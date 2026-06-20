# Fast Pipeline — Inline Processing + Inngest Janitor

**Date:** 2026-06-20
**Status:** approved by Tim, awaiting plan

## Problem

After a user taps Stop on a recording, the perceived wait until the contact card appears averages **8–22 seconds**. The biggest contributors are sequential — there is no parallelism — and the single biggest controllable chunk is the **Inngest queue + cold-start hop** between `POST /api/capture` returning and the worker actually starting transcription (1–5s).

Speed-of-thought capture is one of Connectyall's selling points. This spec removes Inngest from the happy path and keeps it solely as a safety net for in-flight failures.

## What happens today

```
phone taps Stop
  → POST /api/capture
      → upload to R2                                 [~1s]
      → create interactions stub (status='processing')
      → inngest.send({ name: 'capture/process' })
      → return { interactionId }
  → phone starts polling GET /api/cards/[id] every 1500ms
  → (~1–5s elapses while Inngest schedules + cold-starts)
  → Inngest function fires:
      → downloadObject from R2                       [~1s]
      → Cloudflare Whisper transcribe                [~3–8s]
      → Gemini Flash Lite extract                    [~1–3s]
      → ensureContact + DB writes                    [~0.5s]
      → renderCard PNG + R2 upload                   [~1s]
      → markReady(interactionId, contactId)
  → next poll sees status='ready'
  → phone navigates to /app/connections/[contactId]
```

The serialized total feels like 8–22s. The **Inngest queue hop is dead weight** for the happy path — its real value is durability for failures, not throughput on success.

## Proposed design

### Section 1 — `POST /api/capture` becomes the worker

Instead of firing an Inngest event, the route runs the pipeline inside its own serverless function invocation and returns to the phone as soon as the audio is safely in R2.

```
phone taps Stop
  → POST /api/capture
      → validate (size, mime, daily cap)             [<10ms]
      → upload to R2                                 [~1s]
      → create interactions stub (status='processing')
      → waitUntil(processCapture({...}))   // background
      → return { interactionId }                     [~1s after Stop]
  ←
  → // function keeps running past the response thanks to waitUntil
  →   downloadObject from R2                         [~0.2s — same region]
  →   Cloudflare Whisper transcribe (with 2 retries) [~3–8s]
  →   Gemini Flash Lite extract (with 2 retries)     [~1–3s]
  →   ensureContact + DB writes                      [~0.5s]
  →   renderCard PNG + R2 upload                     [~1s]
  →   markReady(interactionId, contactId)
```

**Key change:** use `waitUntil()` from `@vercel/functions` (or the platform equivalent for the Node runtime we use) to allow the pipeline to keep running after the HTTP response has returned to the phone. The function lifetime extends until the work finishes or the 60s timeout hits.

**60s budget check:** typical pipeline is 6–15s. Even a near-60s recording with a slow LLM round-trip fits inside the 60s function ceiling with margin.

### Section 2 — Phone polling stays, just snappier

The existing polling loop in `record-client.tsx` (`poll /api/cards/[id]` every 1500ms) stays. Cadence change only:

