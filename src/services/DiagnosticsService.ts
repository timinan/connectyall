import { eq, sql } from 'drizzle-orm';
import { db } from '../lib/db/client';
import { captureDiagnostics } from '../lib/db/schema';

/**
 * Per-capture diagnostics record. We start an empty record at the top of
 * processCapture and patch fields as we go via updateDiagnostics(). Final
 * outcome + finishedAt + totalMs land in finishDiagnostics().
 *
 * Privacy notes:
 * - We do NOT log the transcript text itself, just `transcriptChars`
 * - We do NOT log raw LLM responses, just whether drift recovery fired
 * - We DO log `contactName` because it's the most useful single field for
 *   "which recording was that" disambiguation when looking at a slow capture
 */

export async function startDiagnostics(input: {
  interactionId: string;
  userId: string;
  audioBytes: number;
  audioMime: string;
}): Promise<string> {
  const [row] = await db()
    .insert(captureDiagnostics)
    .values({
      interactionId: input.interactionId,
      userId: input.userId,
      audioBytes: input.audioBytes,
      audioMime: input.audioMime,
    })
    .returning({ id: captureDiagnostics.id });
  return row.id;
}

export async function updateDiagnostics(
  id: string,
  patch: Partial<{
    audioBytes: number;
    audioDownloadMs: number;
    transcribeMs: number;
    extractMs: number;
    contactPersistMs: number;
    renderMs: number;
    cardUploadMs: number;
    transcriptChars: number;
    llmProvider: string;
    llmModel: string;
    contactName: string;
    followUpsExtracted: number;
    followUpsDrifted: boolean;
  }>,
): Promise<void> {
  if (Object.keys(patch).length === 0) return;
  await db().update(captureDiagnostics).set(patch).where(eq(captureDiagnostics.id, id));
}

export async function finishDiagnostics(
  id: string,
  outcome: 'ready' | 'failed',
  totalMs: number,
  errorStage?: string,
  errorMessage?: string,
): Promise<void> {
  await db()
    .update(captureDiagnostics)
    .set({
      outcome,
      totalMs,
      finishedAt: new Date(),
      errorStage: errorStage ?? null,
      errorMessage: errorMessage ?? null,
    })
    .where(eq(captureDiagnostics.id, id));
}

// =========================================================================
// READ-SIDE: aggregates the diagnostics page renders
// =========================================================================

export type DiagnosticsSummary = {
  totalCaptures: number;
  ready: number;
  failed: number;
  successPct: number;
  avgTotalMs: number;
  p95TotalMs: number;
  stages: {
    audioDownloadMs: number;
    transcribeMs: number;
    extractMs: number;
    contactPersistMs: number;
    renderMs: number;
    cardUploadMs: number;
  };
  drift: { drifted: number; ready: number; pct: number };
  recentFailures: Array<{ recordedAt: Date; errorStage: string | null; errorMessage: string | null }>;
  slowest: Array<{
    recordedAt: Date;
    totalMs: number | null;
    transcribeMs: number | null;
    extractMs: number | null;
    contactName: string | null;
  }>;
};

