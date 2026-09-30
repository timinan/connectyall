# Conversation Capture — Diarized Transcription with Provider Switch

**Date:** 2026-07-06
**Status:** approved direction by Tim, build starts after PR #20 (personalization) merges

## Problem

Captures work great when the user dictates a memo solo, mouth two inches from the mic. The natural next act is capturing a live exchange — the 60–120 seconds where two people actually swap details:

> "So this is Bella — B-E-L-L-A." · "What was your number again?" · "Oh it's 604-555-1234." · "Best way to reach you?" · "Just Telegram, @bellanv."

The extraction side of this is mostly solved already: PR #17 taught the prompt spell-outs and self-corrections, and the LLM strips filler fine. Two things upstream break on real conversations:

1. **No speaker attribution.** `@cf/openai/whisper` returns one unlabeled text stream. For "what's your number?" / "604-555-1234", the model has to guess whose number that is. It guesses wrong exactly when it matters — when both people swap info.
2. **Base Whisper degrades on conversational audio.** Far-field speech, background noise, cross-talk. A garbled name can't be recovered downstream.

## Decision

Swap-able transcription provider, defaulting to the current Whisper path:

- **`TRANSCRIBE_PROVIDER=whisper | nova3`** env enum, exactly mirroring the existing `LLM_PROVIDER` pattern in `src/lib/env.ts`. No new secrets — `@cf/deepgram/nova-3` runs on the same Cloudflare account and API token as Whisper.
- **Nova-3 with `diarize=true`** returns per-word speaker numbers and utterances. It's Deepgram's conversational/noisy-audio model, ~$0.0052/audio-minute (≈1¢ per 2-min capture).
- **Conversation-mode extraction**: when the transcript has ≥2 distinct speakers, the extraction prompt renders a speaker-labeled transcript and adds a section teaching Gemini to identify which speaker is the app user and extract the *other* person as the contact.
- **Recording cap raised 60s → 120s with a hard auto-stop.** Today's "UP TO 60S" is caption-only; nothing enforces it. The 2-min hard cap is what keeps every latency/cost assumption true.

### Why this stays fast

At a 2-minute ceiling: upload is 1–2MB, Nova-3 transcribes it in a couple of seconds (Deepgram batch runs far faster than real-time), transcript is ~400 words so Gemini extraction barely moves. Post-stop wait stays in the current 3–6s band. No Inngest routing changes, no Vercel 60s-ceiling concerns, and the client's 60s processing-poll timeout keeps its margin.

### Why switching back and forth is trivial

- Provider is a single env var read at capture time. Rollback in production = flip the var, redeploy (~1 min), no code revert.
- Vercel env scoping gives free A/B: set `TRANSCRIBE_PROVIDER=nova3` on the **Preview** scope only — every preview deploy runs Nova-3 while production stays on Whisper.
- Degradation is graceful by construction: the Whisper path returns no segments, so extraction automatically falls back to today's memo-mode prompt. A conversation recorded on Whisper still works, just with weaker attribution.

## Architecture

### Transcription contract widens

`transcribe()` currently returns `Promise<string>`. It becomes:

```ts
export type TranscriptSegment = { speaker: number; text: string };
export type TranscriptResult = { text: string; segments: TranscriptSegment[] | null };
export async function transcribe(audio: Uint8Array, opts?: TranscribeOptions): Promise<TranscriptResult>;
```

- Whisper path: `{ text, segments: null }` — behavior otherwise unchanged, including the `initial_prompt` JSON-body switch from PR #20.
- Nova-3 path: `{ text, segments }` where segments come from Deepgram's `utterances` (consecutive same-speaker utterances merged), falling back to grouping the per-word `speaker` fields.

### Nova-3 call

`POST https://api.cloudflare.com/client/v4/accounts/{id}/ai/run/@cf/deepgram/nova-3` with query params `diarize=true&smart_format=true&punctuate=true&utterances=true`, raw audio bytes as the body with the audio's real content-type. Vocabulary (PR #20 layer 1) maps to repeated `keyterm=` query params — Nova-3's equivalent of Whisper's `initial_prompt`, and it avoids the JSON-body byte-array bloat entirely.

**Known unknown:** Cloudflare's docs don't spell out the exact response JSON for the REST endpoint (Deepgram-native `{ results: { channels, utterances } }` vs the Workers AI `{ success, result }` envelope). Task 1 of the plan is a live curl against the endpoint with a sample file to pin the shape before the parser is written. The parser handles both envelopes defensively regardless.

