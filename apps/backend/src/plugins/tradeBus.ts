import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { createBus, type Bus } from './createBus.js';

// tradeBus — single Redis pSubscribe fan-out for trade-detail SSE handlers.
// See createBus.ts for the shared subscriber rationale.

export type TradeBus = Bus;

async function tradeBusPlugin(fastify: FastifyInstance): Promise<void> {
  const bus = await createBus(fastify, {
    name: 'tradeBus',
    channelPrefix: 'trade:channel:',
  });
  fastify.decorate('tradeBus', bus);
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
