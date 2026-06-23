import type { FastifyInstance } from 'fastify';
import type { Redis } from 'ioredis';

// Shared fan-out subscriber used by tradeBus and liveTradeBus.
//
// ioredis blocks a connection once it enters subscribe mode, so the original
// "duplicate per SSE connection" pattern allocated one Redis client per open
// tab and didn't scale past a few hundred subscribers. This factory replaces
// that with a single shared subscriber that pSubscribes to `${prefix}*` and
// fans messages out to a per-key Set of handlers.

export type BusHandler = (raw: string) => void;

export interface Bus {
  subscribe(key: string, handler: BusHandler): () => void;
  size(key?: string): number;
}

export interface CreateBusOptions {
  /** Logged tag for warnings/errors. */
  name: string;
  /** Channel-name prefix; the key parsed from `pmessage` is whatever follows. */
  channelPrefix: string;
}

/**
 * createBus — must be called during Fastify plugin registration. The helper
 * registers its own `onClose` hook on the supplied instance to tear down the
 * Redis subscriber on shutdown; that hook only fires correctly when the
 * caller is already inside a `fastify-plugin`-wrapped registration scope
 * (i.e. tradeBus.ts / liveTradeBus.ts). Calling it from a route handler or
 * other runtime path would leave the subscriber dangling at process exit.
 */
export async function createBus(
  fastify: FastifyInstance,
  opts: CreateBusOptions,
): Promise<Bus> {
  const subscriber: Redis = fastify.redis.duplicate();
  const handlers = new Map<string, Set<BusHandler>>();
  const pattern = `${opts.channelPrefix}*`;

  await subscriber.psubscribe(pattern);

  subscriber.on('pmessage', (_pattern: string, channel: string, message: string) => {
    const key = channel.startsWith(opts.channelPrefix)
      ? channel.slice(opts.channelPrefix.length)
      : null;
    if (!key) return;
    const set = handlers.get(key);
    if (!set) return;
    for (const handler of set) {
      try {
        handler(message);
      } catch (err) {
        fastify.log.warn({ err, bus: opts.name, key }, `${opts.name} handler threw`);
      }
    }
  });

  subscriber.on('error', (err: Error) => {
    fastify.log.error({ err, bus: opts.name }, `${opts.name} Redis error`);
  });

  fastify.addHook('onClose', async () => {
    handlers.clear();
    await subscriber.punsubscribe(pattern).catch(() => undefined);
    await subscriber.quit().catch(() => undefined);
  });

  return {
    subscribe(key, handler) {
      let set = handlers.get(key);
      if (!set) {
        set = new Set();
        handlers.set(key, set);
      }
      set.add(handler);
      return () => {
        const current = handlers.get(key);
        if (!current) return;
        current.delete(handler);
        if (current.size === 0) handlers.delete(key);
      };
    },
    size(key) {
      if (key === undefined) {
        let total = 0;
        for (const set of handlers.values()) total += set.size;
        return total;
      }
      return handlers.get(key)?.size ?? 0;
    },
  };
}