### Conversation-mode extraction

`extract()` gains optional `segments` and `userName` inputs. When segments exist with ≥2 distinct speakers:

- The prompt transcript renders as `Speaker 0: ...` / `Speaker 1: ...` lines.
- The system prompt appends a CONVERSATION MODE section: identify the app user's speaker number (their display name is provided), extract the other speaker(s) as the contact, attribute answers to the question asked, never create a contact for the user themselves, and treat both-people-swap-details as "capture the non-user side only."

With 0–1 speakers (or Whisper), nothing changes — memo mode as today, including all PR #17 and PR #20 prompt sections.

### Diagnostics

Two additive columns on `capture_diagnostics` (same pattern as `llm_provider`/`llm_model`): `transcribe_provider text`, `speaker_count integer`. This is what makes Whisper-vs-Nova-3 comparable per-capture on `/app/diagnostics` — `transcribeMs` is already tracked.

### Recording UI

- Caption: `TAP TO RECORD · UP TO 60S` → `· UP TO 2 MIN`.
- Hard auto-stop at 120s via a timeout ref that calls the existing `stop()` (guarded on `recorderRef.current?.state === 'recording'`), cleared in `stop()`, `resetToIdle()`, and unmount.
- No new screens, no mode toggle. A 1-speaker recording on Nova-3 is just a memo; the pipeline decides per-capture.

## Optional: shadow mode

`TRANSCRIBE_SHADOW=true` (env, default unset): while Whisper remains the real path, also fire Nova-3 in parallel and log its timing + transcript length to two extra diagnostics columns (`shadow_transcribe_ms`, `shadow_transcript_chars`), with both transcripts in server logs. Collects real side-by-side data from Tim's own usage before anything user-facing flips. Doubles transcription cost (pennies). **Tim decides whether to build this task or skip straight to the preview-scope A/B.**

## Cost & latency budget

| | Whisper (today) | Nova-3 (2-min capture) |
|---|---|---|
| Transcription cost | free tier | ~$0.011 |
| Transcribe latency | ~1–3s for 60s audio | expected similar or better; verified via `transcribeMs` |
| Extraction input | ~200 tokens | ~600 tokens (+ labeled speakers) — no measurable Gemini latency change |

## Out of scope

- **Full-conversation / ambient recording.** The product records the 2-minute detail-swap moment, deliberately.
- **Inngest routing for long audio.** Unnecessary at a 2-min cap.
- **Gemini audio-native pipeline** (sending audio straight to the LLM). Documented fallback if Nova-3 disappoints; loses per-stage diagnostics and dedicated-STT accuracy.
- **Live/streaming transcription while recording.** Batch-on-stop stays.
- **>2 speaker group-capture UX.** The prompt handles N speakers, but no UI work for picking among multiple new contacts beyond what multi-contact extraction already does.

## Open questions for Tim

1. **Shadow mode** — build it, or go straight to Nova-3 on preview scope? (Recommendation: skip shadow, preview A/B is enough at this scale.)
2. **Consent nudge** — recording another person is fine one-party in BC/Canada, but two-party in California etc. Add a one-line copy nudge near the record button ("let them know you're recording"), or leave it to the terms page?
3. **Countdown affordance** — when recording passes ~1:45, flip the `RECORDING · 1:47` label red as a "wrapping up" cue, or just hard-stop silently at 2:00?

## Test plan

- Parser: fixture JSON (from the live curl) → correct text + merged segments; word-fallback path; both envelope shapes; empty/malformed → safe `{ text: '', segments: null }`.
- Whisper path: returns `segments: null`; body-switch behavior from PR #20 unchanged.
- Keyterm mapping: vocabulary string → capped, trimmed, URL-safe `keyterm` params; empty vocabulary → none.
- Extraction: segments with 2 speakers → labeled transcript + CONVERSATION MODE section present; 1 speaker or null → memo prompt byte-identical to today.
- Env: `TRANSCRIBE_PROVIDER` defaults to whisper; invalid value fails validation.
- Recorder: auto-stop fires at cap (manual QA on preview).
- End-to-end QA script on preview (in plan): one solo memo regression + two mock conversations (number exchange, spelled-out name) with diagnostics checks.
