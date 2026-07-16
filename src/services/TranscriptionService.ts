import { env } from '../lib/env';
import { withRetry } from '../lib/retry';
import { keytermsFromVocabulary } from '../lib/personalization';

export type TranscriptSegment = { speaker: number; text: string };
export type TranscriptResult = { text: string; segments: TranscriptSegment[] | null };
export type TranscribeOptions = { initialPrompt?: string; mimeType?: string; keyterms?: string[] };

// Single Whisper call. Retried by withRetry() in transcribe() below.
// When an initialPrompt is set, we switch to Cloudflare's JSON body form
// `{ audio: [...bytes], initial_prompt }` which is the only shape that
// accepts the bias hint. Without a prompt we stick to octet-stream — same
// behavior and latency as before.
async function callWhisper(audio: Uint8Array, opts: TranscribeOptions = {}): Promise<string> {
  const { CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN } = env();
  const url = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/openai/whisper`;
  const useJsonBody = Boolean(opts.initialPrompt);
  const init: RequestInit = useJsonBody
    ? {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          audio: Array.from(audio),
          initial_prompt: opts.initialPrompt,
        }),
      }
    : {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
          'Content-Type': 'application/octet-stream',
        },
        body: new Blob([audio as Uint8Array<ArrayBuffer>], { type: 'application/octet-stream' }),
      };
  // No fetch timeout here — the Vercel 60s function ceiling is the safety net
  // on hung-upstream. Retries don't help against a hang; they only help against
  // a clean reject or 5xx response.
  const res = await fetch(url, init);
  if (!res.ok) {
    // 4xx → non-retryable HardError; 5xx → retryable TransientError. Both carry
    // the status so the predicate in transcribe() can decide.
    const text = await res.text().catch(() => '');
    const err = new Error(`Whisper HTTP ${res.status}: ${text || 'no body'}`) as Error & { status: number };
    err.status = res.status;
    throw err;
  }
  const json = (await res.json()) as {
    success: boolean;
    result?: { text: string };
    errors?: Array<{ message: string }>;
  };
  if (!json.success) {
    const reason = json.errors?.[0]?.message ?? 'unknown error';
    throw new Error(`Whisper transcription failed: ${reason}`);
  }
  return json.result?.text ?? '';
}

type Nova3Word = { word?: string; punctuated_word?: string; speaker?: number };
type Nova3Utterance = { speaker?: number; transcript?: string };

export function parseNova3Response(json: unknown): TranscriptResult {
  // Accept both the Workers AI envelope ({ result: {...} }) and raw Deepgram shape.
  const root = (json as { result?: unknown })?.result ?? json;
  const results = (root as { results?: { channels?: Array<{ alternatives?: Array<{ transcript?: string; words?: Nova3Word[] }> }>; utterances?: Nova3Utterance[] } })?.results;
  const alt = results?.channels?.[0]?.alternatives?.[0];
  const text = alt?.transcript ?? '';
  if (!text) return { text: '', segments: null };

  let segments: TranscriptSegment[] | null = null;
  const utts = results?.utterances;
  if (utts?.length) {
    segments = [];
    for (const u of utts) {
      const speaker = u.speaker ?? 0;
      const t = (u.transcript ?? '').trim();
      if (!t) continue;
      const last = segments[segments.length - 1];
      if (last && last.speaker === speaker) last.text += ` ${t}`;
      else segments.push({ speaker, text: t });
    }
  } else if (alt?.words?.some((w) => typeof w.speaker === 'number')) {
    segments = [];
    for (const w of alt.words!) {
      const speaker = w.speaker ?? 0;
      const t = w.punctuated_word ?? w.word ?? '';
      if (!t) continue;
      const last = segments[segments.length - 1];
      if (last && last.speaker === speaker) last.text += ` ${t}`;
      else segments.push({ speaker, text: t });
    }
  }
  if (segments && segments.length === 0) segments = null;
  return { text, segments };
}

async function callNova3(audio: Uint8Array, mimeType: string, keyterms: string[]): Promise<TranscriptResult> {
  const { CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN } = env();
  const params = new URLSearchParams({ diarize: 'true', smart_format: 'true', punctuate: 'true', utterances: 'true' });
  for (const term of keyterms) params.append('keyterm', term);
  const url = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/deepgram/nova-3?${params}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`, 'Content-Type': mimeType || 'application/octet-stream' },
    body: new Blob([audio as Uint8Array<ArrayBuffer>]),
    // A hung upstream must fail fast enough for a retry to fit in the function budget.
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`Nova-3 HTTP ${res.status}: ${text || 'no body'}`) as Error & { status: number };
    err.status = res.status;
    throw err;
  }
  return parseNova3Response(await res.json());
}

const retryOpts = {
  maxAttempts: 3, // 1 try + 2 retries
  baseDelayMs: 500,
  shouldRetry: (err: unknown) => {
    // Retry transient network failures (no HTTP response) and 5xx.
    if (err instanceof TypeError) return true; // fetch network error
    const status = (err as { status?: number })?.status;
    return typeof status === 'number' && status >= 500;
  },
};

export async function transcribe(audio: Uint8Array, opts: TranscribeOptions = {}): Promise<TranscriptResult> {
  if (env().TRANSCRIBE_PROVIDER === 'nova3') {
    return withRetry(() => callNova3(audio, opts.mimeType ?? '', opts.keyterms ?? []), retryOpts);
  }
  const text = await withRetry(() => callWhisper(audio, opts), retryOpts);
  return { text, segments: null };
}

// Re-export for callers that build keyterms from user vocabulary.
export { keytermsFromVocabulary };
