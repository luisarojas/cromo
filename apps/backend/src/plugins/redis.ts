import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';
import { env } from '../env.js';

async function redisPlugin(fastify: FastifyInstance): Promise<void> {
  const redis = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: true,
  });

  redis.on('error', (err: Error) => {
    fastify.log.error({ err }, 'Redis connection error');
  });

  redis.on('connect', () => {
    fastify.log.info('Redis connected.');
  });

  // Connect eagerly so startup fails fast if Redis is unavailable
  await redis.connect();

  fastify.decorate('redis', redis);

  fastify.addHook('onClose', async () => {
    fastify.log.info('Disconnecting Redis...');
    await redis.quit();
  });
}

export const redisPluginWrapped = fp(redisPlugin, {
  name: 'redis',
});
