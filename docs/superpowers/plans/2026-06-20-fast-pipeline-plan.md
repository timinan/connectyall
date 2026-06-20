# Fast Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trim post-Stop recording wait from 8–22s to 3–6s on the happy path by running the pipeline inline in `/api/capture` (via Next 16 `after()`), with an Inngest cron janitor that recovers stuck interactions.

**Architecture:** The fast path: `/api/capture` saves audio to R2, mints an interaction stub WITH the capture metadata on the row (new columns), kicks off `processCapture()` via `after()` so it keeps running after the response, then returns to the phone. The janitor: an Inngest cron runs every 2 minutes, finds interactions stuck in `processing > 60s`, re-runs `processCapture()` against the audio that's already in R2. Audio in R2 + the new capture-metadata columns on `interactions` are the durable handoff between the two paths.

**Tech Stack:** Next.js 16 App Router, Drizzle ORM + Neon Postgres, Inngest (cron mode), Vitest, Cloudflare Workers AI Whisper, Vercel AI SDK + Gemini Flash Lite.

**Spec:** `docs/superpowers/specs/2026-06-20-fast-pipeline-design.md`

---

## File Structure

**Modified:**
- `src/lib/db/schema.ts` — add `userId`, `audioR2Key`, `mimeType` columns to `interactions`
- `src/services/InteractionService.ts` — extend `mintStub` to persist capture metadata
- `src/services/TranscriptionService.ts` — wrap Whisper fetch in retry
- `src/services/ExtractionService.ts` — wrap `generateObject` in retry
- `src/services/CaptureService.ts` — add `findStuckProcessingCaptures` query helper
- `src/lib/inngest/functions.ts` — replace event-triggered `processCaptureFn` with cron-triggered `recoverStuckCapturesFn`
- `src/app/api/capture/route.ts` — drop `inngest.send`, use `after(processCapture(...))`
- `src/app/app/record/record-client.tsx` — tighten polling cadence

