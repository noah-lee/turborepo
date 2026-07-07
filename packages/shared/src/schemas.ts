import { z } from 'zod';

export const meResponseSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().nullable(),
  picture: z.string().url().nullable(),
  isPremium: z.boolean(),
});

export type MeResponse = z.infer<typeof meResponseSchema>;

export const subscriptionStatusSchema = z.enum([
  'active',
  'trialing',
  'past_due',
  'canceled',
  'incomplete',
  'incomplete_expired',
  'unpaid',
  'paused',
]);

export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>;

export const subscriptionResponseSchema = z.object({
  status: subscriptionStatusSchema,
  currentPeriodEnd: z.string().datetime(),
  cancelAtPeriodEnd: z.boolean(),
});

export type SubscriptionResponse = z.infer<typeof subscriptionResponseSchema>;

export const checkoutResponseSchema = z.object({
  url: z.string().url(),
});

export type CheckoutResponse = z.infer<typeof checkoutResponseSchema>;
