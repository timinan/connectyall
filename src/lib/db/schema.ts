import {
  pgTable, bigint, text, jsonb, timestamp, uuid, numeric, index, pgEnum, uniqueIndex, boolean,
} from 'drizzle-orm/pg-core';

export const sourceEnum = pgEnum('source', ['voice', 'audio', 'video', 'manual']);
export const usageEventKindEnum = pgEnum('usage_event_kind', ['capture', 'card_render', 'report']);

export type Socials = { x?: string; linkedin?: string; email?: string; website?: string };
export type ContactLinks = { telegram?: string; x?: string; linkedin?: string; website?: string };

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email'),
  emailVerified: boolean('email_verified').default(false).notNull(),
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
  image: text('image'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  telegramUserId: bigint('telegram_user_id', { mode: 'number' }),
  telegramUsername: text('telegram_username'),
  displayName: text('display_name').notNull(),
  tagline: text('tagline'),
  photoR2Url: text('photo_r2_url'),
  selfIntro: text('self_intro'),
  socials: jsonb('socials').$type<Socials>().default({}).notNull(),
  timezone: text('timezone').default('UTC').notNull(),
  consentAcknowledgedAt: timestamp('consent_acknowledged_at', { withTimezone: true }),
  onboardedAt: timestamp('onboarded_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  emailIdx: uniqueIndex('users_email_unique').on(t.email),
  telegramIdx: uniqueIndex('users_telegram_user_id_unique').on(t.telegramUserId),
}));

export const contacts = pgTable(
  'contacts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    role: text('role'),
    company: text('company'),
    emails: text('emails').array().default([]).notNull(),
    phones: text('phones').array().default([]).notNull(),
    preferredChannel: text('preferred_channel'),
    links: jsonb('links').$type<ContactLinks>().default({}).notNull(),
    notesSummary: text('notes_summary'),
    lastTouchedAt: timestamp('last_touched_at', { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userIdx: index('contacts_user_id_idx').on(t.userId),
    userNameIdx: index('contacts_user_name_idx').on(t.userId, t.name),
    userLastTouchedIdx: index('contacts_user_id_last_touched_idx').on(t.userId, t.lastTouchedAt),
  })
);

export const interactionStatusEnum = pgEnum('interaction_status', ['processing', 'ready', 'failed']);

export const interactions = pgTable(
  'interactions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'cascade' }),
    source: sourceEnum('source').notNull(),
    structuredData: jsonb('structured_data').notNull(),
    status: interactionStatusEnum('status').default('ready').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    contactIdx: index('interactions_contact_id_idx').on(t.contactId),
  })
);

export const usageEvents = pgTable(
  'usage_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    // Nullable, no FK: system-emitted events have no user, and we preserve usage history if a user account is deleted.
    // uuid since Task 11 — migrate usage_events.user_id column to uuid in DB if needed.
    userId: uuid('user_id'),
    kind: usageEventKindEnum('kind').notNull(),
    costUsd: numeric('cost_usd', { precision: 10, scale: 4 }),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    occurredIdx: index('usage_events_occurred_at_idx').on(t.occurredAt),
    userOccurredIdx: index('usage_events_user_occurred_at_idx').on(t.userId, t.occurredAt),
  })
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Contact = typeof contacts.$inferSelect;
export type NewContact = typeof contacts.$inferInsert;
export type Interaction = typeof interactions.$inferSelect;
export type NewInteraction = typeof interactions.$inferInsert;

export const sessions = pgTable('sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  token: text('token').notNull().unique(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const accounts = pgTable('accounts', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const verifications = pgTable('verifications', {
  id: uuid('id').defaultRandom().primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