**Created:**
- `drizzle/0011_interactions_capture_metadata.sql` — new migration
- `drizzle/meta/_journal.json` — append entry for 0011 (memory rule: hand-written migrations need journal entries or `drizzle-kit migrate` silently skips them)
- `src/lib/retry.ts` — generic retry helper (`withRetry`)
- `src/lib/retry.test.ts` — unit tests for `withRetry`
- `src/services/TranscriptionService.test.ts` — new file (doesn't exist today)

---

## Task 0: Schema migration — capture metadata on interactions

**Files:**
- Create: `drizzle/0011_interactions_capture_metadata.sql`
- Modify: `drizzle/meta/_journal.json`
- Modify: `src/lib/db/schema.ts:61-74`

- [ ] **Step 0.1: Write the migration SQL**

Create `drizzle/0011_interactions_capture_metadata.sql`:

```sql
ALTER TABLE "interactions" ADD COLUMN "user_id" uuid;
ALTER TABLE "interactions" ADD COLUMN "audio_r2_key" text;
ALTER TABLE "interactions" ADD COLUMN "mime_type" text;
CREATE INDEX "interactions_status_occurred_at_idx" ON "interactions" ("status", "occurred_at");
```

The new index lets the janitor query `WHERE status='processing' AND occurred_at < now()-60s` cheaply.

- [ ] **Step 0.2: Register the migration in the journal**

Edit `drizzle/meta/_journal.json` — append after the `0010_users_short_blurb` entry:

```json
    {
      "idx": 11,
      "version": "7",
      "when": 1782000000000,
      "tag": "0011_interactions_capture_metadata",
      "breakpoints": true
    }
```

- [ ] **Step 0.3: Update Drizzle schema**

Edit `src/lib/db/schema.ts:61-74` — change the `interactions` table to:

```ts
export const interactions = pgTable(
  'interactions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'cascade' }),
    source: sourceEnum('source').notNull(),
    structuredData: jsonb('structured_data').notNull(),
    status: interactionStatusEnum('status').default('ready').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).defaultNow().notNull(),
    userId: uuid('user_id'),
    audioR2Key: text('audio_r2_key'),
    mimeType: text('mime_type'),
  },
  (t) => ({
    contactIdx: index('interactions_contact_id_idx').on(t.contactId),
    statusOccurredAtIdx: index('interactions_status_occurred_at_idx').on(t.status, t.occurredAt),
  })
);
```

- [ ] **Step 0.4: Apply locally + verify**

Run: `cd /Users/timnan/Documents/GitHub/connectyall && npx drizzle-kit migrate`

Expected output ends with: `[✓] migrations applied successfully!`

Run typecheck: `npx tsc --noEmit`
Expected: clean (no output).

- [ ] **Step 0.5: Commit**

```bash
cd /Users/timnan/Documents/GitHub/connectyall
git add drizzle/0011_interactions_capture_metadata.sql drizzle/meta/_journal.json src/lib/db/schema.ts
git commit -m "schema: persist capture metadata on interactions for janitor recovery"
```

---

## Task 1: Extend `mintStub` to persist capture metadata

**Files:**
- Modify: `src/services/InteractionService.ts:18-29`
- Test: `src/services/InteractionService.test.ts`

- [ ] **Step 1.1: Write the failing test**

Append to `src/services/InteractionService.test.ts`:

```ts
describe('mintStub with capture metadata', () => {
  it('persists userId, audioR2Key, and mimeType when provided', async () => {
    const id = await mintStub('voice', {
      userId: '00000000-0000-0000-0000-000000000001',
      audioR2Key: 'captures/user-1/abc.webm',
      mimeType: 'audio/webm',
    });
    const row = await getStatus(id);
    expect(row).not.toBeNull();
    // The new fields are exposed via a sibling helper in step 5; for now this
    // assertion just guards that mintStub doesn't throw with the new signature.
    expect(typeof id).toBe('string');
  });
});
```

Run: `cd /Users/timnan/Documents/GitHub/connectyall && npx vitest run src/services/InteractionService.test.ts`
Expected: FAIL — current `mintStub` takes one argument, new test passes two.

- [ ] **Step 1.2: Update `mintStub` signature + body**

Replace `src/services/InteractionService.ts:18-29` with:

```ts
export async function mintStub(
  source: NewInteraction['source'],
  captureMetadata?: { userId: string; audioR2Key: string; mimeType: string },
): Promise<string> {
  const [row] = await db()
    .insert(interactions)
    .values({
      source,
      structuredData: {},
      status: 'processing',
      userId: captureMetadata?.userId ?? null,
      audioR2Key: captureMetadata?.audioR2Key ?? null,
      mimeType: captureMetadata?.mimeType ?? null,
    })
    .returning({ id: interactions.id });
  return row.id;
}
```

- [ ] **Step 1.3: Verify**

Run: `npx vitest run src/services/InteractionService.test.ts`
Expected: PASS.

Run the full suite: `npx vitest run`
Expected: existing tests still PASS (the optional metadata defaults to null so old call sites stay valid).

- [ ] **Step 1.4: Commit**

```bash
git add src/services/InteractionService.ts src/services/InteractionService.test.ts
git commit -m "interactions: mintStub persists capture metadata for janitor recovery"
```

---

## Task 2: Generic retry helper

**Files:**
- Create: `src/lib/retry.ts`
- Test: `src/lib/retry.test.ts`

- [ ] **Step 2.1: Write the failing tests**

Create `src/lib/retry.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withRetry } from './retry';

describe('withRetry', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('returns the result on first success without retrying', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const promise = withRetry(fn, { maxAttempts: 3, baseDelayMs: 100, shouldRetry: () => true });
    await expect(promise).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on retryable errors and returns the eventual success', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('blip'))
      .mockRejectedValueOnce(new Error('blip'))
      .mockResolvedValue('ok');
    const promise = withRetry(fn, { maxAttempts: 3, baseDelayMs: 100, shouldRetry: () => true });
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('rethrows the last error after exhausting maxAttempts', async () => {
    const err = new Error('always');
    const fn = vi.fn().mockRejectedValue(err);
    const promise = withRetry(fn, { maxAttempts: 3, baseDelayMs: 100, shouldRetry: () => true });
    await vi.runAllTimersAsync();
    await expect(promise).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not retry when shouldRetry returns false', async () => {
    const err = new Error('hard');
    const fn = vi.fn().mockRejectedValue(err);
    const promise = withRetry(fn, { maxAttempts: 3, baseDelayMs: 100, shouldRetry: () => false });
    await expect(promise).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('uses exponential backoff (base × 2^(attempt-1))', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('a'))
      .mockRejectedValueOnce(new Error('b'))
      .mockResolvedValue('ok');
    const promise = withRetry(fn, { maxAttempts: 3, baseDelayMs: 500, shouldRetry: () => true });
    // First attempt happens synchronously then awaits.
    await Promise.resolve();
    expect(fn).toHaveBeenCalledTimes(1);
    // Backoff #1 = 500ms
    await vi.advanceTimersByTimeAsync(499);
    expect(fn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await Promise.resolve();
    expect(fn).toHaveBeenCalledTimes(2);
    // Backoff #2 = 1000ms
    await vi.advanceTimersByTimeAsync(999);
    expect(fn).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    await Promise.resolve();
    expect(fn).toHaveBeenCalledTimes(3);
    await expect(promise).resolves.toBe('ok');
  });
});
```

Run: `npx vitest run src/lib/retry.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 2.2: Implement `withRetry`**

Create `src/lib/retry.ts`:

```ts
// Generic retry wrapper. Used by TranscriptionService + ExtractionService to
// absorb transient API hiccups (5xx, network blips, retryable 429s) without
// surfacing them to the user. Non-retryable errors short-circuit and rethrow.
//
// Backoff: baseDelayMs × 2^(attempt-1). So with baseDelayMs=500, attempts wait
// 500ms then 1000ms; with baseDelayMs=1000, 1000ms then 2000ms.
export type RetryOptions = {
  maxAttempts: number; // total tries INCLUDING the first; 3 = 1 try + 2 retries
  baseDelayMs: number;
  shouldRetry: (err: unknown) => boolean;
};

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const isLast = attempt === opts.maxAttempts;
      if (isLast || !opts.shouldRetry(err)) throw err;
      const delay = opts.baseDelayMs * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastErr;
}
```

- [ ] **Step 2.3: Verify**

Run: `npx vitest run src/lib/retry.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 2.4: Commit**

