import { z } from 'zod';

const baseSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),
  CORS_ORIGIN: z.string().default('*'),
  DATABASE_URL: z.string().url(),

  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_REDIRECT_URI: z.string().url(),

  ACCESS_TOKEN_SECRET: z.string().min(1),
  REFRESH_TOKEN_SECRET: z.string().min(1),
  COOKIE_SECRET: z.string().min(1),

  WEB_ORIGIN: z.string().url(),

  // From-address used by the email provider (see src/email). The default
  // console provider only logs it; a real provider will send from it.
  EMAIL_FROM: z.string().default('noreply@example.com'),

  STRIPE_SECRET_KEY: z.string().min(1),
  STRIPE_WEBHOOK_SECRET: z.string().min(1),
  STRIPE_PREMIUM_PRICE_ID: z.string().startsWith('price_'),
});

const envSchema = baseSchema.superRefine((env, ctx) => {
  if (env.NODE_ENV !== 'production') return;

  for (const key of ['GOOGLE_REDIRECT_URI', 'WEB_ORIGIN'] as const) {
    if (!env[key].startsWith('https://')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key],
        message: 'Must use https in production',
      });
    }
  }
  // A wildcard origin combined with credentialed CORS reflects any site's
  // origin back with Access-Control-Allow-Credentials. Force an explicit
  // allowlist in production.
  if (env.CORS_ORIGIN === '*') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['CORS_ORIGIN'],
      message: 'Must be an explicit origin (not "*") in production',
    });
  }
  if (!env.STRIPE_SECRET_KEY.startsWith('sk_live_')) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['STRIPE_SECRET_KEY'],
      message: 'Must be a live key (sk_live_) in production',
    });
  }
});

export type Config = z.infer<typeof envSchema> & { isProd: boolean };

export function loadConfig(): Config {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error(
      'Invalid environment variables:',
      result.error.flatten().fieldErrors,
    );
    process.exit(1);
  }
  return { ...result.data, isProd: result.data.NODE_ENV === 'production' };
}
