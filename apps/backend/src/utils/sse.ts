import type { FastifyReply } from 'fastify';
import { camelizeKeys } from './casing.js';

// Raw socket writes bypass Fastify's serializer, so every payload that crosses
// this wire has to be camelized explicitly (see CLAUDE.md). All SSE writes go
// through these helpers so a future event type can't accidentally leak
// snake_case keys to the client.

export function writeSSEEvent(
  reply: FastifyReply,
  eventType: string,
  data: unknown,
  eventId?: string,
): void {
  if (reply.raw.writableEnded) return;
  const payload = JSON.stringify(camelizeKeys(data));
  const idLine = eventId ? `id: ${eventId}\n` : '';
  reply.raw.write(`event: ${eventType}\n${idLine}data: ${payload}\n\n`);
}

export function writeSSEHeartbeat(reply: FastifyReply): void {
  if (reply.raw.writableEnded) return;
  reply.raw.write(': heartbeat\n\n');
}

// reply.raw.writeHead bypasses Fastify's response pipeline, so CORS headers
// set by the cors plugin's onRequest hook are never flushed to the wire.
// Every SSE endpoint has to mirror them onto the raw socket. Carrying *every*
// CORS-shaped header (rather than naming each one inline) means changes to
// the cors plugin (origin / credentials / exposed headers) propagate here
// without a code edit.
const CORS_HEADER_NAMES = [
  'access-control-allow-origin',
  'access-control-allow-credentials',
  'access-control-expose-headers',
  'vary',
];

export function collectCorsHeaders(reply: FastifyReply): Record<string, string> {
  const out: Record<string, string> = {};
  for (const h of CORS_HEADER_NAMES) {
    const v = reply.getHeader(h);
    if (typeof v === 'string') out[h] = v;
  }
  return out;
}

/**
 * writeSSEHead — flush the SSE response head with CORS headers carried over
 * from the Fastify reply. This is the canonical entry point for any SSE
 * handler that uses reply.raw to start the stream.
 */
export function writeSSEHead(reply: FastifyReply): void {
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
    ...collectCorsHeaders(reply),
  });
  reply.raw.flushHeaders?.();
}
