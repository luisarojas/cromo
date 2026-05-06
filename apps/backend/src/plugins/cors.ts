import fastifyCors from '@fastify/cors';
import type { FastifyInstance } from 'fastify';
import { env } from '../env.js';

export async function corsPlugin(fastify: FastifyInstance): Promise<void> {
  await fastify.register(fastifyCors, {
    origin: env.NODE_ENV === 'production'
      ? env.CORS_ORIGIN.split(',').map((o) => o.trim())
      : true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
    exposedHeaders: ['X-Request-ID'],
  });
}
