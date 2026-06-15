import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Pool } from 'pg';

// We exercise the exported `processOne` directly — that's the meat of the
// poller's decision tree. The actual `startSesPoller` long-poll loop is
// intentionally NOT unit-tested: it's an unbounded async loop whose only
// non-trivial step is processOne(), so testing the loop adds no signal but
// risks heap exhaustion in a tight mocked iteration.

vi.mock('@aws-sdk/client-sqs', () => {
  class SQSClient { send = vi.fn(); destroy = vi.fn(); }
  class ReceiveMessageCommand { constructor(public input: unknown) {} }
  class DeleteMessageCommand  { constructor(public input: unknown) {} }
  return { SQSClient, ReceiveMessageCommand, DeleteMessageCommand };
});

const handleMock = vi.fn().mockResolvedValue(1);
vi.mock('../../src/services/ses-event-handler.js', () => ({
  handleSesEvent: (db: unknown, ev: unknown) => handleMock(db, ev),
}));

vi.mock('../../src/env.js', () => ({
  env: { SES_QUEUE_URL: 'https://sqs.fake/q', UPLOADS_REGION: 'ca-central-1' },
}));

import {
  processOne,
  startSesPoller,
} from '../../src/services/ses-poller.service.js';

const db = {} as Pool;
const QUEUE_URL = 'https://sqs.fake/q';

function makeLog() {
  const calls: { level: 'info' | 'warn' | 'error'; msg: string; fields?: unknown }[] = [];
  return {
    log: {
      info: (msg: string, fields?: Record<string, unknown>) => calls.push({ level: 'info', msg, fields }),
      warn: (msg: string, fields?: Record<string, unknown>) => calls.push({ level: 'warn', msg, fields }),
      error: (_err: unknown, msg?: string) => calls.push({ level: 'error', msg: msg ?? '' }),
    },
    calls,
  };
}

function makeClient(sendImpl: (cmd: unknown) => unknown) {
  return { send: vi.fn(async (cmd: unknown) => sendImpl(cmd)) };
}

beforeEach(() => {
  handleMock.mockReset().mockResolvedValue(1);
});

describe('processOne', () => {
  it('parses, dispatches, then DELETES the message on success', async () => {
    const event = {
      notificationType: 'Bounce',
      bounce: { bounceType: 'Permanent', bouncedRecipients: [{ emailAddress: 'a@x' }] },
    };
    const client = makeClient(() => ({}));
    const { log } = makeLog();
    await processOne(db, client, QUEUE_URL, {
      MessageId: 'm-1', ReceiptHandle: 'rh-1', Body: JSON.stringify(event),
    }, log);
    expect(handleMock).toHaveBeenCalledWith(db, event);
    expect(client.send).toHaveBeenCalledTimes(1);
    const cmd = client.send.mock.calls[0]![0] as { constructor: { name: string }; input: { ReceiptHandle: string } };
    expect(cmd.constructor.name).toBe('DeleteMessageCommand');
    expect(cmd.input.ReceiptHandle).toBe('rh-1');
  });

  it('does NOT delete a malformed JSON body — leaves it for redrive', async () => {
    const client = makeClient(() => ({}));
    const { log, calls } = makeLog();
    await processOne(db, client, QUEUE_URL, {
      MessageId: 'bad', ReceiptHandle: 'rh-bad', Body: '{not json',
    }, log);
    expect(handleMock).not.toHaveBeenCalled();
    expect(client.send).not.toHaveBeenCalled();
    expect(calls.some((c) => c.level === 'warn' && c.msg.includes('malformed'))).toBe(true);
  });

  it('does NOT delete when the handler throws — the message will retry', async () => {
    handleMock.mockReset().mockRejectedValue(new Error('downstream'));
    const client = makeClient(() => ({}));
    const { log, calls } = makeLog();
    await processOne(db, client, QUEUE_URL, {
      MessageId: 'fail', ReceiptHandle: 'rh-fail',
      Body: JSON.stringify({ notificationType: 'Bounce', bounce: { bounceType: 'Permanent', bouncedRecipients: [] } }),
    }, log);
    expect(client.send).not.toHaveBeenCalled();
    expect(calls.some((c) => c.level === 'error')).toBe(true);
  });

  it('is a no-op when Body or ReceiptHandle is missing', async () => {
    const client = makeClient(() => ({}));
    const { log } = makeLog();
    await processOne(db, client, QUEUE_URL, { MessageId: 'x' }, log);
    expect(handleMock).not.toHaveBeenCalled();
    expect(client.send).not.toHaveBeenCalled();
  });
});

describe('startSesPoller — disabled mode (env gate)', () => {
  it('returns a no-op stop function and never touches SQS when SES_QUEUE_URL is empty', async () => {
    vi.doMock('../../src/env.js', () => ({
      env: { SES_QUEUE_URL: '', UPLOADS_REGION: 'ca-central-1' },
    }));
    vi.resetModules();
    const { startSesPoller: disabledStart } = await import('../../src/services/ses-poller.service.js');
    const { log, calls } = makeLog();
    const stop = disabledStart(db, log);
    expect(calls.some((c) => c.msg.includes('SES_QUEUE_URL not set'))).toBe(true);
    await expect(stop()).resolves.toBeUndefined();
  });
});

describe('startSesPoller — enabled mode', () => {
  it('logs "starting" with the queue URL and returns a stop function (loop runs in background)', async () => {
    // We don't await any loop iteration here — the SDK send is mocked to a
    // forever-pending Promise so the loop is effectively idle. The contract
    // we verify is that calling start emits the "starting" log line and that
    // stop() resolves cleanly (flips the running flag, destroys the client).
    vi.doMock('@aws-sdk/client-sqs', () => {
      class SQSClient {
        // Never-resolving send → loop awaits forever; the loop won't tail-spin.
        send = vi.fn(() => new Promise<unknown>(() => undefined));
        destroy = vi.fn();
      }
      class ReceiveMessageCommand { constructor(public input: unknown) {} }
      class DeleteMessageCommand  { constructor(public input: unknown) {} }
      return { SQSClient, ReceiveMessageCommand, DeleteMessageCommand };
    });
    vi.doMock('../../src/env.js', () => ({
      env: { SES_QUEUE_URL: 'https://sqs.fake/q', UPLOADS_REGION: 'ca-central-1' },
    }));
    vi.resetModules();
    const { startSesPoller: enabledStart } = await import('../../src/services/ses-poller.service.js');
    const { log, calls } = makeLog();
    const stop = enabledStart(db, log);
    expect(calls.some((c) => c.msg.includes('starting'))).toBe(true);
    await expect(stop()).resolves.toBeUndefined();
  });
});
