import { and, gte, eq, lt, isNotNull, sql } from 'drizzle-orm';
import { db } from '../lib/db/client';
import { usageEvents, contacts, interactions } from '../lib/db/schema';
import { env } from '../lib/env';
import { transcribe } from './TranscriptionService';
import { extract, type ExtractedContact } from './ExtractionService';
import { getById } from './UserProfileService';
import { createContact, findByNameAndCompany } from './ContactService';
import { mintStub, markReady, markFailed } from './InteractionService';
import { renderCard } from './CardService';
import { uploadBytes, downloadObject } from '../lib/r2/client';
import { createManyForInteraction as createManyFollowUps } from './FollowUpsService';
import { resolveRelativeDate } from '../lib/follow-up-dates';
import { startDiagnostics, updateDiagnostics, finishDiagnostics } from './DiagnosticsService';
import { listRecentCorrections } from './CorrectionsService';
import { listExamples as listCalibrationExamples } from './CalibrationService';
import { normalizeVocabulary, buildWhisperInitialPrompt, keytermsFromVocabulary } from '../lib/personalization';

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
  return downloadObject(key);
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

  const t0 = Date.now();
  const diagId = await startDiagnostics({
    interactionId: input.interactionId,
    userId: input.userId,
    audioBytes: 0, // patched after download
    audioMime: input.mimeType,
  });

  let stage = 'download';
  let audio: Uint8Array;
  try {
    const sDl = Date.now();
    audio = await downloadFromR2(input.audioR2Key);
    await updateDiagnostics(diagId, { audioDownloadMs: Date.now() - sDl, audioBytes: audio.byteLength });
  } catch (err) {
    await finishDiagnostics(diagId, 'failed', Date.now() - t0, stage, err instanceof Error ? err.message : String(err));
    throw err;
  }

  const vocabulary = normalizeVocabulary(profile.vocabulary);

  stage = 'transcribe';
  let transcript: string;
  let tr: Awaited<ReturnType<typeof transcribe>>;
  try {
    const sTr = Date.now();
    tr = await transcribe(audio, {
      initialPrompt: buildWhisperInitialPrompt(vocabulary),
      mimeType: input.mimeType,
      keyterms: keytermsFromVocabulary(vocabulary),
    });
    transcript = tr.text;
    await updateDiagnostics(diagId, {
      transcribeMs: Date.now() - sTr,
      transcriptChars: transcript.length,
      transcribeProvider: env().TRANSCRIBE_PROVIDER,
      speakerCount: tr.segments ? new Set(tr.segments.map((s) => s.speaker)).size : null,
    });
  } catch (err) {
    await finishDiagnostics(diagId, 'failed', Date.now() - t0, stage, err instanceof Error ? err.message : String(err));
    throw err;
  }

  if (!transcript.trim()) {
    await finishDiagnostics(diagId, 'failed', Date.now() - t0, 'transcribe', 'empty transcript');
    await markFailed(input.interactionId);
    return;
  }

  // Load personalization context in parallel with the extraction setup.
  const [recentCorrections, calibrationExamples] = await Promise.all([
    listRecentCorrections(input.userId, 10).catch(() => []),
    listCalibrationExamples(input.userId, 3).catch(() => []),
  ]);

  stage = 'extract';
  let extraction: Awaited<ReturnType<typeof extract>>;
  try {
    const sEx = Date.now();
    extraction = await extract({
      transcript,
      segments: tr.segments,
      userName: profile.displayName,
      selfIntro: profile.selfIntro,
      vocabulary,
      corrections: recentCorrections.map((c) => ({
        field: c.field, originalText: c.originalText, correctedText: c.correctedText,
      })),
      examples: calibrationExamples.map((e) => ({ transcript: e.transcript, expectedJson: e.expectedJson })),
    });
    const firstExtracted = extraction.contacts[0];
    await updateDiagnostics(diagId, {
      extractMs: Date.now() - sEx,
      llmProvider: env().LLM_PROVIDER,
      llmModel: env().LLM_MODEL,
      contactName: firstExtracted?.name ?? null,
      followUpsExtracted: firstExtracted?.follow_ups?.length ?? 0,
    });
  } catch (err) {
    await finishDiagnostics(diagId, 'failed', Date.now() - t0, stage, err instanceof Error ? err.message : String(err));
    throw err;
  }

  if (extraction.contacts.length === 0) {
    await finishDiagnostics(diagId, 'failed', Date.now() - t0, 'extract', 'no contacts extracted');
    await markFailed(input.interactionId);
    return;
  }

  const [firstContact, ...restContacts] = extraction.contacts;

  // Process the first contact using the pre-minted interactionId
  stage = 'persist';
  let firstResult: Awaited<ReturnType<typeof ensureContact>>;
  try {
    const sPe = Date.now();
    firstResult = await ensureContact(input.userId, firstContact);
    await updateDiagnostics(diagId, { contactPersistMs: Date.now() - sPe });
  } catch (err) {
    await finishDiagnostics(diagId, 'failed', Date.now() - t0, stage, err instanceof Error ? err.message : String(err));
    throw err;
  }

  stage = 'render';
  let png: Awaited<ReturnType<typeof renderCard>>;
  try {
    const sRe = Date.now();
    png = await renderCard({
      profile: {
        displayName: profile.displayName,
        tagline: profile.tagline,
        telegramUsername: profile.telegramUsername,
        photoR2Url: profile.photoR2Url,
        socials: profile.socials,
      },
    });
    await updateDiagnostics(diagId, { renderMs: Date.now() - sRe });
  } catch (err) {
    await finishDiagnostics(diagId, 'failed', Date.now() - t0, stage, err instanceof Error ? err.message : String(err));
    throw err;
  }

  await markReady(input.interactionId, firstResult.id, {
    ...firstContact,
    was_live_recording: extraction.was_live_recording,
    photo_file_id: null,
  });

  stage = 'upload';
  try {
    const sUp = Date.now();
    await uploadBytes({
      key: `cards/${input.interactionId}.png`,
      bytes: new Uint8Array(png),
      contentType: 'image/png',
    });
    await updateDiagnostics(diagId, { cardUploadMs: Date.now() - sUp });
  } catch (err) {
    await finishDiagnostics(diagId, 'failed', Date.now() - t0, stage, err instanceof Error ? err.message : String(err));
    throw err;
  }

  // Persist any follow-ups the LLM extracted for the first contact.
  const followUpsForFirst = (firstContact.follow_ups ?? [])
    .map((fu) => ({
      topic: fu.topic.trim(),
      dueAt: resolveRelativeDate(fu.relative_due ?? null, new Date(), profile.timezone),
    }))
    .filter((fu) => fu.topic.length > 0);
  if (followUpsForFirst.length > 0) {
    await createManyFollowUps({
      userId: input.userId,
      contactId: firstResult.id,
      interactionId: input.interactionId,
      followUps: followUpsForFirst,
    });
  }

  await finishDiagnostics(diagId, 'ready', Date.now() - t0);

  // Record the usage event AFTER the row has reached `ready`. If the
  // function crashed earlier, the janitor will re-run processCapture and
  // we don't want to charge the user's daily cap twice for the same audio.
  await db().insert(usageEvents).values({ userId: input.userId, kind: 'capture' });

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
    const followUpsForExtra = (c.follow_ups ?? [])
      .map((fu) => ({
        topic: fu.topic.trim(),
        dueAt: resolveRelativeDate(fu.relative_due ?? null, new Date(), profile.timezone),
      }))
      .filter((fu) => fu.topic.length > 0);
    if (followUpsForExtra.length > 0) {
      await createManyFollowUps({
        userId: input.userId,
        contactId: contact.id,
        interactionId: extraId,
        followUps: followUpsForExtra,
      });
    }
  }
}

