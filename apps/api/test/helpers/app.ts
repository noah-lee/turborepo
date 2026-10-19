import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.ts';
import type { Config } from '../../src/config.ts';
import { createTestConfig } from './config.ts';

const apiScopes = new WeakMap<FastifyInstance, FastifyInstance>();

// The real app against the test database. Not yet `ready()`, so a test can still add
// routes; `app.inject()` readies it. Close it in afterAll to release the DB pool.
export async function createTestApp(
  overrides: Partial<Config> = {},
): Promise<FastifyInstance> {
  const app = await buildApp(createTestConfig(overrides));
  app.addHook('onRequest', async (req) => {
    if (req.url.startsWith('/api/')) apiScopes.set(app, req.server);
  });
  return app;
}

// The `/api` scope from app.ts. The domain plugins decorate it, not the root, so
// `jwt`, `stripe` and `authenticate` live here: `(await apiScope(app)).stripe`.
export async function apiScope(app: FastifyInstance): Promise<FastifyInstance> {
  if (!apiScopes.has(app))
    await app.inject({ method: 'GET', url: '/api/health' });
  const scope = apiScopes.get(app);
  if (!scope) throw new Error('apiScope: app was not built by createTestApp');
  return scope;
}
