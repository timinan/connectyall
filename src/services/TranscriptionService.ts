import { env } from '../lib/env';
import { withRetry } from '../lib/retry';

// Single Whisper call. Retried by withRetry() in transcribe() below.
async function callWhisper(audio: Uint8Array): Promise<string> {
  const { CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN } = env();
  const url = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/openai/whisper`;
  // 30s timeout: a hung Whisper upstream previously burned the whole function budget
  // silently; now it fails fast enough for one retry to fit inside the function ceiling.
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
      'Content-Type': 'application/octet-stream',
    },
    body: new Blob([audio as Uint8Array<ArrayBuffer>], { type: 'application/octet-stream' }),
    signal: AbortSignal.timeout(30_000),
  });
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

export async function transcribe(audio: Uint8Array): Promise<string> {
  return withRetry(() => callWhisper(audio), {
    maxAttempts: 3, // 1 try + 2 retries
    baseDelayMs: 500,
    shouldRetry: (err) => {
      // Retry transient network failures (no HTTP response) and 5xx.
      if (err instanceof TypeError) return true; // fetch network error
      if (err instanceof DOMException && (err.name === 'TimeoutError' || err.name === 'AbortError')) return true;
      const status = (err as { status?: number })?.status;
      return typeof status === 'number' && status >= 500;
    },
  });
}
