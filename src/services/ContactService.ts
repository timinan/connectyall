import { and, eq, sql } from 'drizzle-orm';
import { db } from '../lib/db/client';
import {
  contacts, interactions,
  type Contact, type NewContact,
} from '../lib/db/schema';

export type UpdatableField =
  | { kind: 'name'; value: string }
  | { kind: 'telegram'; value: string }
  | { kind: 'x'; value: string }
  | { kind: 'linkedin'; value: string }
  | { kind: 'website'; value: string }
  | { kind: 'telegram-clear' }
  | { kind: 'x-clear' }
  | { kind: 'linkedin-clear' }
  | { kind: 'website-clear' }
  | { kind: 'email'; index: number; value: string }
  | { kind: 'email-add'; value: string }
  | { kind: 'email-remove'; index: number }
  | { kind: 'phone'; index: number; value: string }
  | { kind: 'phone-add'; value: string }
  | { kind: 'phone-remove'; index: number }
  | { kind: 'preferred'; value: 'telegram' | 'email' | 'phone' | 'x' | 'linkedin' | 'website' | null };

export async function createContact(input: NewContact): Promise<Contact> {
  const [row] = await db().insert(contacts).values(input).returning();
  return row;
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
      contactPhones: contacts.phones,
      contactPreferredChannel: contacts.preferredChannel,
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
      phones: r.contactPhones,
      preferredChannel: r.contactPreferredChannel,
      links: r.contactLinks,
      notesSummary: r.contactNotesSummary,
      lastTouchedAt: r.contactLastTouchedAt,
      createdAt: r.contactCreatedAt,
    },
  };
}

export async function updateContactField(contactId: string, field: UpdatableField): Promise<void> {
  switch (field.kind) {
    case 'name':
      await db().update(contacts).set({ name: field.value }).where(eq(contacts.id, contactId));
      break;
    case 'telegram':
    case 'x':
    case 'linkedin':
    case 'website':
      await db()
        .update(contacts)
        .set({ links: sql`${contacts.links} || ${JSON.stringify({ [field.kind]: field.value })}::jsonb` })
        .where(eq(contacts.id, contactId));
      break;
    case 'email': {
      const rows = await db().select({ emails: contacts.emails }).from(contacts).where(eq(contacts.id, contactId)).limit(1);
      if (!rows[0]) break;
      const emails = [...(rows[0].emails ?? [])];
      emails[field.index] = field.value;
      await db().update(contacts).set({ emails }).where(eq(contacts.id, contactId));
      break;
    }
    case 'email-add': {
      const rows = await db().select({ emails: contacts.emails }).from(contacts).where(eq(contacts.id, contactId)).limit(1);
      if (!rows[0]) break;
      const emails = [...(rows[0].emails ?? []), field.value];
      await db().update(contacts).set({ emails }).where(eq(contacts.id, contactId));
      break;
    }
    case 'email-remove': {
      const rows = await db().select({ emails: contacts.emails }).from(contacts).where(eq(contacts.id, contactId)).limit(1);
      if (!rows[0]) break;
      const emails = (rows[0].emails ?? []).filter((_, i) => i !== field.index);
      await db().update(contacts).set({ emails }).where(eq(contacts.id, contactId));
      break;
    }
    case 'phone': {
      const rows = await db().select({ phones: contacts.phones }).from(contacts).where(eq(contacts.id, contactId)).limit(1);
      if (!rows[0]) break;
      const phones = [...(rows[0].phones ?? [])];
      phones[field.index] = field.value;
      await db().update(contacts).set({ phones }).where(eq(contacts.id, contactId));
      break;
    }
    case 'phone-add': {
      const rows = await db().select({ phones: contacts.phones }).from(contacts).where(eq(contacts.id, contactId)).limit(1);
      if (!rows[0]) break;
      const phones = [...(rows[0].phones ?? []), field.value];
      await db().update(contacts).set({ phones }).where(eq(contacts.id, contactId));
      break;
    }
    case 'phone-remove': {
      const rows = await db().select({ phones: contacts.phones }).from(contacts).where(eq(contacts.id, contactId)).limit(1);
      if (!rows[0]) break;
      const phones = (rows[0].phones ?? []).filter((_, i) => i !== field.index);
      await db().update(contacts).set({ phones }).where(eq(contacts.id, contactId));
      break;
    }
    case 'telegram-clear':
    case 'x-clear':
    case 'linkedin-clear':
    case 'website-clear': {
      const linkKey = field.kind.replace('-clear', ''); // 'telegram' | 'x' | 'linkedin' | 'website'
      await db()
        .update(contacts)
        .set({ links: sql`${contacts.links} - ${linkKey}` })
        .where(eq(contacts.id, contactId));
      break;
    }
    case 'preferred':
      await db().update(contacts).set({ preferredChannel: field.value }).where(eq(contacts.id, contactId));
      break;
  }
}

export async function setContactLink(
  contactId: string,
  kind: 'telegram' | 'x' | 'linkedin' | 'website',
  value: string
): Promise<void> {
  return updateContactField(contactId, { kind, value });
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
