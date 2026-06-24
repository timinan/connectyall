# Personalization — Vocabulary, Memory, Calibration

**Date:** 2026-06-24
**Status:** approved by Tim, implementation in flight

## Problem

Capture accuracy is good but not great, and the failures are personal. Sarah/Sarra, Vee/V, Pinto/Pintu — these are not problems a base model can solve for everyone the same way. They depend on who the user keeps recording about, the names they over-index on, the handles they always speak the same way.

Two paths exist for fixing personal accuracy: train per-user models (cost-prohibitive, weeks of work per user), or give every user three lightweight layers of personal context that ride on top of the shared baseline. This spec is the second path.

## Naming

User-facing label: **"Tuning"** (premium feature). The three pieces:

- **Your vocabulary** — words you say a lot that the AI should know about.
- **Smart memory** — when you fix a name or detail, we remember for next time.
- **Voice training** — a guided session that teaches the AI how you talk.

Internally we call the whole thing "personalization" because that's what it technically is. The user-facing language sells the felt experience, not the implementation.

## Three layers

### Layer 1 — Personal vocabulary (Your vocabulary)

A single user-editable text field on the profile (max ~500 chars). Free-form. The user lists names, companies, handles, jargon they say a lot.

Example value:

> Sarah Lee, V (the founder), Pinto Money, Connectyall, ARR, MEV, @timnan, @robfromacme

This string gets injected in two places per capture:

1. **Whisper `initial_prompt`** on the transcription call. Cloudflare's `@cf/openai/whisper` accepts `initial_prompt` via the JSON body form `{ audio: [...bytes], initial_prompt }`. When the user has a vocabulary set, we switch from octet-stream to JSON body. When the vocabulary is empty (most users on day one), we keep the fast octet-stream path.
2. **Gemini extraction system prompt**, as a new section:
   ```
   USER VOCABULARY (words this user says often — prefer these spellings):
   Sarah Lee, V (the founder), Pinto Money, ...
   ```

Cost: one tiny migration, one helper, two prompt edits, one profile UI row.

### Layer 2 — Correction memory (Smart memory)

Every inline edit on the contact-detail page is already a single-field PUT to `/api/contacts/[id]`. We add a service-level hook that, before applying the update, reads the current value and compares. If they differ and both look like meaningful text (not a clear, not an empty string), we log a row to a new `user_corrections` table:

```sql
CREATE TABLE user_corrections (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  field         text NOT NULL,        -- 'name', 'telegram', 'company', 'notes', etc.
  original_text text NOT NULL,
  corrected_text text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  used_count    integer NOT NULL DEFAULT 0
);
CREATE INDEX user_corrections_user_id_created_at_idx
  ON user_corrections (user_id, created_at DESC);
```

On extraction, we read the top N corrections for the user (most recent 10) and inject them as another section of the Gemini system prompt:

```
RECENT CORRECTIONS (when the user said X, they meant Y — prefer Y next time):
- "Sarra" → "Sarah Lee"
- "Pintu" → "Pinto Money"
- "@timman" → "@timnan"
```

We do NOT inject corrections into Whisper directly — `initial_prompt` has a length budget and the vocabulary field already covers that surface. Corrections shape extraction only.

**Dedup rule:** if a `(field, original_text, corrected_text)` triple already exists, increment `used_count` and bump `created_at` instead of inserting a new row.

**Privacy note:** corrections are per-user, never shared. Aggregated patterns may inform future shared-prompt tuning but only by Tim's hand, never automatic.

### Layer 3 — Calibration session (Voice training)

A guided multi-step flow the user runs once or twice. It produces a small set of canonical `(transcript, expected_extraction)` pairs that get used as few-shot examples in the extraction prompt forever after.

Schema:

```sql
CREATE TABLE user_calibration_examples (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  transcript    text NOT NULL,
  expected_json jsonb NOT NULL,        -- a single ExtractedContact
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX user_calibration_examples_user_id_idx
  ON user_calibration_examples (user_id);
```

Flow (UI to be mocked + designed before shipping):

1. **Intro screen.** "Let's spend 5 minutes teaching Connectyall how you talk." Bullet on what the user gets.
2. **Loop, 3–5 times:**
   - Record a short memo about someone they know well.
   - Connectyall runs the normal pipeline, shows the proposed extraction.
   - User edits anything wrong using the same inline-edit UI as the connection detail page.
   - User taps "This is right" — the corrected version is saved as a calibration example.
3. **Done screen.** "Saved N examples. Future captures will use them."

On every subsequent extraction, the system prompt gets a new section:

```
USER EXAMPLES (when this user records, expect output like these):
Transcript: "I just met Sarah Lee, she's a designer at Notion. We chatted about onboarding flows."
Output: { "name": "Sarah Lee", "company": "Notion", "role": "Designer", "context": "...", ... }

Transcript: "Met V again at the coffee shop, the Pinto founder. ..."
Output: { ... }
```

We cap injection at 3 examples to keep the prompt under a sensible token ceiling, picked in insertion order. The user can revisit `/app/profile/tuning` to clear or regenerate examples.

**Backend ships in this branch. UI ships in a follow-on once Tim signs off on the mockups.**

## Prompt-budget math

A capture today sends Gemini ~1200 system-prompt tokens + ~150 user-context tokens + the transcript (~200 tokens for a 30s memo). Personalization adds up to:

- Vocabulary section: ~120 tokens cap (500 chars).
- Corrections section: ~150 tokens for 10 entries.
- Examples section: ~400 tokens for 3 examples.

Total worst case: +670 tokens per capture, well under Flash Lite's 1M-token context. No measurable latency cost.

## Test plan

- **Vocabulary parser:** strips junk, caps at 500 chars, normalizes whitespace.
- **Whisper body switch:** when vocabulary is empty, sends octet-stream (unchanged). When set, sends JSON body with `initial_prompt`.
- **Corrections diff:** when a PUT changes the value, a row lands. When PUT is a no-op or a clear, no row.
- **Corrections dedup:** repeated identical corrections bump used_count, not row count.
- **Extraction prompt assembly:** all three sections appear in the right order when data is present, absent sections collapse cleanly.
- **Calibration injection:** examples appear in the prompt; cap at 3.

## Out of scope

- **Real model fine-tuning.** Different cost curve, different sprint.
- **Cross-user vocabulary suggestions.** Privacy.
- **Calibration recording UI.** Mockup ships in this branch, implementation in next.
- **A "tuning" subscription gate.** Wired to free for now; gating is a billing concern, not a capture concern.
- **Sharing tuning across devices.** Server-side already, so this is free.

## Open questions

- **Whisper JSON body latency.** Serializing audio as a JSON number array is ~5x bloat. For 30s memos (~150KB octet → ~750KB JSON) the overhead should be sub-second. We'll measure in diagnostics — `transcribeMs` will tell us if vocabulary captures are noticeably slower.
- **Correction triggers from notes vs name vs handle.** Probably want different weights eventually (a wrong name is worth more than a slightly-different note). Out of scope for v1; all corrections equal.