/**
 * Find interactions that are stuck mid-pipeline. The janitor calls this every
 * 2 minutes to recover anything the inline path dropped (network blip,
 * function timeout, deploy interruption).
 *
 * Returns only rows that have the capture metadata we need to re-run the
 * pipeline. Rows without it (legacy, or secondary contacts that don't have
 * their own audio) are filtered out by the IS NOT NULL guards.
 */
export async function findStuckProcessingCaptures(opts: {
  maxAgeSeconds: number;
  limit: number;
}): Promise<Array<{ id: string; userId: string; audioR2Key: string; mimeType: string; occurredAt: Date }>> {
  const cutoff = sql`now() - (${opts.maxAgeSeconds} * interval '1 second')`;
  const rows = await db()
    .select({
      id: interactions.id,
      userId: interactions.userId,
      audioR2Key: interactions.audioR2Key,
      mimeType: interactions.mimeType,
      occurredAt: interactions.occurredAt,
    })
    .from(interactions)
    .where(
      and(
        eq(interactions.status, 'processing'),
        lt(interactions.occurredAt, cutoff as unknown as Date),
        isNotNull(interactions.userId),
        isNotNull(interactions.audioR2Key),
        isNotNull(interactions.mimeType),
      ),
    )
    .limit(opts.limit);
  // The runtime guard mirrors the SQL filter so the return type is narrow.
  return rows
    .filter((r): r is { id: string; userId: string; audioR2Key: string; mimeType: string; occurredAt: Date } =>
      r.userId !== null && r.audioR2Key !== null && r.mimeType !== null)
    .map((r) => ({ id: r.id, userId: r.userId, audioR2Key: r.audioR2Key, mimeType: r.mimeType, occurredAt: r.occurredAt }));
}
