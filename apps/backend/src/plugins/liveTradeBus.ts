import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { createBus, type Bus } from './createBus.js';

// liveTradeBus — single Redis pSubscribe fan-out for live-trade SSE handlers.
// See createBus.ts for the shared subscriber rationale.

export type LiveTradeBus = Bus;

async function liveTradeBusPlugin(fastify: FastifyInstance): Promise<void> {
  const bus = await createBus(fastify, {
    name: 'liveTradeBus',
    channelPrefix: 'live-trade:channel:',
  });
  fastify.decorate('liveTradeBus', bus);
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
