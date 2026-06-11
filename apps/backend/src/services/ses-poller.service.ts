import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  type Message,
} from '@aws-sdk/client-sqs';
import type { Pool } from 'pg';
import { handleSesEvent, type SesEvent } from './ses-event-handler.js';
import { env } from '../env.js';

// Long-polls the SES bounce/complaint SQS queue and writes the resulting
// events into email_suppressions. Replaces the older HTTPS webhook —
// see modules/ses-consumer/main.tf for why.
//
// Lifecycle: a single in-process consumer, started from app.ts via
// startSesPoller(). The returned stop function flips a flag and lets the
// current ReceiveMessage call drain before resolving.

const RECEIVE_MAX_MESSAGES = 10;     // SDK max per call
const RECEIVE_WAIT_SECONDS = 20;     // long-poll: keep the connection open
const VISIBILITY_TIMEOUT_SEC = 60;   // matches the queue's setting

interface Log {
  info: (msg: string, fields?: Record<string, unknown>) => void;
  warn: (msg: string, fields?: Record<string, unknown>) => void;
  error: (err: unknown, msg?: string) => void;
}

export function startSesPoller(
  db: Pool,
  log: Log,
): () => Promise<void> {
  if (!env.SES_QUEUE_URL) {
    log.info('[ses-poller] SES_QUEUE_URL not set, poller disabled');
    return async () => undefined;
  }

  const client = new SQSClient({ region: env.UPLOADS_REGION });
  const queueUrl = env.SES_QUEUE_URL;
  let running = true;

  async function processOne(msg: Message): Promise<void> {
    if (!msg.Body || !msg.ReceiptHandle) return;
    let event: SesEvent;
    try {
      event = JSON.parse(msg.Body) as SesEvent;
    } catch (err) {
      // Malformed bodies will hit the DLQ after maxReceiveCount tries.
      // Don't delete here — let the redrive policy do its job.
      log.warn('[ses-poller] malformed message body, leaving for redrive', {
        messageId: msg.MessageId,
      });
      return;
    }

    try {
      const affected = await handleSesEvent(db, event);
      log.info('[ses-poller] processed event', {
        messageId: msg.MessageId,
        type: event.notificationType,
        affected,
      });
      await client.send(new DeleteMessageCommand({
        QueueUrl: queueUrl,
        ReceiptHandle: msg.ReceiptHandle,
      }));
    } catch (err) {
      // Don't delete on handler failure — the message becomes visible again
      // after the visibility timeout and will be retried. Hits the DLQ
      // after maxReceiveCount transient failures.
      log.error(err, '[ses-poller] handler failed, message will retry');
    }
  }

  async function loop(): Promise<void> {
    while (running) {
      try {
        const result = await client.send(new ReceiveMessageCommand({
          QueueUrl: queueUrl,
          MaxNumberOfMessages: RECEIVE_MAX_MESSAGES,
          WaitTimeSeconds: RECEIVE_WAIT_SECONDS,
          VisibilityTimeout: VISIBILITY_TIMEOUT_SEC,
        }));
        const messages = result.Messages ?? [];
        if (messages.length === 0) continue;
        // Process messages sequentially. SES bounce volume is low; serial
        // is simpler and avoids the failure-handling tangle of Promise.all.
        for (const msg of messages) {
          if (!running) break;
          await processOne(msg);
        }
      } catch (err) {
        // Network blip, IAM hiccup — short backoff before retrying so we
        // don't melt the SDK with a tight reconnect loop.
        log.error(err, '[ses-poller] receive loop error');
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }

  log.info('[ses-poller] starting', { queueUrl });
  loop().catch((err) => log.error(err, '[ses-poller] crashed'));

  return async () => {
    running = false;
    client.destroy();
  };
}