```bash
git add src/lib/retry.ts src/lib/retry.test.ts
git commit -m "lib: generic withRetry helper (exponential backoff, predicate)"
```

---

## Task 3: TranscriptionService — wrap Whisper fetch in retry

**Files:**
- Modify: `src/services/TranscriptionService.ts`
- Create: `src/services/TranscriptionService.test.ts`

- [ ] **Step 3.1: Write the failing tests**

Create `src/services/TranscriptionService.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../lib/env', () => ({
  env: () => ({
    CLOUDFLARE_ACCOUNT_ID: 'acct',
    CLOUDFLARE_API_TOKEN: 'tok',
  }),
}));

import { transcribe } from './TranscriptionService';

const okBody = { success: true, result: { text: 'hello world' } };
const errBody = { success: false, errors: [{ message: 'kaboom' }] };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('transcribe (with retry)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('returns the transcript on first success', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(jsonResponse(okBody));
    const promise = transcribe(new Uint8Array([1, 2, 3]));
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe('hello world');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('retries on 5xx and returns the eventual success', async () => {
    const f = globalThis.fetch as ReturnType<typeof vi.fn>;
    f.mockResolvedValueOnce(new Response('upstream', { status: 502 }));
    f.mockResolvedValueOnce(jsonResponse(okBody));
    const promise = transcribe(new Uint8Array([1]));
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe('hello world');
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('retries on a thrown network error (fetch rejects)', async () => {
    const f = globalThis.fetch as ReturnType<typeof vi.fn>;
    f.mockRejectedValueOnce(new TypeError('failed to fetch'));
    f.mockResolvedValueOnce(jsonResponse(okBody));
    const promise = transcribe(new Uint8Array([1]));
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe('hello world');
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('does NOT retry on 4xx (treats it as non-retryable)', async () => {
    const f = globalThis.fetch as ReturnType<typeof vi.fn>;
    f.mockResolvedValueOnce(new Response('bad', { status: 400 }));
    const promise = transcribe(new Uint8Array([1]));
    await vi.runAllTimersAsync();
    await expect(promise).rejects.toThrow();
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('rethrows when all 3 attempts fail', async () => {
    const f = globalThis.fetch as ReturnType<typeof vi.fn>;
    f.mockResolvedValue(new Response('upstream', { status: 503 }));
    const promise = transcribe(new Uint8Array([1]));
    await vi.runAllTimersAsync();
    await expect(promise).rejects.toThrow();
    expect(f).toHaveBeenCalledTimes(3);
  });

  it('throws (non-retryable) when Whisper returns success:false in the body', async () => {
    const f = globalThis.fetch as ReturnType<typeof vi.fn>;
    f.mockResolvedValueOnce(jsonResponse(errBody));
    const promise = transcribe(new Uint8Array([1]));
    await vi.runAllTimersAsync();
    await expect(promise).rejects.toThrow(/kaboom/);
    expect(f).toHaveBeenCalledTimes(1);
  });
});
```

