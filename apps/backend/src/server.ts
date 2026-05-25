import { buildApp } from './app.js';
import { env } from './env.js';

async function start(): Promise<void> {
  const app = await buildApp();

  try {
    await app.listen({ port: env.PORT, host: env.HOST });
    app.log.info(
      `Cromo API listening on http://${env.HOST}:${env.PORT} [${env.NODE_ENV}]`
    );
    app.log.info(`Swagger UI: http://localhost:${env.PORT}/docs`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.info('[server] SIGTERM received — shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.info('[server] SIGINT received — shutting down gracefully...');
  process.exit(0);
});

start();
