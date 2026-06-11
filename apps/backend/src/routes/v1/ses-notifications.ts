import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'node:crypto';
import { suppress } from '../../services/email-suppressions.service.js';

// SES → SNS → this webhook → email_suppressions table.
//
// SES is wired (via Terraform; see modules/ses/main.tf) to publish every
// bounce and complaint event to two SNS topics. SNS delivers each event to
// this HTTPS endpoint. We:
//   1. Verify the SNS message signature using the per-message SigningCertURL
//      so a third party can't POST forged suppression requests.
//   2. Enforce a TopicArn allow-list (env.SES_BOUNCE_TOPIC_ARN,
//      env.SES_COMPLAINT_TOPIC_ARN) as defence in depth — the cert check
//      proves the message came from SNS, the allow-list proves it came from
//      OUR SNS topics.
//   3. For SubscriptionConfirmation events, fetch SubscribeURL once to
//      complete the SNS subscription handshake without manual intervention.
//   4. For Notification events, parse the SES event envelope and write every
//      affected address into email_suppressions.
//
// The endpoint is intentionally unauthenticated at the app layer — SNS won't
// send a bearer token. The signature check IS the authentication.

interface SnsMessage {
  Type: 'SubscriptionConfirmation' | 'Notification' | 'UnsubscribeConfirmation';
  MessageId: string;
  TopicArn: string;
  Subject?: string;
  Message: string;
  Timestamp: string;
  SignatureVersion: '1' | '2';
  Signature: string;
  SigningCertURL: string;
  SubscribeURL?: string;
  Token?: string;
}

// Hosts SNS will ever serve signing certs from. Anything else is a forgery
// attempt — fetch is refused without making the HTTP call.
const ALLOWED_CERT_HOST = /^sns\.[a-z0-9-]+\.amazonaws\.com$/;

// Allowed source topics. Empty array = accept nothing — the env vars must be
// populated by Terraform on every environment where the webhook runs.
function allowedTopicArns(): Set<string> {
  return new Set(
    [process.env['SES_BOUNCE_TOPIC_ARN'], process.env['SES_COMPLAINT_TOPIC_ARN']]
      .filter((v): v is string => typeof v === 'string' && v.length > 0),
  );
}

// SNS signs a deterministic, newline-separated, alphabetically-ordered subset
// of message fields. See:
// https://docs.aws.amazon.com/sns/latest/dg/sns-verify-signature-of-message.html
function canonicalString(msg: SnsMessage): string {
  const fields: string[] = [];
  if (msg.Type === 'Notification') {
    fields.push('Message', msg.Message);
    fields.push('MessageId', msg.MessageId);
    if (msg.Subject) fields.push('Subject', msg.Subject);
    fields.push('Timestamp', msg.Timestamp);
    fields.push('TopicArn', msg.TopicArn);
    fields.push('Type', msg.Type);
  } else {
    fields.push('Message', msg.Message);
    fields.push('MessageId', msg.MessageId);
    if (msg.SubscribeURL) fields.push('SubscribeURL', msg.SubscribeURL);
    fields.push('Timestamp', msg.Timestamp);
    if (msg.Token) fields.push('Token', msg.Token);
    fields.push('TopicArn', msg.TopicArn);
    fields.push('Type', msg.Type);
  }
  return fields.join('\n') + '\n';
}

// Cache fetched certificates so repeated notifications from the same SNS
// signing key don't hit s3 every time. SNS rotates keys infrequently.
const certCache = new Map<string, string>();

async function fetchCert(url: string): Promise<string> {
  const cached = certCache.get(url);
  if (cached) return cached;
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || !ALLOWED_CERT_HOST.test(parsed.hostname)) {
    throw new Error(`SigningCertURL rejected: ${url}`);
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`SigningCertURL fetch failed: ${res.status}`);
  const pem = await res.text();
  certCache.set(url, pem);
  return pem;
}

async function verifySignature(msg: SnsMessage): Promise<boolean> {
  const pem = await fetchCert(msg.SigningCertURL);
  const algorithm = msg.SignatureVersion === '2' ? 'RSA-SHA256' : 'RSA-SHA1';
  const verifier = crypto.createVerify(algorithm);
  verifier.update(canonicalString(msg), 'utf8');
  return verifier.verify(pem, msg.Signature, 'base64');
}

