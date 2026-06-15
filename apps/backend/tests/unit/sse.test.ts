import { describe, it, expect, vi } from 'vitest';
import type { FastifyReply } from 'fastify';
import { writeSSEEvent, writeSSEHeartbeat } from '../../src/utils/sse.js';

// A minimal reply.raw shim that records every write and lets us flip
// writableEnded on demand.
function makeReply(ended = false) {
  const writes: string[] = [];
  return {
    writes,
    reply: {
      raw: {
        writableEnded: ended,
        write: (chunk: string) => {
          writes.push(chunk);
          return true;
        },
      },
    } as unknown as FastifyReply,
  };
}

describe('writeSSEEvent', () => {
  it('emits a well-formed SSE frame with camelized payload', async () => {
    const { reply, writes } = makeReply();
    writeSSEEvent(reply, 'trade:updated', { trade_id: 'abc', counter_party_id: 'xyz' });
    expect(writes).toHaveLength(1);
    const frame = writes[0]!;
    expect(frame).toMatch(/^event: trade:updated\n/);
    expect(frame).toMatch(/data: \{"tradeId":"abc","counterPartyId":"xyz"\}\n\n$/);
    // No id line should be present without an explicit eventId.
    expect(frame).not.toContain('id:');
  });

  it('includes an id: line when eventId is supplied', () => {
    const { reply, writes } = makeReply();
    writeSSEEvent(reply, 'ping', { ok: true }, 'evt-42');
    expect(writes[0]!).toContain('id: evt-42\n');
  });

  it('is a no-op when the socket has already ended', () => {
    const { reply, writes } = makeReply(true);
    writeSSEEvent(reply, 'late', { a: 1 });
    expect(writes).toHaveLength(0);
  });
});

describe('writeSSEHeartbeat', () => {
  it('writes the SSE comment heartbeat frame', () => {
    const { reply, writes } = makeReply();
    writeSSEHeartbeat(reply);
    expect(writes).toEqual([': heartbeat\n\n']);
  });

  it('is a no-op when the socket has already ended', () => {
    const { reply, writes } = makeReply(true);
    writeSSEHeartbeat(reply);
    expect(writes).toHaveLength(0);
  });
});

// Smoke test that the camelize hook is actually applied at runtime.
describe('SSE casing contract', () => {
  it('never lets snake_case keys reach the wire', () => {
    const { reply, writes } = makeReply();
    const payload = { user_id: '1', nested: { last_seen_at: 'iso', items: [{ row_id: 9 }] } };
    writeSSEEvent(reply, 'x', payload);
    expect(writes[0]!).not.toContain('user_id');
    expect(writes[0]!).not.toContain('last_seen_at');
    expect(writes[0]!).not.toContain('row_id');
    expect(writes[0]!).toContain('"userId":"1"');
    expect(writes[0]!).toContain('"lastSeenAt":"iso"');
    expect(writes[0]!).toContain('"rowId":9');
  });
});

// Ensure vitest's vi mock loader doesn't get garbage-collected; keeps the
// import live without using it.
vi.fn();