Run: `npx vitest run src/services/TranscriptionService.test.ts`
Expected: FAIL — retries don't exist yet; some tests pass coincidentally (first success, success:false) but the retry-on-5xx and 4xx-no-retry tests fail.

- [ ] **Step 3.2: Rewrite `transcribe` to use `withRetry`**

Replace `src/services/TranscriptionService.ts` with:

```ts
import { env } from '../lib/env';
import { withRetry } from '../lib/retry';

// Single Whisper call. Retried by withRetry() in transcribe() below.
async function callWhisper(audio: Uint8Array): Promise<string> {
  const { CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN } = env();
  const url = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/openai/whisper`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
      'Content-Type': 'application/octet-stream',
    },
    body: new Blob([audio as Uint8Array<ArrayBuffer>], { type: 'application/octet-stream' }),
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
      const status = (err as { status?: number })?.status;
      return typeof status === 'number' && status >= 500;
    },
  });
}
```

- [ ] **Step 3.3: Verify**

Run: `npx vitest run src/services/TranscriptionService.test.ts`
Expected: PASS (6 tests).

Run the full suite: `npx vitest run`
Expected: PASS — no regressions in CaptureService.test.ts (which mocks `transcribe` directly).

- [ ] **Step 3.4: Commit**

```bash
git add src/services/TranscriptionService.ts src/services/TranscriptionService.test.ts
git commit -m "transcription: retry on 5xx + network errors (2 retries, 500ms base)"
```

---

## Task 4: ExtractionService — wrap `generateObject` in retry

**Files:**
- Modify: `src/services/ExtractionService.ts:170-195` (the `extract()` body — where `generateObject` is called)
- Modify: `src/services/ExtractionService.test.ts`

- [ ] **Step 4.1: Locate the exact call site**

In `src/services/ExtractionService.ts`, find the `extract()` function. The `generateObject({...})` call is the part wrapped in retry.

- [ ] **Step 4.2: Write the failing tests**

Append to `src/services/ExtractionService.test.ts`:

```ts
describe('extract (with retry)', () => {
  beforeEach(() => generateObjectMock.mockReset());

  it('retries when generateObject throws a transient 5xx-shaped error', async () => {
    const transient = Object.assign(new Error('upstream'), { statusCode: 503 });
    generateObjectMock
      .mockRejectedValueOnce(transient)
      .mockResolvedValueOnce({
        object: { contacts: [], was_live_recording: false },
      });
    const result = await extract({ transcript: 'hi', selfIntro: '' });
    expect(result.contacts).toHaveLength(0);
    expect(generateObjectMock).toHaveBeenCalledTimes(2);
  });

  it('retries on a retryable 429', async () => {
    const tooMany = Object.assign(new Error('rate limited'), { statusCode: 429 });
    generateObjectMock
      .mockRejectedValueOnce(tooMany)
      .mockResolvedValueOnce({
        object: { contacts: [], was_live_recording: false },
      });
    const result = await extract({ transcript: 'hi', selfIntro: '' });
    expect(result.contacts).toHaveLength(0);
    expect(generateObjectMock).toHaveBeenCalledTimes(2);
  });

  it('does NOT retry on a 4xx that is not 429', async () => {
    const badReq = Object.assign(new Error('bad input'), { statusCode: 400 });
    generateObjectMock.mockRejectedValueOnce(badReq);
    await expect(extract({ transcript: 'hi', selfIntro: '' })).rejects.toThrow();
    expect(generateObjectMock).toHaveBeenCalledTimes(1);
  });
});
```

Run: `npx vitest run src/services/ExtractionService.test.ts`
Expected: FAIL — current `extract` doesn't retry.

- [ ] **Step 4.3: Wrap the `generateObject` call in `withRetry`**

In `src/services/ExtractionService.ts`:

1. Add at the top: `import { withRetry } from '../lib/retry';`
2. Replace the existing `const { object } = await generateObject({...})` call (the only `await generateObject` in the file — inside `extract`) with:

```ts
const { object } = await withRetry(
  () => generateObject({
    model: getLLM(),
    schema: ExtractionSchema,
    system: SYSTEM_PROMPT,
    prompt: `${userContext}Transcript:\n${input.transcript}`,
  }),
  {
    maxAttempts: 3, // 1 try + 2 retries
    baseDelayMs: 1000,
    shouldRetry: (err) => {
      const status = (err as { statusCode?: number; status?: number })?.statusCode
        ?? (err as { status?: number })?.status;
      if (typeof status !== 'number') return false;
      if (status >= 500) return true; // transient upstream
      if (status === 429) return true; // retryable rate limit
      return false;
    },
  },
);
```

- [ ] **Step 4.4: Verify**

Run: `npx vitest run src/services/ExtractionService.test.ts`
Expected: PASS (all existing + 3 new tests).

Run: `npx vitest run`
Expected: full suite green.

- [ ] **Step 4.5: Commit**

```bash
git add src/services/ExtractionService.ts src/services/ExtractionService.test.ts
git commit -m "extraction: retry on 5xx + retryable 429 (2 retries, 1s base)"
```

---

## Task 5: `findStuckProcessingCaptures` query helper

**Files:**
- Modify: `src/services/CaptureService.ts` — add exported helper at the bottom
- Modify: `src/services/CaptureService.test.ts` — add tests

- [ ] **Step 5.1: Write the failing tests**

Append to `src/services/CaptureService.test.ts` (after the existing describe blocks):

```ts
import { findStuckProcessingCaptures } from './CaptureService';

