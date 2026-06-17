import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import type { Redis } from 'ioredis';

/**
 * liveTradeBus — shared Redis pSubscribe connection that fans out live-trade
 * session events to in-process SSE handlers. Same shape as tradeBus (single
 * subscriber, per-sessionId Set of handlers) so opening twenty live-trade
 * tabs still only burns one Redis client.
 */

export type LiveTradeBusHandler = (raw: string) => void;

export interface LiveTradeBus {
  subscribe(sessionId: string, handler: LiveTradeBusHandler): () => void;
  size(sessionId?: string): number;
}

async function liveTradeBusPlugin(fastify: FastifyInstance): Promise<void> {
  const subscriber: Redis = fastify.redis.duplicate();

  const handlers = new Map<string, Set<LiveTradeBusHandler>>();

  const CHANNEL_PREFIX = 'live-trade:channel:';
  const PATTERN = `${CHANNEL_PREFIX}*`;

  await subscriber.psubscribe(PATTERN);

  subscriber.on('pmessage', (_pattern: string, channel: string, message: string) => {
    const sessionId = channel.startsWith(CHANNEL_PREFIX)
      ? channel.slice(CHANNEL_PREFIX.length)
      : null;
    if (!sessionId) return;
    const set = handlers.get(sessionId);
    if (!set) return;
    for (const handler of set) {
      try {
        handler(message);
      } catch (err) {
        fastify.log.warn({ err, sessionId }, 'liveTradeBus handler threw');
      }
    }
  });

  subscriber.on('error', (err: Error) => {
    fastify.log.error({ err }, 'liveTradeBus Redis error');
  });

  const bus: LiveTradeBus = {
    subscribe(sessionId, handler) {
      let set = handlers.get(sessionId);
      if (!set) {
        set = new Set();
        handlers.set(sessionId, set);
      }
      set.add(handler);

      return () => {
        const current = handlers.get(sessionId);
        if (!current) return;
        current.delete(handler);
        if (current.size === 0) handlers.delete(sessionId);
      };
    },
    size(sessionId) {
      if (sessionId === undefined) {
        let total = 0;
        for (const set of handlers.values()) total += set.size;
        return total;
      }
      return handlers.get(sessionId)?.size ?? 0;
    },
  };

  fastify.decorate('liveTradeBus', bus);

  fastify.addHook('onClose', async () => {
    handlers.clear();
    await subscriber.punsubscribe(PATTERN).catch(() => undefined);
    await subscriber.quit().catch(() => undefined);
  });
}

export const liveTradeBusPluginWrapped = fp(liveTradeBusPlugin, {
  name: 'liveTradeBus',
  dependencies: ['redis'],
});

declare module 'fastify' {
  interface FastifyInstance {
    liveTradeBus: LiveTradeBus;
  }
}
