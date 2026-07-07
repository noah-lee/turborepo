import Stripe from 'stripe';

export type StripeClient = Stripe;

// Pin the API version explicitly so upgrading the `stripe` package is a
// deliberate step, not a silent behavior change. Note: `2025-03-31.basil` and
// later relocate `current_period_end` off the subscription onto its items —
// bumping past this version requires updating sync.ts accordingly.
const STRIPE_API_VERSION = '2025-02-24.acacia';

export function createStripeClient(secretKey: string): Stripe {
  return new Stripe(secretKey, { apiVersion: STRIPE_API_VERSION });
}
