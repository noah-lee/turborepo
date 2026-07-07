import fp from 'fastify-plugin';
import { billingRoutes } from './routes.ts';
import { type StripeClient, createStripeClient } from './stripe.ts';

declare module 'fastify' {
  interface FastifyInstance {
    stripe: StripeClient;
  }
}

export const billingPlugin = fp(async (app) => {
  app.decorate('stripe', createStripeClient(app.config.STRIPE_SECRET_KEY));

  await app.register(billingRoutes, { prefix: '/billing' });
});