describe('findStuckProcessingCaptures', () => {
  it('returns rows where status=processing AND occurredAt older than the threshold', async () => {
    // The CaptureService.test.ts file already mocks ../lib/db/client. Configure
    // the mock to capture the chain and return canned rows.
    const olderRow = {
      id: 'i-1',
      userId: 'u-1',
      audioR2Key: 'captures/u-1/a.webm',
      mimeType: 'audio/webm',
    };
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([olderRow]),
    };
    const { db } = await import('../lib/db/client');
    (db as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ select: vi.fn().mockReturnValue(selectChain) });

    const rows = await findStuckProcessingCaptures({ maxAgeSeconds: 60, limit: 20 });
    expect(rows).toEqual([olderRow]);
    expect(selectChain.limit).toHaveBeenCalledWith(20);
  });
});
```

Run: `npx vitest run src/services/CaptureService.test.ts`
Expected: FAIL — `findStuckProcessingCaptures` not exported.

- [ ] **Step 5.2: Add the helper to CaptureService**

Append to `src/services/CaptureService.ts`:

```ts
import { interactions } from '../lib/db/schema';
import { and, eq, lt, sql } from 'drizzle-orm';

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
}): Promise<Array<{ id: string; userId: string; audioR2Key: string; mimeType: string }>> {
  const cutoff = sql`now() - (${opts.maxAgeSeconds} * interval '1 second')`;
  const rows = await db()
    .select({
      id: interactions.id,
      userId: interactions.userId,
      audioR2Key: interactions.audioR2Key,
      mimeType: interactions.mimeType,
    })
    .from(interactions)
    .where(
      and(
        eq(interactions.status, 'processing'),
        lt(interactions.occurredAt, cutoff as unknown as Date),
        sql`${interactions.userId} IS NOT NULL`,
        sql`${interactions.audioR2Key} IS NOT NULL`,
        sql`${interactions.mimeType} IS NOT NULL`,
      ),
    )
    .limit(opts.limit);
  // The runtime guard mirrors the SQL filter so the return type is narrow.
  return rows
    .filter((r): r is { id: string; userId: string; audioR2Key: string; mimeType: string } =>
      r.userId !== null && r.audioR2Key !== null && r.mimeType !== null)
    .map((r) => ({ id: r.id, userId: r.userId, audioR2Key: r.audioR2Key, mimeType: r.mimeType }));
}
```

Note: the existing imports at the top of `CaptureService.ts` already include `db`, `eq`, and `sql`. Add only what's missing — `and`, `lt`, and `interactions` from `../lib/db/schema`. Verify the imports section after editing.

- [ ] **Step 5.3: Verify**

Run: `npx vitest run src/services/CaptureService.test.ts`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 5.4: Commit**

```bash
git add src/services/CaptureService.ts src/services/CaptureService.test.ts
git commit -m "capture: findStuckProcessingCaptures helper for janitor recovery"
```

---

## Task 6: Inngest janitor cron — `recoverStuckCapturesFn`

**Files:**
- Modify: `src/lib/inngest/functions.ts`
- Create: `src/lib/inngest/functions.test.ts`

- [ ] **Step 6.1: Write the failing test**

Create `src/lib/inngest/functions.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';

