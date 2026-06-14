import { and, eq, sql } from 'drizzle-orm';
import { db } from '../lib/db/client';
import {
  contacts, interactions,
  type Contact, type NewContact, type NewInteraction,
} from '../lib/db/schema';

export async function createContact(input: NewContact): Promise<Contact> {
  const [row] = await db().insert(contacts).values(input).returning();
  return row;
}

export async function addInteraction(
  contactId: string,
  source: NewInteraction['source'],
  structuredData: unknown
): Promise<void> {
  await db().insert(interactions).values({ contactId, source, structuredData });
  await db().update(contacts).set({ lastTouchedAt: new Date() }).where(eq(contacts.id, contactId));
}

export async function findByNameAndCompany(
  userId: number,
  name: string,
  company: string | null
): Promise<Contact | null> {
  const cond = company
    ? and(
        eq(contacts.userId, userId),
        sql`LOWER(${contacts.name}) = LOWER(${name})`,
        sql`LOWER(${contacts.company}) = LOWER(${company})`,
      )
    : and(eq(contacts.userId, userId), sql`LOWER(${contacts.name}) = LOWER(${name})`);

  const rows = await db().select().from(contacts).where(cond).limit(1);
  return rows[0] ?? null;
}

export async function listContacts(userId: number, opts: { limit: number; offset: number }): Promise<Contact[]> {
  return db().select().from(contacts)
    .where(eq(contacts.userId, userId))
    .orderBy(sql`${contacts.lastTouchedAt} DESC`)
    .limit(opts.limit)
    .offset(opts.offset);
}
