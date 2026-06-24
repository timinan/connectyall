# Personalization — Implementation Plan

**Spec:** `docs/superpowers/specs/2026-06-24-personalization-design.md`
**Branch:** `feature/personalization`

## Approach

TDD where there's pure logic. Direct implementation for UI + plumbing. Migrations are hand-written with matching `_journal.json` entries (Drizzle silently skips otherwise). One commit per coherent slice so the PR diff reads well.

## Tasks

### Layer 1 — Vocabulary

1. **Migration 0016** — add `users.vocabulary text` (nullable, hard cap 500 chars enforced in app). Update `_journal.json`.
2. **`src/lib/personalization.ts`** — new module.
   - `normalizeVocabulary(raw: string | null | undefined): string | null` — trims, collapses whitespace, drops if empty, caps at 500 chars.
   - `buildWhisperInitialPrompt(vocab: string | null): string | undefined`
   - `buildExtractionPersonalizationBlock({ vocabulary, corrections, examples }): string` — assembles the optional sections of the system prompt. Returns `''` when nothing is set.
   - Tests for each.
3. **TranscriptionService** — `transcribe(audio, options?: { initialPrompt?: string })`. When `initialPrompt` is set, switch to JSON body form `{ audio: Array.from(bytes), initial_prompt }`. Otherwise keep octet-stream.
4. **ExtractionService** — `extract({ transcript, selfIntro, vocabulary, corrections, examples })`. Build the system prompt by appending the personalization block to the SYSTEM_PROMPT constant.
5. **CaptureService** — pass `profile.vocabulary` to transcribe + extract.
6. **`/api/profile` PUT** — accept partial `{ vocabulary: string | null }`. Validate with the same normalizer.
7. **Profile UI** — add a tap-to-edit section above the "Sign out" / "Delete" row. Title: "Your vocabulary". Mono label: "WORDS YOU SAY OFTEN". Body copy: "List names, companies, and handles you talk about often so we transcribe them right." Textarea with the normalizer applied client-side and server-side. Follow design system: tap-to-edit pattern (pencil → check + X), `CARD_BASE`, mono labels, brand purple primary actions.

### Layer 2 — Correction memory

8. **Migration 0017** — `user_corrections` table + index. Update `_journal.json`.
9. **`src/services/CorrectionsService.ts`**
   - `logCorrection(userId, field, original, corrected)` — dedups by `(userId, field, original, corrected)`. Insert with `used_count = 1`, or update `used_count = used_count + 1, created_at = now()` on conflict.
   - `listRecentCorrections(userId, limit)` — returns rows ordered by `created_at DESC`.
   - `clearCorrectionsForUser(userId)` — for the future "reset tuning" button.
   - Tests via pglite (consistent with existing tests).
10. **Hook into PUT /api/contacts/[id]** — at the service layer (`ContactService.updateContactField`), before the update, read the current value. After a successful update, if both old and new are non-empty meaningful strings, call `logCorrection`. Limit which `kind` values are logged: `name`, `notes`, `telegram`, `x`, `linkedin`, `website`, `whatsapp`, `wechat`, `line`, `instagram`, `messenger` (the free-text values, not enum picks).
11. **ExtractionService injection** — caller passes `corrections` array; the prompt builder formats them.
12. **CaptureService** — load top 10 corrections, pass to `extract`.

### Layer 3 — Calibration backend + mockup

13. **Migration 0018** — `user_calibration_examples` table + index. Update `_journal.json`.
14. **`src/services/CalibrationService.ts`**
    - `addExample(userId, transcript, expectedJson)` — insert, cap at 10 per user (delete oldest if 11th).
    - `listExamples(userId, limit)` — most recent first.
    - `clearForUser(userId)`.
    - Tests.
15. **ExtractionService injection** — caller passes `examples`; prompt builder formats them.
16. **CaptureService** — load top 3 examples, pass to `extract`.
17. **API** `GET /api/calibration-examples`, `POST /api/calibration-examples`, `DELETE /api/calibration-examples`. Hooked up but the UI doesn't call them yet; this lets us mock + iterate on the UI next pass.
18. **UI mockup** — `PM-OS/outputs/portfolio/connectyall-ui-mockups/2026-06-24-voice-training-design.html`. Phone-frame grid, all the screens of the flow, light annotation of open decisions for Tim.

### Verify, push, ship

19. `pnpm typecheck && pnpm test -- --run`.
20. `pnpm db:migrate`.
21. Commit per task slice. Push the branch.
22. `vercel` preview. `curl -X PUT https://<preview>/api/inngest`.
23. Update `PM-OS/outputs/portfolio/connectyall-session-state.md`.
24. Update `PM-OS/outputs/portfolio/connectyall-journey.md`.
25. Open PR.
26. Wakeup note to Tim.

## Notes

- Branch `recording-feedback` is parked waiting Tim's QA. This branch is independent off `main`. When recording-feedback merges first, this rebases. When this merges first, recording-feedback rebases. No content overlap expected.
- No new env vars.
- Design system reference is `docs/design-system.html`; the profile UI changes follow the tap-to-edit pattern already documented there.