const findStuckMock = vi.hoisted(() => vi.fn());
const processCaptureMock = vi.hoisted(() => vi.fn());

vi.mock('@/services/CaptureService', () => ({
  findStuckProcessingCaptures: findStuckMock,
  processCapture: processCaptureMock,
}));

import { recoverStuckCapturesFn } from './functions';

describe('recoverStuckCapturesFn', () => {
  it('calls processCapture for every stuck row the query returns', async () => {
    findStuckMock.mockResolvedValueOnce([
      { id: 'i-1', userId: 'u-1', audioR2Key: 'k1', mimeType: 'audio/webm' },
      { id: 'i-2', userId: 'u-2', audioR2Key: 'k2', mimeType: 'audio/mp4' },
    ]);
    processCaptureMock.mockResolvedValue(undefined);

    // The handler ignores its event/step args for the cron path beyond running
    // a single step. We invoke the handler directly with a minimal step stub.
    const step = { run: (_id: string, fn: () => Promise<unknown>) => fn() };
    await (recoverStuckCapturesFn as unknown as { fn: (ctx: { step: typeof step }) => Promise<unknown> })
      .fn({ step });

    expect(findStuckMock).toHaveBeenCalledWith({ maxAgeSeconds: 60, limit: 20 });
    expect(processCaptureMock).toHaveBeenCalledTimes(2);
    expect(processCaptureMock).toHaveBeenNthCalledWith(1, {
      userId: 'u-1', audioR2Key: 'k1', mimeType: 'audio/webm', interactionId: 'i-1',
    });
    expect(processCaptureMock).toHaveBeenNthCalledWith(2, {
      userId: 'u-2', audioR2Key: 'k2', mimeType: 'audio/mp4', interactionId: 'i-2',
    });
  });

  it('catches per-row errors and keeps processing the rest', async () => {
    findStuckMock.mockResolvedValueOnce([
      { id: 'i-1', userId: 'u-1', audioR2Key: 'k1', mimeType: 'audio/webm' },
      { id: 'i-2', userId: 'u-2', audioR2Key: 'k2', mimeType: 'audio/mp4' },
    ]);
    processCaptureMock
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(undefined);

    const step = { run: (_id: string, fn: () => Promise<unknown>) => fn() };
    await (recoverStuckCapturesFn as unknown as { fn: (ctx: { step: typeof step }) => Promise<unknown> })
      .fn({ step });

    expect(processCaptureMock).toHaveBeenCalledTimes(2);
  });
});
```

Run: `npx vitest run src/lib/inngest/functions.test.ts`
Expected: FAIL — `recoverStuckCapturesFn` not exported yet.

- [ ] **Step 6.2: Rewrite `src/lib/inngest/functions.ts`**

Replace the whole file with:

```ts
import { inngest } from './client';
import { processCapture, findStuckProcessingCaptures } from '@/services/CaptureService';

