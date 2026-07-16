# Conversation Capture — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-07-06-conversation-capture-design.md`
**Branch:** `feature/conversation-capture` — off fresh `main`, **only after PR #20 (personalization) has merged** (this plan edits the same three services and assumes `vocabulary` exists)
**Goal:** Capture a live two-person exchange reliably by adding a switchable Nova-3 diarized transcription path plus conversation-mode extraction, behind `TRANSCRIBE_PROVIDER` with Whisper as the untouched default.

**Architecture:** Widen `transcribe()` to return `{ text, segments }`; add a Nova-3 client dispatched by env enum (mirrors `LLM_PROVIDER`); render speaker-labeled transcripts into a new CONVERSATION MODE prompt section when ≥2 speakers; log provider + speaker count to `capture_diagnostics`; raise the recording cap to a hard 120s.

**Tech stack:** Next.js 16 / TypeScript, Cloudflare Workers AI REST (`@cf/deepgram/nova-3`), Vercel AI SDK + Gemini (unchanged), Drizzle + Neon, Vitest.

## Global constraints

- `TRANSCRIBE_PROVIDER` values are exactly `whisper` | `nova3`, default `whisper`. No new secrets.
- Whisper behavior (including PR #20's `initial_prompt` JSON-body switch) must be byte-for-byte unchanged when provider is whisper.
- Migration is hand-written SQL **with a matching `drizzle/meta/_journal.json` entry** (Drizzle silently skips otherwise). Number it as the next free `00NN` at build time — `0019` assumed below; renumber if other branches landed migrations first.
- Every migration is additive only (safe to apply to prod Neon before merge, per repo convention).
- Commit style: short lowercase subjects, no AI credits. `pnpm typecheck && pnpm test -- --run` before every push.
- Record-page UI copy stays in the mono-caption design language; no new screens.

## Risks & mitigations (read before starting any task)

| # | Risk | Likelihood | Mitigation |
|---|------|-----------|------------|
| R1 | **Nova-3 REST contract differs from the plan** — response JSON paths are undocumented, and the endpoint may reject a raw binary body (some partner models want multipart). | Medium | Task 1 exists precisely for this: the live curl fixture is the source of truth, and the Task 3 parser already handles both envelope shapes. If the binary body 400s, retry the curl as `multipart/form-data` (`-F "audio=@sample.webm;type=audio/webm"`) and adapt `callNova3` to `FormData`. If `keyterm` as a query param errors, drop keyterms silently — vocabulary still shapes extraction downstream. Do not proceed past Task 1 with an unverified shape. |
| R2 | **Diarization quality on one shared phone mic** — two voices on the same far-field mic can merge into one speaker or flip labels mid-utterance. | Medium | The CONVERSATION MODE prompt attributes by content (Q&A pairing), not labels alone, so label noise degrades gracefully; worst case equals today's memo-mode quality. If QA shows `speaker_count` frequently wrong, do NOT try to fix diarization — flag to Tim and consider content-only conversation detection as a follow-up. |
| R3 | **Whisper-path regression** — Tasks 2/3/6 rewrite the hot path every production capture flows through. | Low likelihood, high blast radius | Provider defaults to `whisper`; existing TranscriptionService tests must pass with only return-shape assertions changed; production never sees nova3 until Tim flips the env var. Never edit `callWhisper` itself. |
| R4 | **Migration collision** — PR #19 holds 0015 and `first-time-flow` holds 0014; 0019 may be taken or leave gaps by build time. | Medium | Renumber to next-free `00NN` at build time; the `_journal.json` tag must match the filename exactly; verify `pnpm db:migrate` prints `[✓] migrations applied successfully!` (silence = journal entry missing = silent skip). |
| R5 | **Env var lands on the wrong Vercel scope** — setting `TRANSCRIBE_PROVIDER=nova3` on Production flips real users without review. | Low | Task 9 sets it via `vercel env add TRANSCRIBE_PROVIDER preview` (preview scope ONLY); afterwards run `vercel env ls` and confirm Production has no `TRANSCRIBE_PROVIDER` row. |
| R6 | **Double-stop crash** — `MediaRecorder.stop()` on an inactive recorder throws; the auto-stop timeout racing a manual stop is the trigger. | Medium | Task 7's guard (`recorderRef.current?.state === 'recording'`) plus clearing the timeout in `stop()`, `resetToIdle()`, and unmount. Manually QA: stop at 1:59 and confirm nothing fires when the timeout window passes. |
| R7 | **Latency regression on nova3** — assumed fast, not yet measured on Cloudflare's hosting. | Low | `transcribeMs` + `transcribe_provider` diagnostics make it measurable per-capture on `/app/diagnostics`; if p50 transcribe worsens materially vs whisper rows, report numbers to Tim before any prod flip. Rollback is the env var. |
| R8 | **Inngest sync footgun** — testing on preview without re-pointing Inngest leaves the janitor on prod code (or vice versa after merge). | Medium | Task 9 syncs to the preview; after any eventual prod deploy run `curl -X PUT https://connectyall.vercel.app/api/inngest` (session-state playbook rule). |
| R9 | **PR #20 not merged when this builds** — the plan consumes `vocabulary`, `normalizeVocabulary`, `buildWhisperInitialPrompt`. | Low | Hard precondition (see Branch note above): do not start on a main that lacks PR #20; if #20 is abandoned, Tasks 4 and 6 need rescoping by Tim first. |
| R10 | **Multi-contact conversations** — a 3-person exchange yields two contacts; persistence handles it, but the share/redirect flow assumes one primary contact. | Low | Out of scope per spec; the prompt's N-speaker rules are best-effort. If QA surfaces broken UX here, log it for Tim rather than expanding scope. |

---

### Task 1: Pin the Nova-3 response shape (live curl, no code)

**Files:** none (findings recorded as a fixture file in Task 3)

The Cloudflare docs don't document the REST response JSON for `@cf/deepgram/nova-3`. Before writing the parser, hit the real endpoint once.

- [ ] **Step 1:** Grab any short webm/opus or mp3 file with two voices (record one on the phone and download from R2, or use any local file).
- [ ] **Step 2:** Run (creds from `.env.local`):

```bash
curl -s "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/ai/run/@cf/deepgram/nova-3?diarize=true&smart_format=true&punctuate=true&utterances=true" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: audio/webm" \
  --data-binary @sample.webm | jq . > docs/superpowers/specs/nova3-sample-response.json
```

- [ ] **Step 3:** Confirm in the output: (a) is it wrapped in `{ success, result }` like Whisper, or raw Deepgram `{ results: ... }`? (b) transcript at `results.channels[0].alternatives[0].transcript`? (c) `results.utterances[]` with `{ speaker, transcript }`? (d) per-word `speaker` fields under `alternatives[0].words[]`? If any path differs from the parser in Task 3, adjust the parser to match reality — the fixture file is the source of truth.
- [ ] **Step 4:** Trim the JSON to a small representative fixture and save as `src/services/__fixtures__/nova3-response.json`. Commit: `git commit -m "fixtures: real nova-3 diarized response sample"`

### Task 2: Widen the transcription contract (Whisper unchanged)

**Files:**
- Modify: `src/services/TranscriptionService.ts`
- Modify: `src/services/CaptureService.ts:100-115` (consume new shape)
- Test: `src/services/TranscriptionService.test.ts` (update existing)

**Interfaces (produced, used by Tasks 3/5/6):**

```ts
export type TranscriptSegment = { speaker: number; text: string };
export type TranscriptResult = { text: string; segments: TranscriptSegment[] | null };
export async function transcribe(audio: Uint8Array, opts?: TranscribeOptions): Promise<TranscriptResult>;
```

- [ ] **Step 1:** Update the existing TranscriptionService tests: every assertion on the return value becomes `expect(result.text).toBe(...)` plus `expect(result.segments).toBeNull()`. Run `pnpm test -- --run TranscriptionService` — expect FAIL (still returns string).
- [ ] **Step 2:** In `TranscriptionService.ts`, add the two exported types; change `transcribe()` to `return withRetry(...)` wrapped as `{ text: await callWhisper(...), segments: null }`:

```ts
export async function transcribe(audio: Uint8Array, opts: TranscribeOptions = {}): Promise<TranscriptResult> {
  const text = await withRetry(() => callWhisper(audio, opts), { /* unchanged options */ });
  return { text, segments: null };
}
```

- [ ] **Step 3:** In `CaptureService.processCapture`, change `let transcript: string` to consume the object:

```ts
const tr = await transcribe(audio, { initialPrompt: buildWhisperInitialPrompt(vocabulary) });
const transcript = tr.text;
await updateDiagnostics(diagId, { transcribeMs: Date.now() - sTr, transcriptChars: transcript.length });
```

Keep `tr` in scope — Tasks 5/6 use `tr.segments`.
- [ ] **Step 4:** `pnpm typecheck && pnpm test -- --run` — all pass.
- [ ] **Step 5:** Commit: `transcription: return { text, segments } instead of bare string`

### Task 3: Nova-3 client + response parser

**Files:**
- Modify: `src/services/TranscriptionService.ts`
- Modify: `src/lib/env.ts`
- Create: `src/services/__fixtures__/nova3-response.json` (from Task 1)
- Test: `src/services/TranscriptionService.test.ts`

**Interfaces:**
- Consumes: `TranscriptResult` / `TranscriptSegment` (Task 2), `keytermsFromVocabulary` (Task 4 — stub as `(v: string | null) => string[]` returning `[]` if building tasks in order, then wire in Task 4)
- Produces: `transcribe()` dispatching on `env().TRANSCRIBE_PROVIDER`; exported `parseNova3Response(json: unknown): TranscriptResult` (exported for tests)

- [ ] **Step 1 — env:** In `src/lib/env.ts` schema, after `LLM_MODEL`, add:

```ts
TRANSCRIBE_PROVIDER: z.enum(['whisper', 'nova3']).default('whisper'),
```

No `superRefine` needed (Cloudflare creds are already required unconditionally). Add a test in `src/lib/env.test.ts` if one exists for enum defaults; otherwise typecheck suffices.
- [ ] **Step 2 — failing parser tests** against the Task-1 fixture:

```ts
import fixture from './__fixtures__/nova3-response.json';
import { parseNova3Response } from './TranscriptionService';

test('nova3 parser extracts transcript text', () => {
  const r = parseNova3Response(fixture);
  expect(r.text.length).toBeGreaterThan(0);
});
test('nova3 parser builds speaker segments, merging consecutive same-speaker utterances', () => {
  const r = parseNova3Response(fixture);
  expect(r.segments).not.toBeNull();
  expect(r.segments![0]).toEqual({ speaker: expect.any(Number), text: expect.any(String) });
  for (let i = 1; i < r.segments!.length; i++) {
    expect(r.segments![i].speaker).not.toBe(r.segments![i - 1].speaker); // merged
  }
});
test('nova3 parser survives malformed input', () => {
  expect(parseNova3Response({})).toEqual({ text: '', segments: null });
  expect(parseNova3Response(null)).toEqual({ text: '', segments: null });
});
```

Run — FAIL (function not defined).
- [ ] **Step 3 — parser** (adjust paths to match the Task-1 fixture if they differ):

```ts
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
```

- [ ] **Step 4 — client + dispatch.** Add `callNova3` beside `callWhisper` (same error convention: status-carrying Error, 4xx hard / 5xx retryable) and dispatch in `transcribe()`:

```ts
async function callNova3(audio: Uint8Array, mimeType: string, keyterms: string[]): Promise<TranscriptResult> {
  const { CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN } = env();
  const params = new URLSearchParams({ diarize: 'true', smart_format: 'true', punctuate: 'true', utterances: 'true' });
  for (const term of keyterms) params.append('keyterm', term);
  const url = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/deepgram/nova-3?${params}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`, 'Content-Type': mimeType || 'application/octet-stream' },
    body: new Blob([audio as Uint8Array<ArrayBuffer>]),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`Nova-3 HTTP ${res.status}: ${text || 'no body'}`) as Error & { status: number };
    err.status = res.status;
    throw err;
  }
  return parseNova3Response(await res.json());
}
```

`transcribe` gains the mime + keyterm inputs via options (Whisper ignores them):

```ts
export type TranscribeOptions = { initialPrompt?: string; mimeType?: string; keyterms?: string[] };