export async function getDiagnosticsSummary(days: number): Promise<DiagnosticsSummary> {
  const cutoff = sql`now() - (${days} * interval '1 day')`;

  type HeadlineRow = {
    total: number;
    ready: number;
    failed: number;
    avg_total_ms: number | null;
    p95_total_ms: number | null;
    avg_download: number | null;
    avg_transcribe: number | null;
    avg_extract: number | null;
    avg_persist: number | null;
    avg_render: number | null;
    avg_upload: number | null;
    drifted: number;
  };

  // One efficient query for the headline numbers
  const headlineResult = await db().execute<HeadlineRow>(sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE outcome = 'ready')::int AS ready,
      COUNT(*) FILTER (WHERE outcome = 'failed')::int AS failed,
      AVG(total_ms) FILTER (WHERE outcome = 'ready')::int AS avg_total_ms,
      PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY total_ms) FILTER (WHERE outcome = 'ready')::int AS p95_total_ms,
      AVG(audio_download_ms) FILTER (WHERE outcome = 'ready')::int AS avg_download,
      AVG(transcribe_ms) FILTER (WHERE outcome = 'ready')::int AS avg_transcribe,
      AVG(extract_ms) FILTER (WHERE outcome = 'ready')::int AS avg_extract,
      AVG(contact_persist_ms) FILTER (WHERE outcome = 'ready')::int AS avg_persist,
      AVG(render_ms) FILTER (WHERE outcome = 'ready')::int AS avg_render,
      AVG(card_upload_ms) FILTER (WHERE outcome = 'ready')::int AS avg_upload,
      COUNT(*) FILTER (WHERE outcome = 'ready' AND follow_ups_drifted = true)::int AS drifted
    FROM capture_diagnostics
    WHERE recorded_at >= ${cutoff}
  `);
  const headline = headlineResult.rows[0];

  type FailureRow = { recorded_at: Date; error_stage: string | null; error_message: string | null };
  const recentFailuresResult = await db().execute<FailureRow>(sql`
    SELECT recorded_at, error_stage, error_message
    FROM capture_diagnostics
    WHERE outcome = 'failed' AND recorded_at >= ${cutoff}
    ORDER BY recorded_at DESC
    LIMIT 10
  `);

  type SlowestRow = { recorded_at: Date; total_ms: number | null; transcribe_ms: number | null; extract_ms: number | null; contact_name: string | null };
  const slowestResult = await db().execute<SlowestRow>(sql`
    SELECT recorded_at, total_ms, transcribe_ms, extract_ms, contact_name
    FROM capture_diagnostics
    WHERE outcome = 'ready' AND recorded_at >= ${cutoff} AND total_ms IS NOT NULL
    ORDER BY total_ms DESC
    LIMIT 10
  `);

  const ready = Number(headline?.ready ?? 0);
  const drifted = Number(headline?.drifted ?? 0);
  return {
    totalCaptures: Number(headline?.total ?? 0),
    ready,
    failed: Number(headline?.failed ?? 0),
    successPct: ready + Number(headline?.failed ?? 0) > 0 ? Math.round(100 * ready / (ready + Number(headline?.failed ?? 0))) : 0,
    avgTotalMs: Number(headline?.avg_total_ms ?? 0),
    p95TotalMs: Number(headline?.p95_total_ms ?? 0),
    stages: {
      audioDownloadMs: Number(headline?.avg_download ?? 0),
      transcribeMs: Number(headline?.avg_transcribe ?? 0),
      extractMs: Number(headline?.avg_extract ?? 0),
      contactPersistMs: Number(headline?.avg_persist ?? 0),
      renderMs: Number(headline?.avg_render ?? 0),
      cardUploadMs: Number(headline?.avg_upload ?? 0),
    },
    drift: { drifted, ready, pct: ready > 0 ? Math.round(1000 * drifted / ready) / 10 : 0 },
    recentFailures: recentFailuresResult.rows.map((r) => ({ recordedAt: r.recorded_at, errorStage: r.error_stage, errorMessage: r.error_message })),
    slowest: slowestResult.rows.map((r) => ({ recordedAt: r.recorded_at, totalMs: r.total_ms, transcribeMs: r.transcribe_ms, extractMs: r.extract_ms, contactName: r.contact_name })),
  };
}

// =========================================================================
// USER-FLAGGED CAPTURES — recording quality feedback from beta users
// =========================================================================

export type FlaggedCapture = {
  interactionId: string;
  submittedAt: Date;
  contactName: string | null;
  comment: string | null;
  audioMime: string | null;
  structuredData: unknown;
};

export async function getFlaggedCaptures(days: number, limit = 30): Promise<FlaggedCapture[]> {
  const cutoff = sql`now() - (${days} * interval '1 day')`;
  type Row = {
    interaction_id: string;
    feedback_submitted_at: Date;
    contact_name: string | null;
    user_feedback_text: string | null;
    audio_mime: string | null;
    structured_data: unknown;
  };
  const result = await db().execute<Row>(sql`
    SELECT
      cd.interaction_id,
      cd.feedback_submitted_at,
      cd.contact_name,
      cd.user_feedback_text,
      cd.audio_mime,
      i.structured_data
    FROM capture_diagnostics cd
    LEFT JOIN interactions i ON i.id = cd.interaction_id
    WHERE cd.user_feedback_rating = 'incorrect'
      AND cd.feedback_submitted_at >= ${cutoff}
    ORDER BY cd.feedback_submitted_at DESC
    LIMIT ${limit}
  `);
  return result.rows.map((r) => ({
    interactionId: r.interaction_id,
    submittedAt: r.feedback_submitted_at,
    contactName: r.contact_name,
    comment: r.user_feedback_text,
    audioMime: r.audio_mime,
    structuredData: r.structured_data,
  }));
}