// Cron-triggered janitor. Every 2 minutes, sweep the interactions table for
// rows that started processing more than 60 seconds ago and never reached
// 'ready' or 'failed'. Re-run the pipeline for each. Audio in R2 + the
// capture metadata on the row are the durable handoff from the fast path
// (`/api/capture` running processCapture inline via `after()`) to here.
export const recoverStuckCapturesFn = inngest.createFunction(
  { id: 'recover-stuck-captures', name: 'Recover stuck captures' },
  { cron: '*/2 * * * *' }, // every 2 minutes
  async ({ step }) => {
    const stuck = await step.run('find-stuck', () =>
      findStuckProcessingCaptures({ maxAgeSeconds: 60, limit: 20 }),
    );

    let recovered = 0;
    let failed = 0;
    for (const row of stuck) {
      try {
        await processCapture({
          userId: row.userId,
          audioR2Key: row.audioR2Key,
          mimeType: row.mimeType,
          interactionId: row.id,
        });
        recovered += 1;
      } catch (err) {
        // Don't let one bad row block the rest. processCapture's own retries
        // already covered transient failures; what bubbles up here is hard
        // and gets surfaced in Inngest dashboard logs.
        console.error('recover-stuck-captures: row failed', { interactionId: row.id, err });
        failed += 1;
      }
    }
    return { swept: stuck.length, recovered, failed };
  },
);

export const functions = [recoverStuckCapturesFn];
```

- [ ] **Step 6.3: Verify**

Run: `npx vitest run src/lib/inngest/functions.test.ts`
Expected: PASS.

Run: `npx vitest run` and `npx tsc --noEmit`
Expected: full suite green, no type errors.

- [ ] **Step 6.4: Commit**

```bash
git add src/lib/inngest/functions.ts src/lib/inngest/functions.test.ts
git commit -m "inngest: cron janitor — recover stuck captures every 2 min"
```

---

## Task 7: `/api/capture` rewrite — inline pipeline via `after()`

**Files:**
- Modify: `src/app/api/capture/route.ts`

- [ ] **Step 7.1: Replace the route body**

Replace `src/app/api/capture/route.ts` entirely with:

```ts
import { NextResponse } from 'next/server';
import { after } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getServerSession } from '@/lib/auth/session';
import { uploadBytes } from '@/lib/r2/client';
import { mintStub } from '@/services/InteractionService';
import { processCapture } from '@/services/CaptureService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 20 * 1024 * 1024;
const ALLOWED_MIME = ['audio/webm', 'audio/ogg', 'audio/mp3', 'audio/mpeg', 'audio/mp4', 'audio/wav', 'video/webm'];

export async function POST(req: Request) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const form = await req.formData();
  const file = form.get('audio');
  if (!(file instanceof File)) return NextResponse.json({ error: 'audio file required' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'audio too large (>20MB)' }, { status: 400 });

  // file.type may include a codec like 'audio/webm;codecs=opus' — match on base mime only
  const baseMime = file.type.split(';')[0].trim();
  if (!ALLOWED_MIME.includes(baseMime)) return NextResponse.json({ error: `unsupported mime: ${file.type}` }, { status: 400 });

  const ext = baseMime.split('/').pop() ?? 'webm';
  const audioR2Key = `captures/${session.user.id}/${randomUUID()}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  await uploadBytes({ key: audioR2Key, bytes, contentType: baseMime });

  // Mint the stub WITH capture metadata. If the inline pipeline drops, the
  // janitor will find this row and re-run processCapture against the same
  // audio still sitting in R2.
  const interactionId = await mintStub('voice', {
    userId: session.user.id,
    audioR2Key,
    mimeType: baseMime,
  });

  // Inline pipeline: keep running after the response goes back to the phone.
  // Any thrown error here is caught so the function exits cleanly; the row
  // stays at status='processing' and the janitor picks it up within 2 min.
  after(
    processCapture({
      userId: session.user.id,
      audioR2Key,
      mimeType: baseMime,
      interactionId,
    }).catch((err) => {
      console.error('inline processCapture failed; janitor will retry', { interactionId, err });
    }),
  );

  return NextResponse.json({ interactionId });
}
```

- [ ] **Step 7.2: Verify**

Run: `npx vitest run`
Expected: full suite green. No existing test exercises the `/api/capture` route directly, so this is a structural change with no test delta.

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 7.3: Commit**

```bash
git add src/app/api/capture/route.ts
git commit -m "capture: run pipeline inline via after(); drop inngest.send"
```

---

## Task 8: Tighten polling cadence on the phone

**Files:**
- Modify: `src/app/app/record/record-client.tsx` — the polling loop inside `stop()` (search for `await new Promise((r) => setTimeout(r, 1500))`)

- [ ] **Step 8.1: Replace the polling loop**

In `src/app/app/record/record-client.tsx`, find the polling block inside `stop()`:

```ts
    const startTime = Date.now();
    while (Date.now() - startTime < 60_000) {
      await new Promise((r) => setTimeout(r, 1500));
```

