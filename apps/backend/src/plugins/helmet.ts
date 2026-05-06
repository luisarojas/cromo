import fastifyHelmet from '@fastify/helmet';
import type { FastifyInstance } from 'fastify';

export async function helmetPlugin(fastify: FastifyInstance): Promise<void> {
  await fastify.register(fastifyHelmet, {
    // Allow Swagger UI to load inline scripts/styles in development
    contentSecurityPolicy: process.env['NODE_ENV'] === 'production'
      ? undefined
      : false,
  });
}
