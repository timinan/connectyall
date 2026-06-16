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
): Promise<string> {
  const [row] = await db()
    .insert(interactions)
    .values({ contactId, source, structuredData })
    .returning({ id: interactions.id });
  await db().update(contacts).set({ lastTouchedAt: new Date() }).where(eq(contacts.id, contactId));
  return row.id;
}

export async function getInteractionWithContact(
  interactionId: string
): Promise<{ interaction: { id: string; contactId: string; structuredData: unknown }; contact: Contact } | null> {
  const rows = await db()
    .select({
      interactionId: interactions.id,
      interactionContactId: interactions.contactId,
      interactionStructured: interactions.structuredData,
      contactId: contacts.id,
      contactUserId: contacts.userId,
      contactName: contacts.name,
      contactRole: contacts.role,
      contactCompany: contacts.company,
      contactEmails: contacts.emails,
      contactLinks: contacts.links,
      contactNotesSummary: contacts.notesSummary,
      contactLastTouchedAt: contacts.lastTouchedAt,
      contactCreatedAt: contacts.createdAt,
    })
    .from(interactions)
    .innerJoin(contacts, eq(contacts.id, interactions.contactId))
    .where(eq(interactions.id, interactionId))
    .limit(1);
  const r = rows[0];
  if (!r) return null;
  return {
    interaction: { id: r.interactionId, contactId: r.interactionContactId!, structuredData: r.interactionStructured },
    contact: {
      id: r.contactId,
      userId: r.contactUserId!,
      name: r.contactName,
      role: r.contactRole,
      company: r.contactCompany,
      emails: r.contactEmails,
      links: r.contactLinks,
      notesSummary: r.contactNotesSummary,
      lastTouchedAt: r.contactLastTouchedAt,
      createdAt: r.contactCreatedAt,
    },
  };
}

export async function setContactLink(
  contactId: string,
  kind: 'telegram' | 'x' | 'linkedin' | 'website',
  value: string
): Promise<void> {
  await db()
    .update(contacts)
    .set({ links: sql`${contacts.links} || ${JSON.stringify({ [kind]: value })}::jsonb` })
    .where(eq(contacts.id, contactId));
}

export async function findByNameAndCompany(
  userId: string,
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

export async function listContacts(userId: string, opts: { limit: number; offset: number }): Promise<Contact[]> {
  return db().select().from(contacts)
    .where(eq(contacts.userId, userId))
    .orderBy(sql`${contacts.lastTouchedAt} DESC`)
    .limit(opts.limit)
    .offset(opts.offset);
}