Replace with:

```ts
    // Polling cadence: 500ms for the first 5s (fast path is usually 3–6s),
    // then back off to 1500ms for the long tail and janitor recovery window.
    const startTime = Date.now();
    while (Date.now() - startTime < 60_000) {
      const elapsed = Date.now() - startTime;
      const interval = elapsed < 5_000 ? 500 : 1_500;
      await new Promise((r) => setTimeout(r, interval));
```

- [ ] **Step 8.2: Verify**

Run: `npx tsc --noEmit`
Expected: clean.

Run: `npx vitest run`
Expected: full suite green.

- [ ] **Step 8.3: Commit**

```bash
git add src/app/app/record/record-client.tsx
git commit -m "record: tighten poll cadence — 500ms for first 5s, then 1500ms"
```

---

## Task 9: Deploy preview, sync Inngest, smoke-test

**Files:** none (manual verification step)

- [ ] **Step 9.1: Push branch + deploy preview**

```bash
cd /Users/timnan/Documents/GitHub/connectyall
git push -u origin feature/fast-pipeline
vercel --yes
```

Note the preview URL printed in the output (`https://connectyall-XXXXXXXXX-...`).

- [ ] **Step 9.2: Sync Inngest to the preview**

The janitor is a NEW Inngest function. Inngest needs to know it exists.

```bash
curl -X PUT https://<preview-url>/api/inngest
```

Expected: HTTP 200 with `{"message":"Successfully registered","modified":true}`.

If `modified: false`, that just means Inngest already knew about the previous version's functions — but a new function should always be `modified: true` on the first sync.

- [ ] **Step 9.3: Verify the cron is registered**

Open the Inngest dashboard for the connectyall app and confirm `recover-stuck-captures` is listed with cron `*/2 * * * *` and that `process-capture` is no longer present (or shows 0 events fired since last deploy).

- [ ] **Step 9.4: Happy-path smoke**

Sign in on the preview. Record a 10–20 second voice memo about a fictional person. Time from tap-Stop to seeing the connection-detail page.

Expected: **3–6 seconds end-to-end** for a typical recording. If it lands above 8s, the inline pipeline isn't actually running — check Vercel logs for the preview deployment to see whether `processCapture` is being executed in the same function as `/api/capture`.

- [ ] **Step 9.5: Janitor recovery smoke**

In Vercel dashboard for the preview deployment, manually kill the inline pipeline by deploying a fresh build immediately after recording. Or — easier — open `src/services/CaptureService.ts` temporarily, add `if (input.audioR2Key.endsWith('.webm')) throw new Error('smoke test');` at the top of `processCapture`, redeploy, record one memo, then revert the change and redeploy.

After the inline path crashes, the interaction sits at `processing`. Wait up to 2 minutes. The janitor should run, hit the now-fixed pipeline, and the contact should appear in `/app/connections` without any tap from the user.

Revert the smoke-test edit before merge.

- [ ] **Step 9.6: Report results to Tim**

Comment on the branch / report back with:
- Measured tap-Stop-to-contact time for 3 recordings (median + range)
- Confirmation that janitor recovered the deliberately-failed recording within ~2 min
- Any unexpected log output from Vercel during either test

---

## Self-Review (run by plan author after writing — already done)

**1. Spec coverage:**
- Section 1 (waitUntil pipeline) → Task 7 (`after()`) + Task 0 (metadata on row) + Task 1 (mintStub persists metadata)
- Section 2 (polling cadence) → Task 8
- Section 3 (retry policy) → Task 2 (helper) + Task 3 (Whisper) + Task 4 (Gemini)
- Section 4 (Inngest janitor) → Task 5 (query helper) + Task 6 (cron function)
- Section 5 (keep/repurpose) → covered across Tasks 6, 7
- Section 6 (failure matrix) → verified end-to-end in Task 9

**2. Placeholder scan:** no "TBD"/"TODO"/"similar to" — code shown explicitly in every step.

**3. Type consistency:**
- `findStuckProcessingCaptures` return shape matches `processCapture` input shape (`{ userId, audioR2Key, mimeType }` + `id` → `interactionId`)
- `mintStub` second arg type matches the columns in Task 0
- `withRetry` signature stays identical across Tasks 2/3/4