export async function transcribe(audio: Uint8Array, opts: TranscribeOptions = {}): Promise<TranscriptResult> {
  const retryOpts = { maxAttempts: 3, baseDelayMs: 500, shouldRetry: /* unchanged predicate */ };
  if (env().TRANSCRIBE_PROVIDER === 'nova3') {
    return withRetry(() => callNova3(audio, opts.mimeType ?? '', opts.keyterms ?? []), retryOpts);
  }
  const text = await withRetry(() => callWhisper(audio, opts), retryOpts);
  return { text, segments: null };
}
```

- [ ] **Step 5:** `pnpm test -- --run TranscriptionService` — parser tests pass; existing whisper tests still pass (provider defaults to whisper).
- [ ] **Step 6:** Commit: `transcription: nova-3 client with diarization behind TRANSCRIBE_PROVIDER`

### Task 4: Vocabulary → keyterms

**Files:**
- Modify: `src/lib/personalization.ts`
- Test: `src/lib/personalization.test.ts`

**Interfaces:**
- Produces: `keytermsFromVocabulary(vocabulary: string | null): string[]`

- [ ] **Step 1 — failing tests:**

```ts
test('keytermsFromVocabulary splits on commas and newlines, trims, drops empties', () => {
  expect(keytermsFromVocabulary('Sarah Lee, Pinto Money\n@timnan,  ,Connectyall'))
    .toEqual(['Sarah Lee', 'Pinto Money', '@timnan', 'Connectyall']);
});
test('keytermsFromVocabulary caps at 50 terms', () => {
  const vocab = Array.from({ length: 60 }, (_, i) => `term${i}`).join(',');
  expect(keytermsFromVocabulary(vocab)).toHaveLength(50);
});
test('keytermsFromVocabulary returns [] for null/empty', () => {
  expect(keytermsFromVocabulary(null)).toEqual([]);
  expect(keytermsFromVocabulary('  ')).toEqual([]);
});
```

- [ ] **Step 2 — implementation:**

```ts
export function keytermsFromVocabulary(vocabulary: string | null): string[] {
  if (!vocabulary) return [];
  return vocabulary
    .split(/[,\n]/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 50);
}
```

- [ ] **Step 3:** Tests pass. Commit: `personalization: map vocabulary to nova-3 keyterms`

### Task 5: Conversation-mode extraction

**Files:**
- Modify: `src/services/ExtractionService.ts` (`extract()` signature ~line 262, prompt assembly ~line 279)
- Test: `src/services/ExtractionService.test.ts`

**Interfaces:**
- Consumes: `TranscriptSegment` from TranscriptionService
- Produces: `extract(input: { transcript, segments?: TranscriptSegment[] | null, userName?: string | null, selfIntro?, vocabulary?, corrections?, examples? })`

- [ ] **Step 1 — failing tests** (follow the existing pattern this file uses for asserting prompt content — if extraction tests mock the AI SDK, assert on the captured `system`/`prompt` strings):

```ts
test('two-speaker segments render a labeled transcript and CONVERSATION MODE section', async () => {
  // ... existing mock setup ...
  await extract({
    transcript: 'flat text',
    segments: [
      { speaker: 0, text: 'What was your number again?' },
      { speaker: 1, text: 'It is 604-555-1234.' },
    ],
    userName: 'Tim Nan',
  });
  expect(capturedSystem).toContain('CONVERSATION MODE');
  expect(capturedSystem).toContain('Tim Nan');
  expect(capturedPrompt).toContain('Speaker 0: What was your number again?');
  expect(capturedPrompt).toContain('Speaker 1: It is 604-555-1234.');
});
test('single-speaker segments fall back to memo mode', async () => {
  await extract({ transcript: 'flat text', segments: [{ speaker: 0, text: 'flat text' }] });
  expect(capturedSystem).not.toContain('CONVERSATION MODE');
  expect(capturedPrompt).toContain('Transcript:\nflat text');
});
test('null segments unchanged from today', async () => {
  await extract({ transcript: 'flat text' });
  expect(capturedSystem).not.toContain('CONVERSATION MODE');
});
```

- [ ] **Step 2 — implementation.** Add to `ExtractionService.ts`:

```ts
const CONVERSATION_MODE_SECTION = (userName: string | null | undefined) => `

CONVERSATION MODE:
The transcript below is a live conversation with speaker labels, recorded by the app user while talking to someone they just met.
- Identify which speaker is the app user${userName ? ` (their name is "${userName}")` : ''}: they ask for the other person's details, introduce them, or refer to themselves by that name. NEVER create a contact for the app user.
- Extract the OTHER speaker(s) as the contact(s).
- Attribute answers to questions: if one speaker asks "what's your number?" and the other answers with digits, the number belongs to the ANSWERING speaker.
- If both people exchange their own details, capture only the non-user speaker's details.
- Greetings and small talk are not contact data. The recap covers what they genuinely chatted about, same rules as a memo.

Example:
Speaker 0: So great meeting you! What was the best way to reach you?
Speaker 1: I'm on Telegram, it's bella underscore n v. Bella, B-E-L-L-A.
Speaker 0: Got it. I'm Tim by the way, tim at connectyall dot app.
→ One contact: name "Bella", telegram "@bella_nv". Speaker 0 is the user; their email is NOT captured.`;

