import {
  pgTable, bigint, text, jsonb, timestamp, uuid, numeric, index, pgEnum,
} from 'drizzle-orm/pg-core';

export const sourceEnum = pgEnum('source', ['voice', 'audio', 'video', 'manual']);

export type Socials = { x?: string; linkedin?: string; email?: string; website?: string };
export type ContactLinks = { telegram?: string; x?: string; linkedin?: string; website?: string };

export const users = pgTable('users', {
  telegramUserId: bigint('telegram_user_id', { mode: 'number' }).primaryKey(),
  telegramUsername: text('telegram_username'),
  displayName: text('display_name').notNull(),
  tagline: text('tagline'),
  photoR2Url: text('photo_r2_url'),
  selfIntro: text('self_intro'),
  socials: jsonb('socials').$type<Socials>().default({}).notNull(),
  timezone: text('timezone').default('UTC').notNull(),
  consentAcknowledgedAt: timestamp('consent_acknowledged_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const contacts = pgTable(
  'contacts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: bigint('user_id', { mode: 'number' })
      .notNull()
      .references(() => users.telegramUserId, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    role: text('role'),
    company: text('company'),
    emails: text('emails').array().default([]).notNull(),
    links: jsonb('links').$type<ContactLinks>().default({}).notNull(),
    notesSummary: text('notes_summary'),
    lastTouchedAt: timestamp('last_touched_at').defaultNow().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => ({
    userIdx: index('contacts_user_id_idx').on(t.userId),
    userNameIdx: index('contacts_user_name_idx').on(t.userId, t.name),
  })
);

export const interactions = pgTable(
  'interactions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    source: sourceEnum('source').notNull(),
    structuredData: jsonb('structured_data').notNull(),
    occurredAt: timestamp('occurred_at').defaultNow().notNull(),
  },
  (t) => ({
    contactIdx: index('interactions_contact_id_idx').on(t.contactId),
  })
);

export const usageEvents = pgTable(
  'usage_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: bigint('user_id', { mode: 'number' }),
    kind: text('kind').notNull(),
    costUsd: numeric('cost_usd', { precision: 10, scale: 4 }),
    occurredAt: timestamp('occurred_at').defaultNow().notNull(),
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
