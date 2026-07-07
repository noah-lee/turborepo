import fastifyCookie from '@fastify/cookie';
import fastifyJwt from '@fastify/jwt';
import type { FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { googleRoutes } from './google/routes.ts';
import { authRoutes } from './routes.ts';
import { type AccessTokenPayload, accessCookieName } from './tokens.ts';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: AccessTokenPayload;
    user: AccessTokenPayload;
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (
      req: FastifyRequest,
      reply: FastifyReply,
    ) => Promise<unknown>;
  }
}

export const authPlugin = fp(async (app) => {
  const { config } = app;

  await app.register(fastifyCookie, { secret: config.COOKIE_SECRET });

  await app.register(fastifyJwt, {
    secret: config.ACCESS_TOKEN_SECRET,
    namespace: 'access',
  });

  await app.register(fastifyJwt, {
    secret: config.REFRESH_TOKEN_SECRET,
    namespace: 'refresh',
  });

  app.decorate(
    'authenticate',
    async (req: FastifyRequest, reply: FastifyReply) => {
      const token = req.cookies[accessCookieName(config.isProd)];
      if (!token) {
        return reply.code(401).send({ error: 'unauthenticated' });
      }
      try {
        req.user = app.jwt.access.verify<AccessTokenPayload>(token);
      } catch {
        return reply.code(401).send({ error: 'unauthenticated' });
      }
    },
  );

  await app.register(authRoutes, { prefix: '/auth' });
  await app.register(googleRoutes, { prefix: '/auth/google' });
});
