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
