import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import type { Redis } from 'ioredis';

/**
 * tradeBus — a single Redis pSubscribe connection that fans out trade events
 * to in-process SSE handlers.
 *
 * The previous SSE handler called `fastify.redis.duplicate()` on every open
 * trade-detail tab. ioredis blocks a connection once it's in subscribe mode,
 * so that pattern allocates one Redis client per concurrent SSE connection and
 * doesn't scale past a few hundred subscribers. The bus replaces that with a
 * single shared subscriber that pSubscribes once to `trade:channel:*` and fans
 * messages out to a per-tradeId Set of handlers.
 */

export type TradeBusHandler = (raw: string) => void;

export interface TradeBus {
  subscribe(tradeId: string, handler: TradeBusHandler): () => void;
  size(tradeId?: string): number;
}

async function tradeBusPlugin(fastify: FastifyInstance): Promise<void> {
  const subscriber: Redis = fastify.redis.duplicate();

  // Keyed by tradeId; one Set of handlers per active trade channel.
  const handlers = new Map<string, Set<TradeBusHandler>>();

  const CHANNEL_PREFIX = 'trade:channel:';
  const PATTERN = `${CHANNEL_PREFIX}*`;

  await subscriber.psubscribe(PATTERN);

  subscriber.on('pmessage', (_pattern: string, channel: string, message: string) => {
    const tradeId = channel.startsWith(CHANNEL_PREFIX)
      ? channel.slice(CHANNEL_PREFIX.length)
      : null;
    if (!tradeId) return;
    const set = handlers.get(tradeId);
    if (!set) return;
    for (const handler of set) {
      try {
        handler(message);
      } catch (err) {
        fastify.log.warn({ err, tradeId }, 'tradeBus handler threw');
      }
    }
  });

  subscriber.on('error', (err: Error) => {
    fastify.log.error({ err }, 'tradeBus Redis error');
  });

  const bus: TradeBus = {
    subscribe(tradeId, handler) {
      let set = handlers.get(tradeId);
      if (!set) {
        set = new Set();
        handlers.set(tradeId, set);
      }
      set.add(handler);

      return () => {
        const current = handlers.get(tradeId);
        if (!current) return;
        current.delete(handler);
        if (current.size === 0) handlers.delete(tradeId);
      };
    },
    size(tradeId) {
      if (tradeId === undefined) {
        let total = 0;
        for (const set of handlers.values()) total += set.size;
        return total;
      }
      return handlers.get(tradeId)?.size ?? 0;
    },
  };

  fastify.decorate('tradeBus', bus);

  fastify.addHook('onClose', async () => {
    handlers.clear();
    await subscriber.punsubscribe(PATTERN).catch(() => undefined);
    await subscriber.quit().catch(() => undefined);
  });
}

export const tradeBusPluginWrapped = fp(tradeBusPlugin, {
  name: 'tradeBus',
  dependencies: ['redis'],
});

declare module 'fastify' {
  interface FastifyInstance {
    tradeBus: TradeBus;
  }
}