interface SesBounceEvent {
  notificationType: 'Bounce';
  bounce: {
    bounceType: 'Permanent' | 'Transient' | 'Undetermined';
    bounceSubType?: string;
    bouncedRecipients: { emailAddress: string; diagnosticCode?: string }[];
  };
}

interface SesComplaintEvent {
  notificationType: 'Complaint';
  complaint: {
    complainedRecipients: { emailAddress: string }[];
    complaintFeedbackType?: string;
  };
}

type SesEvent = SesBounceEvent | SesComplaintEvent;

export async function sesNotificationsRoutes(fastify: FastifyInstance): Promise<void> {
  // SNS POSTs application/json but stamps Content-Type: text/plain on the
  // request. Register a parser so Fastify accepts the body without 415.
  fastify.addContentTypeParser('text/plain', { parseAs: 'string' }, (_req, body, done) => {
    try {
      done(null, JSON.parse(body as string));
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  fastify.post(
    '/api/v1/internal/ses/notifications',
    {
      // Bypass the global rate limit — SES can burst notifications during
      // an incident and we never want to drop a suppression update.
      config: { rateLimit: false },
      logLevel: 'warn',
      schema: {
        tags: ['Internal'],
        summary: 'SES bounce/complaint webhook (SNS HTTPS subscription)',
        description:
          'AWS-only callback. Authenticated by SNS message signature, not bearer token.',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const msg = request.body as SnsMessage | undefined;
      if (!msg || typeof msg !== 'object' || !msg.Type) {
        return reply.status(400).send({ error: 'Malformed SNS envelope' });
      }

      if (!allowedTopicArns().has(msg.TopicArn)) {
        request.log.warn({ topicArn: msg.TopicArn }, '[ses] rejected topic');
        return reply.status(403).send({ error: 'Topic not allowed' });
      }

      let signatureValid = false;
      try {
        signatureValid = await verifySignature(msg);
      } catch (err) {
        request.log.error({ err }, '[ses] signature verification error');
      }
      if (!signatureValid) {
        return reply.status(403).send({ error: 'Invalid signature' });
      }

      // Auto-complete the SNS subscription handshake. Without this, the
      // subscription stays pending until someone clicks the URL by hand.
      if (msg.Type === 'SubscriptionConfirmation' && msg.SubscribeURL) {
        const parsed = new URL(msg.SubscribeURL);
        if (parsed.protocol !== 'https:' || !ALLOWED_CERT_HOST.test(parsed.hostname)) {
          return reply.status(400).send({ error: 'SubscribeURL host not allowed' });
        }
        const res = await fetch(msg.SubscribeURL);
        request.log.info(
          { topicArn: msg.TopicArn, status: res.status },
          '[ses] confirmed SNS subscription',
        );
        return reply.status(200).send({ confirmed: true });
      }

      if (msg.Type !== 'Notification') {
        return reply.status(200).send({ ignored: msg.Type });
      }

      let event: SesEvent;
      try {
        event = JSON.parse(msg.Message) as SesEvent;
      } catch (err) {
        request.log.error({ err }, '[ses] malformed notification payload');
        return reply.status(400).send({ error: 'Malformed notification payload' });
      }

      if (event.notificationType === 'Bounce') {
        // Transient bounces (mailbox full, greylisted) are NOT suppressed —
        // SES guidance is to only auto-suppress permanent failures. Transients
        // get retried by SES on the next send naturally.
        if (event.bounce.bounceType !== 'Permanent') {
          return reply.status(200).send({ ignored: 'transient bounce' });
        }
        for (const recipient of event.bounce.bouncedRecipients) {
          await suppress(fastify.db, recipient.emailAddress, {
            reason: 'bounce',
            bounceType: event.bounce.bounceType,
            bounceSubtype: event.bounce.bounceSubType ?? null,
            diagnosticCode: recipient.diagnosticCode ?? null,
            payload: event,
          });
        }
        return reply.status(200).send({ suppressed: event.bounce.bouncedRecipients.length });
      }

      if (event.notificationType === 'Complaint') {
        for (const recipient of event.complaint.complainedRecipients) {
          await suppress(fastify.db, recipient.emailAddress, {
            reason: 'complaint',
            payload: event,
          });
        }
        return reply.status(200).send({ suppressed: event.complaint.complainedRecipients.length });
      }

      return reply.status(200).send({ ignored: 'unknown notification type' });
    },
  );
}