- **First 5 seconds after the upload returns:** poll every **500ms**
- **After 5 seconds:** back off to **1500ms** (today's cadence)
- 60s ceiling unchanged; on timeout the error modal kicks in (`processingTimeoutError` — already built)

On `status='ready'`: navigate to `/app/connections/[contactId]` (unchanged).
On `status='failed'`: surface the existing error modal (unchanged).

### Section 3 — Inline retry policy

The pipeline needs to absorb transient API hiccups without bubbling up to the user. Inside `processCapture`:

- **Whisper transient errors** (HTTP 5xx, fetch network errors): up to **2 retries**, **500ms** initial backoff, doubling each retry
- **Gemini transient errors** (HTTP 5xx, retryable 429 with `retryAfter` hint inside the AI SDK's error shape): up to **2 retries**, **1s** initial backoff, doubling
- **Non-retryable errors** (4xx other than 429, invalid responses, schema validation failures): no retry — mark the interaction `failed` immediately

This logic lives in `TranscriptionService` and `ExtractionService` themselves, so the janitor benefits from it too without duplication.

### Section 4 — Inngest janitor (the safety net)

A new Inngest cron-triggered function — `recover-stuck-captures` — runs every **2 minutes**. It finds interactions where `status='processing'` and `created_at > 60 seconds ago`, and re-runs the same pipeline for each.

```
inngest cron, every 2 minutes:
  rows = db.select()
    .from(interactions)
    .where(eq(status, 'processing'))
    .where(lt(created_at, now() - 60s))
    .limit(20);  // soft cap per tick
  for each row:
    await processCapture({ userId, audioR2Key, mimeType, interactionId });
```

Catches all the scenarios that the inline path can drop:

- Network drops mid-request — phone never got the `ready` signal, but pipeline never started
- Vercel function timeout — pipeline started but exceeded 60s
- Deploy mid-process — old function instance died before completion
- waitUntil silently dropped — platform edge case

**Time to recovery: up to 2 minutes** (cron interval). The phone's polling will see `ready` on the next poll after the janitor finishes.

### Section 5 — What we keep, repurpose, and delete

**Keep:**
- All current input validation in `/api/capture` (`MAX_BYTES`, `ALLOWED_MIME`, `MAX_CAPTURES_PER_DAY`)
- `CaptureService.processCapture` — the worker logic. Just gets called inline now instead of as a sole Inngest step.
- The existing polling client and the recording error modal
- Audio in R2 is the source of truth — uploaded before processing kicks off, so it survives any in-flight failure
- Inngest itself — we still need the cron infrastructure for the janitor

**Repurpose:**
- `src/lib/inngest/functions.ts` — `processCaptureFn` (event-triggered) replaced by `recoverStuckCapturesFn` (cron-triggered). Same body, different trigger.

**Delete:**
- `inngest.send({ name: 'capture/process', ... })` from the inline `/api/capture` route
- The `capture/process` event type is no longer fired by the app; can leave the Inngest function listening or remove — doesn't matter once nothing emits it. Remove for cleanliness.

### Section 6 — Failure behavior matrix

| Scenario | Today (Inngest happy path) | New (inline + janitor) |
|---|---|---|
| Happy path | ✅ Works (~10–20s) | ✅ Works (~3–6s) |
| Whisper 5xx blip | ✅ Inngest retries 3× | ✅ Inline retries 2× |
| Gemini 5xx blip | ✅ Inngest retries 3× | ✅ Inline retries 2× |
| Gemini 429 (quota) | ❌ User sees failed (same) | ❌ User sees failed (same) |
| Network drops between phone and server | ✅ Inngest still finishes server-side | ✅ Janitor finishes within ~2 min |
| Vercel function timeout (audio > 60s) | ⚠️ Inngest function inherits same timeout | ✅ Janitor retries from R2 — and any single re-run that fits in 60s eventually wins |
| Deploy mid-process | ✅ Inngest queue durable | ✅ Janitor catches it within ~2 min |
| Whisper hard failure (corrupt audio) | ❌ Marked failed after retries | ❌ Marked failed after retries |
| No contacts extracted | ❌ Marked failed | ❌ Marked failed |

**No category gets user-visibly worse.** The only category where the *recovery time* changes is "network drops" — from "best-effort fast" to "up to 2 minutes." The user still doesn't have to redo anything.

## File and surface changes

- `src/app/api/capture/route.ts` — drop the `inngest.send`, call `processCapture` via `waitUntil`
- `src/services/CaptureService.ts` — no API change; just gets called from a new entry point
- `src/services/TranscriptionService.ts` — wrap the Cloudflare fetch in retry logic (2 tries, 500ms backoff, retry on 5xx + network)
- `src/services/ExtractionService.ts` — wrap the `generateObject` call in retry logic (2 tries, 1s backoff, retry on 5xx + retryable 429)
- `src/lib/inngest/functions.ts` — replace event-triggered `processCaptureFn` with cron-triggered `recoverStuckCapturesFn`
- `src/app/app/record/record-client.tsx` — tighten polling cadence (500ms for first 5s, then 1500ms)
- New tests:
  - `TranscriptionService.test.ts` — retry behavior on 5xx, no retry on 4xx, ceiling at 2 retries
  - `ExtractionService.test.ts` — retry behavior on 5xx and retryable 429s
  - `inngest/functions.test.ts` — janitor finds and reprocesses stuck rows
  - `CaptureService.test.ts` — existing tests still pass; add a "marks failed on non-retryable error" case

## Out of scope (separate branches)

- Web Speech API for browser-side live transcription (the bigger speed win, Tim explicitly punted to review after this lands)
- SSE / WebSocket push to replace polling entirely
- Audio chunked streaming upload during recording
- Recap prompt round-2 tuning based on production data

## What "done" looks like

- 30-second test recording from phone shows the contact card in ~3–6 seconds end-to-end
- A simulated mid-pipeline failure (kill the inline function before it writes ready) results in the contact appearing within 2 minutes via the janitor, with no user action
- All existing tests pass; new tests cover the retry + janitor paths
- Sentry / Vercel logs show no orphaned `processing` interactions older than 2 minutes after a full day of normal use
- The error modal still surfaces the right human-readable message for the failure cases that bubble up

## Self-review notes (this spec)

- Goal stated, current pipeline traced, speedup math grounded in actual measured ranges ✅
- Every section names the actual files and function names that change ✅
- No placeholder copy ("TBD", "consider", "TODO") ✅
- Failure matrix forces every category to be reasoned about ✅
- Out-of-scope list closes the door on scope creep ✅
