import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { type Database, createDb } from '@repo/db';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import { authPlugin } from './auth/plugin.ts';
import { billingPlugin } from './billing/plugin.ts';
import type { Config } from './config.ts';

declare module 'fastify' {
  interface FastifyInstance {
    db: Database;
    config: Config;
  }
}

export async function buildApp(config: Config): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: config.LOG_LEVEL },
  });

  await app.register(helmet);

  await app.register(cors, {
    origin:
      config.CORS_ORIGIN === '*'
        ? true
        : config.CORS_ORIGIN.split(',').map((s) => s.trim()),
    credentials: true,
  });

  // Coarse per-IP limit across all routes. The Stripe webhook opts out below
  // (routes.ts) so provider retries are never throttled.
  await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });

  const db = createDb(config.DATABASE_URL);
  app.decorate('config', config);
  app.decorate('db', db);

  app.addHook('onClose', async () => {
    await db.$client.end();
  });

  app.setErrorHandler((err: FastifyError, req, reply) => {
    req.log.error({ err }, 'request failed');
    const statusCode = err.statusCode ?? 500;
    // Never leak internal error details on a 500 in production; 4xx errors
    // (validation, auth) carry safe, intentional messages.
    if (statusCode >= 500 && config.isProd) {
      return reply.code(statusCode).send({ error: 'internal_server_error' });
    }
    return reply.code(statusCode).send({ error: err.message });
  });

  await app.register(authPlugin);
  await app.register(billingPlugin);

  app.get('/health', async () => ({ status: 'ok' }));

  app.get('/health/db', async (_req, reply) => {
    try {
      await app.db.$client`SELECT 1`;
      return { status: 'ok' };
    } catch (err) {
      app.log.error({ err }, 'db health check failed');
      reply.code(503);
      return { status: 'error' };
    }
  });

  return app;
}
