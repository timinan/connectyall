import { and, gte, eq, sql } from 'drizzle-orm';
import { db } from '../lib/db/client';
import { usageEvents, contacts } from '../lib/db/schema';
import { env } from '../lib/env';
import { transcribe } from './TranscriptionService';
import { extract, type ExtractedContact } from './ExtractionService';
import { getById } from './UserProfileService';
import { createContact, findByNameAndCompany } from './ContactService';
import { mintStub, markReady, markFailed } from './InteractionService';
import { renderCard } from './CardService';
import { uploadBytes } from '../lib/r2/client';

type CaptureInput = {
  userId: string;         // users.id uuid
  audioR2Key: string;     // R2 key like 'captures/<uuid>.webm'
  mimeType: string;
  interactionId: string;  // pre-minted by /api/capture, always required now
};

async function capturesInLast24h(userId: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const rows = await db()
    .select({ count: sql<number>`count(*)::int` })
    .from(usageEvents)
    .where(and(eq(usageEvents.userId, userId), eq(usageEvents.kind, 'capture'), gte(usageEvents.occurredAt, since)));
  return rows[0]?.count ?? 0;
}

async function downloadFromR2(key: string): Promise<Uint8Array> {
  const url = `${env().R2_PUBLIC_URL_BASE}/${key}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`R2 fetch failed: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

async function ensureContact(userId: string, c: ExtractedContact) {
  const existing = await findByNameAndCompany(userId, c.name, c.company);
  if (existing) {
    // Merge any new info from this capture into the existing contact
    const updates: Partial<{ phones: string[]; preferredChannel: string | null; notes: string | null }> = {};
    const newPhones = c.phones.filter(p => !existing.phones.includes(p));
    if (newPhones.length > 0) updates.phones = [...existing.phones, ...newPhones];
    if (!existing.preferredChannel && c.preferred_channel) updates.preferredChannel = c.preferred_channel;
    if (!existing.notes && c.notes) updates.notes = c.notes;
    if (Object.keys(updates).length > 0) {
      await db().update(contacts).set(updates).where(eq(contacts.id, existing.id));
    }
    return existing;
  }
  return createContact({
    userId,
    name: c.name,
    role: c.role,
    company: c.company,
    emails: c.emails,
    phones: c.phones,
    links: c.links,
    preferredChannel: c.preferred_channel,
    notes: c.notes,
  });
}

export async function processCapture(input: CaptureInput): Promise<void> {
  const count = await capturesInLast24h(input.userId);
  if (count >= env().MAX_CAPTURES_PER_DAY) {
    await markFailed(input.interactionId);
    return;
  }

  const profile = await getById(input.userId);
  if (!profile) {
    await markFailed(input.interactionId);
    return;
  }

  await db().insert(usageEvents).values({ userId: input.userId, kind: 'capture' });

  const audio = await downloadFromR2(input.audioR2Key);

  const transcript = await transcribe(audio);

  if (!transcript.trim()) {
    await markFailed(input.interactionId);
    return;
  }

  const extraction = await extract({ transcript, selfIntro: profile.selfIntro });

  if (extraction.contacts.length === 0) {
    await markFailed(input.interactionId);
    return;
  }

  const [firstContact, ...restContacts] = extraction.contacts;

  // Process the first contact using the pre-minted interactionId
  const firstResult = await ensureContact(input.userId, firstContact);
  const png = await renderCard({
    profile: {
      displayName: profile.displayName,
      tagline: profile.tagline,
      telegramUsername: profile.telegramUsername,
      photoR2Url: profile.photoR2Url,
      socials: profile.socials,
    },
  });
  await markReady(input.interactionId, firstResult.id, {
    ...firstContact,
    was_live_recording: extraction.was_live_recording,
    photo_file_id: null,
  });
  await uploadBytes({
    key: `cards/${input.interactionId}.png`,
    bytes: new Uint8Array(png),
    contentType: 'image/png',
  });

  // Process any additional contacts — mint new stubs for each
  for (const c of restContacts) {
    const contact = await ensureContact(input.userId, c);
    const extraId = await mintStub('voice');
    const extraPng = await renderCard({
      profile: {
        displayName: profile.displayName,
        tagline: profile.tagline,
        telegramUsername: profile.telegramUsername,
        photoR2Url: profile.photoR2Url,
        socials: profile.socials,
      },
    });
    await markReady(extraId, contact.id, {
      ...c,
      was_live_recording: extraction.was_live_recording,
      photo_file_id: null,
    });
    await uploadBytes({
      key: `cards/${extraId}.png`,
      bytes: new Uint8Array(extraPng),
      contentType: 'image/png',
    });
  }
}