function renderSegments(segments: TranscriptSegment[]): string {
  return segments.map((s) => `Speaker ${s.speaker}: ${s.text}`).join('\n');
}
```

In `extract()`: compute `const distinct = new Set((input.segments ?? []).map((s) => s.speaker)).size;` and `const conversation = distinct >= 2;`. Then:

```ts
system: `${SYSTEM_PROMPT}${personalization}${conversation ? CONVERSATION_MODE_SECTION(input.userName) : ''}`,
prompt: `${userContext}Transcript:\n${conversation ? renderSegments(input.segments!) : input.transcript}`,
```

- [ ] **Step 3:** `pnpm test -- --run ExtractionService` — all pass, including every pre-existing test untouched.
- [ ] **Step 4:** Commit: `extraction: conversation mode for diarized two-speaker transcripts`

### Task 6: Capture wiring + diagnostics columns

**Files:**
- Create: `drizzle/0019_capture_diagnostics_transcribe_provider.sql`
- Modify: `drizzle/meta/_journal.json` (append entry, next idx, tag `0019_capture_diagnostics_transcribe_provider`)
- Modify: `src/lib/db/schema.ts:121-152` (captureDiagnostics table)
- Modify: `src/services/DiagnosticsService.ts` (updateDiagnostics patch type)
- Modify: `src/services/CaptureService.ts:100-143`

**Interfaces:**
- Consumes: `tr.segments` (Task 2), `keytermsFromVocabulary` (Task 4), `extract` signature (Task 5)

- [ ] **Step 1 — migration** `drizzle/0019_capture_diagnostics_transcribe_provider.sql`:

```sql
ALTER TABLE capture_diagnostics ADD COLUMN transcribe_provider text;
ALTER TABLE capture_diagnostics ADD COLUMN speaker_count integer;
```

Append the `_journal.json` entry (copy the previous entry's shape, bump `idx` and `when`, tag `0019_capture_diagnostics_transcribe_provider`). **Do not skip the journal entry — Drizzle silently no-ops without it.**
- [ ] **Step 2 — schema:** in `captureDiagnostics`, after `llmModel`:

```ts
transcribeProvider: text('transcribe_provider'),
speakerCount: integer('speaker_count'),
```

Add both as optional fields to `updateDiagnostics`'s patch type in `DiagnosticsService.ts` (same style as `llmProvider: string`).
- [ ] **Step 3 — CaptureService:** in the transcribe stage:

```ts
const tr = await transcribe(audio, {
  initialPrompt: buildWhisperInitialPrompt(vocabulary),
  mimeType: input.mimeType,
  keyterms: keytermsFromVocabulary(vocabulary),
});
const transcript = tr.text;
await updateDiagnostics(diagId, {
  transcribeMs: Date.now() - sTr,
  transcriptChars: transcript.length,
  transcribeProvider: env().TRANSCRIBE_PROVIDER,
  speakerCount: tr.segments ? new Set(tr.segments.map((s) => s.speaker)).size : null,
});
```

In the extract stage, add to the `extract({ ... })` call: `segments: tr.segments, userName: profile.displayName,`.
- [ ] **Step 4:** `pnpm db:migrate` — output must end `[✓] migrations applied successfully!` (silence = journal entry missing). `pnpm typecheck && pnpm test -- --run`.
- [ ] **Step 5:** Commit: `capture: wire diarized segments through extraction, log provider + speaker count`

### Task 7: Recording cap 60s → 120s with hard auto-stop

**Files:**
- Modify: `src/app/app/record/record-client.tsx` (caption ~line 472, `start()` ~line 158, `stop()` ~line 208, `resetToIdle()` ~line 131, unmount effect ~line 150)

- [ ] **Step 1:** Add at module level: `const MAX_RECORDING_MS = 120_000;` and a ref in the component: `const autoStopRef = useRef<number | null>(null);`
- [ ] **Step 2:** In `start()` after the elapsed timer starts:

```ts
autoStopRef.current = window.setTimeout(() => {
  if (recorderRef.current?.state === 'recording') void stop();
}, MAX_RECORDING_MS);
```

- [ ] **Step 3:** Clear it in three places (guarding against double-stop, since `stop()` on an inactive MediaRecorder throws): top of `stop()`, inside `resetToIdle()`, and in the unmount cleanup effect — `if (autoStopRef.current) clearTimeout(autoStopRef.current); autoStopRef.current = null;`
- [ ] **Step 4:** Caption at ~line 472: `UP TO 60S` → `UP TO 2 MIN`.
- [ ] **Step 5:** Manual check in local dev: record past 2:00 → recorder stops itself and uploads normally; tapping stop early still works; Try Again resets cleanly.
- [ ] **Step 6:** Commit: `record: raise cap to 2 min with a hard auto-stop`

### Task 8 (OPTIONAL — Tim decides, spec open question 1): Shadow mode

Skip unless Tim wants side-by-side data before flipping preview to nova3. If built: env `TRANSCRIBE_SHADOW: z.coerce.boolean().default(false)`; in CaptureService when provider is whisper and shadow is on, fire `callNova3` in parallel (never await before the whisper result, never fail the capture on shadow errors), log `shadow_transcribe_ms` + `shadow_transcript_chars` (extend migration 0019 with these two columns if this task is in scope at migration time) and `console.log` both transcripts for Vercel logs.

### Task 9: Verify, deploy, hand off

- [ ] **Step 1:** `pnpm typecheck && pnpm test -- --run` — everything green.
- [ ] **Step 2:** Push branch; `vercel` preview deploy.
- [ ] **Step 3:** Set the provider on preview scope only: `vercel env add TRANSCRIBE_PROVIDER preview` → value `nova3`. Redeploy preview so it takes effect. Production keeps no var (defaults to whisper).
- [ ] **Step 4:** `curl -X PUT https://<preview-url>/api/inngest` (janitor routing, per playbook).
- [ ] **Step 5 — QA script for Tim on the preview:**
  1. Solo memo regression: record a normal 30s memo → contact extracts as before; `/app/diagnostics` shows `transcribe_provider: nova3`, `speaker_count: 1`, `transcribeMs` comparable to whisper captures.
  2. Mock conversation A (two voices, or Tim doing both voices distinctly): include "what's your number again?" → "604-555-0123" → number lands on the contact, not the user.
  3. Mock conversation B: spelled-out name ("Bella, B-E-L-L-A") + a handle → spelling wins; user's own details from the exchange are NOT on the contact.
  4. Record right up to 2:00 → auto-stop fires, capture processes within the normal wait.
- [ ] **Step 6:** Update `PM-OS/outputs/portfolio/connectyall-session-state.md` (current step, in-flight section) and `connectyall-journey.md`.
- [ ] **Step 7:** Open PR: title `conversation capture — nova-3 diarization behind a provider switch`, body leads with what shipped and why, includes the QA script and the rollback story (flip `TRANSCRIBE_PROVIDER`, redeploy).

## Notes

- **Response-shape risk is front-loaded into Task 1** — the parser in Task 3 is written against the real fixture, not the docs.
- If PR #19 (`recording-feedback`) is still unmerged when this builds, migration numbering may shift (it holds 0015; first-time-flow holds 0014). Renumber to next-free and fix the journal tag to match.
- Whisper stays the production default until the QA script passes and Tim explicitly flips prod.
