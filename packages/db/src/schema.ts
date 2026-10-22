import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

// Every timestamp is precision 3 (milliseconds), matching a JS Date, so values
// round-trip exactly (e.g. for a timestamp-based pagination cursor).

// One sign-in method per user: the provider that created the account, and that
// provider's stable user id (e.g. the OIDC `sub`). Signing in through a different
// provider with an email that's already taken is refused, not linked.
export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    email: text('email').notNull().unique(),
    authProvider: text('auth_provider').notNull(),
    authProviderId: text('auth_provider_id').notNull(),
    name: text('name'),
    picture: text('picture'),
    sessionId: uuid('session_id').defaultRandom().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    unique('users_auth_provider_account_unique').on(
      t.authProvider,
      t.authProviderId,
    ),
  ],
);

export const stripeCustomers = pgTable('stripe_customers', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  stripeCustomerId: text('stripe_customer_id').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true, precision: 3 })
    .defaultNow()
    .notNull(),
});

export const stripeSubscriptions = pgTable('stripe_subscriptions', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  stripeSubscriptionId: text('stripe_subscription_id').notNull().unique(),
  status: text('status').notNull(),
  currentPeriodEnd: timestamp('current_period_end', {
    withTimezone: true,
    precision: 3,
  }).notNull(),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export const stripeEvents = pgTable('stripe_events', {
  stripeEventId: text('stripe_event_id').primaryKey(),
  processedAt: timestamp('processed_at', { withTimezone: true, precision: 3 })
    .defaultNow()
    .notNull(),
});

// An object in the S3 bucket. A row is written before the browser uploads; `uploadedAt`
// stays null until the api has seen the object at exactly `sizeBytes`.
export const files = pgTable(
  'files',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    fileName: text('file_name').notNull(),
    contentType: text('content_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    storageKey: text('storage_key').notNull().unique(),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true, precision: 3 }),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull(),
  },
  (t) => [index('files_user_id_idx').on(t.userId)],
);

export type SelectUser = typeof users.$inferSelect;
export type SelectFile = typeof files.$inferSelect;
