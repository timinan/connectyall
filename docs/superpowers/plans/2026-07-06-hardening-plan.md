# Hardening — Implementation Plan (2026-07-06 audit remediation)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Source:** security + reliability audit of main on 2026-07-06 (findings summarized in `PM-OS/outputs/portfolio/connectyall-session-state.md` § "Codebase audit — 2026-07-06").
**Branch:** `hardening` — off fresh `main`, ideally after open PRs #19/#20 merge (Tasks 1–3 touch `CaptureService`/`InteractionService`/`/api/capture`, which #19/#20 also edit; if those PRs are still open, expect rebases).
**Goal:** Close the audit findings: race-free capture pipeline, upload abuse controls, OTP hardening, public-page noindex, and a set of small correctness fixes.

**Architecture:** No new features. Three clusters: (1) pipeline concurrency — atomic row claim + guarded status transitions + cap enforced in the route; (2) input/output hygiene — magic-byte MIME sniff, vCard CRLF strip, noindex; (3) housekeeping — R2 cleanup on contact delete, `interactions.userId` FK, fetch timeouts, admin allowlist to env, OTP limits.

**Tech stack:** unchanged (Next.js 16, Drizzle + Neon, Better Auth, R2, Vitest).

## Global constraints

- Every migration is hand-written SQL **with a matching `drizzle/meta/_journal.json` entry** (silent skip otherwise). Migration numbers below are `00NN` placeholders — use next-free numbers at build time.
- Task 10's migration DELETEs orphan rows — the one non-additive step in this plan. Run the count query first and show Tim the number before applying to prod Neon.
- Commit style: short lowercase subjects, no AI credits. `pnpm typecheck && pnpm test -- --run` before every push.
- Behavior changes must be invisible to a normal single-capture user: same happy-path UX, same latency.

## Risks & mitigations

| # | Risk | Mitigation |
|---|------|------------|
| H1 | Claim column (Task 2) accidentally blocks the janitor from recovering genuinely-dead runs. | Claim TTL is 120s — a crashed inline run's claim expires before the janitor's second sweep; test covers expired-claim reclaim. |
| H2 | Status guards (Task 1) silently skip a transition the caller expected. | Both helpers return the updated row count; callers log when 0 (transition skipped = someone else finished first, which is the desired outcome). |
| H3 | Better Auth version may not support `allowedAttempts`/`rateLimit` exactly as written (Task 5). | First step of Task 5 checks the installed version's types in `node_modules/better-auth`; adapt option names to what the types expose, keep the intent (attempt cap + send cooldown). |
| H4 | MIME sniff (Task 4) rejects a real phone recording (odd container). | Sniffer covers webm/EBML, mp4/ftyp, ogg, mp3 (ID3 + frame-sync), wav — the full set `record-client.tsx` can produce; QA includes an iPhone (audio/mp4) and Android (webm) recording before merge. |
| H5 | FK migration (Task 10) fails on prod because orphans exist. | Migration deletes orphans first in the same transaction; dry-run count on prod Neon before applying. |
| H6 | Route-level cap check (Task 3) double-counts with the in-pipeline check. | Both remain (defense in depth) but only the route rejects user-visibly with 429; the pipeline check stays as the janitor-path backstop. |

---

### Task 1: Guard status transitions (`markReady` / `markFailed`)

**Files:**
- Modify: `src/services/InteractionService.ts:37-57`
- Test: `src/services/InteractionService.test.ts` (extend; pglite pattern as in FollowUpsService tests)

**Interfaces (produced, used by Tasks 2/3):**

```ts
export async function markReady(interactionId: string, contactId: string, structuredData: unknown): Promise<boolean>;
export async function markFailed(interactionId: string): Promise<boolean>;
// true = transition applied; false = row was no longer 'processing' (skipped)
```

- [ ] **Step 1 — failing tests:**

```ts
test('markFailed does not clobber a ready row', async () => {
  const id = await mintStub('voice', meta);
  await markReady(id, contactId, {});
  const applied = await markFailed(id);
  expect(applied).toBe(false);
  expect((await getStatus(id))!.status).toBe('ready');
});
test('markReady only applies to processing rows', async () => {
  const id = await mintStub('voice', meta);
  await markFailed(id);
  expect(await markReady(id, contactId, {})).toBe(false);
  expect((await getStatus(id))!.status).toBe('failed');
});
```

- [ ] **Step 2 — implementation.** Both updates add the status guard and return whether a row changed; `markReady` only touches `contacts.lastTouchedAt` when the transition applied:

```ts
export async function markReady(interactionId: string, contactId: string, structuredData: unknown): Promise<boolean> {
  const updated = await db()
    .update(interactions)
    .set({ contactId, structuredData, status: 'ready' })
    .where(and(eq(interactions.id, interactionId), eq(interactions.status, 'processing')))
    .returning({ id: interactions.id });
  if (updated.length === 0) return false;
  await db().update(contacts).set({ lastTouchedAt: new Date() }).where(eq(contacts.id, contactId));
  return true;
}

export async function markFailed(interactionId: string): Promise<boolean> {
  const updated = await db()
    .update(interactions)
    .set({ status: 'failed' })
    .where(and(eq(interactions.id, interactionId), eq(interactions.status, 'processing')))
    .returning({ id: interactions.id });
  return updated.length > 0;
}
```

Import `and` from `drizzle-orm`. Callers compile unchanged (return value newly available, not required). In `src/app/api/capture/route.ts:50-63` and `src/lib/inngest/functions.ts:38-46`, log when the helper returns false: `console.log('[capture] markFailed skipped — row already resolved (interactionId=...)')`.
- [ ] **Step 3:** `pnpm test -- --run InteractionService` passes. Commit: `interactions: status transitions only apply to processing rows`

### Task 2: Atomic claim — inline pipeline vs janitor mutual exclusion

**Files:**
- Create: `drizzle/00NN_interactions_claimed_at.sql` + `_journal.json` entry
- Modify: `src/lib/db/schema.ts` (interactions table), `src/services/InteractionService.ts` (claim helper), `src/services/CaptureService.ts:66` (top of `processCapture`)
- Test: `src/services/InteractionService.test.ts`

**Interfaces:**
- Produces: `claimCapture(interactionId: string): Promise<boolean>` (exported from `InteractionService.ts` for tests)

- [ ] **Step 1 — migration:**

```sql
ALTER TABLE interactions ADD COLUMN claimed_at timestamptz;
```

Journal entry with matching tag. Schema.ts: add `claimedAt: timestamp('claimed_at', { withTimezone: true }),` to the interactions table.
- [ ] **Step 2 — failing tests:**

```ts
test('claimCapture wins once, second concurrent claim loses', async () => {
  const id = await mintStub('voice', meta);
  expect(await claimCapture(id)).toBe(true);
  expect(await claimCapture(id)).toBe(false); // fresh claim blocks re-entry
});
test('an expired claim can be re-claimed', async () => {
  const id = await mintStub('voice', meta);
  await claimCapture(id);
  await db().update(interactions).set({ claimedAt: new Date(Date.now() - 150_000) }).where(eq(interactions.id, id));
  expect(await claimCapture(id)).toBe(true); // stale (>120s) claim = dead run, reclaimable
});
test('claimCapture refuses non-processing rows', async () => {
  const id = await mintStub('voice', meta);
  await markFailed(id);
  expect(await claimCapture(id)).toBe(false);
});
```

- [ ] **Step 3 — implementation** in `InteractionService.ts`:

```ts
const CLAIM_TTL_SECONDS = 120;

// Atomic claim: exactly one runner (inline after() or janitor) may own a
// processing row at a time. A claim older than the TTL is treated as a dead
// run (crashed function) and can be taken over.
export async function claimCapture(interactionId: string): Promise<boolean> {
  const claimed = await db()
    .update(interactions)
    .set({ claimedAt: new Date() })
    .where(and(
      eq(interactions.id, interactionId),
      eq(interactions.status, 'processing'),
      sql`(claimed_at IS NULL OR claimed_at < now() - (${CLAIM_TTL_SECONDS} * interval '1 second'))`,
    ))
    .returning({ id: interactions.id });
  return claimed.length > 0;
}
```

In `CaptureService.processCapture`, immediately after the profile guard (line ~77), add:

```ts
if (!(await claimCapture(input.interactionId))) {
  console.log(`[capture] skipping — row claimed by another runner or already resolved (interactionId=${input.interactionId})`);
  return;
}
```

This also fixes the duplicate-secondary-contacts finding: secondaries only mint after `markReady`, so the only duplication path was two concurrent runners — which the claim now excludes.
- [ ] **Step 4:** `pnpm db:migrate` (confirm `[✓]`), `pnpm typecheck && pnpm test -- --run`. Commit: `capture: atomic row claim so inline pipeline and janitor never double-process`

### Task 3: Enforce the daily cap in the route, before the upload

**Files:**
- Modify: `src/app/api/capture/route.ts:14-30`, `src/services/CaptureService.ts:26` (export helper), `src/services/InteractionService.ts` (new count helper)
- Test: `src/app/api/capture/route.test.ts` if a route-test pattern exists; otherwise service-level test for the new counter

- [ ] **Step 1:** Export the existing private `capturesInLast24h` from `CaptureService.ts:26` (add `export`). Add to `InteractionService.ts`:

```ts
export async function countProcessingForUser(userId: string): Promise<number> {
  const rows = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(interactions)
    .where(and(eq(interactions.userId, userId), eq(interactions.status, 'processing')));
  return rows[0]?.n ?? 0;
}
```

- [ ] **Step 2:** In `route.ts`, after the session check (line 16) and BEFORE `req.formData()`:

```ts
const [done, inFlight] = await Promise.all([
  capturesInLast24h(session.user.id),
  countProcessingForUser(session.user.id),
]);
if (done + inFlight >= env().MAX_CAPTURES_PER_DAY) {
  return NextResponse.json({ error: 'daily capture limit reached' }, { status: 429 });
}
```

(import `env` from `@/lib/env`). Keep the in-pipeline check at `CaptureService.ts:67` unchanged — it stays as the backstop for janitor-path re-entry.
- [ ] **Step 3:** Check `record-client.tsx`'s `decodeUploadError` handles a 429 `{error}` body gracefully (it decodes `{error: '...'}` payloads — verify copy reads humanly, e.g. surface "daily capture limit reached" as the modal body; adjust the decoder mapping if it falls through to a generic message).
- [ ] **Step 4:** `pnpm typecheck && pnpm test -- --run`. Commit: `capture: enforce daily cap in the route before the upload lands in r2`

### Task 4: Magic-byte MIME validation on upload

**Files:**
- Create: `src/lib/audio-sniff.ts`
- Modify: `src/app/api/capture/route.ts:23-30`
- Test: `src/lib/audio-sniff.test.ts`

- [ ] **Step 1 — failing tests** (byte-array literals, no fixture files needed):

```ts
test('sniffs webm/EBML', () => expect(sniffAudioMime(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe('audio/webm'));
test('sniffs mp4/ftyp', () => expect(sniffAudioMime(new Uint8Array([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]))).toBe('audio/mp4'));
test('sniffs ogg', () => expect(sniffAudioMime(new Uint8Array([0x4f, 0x67, 0x67, 0x53, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe('audio/ogg'));
test('sniffs mp3 via ID3 and frame sync', () => {
  expect(sniffAudioMime(new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe('audio/mpeg');
  expect(sniffAudioMime(new Uint8Array([0xff, 0xfb, 0x90, 0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe('audio/mpeg');
});
test('sniffs wav/RIFF', () => expect(sniffAudioMime(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]))).toBe('audio/wav'));
test('rejects non-audio', () => {
  expect(sniffAudioMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0]))).toBeNull(); // png
  expect(sniffAudioMime(new Uint8Array([1, 2]))).toBeNull(); // too short
});
```

- [ ] **Step 2 — implementation:**

```ts
// Sniff the real container from magic bytes — client-supplied MIME is spoofable.
export function sniffAudioMime(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return 'audio/webm'; // EBML
  if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) return 'audio/mp4'; // ftyp
  if (bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) return 'audio/ogg'; // OggS
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return 'audio/mpeg'; // ID3
  if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return 'audio/mpeg'; // MPEG frame sync
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) return 'audio/wav'; // RIFF
  return null;
}
```

- [ ] **Step 3 — route:** after `const bytes = new Uint8Array(await file.arrayBuffer());` (line 29), before `uploadBytes`:

```ts
const sniffed = sniffAudioMime(bytes);
if (!sniffed) return NextResponse.json({ error: 'not a recognized audio file' }, { status: 400 });
```

Keep using `baseMime` for ext/contentType (webm-in-video/webm etc. already normalized); the sniff is the gate, not the label.
- [ ] **Step 4:** Tests pass. Commit: `capture: validate audio magic bytes, not just client mime`

### Task 5: OTP hardening

**Files:**
- Modify: `src/lib/auth/server.ts:60-68`

- [ ] **Step 1:** Check the installed Better Auth version's option types: `grep -rn "allowedAttempts\|rateLimit" node_modules/better-auth/dist/**/*.d.ts | head`. Adapt the exact option names below to what the types expose — the intent is fixed: cap verify attempts, cool down sends, rate-limit both endpoints.
- [ ] **Step 2:** Extend the plugin config and add global rate limiting:

```ts
    rateLimit: {
      enabled: true,
      window: 60,
      max: 20,
      customRules: {
        '/email-otp/send-verification-otp': { window: 60, max: 2 },
        '/sign-in/email-otp': { window: 60, max: 5 },
      },
    },
    plugins: [
      emailOTP({
        sendVerificationOTP: async ({ email, otp }) => {
          await sendOTPEmail({ to: email, otp });
        },
        otpLength: 6,
        expiresIn: 60 * 10,
        allowedAttempts: 5, // verify attempts per code before it's invalidated
      }),
    ],
```

Note: better-auth's default rate-limit storage is in-memory, which is per-instance on serverless — still worthwhile (slows single-instance bursts), but note in the commit that DB-backed rate-limit storage (`rateLimit.storage: 'database'`) is the stronger option if the types support it; prefer it if available.
- [ ] **Step 3:** Manual QA on preview: request 3 OTPs inside a minute (third is rejected), enter 6 wrong codes (code invalidated, must re-send). Commit: `auth: cap otp attempts and rate-limit send/verify`

### Task 6: `noindex` on public card pages

**Files:**
- Modify: `src/app/c/[id]/page.tsx:16` (`generateMetadata`)

- [ ] **Step 1:** Add to the metadata object returned by `generateMetadata` (both the found and not-found branches if it has them):

```ts
robots: { index: false, follow: false },
```

- [ ] **Step 2:** Verify locally: `curl -s localhost:3000/c/<some-id> | grep -i robots` shows the meta tag. Commit: `public card: noindex — share pages are for recipients, not crawlers`

### Task 7: Ownership check before status leak in `/api/cards/[id]`

**Files:**
- Modify: `src/services/InteractionService.ts:59-73` (`getStatus`), `src/app/api/cards/[id]/route.ts:25-30`

- [ ] **Step 1:** Add `userId: interactions.userId` to `getStatus`'s select and return type.
- [ ] **Step 2:** In the route, before the `stub.status !== 'ready'` early return:

```ts
if (stub.userId !== session.user.id) return NextResponse.json({ error: 'not found' }, { status: 404 });
```

404 (not 403) so non-owners can't distinguish "exists" from "doesn't" — and legacy bot-era rows (`userId` null) simply 404. The later contact-ownership check at line 36 stays.
- [ ] **Step 3:** `pnpm typecheck && pnpm test -- --run`. Commit: `cards api: ownership check before returning processing status`

### Task 8: vCard CRLF hygiene

**Files:**
- Modify: `src/lib/vcard.ts`
- Test: `src/lib/vcard.test.ts` (extend if exists, else create)

- [ ] **Step 1 — failing test:**

```ts
test('newlines in fields cannot inject vcard properties', () => {
  const v = buildContactVCard({ name: 'Mallory\r\nTEL:+1555000000', emails: [], phones: [], telegram: null, x: null, linkedin: null, website: null });
  expect(v).not.toContain('\r\nTEL:+1555000000');
  expect(v).toContain('FN:Mallory TEL:+1555000000'); // folded onto one line
});
```

- [ ] **Step 2:** Add `const clean = (s: string) => s.replace(/[\r\n]+/g, ' ').trim();` and wrap every interpolated user value in both builders: `FN`, the `N` name parts (inside `splitName` input), `TITLE`, `ORG`, `EMAIL`, `TEL`. (URL lines already pass through `social-urls` normalizers, which strip whitespace — leave them.)
- [ ] **Step 3:** Tests pass. Commit: `vcard: strip crlf from interpolated fields`

### Task 9: R2 cleanup when a contact is deleted

**Files:**
- Modify: `src/app/api/contacts/[id]/route.ts:105-121` (DELETE)
- Test: manual QA (R2 mock not worth building; the account-delete path at `src/app/api/profile/route.ts:122-128` is the pattern)

- [ ] **Step 1:** Before the `db().delete(contacts)` call, collect and delete the R2 objects (replace the "will land in the privacy-hardening branch" comment — this is that branch):

```ts
const interactionRows = await db()
  .select({ id: interactions.id, audioR2Key: interactions.audioR2Key })
  .from(interactions)
  .where(eq(interactions.contactId, id));
for (const row of interactionRows) {
  try { await deleteObject(`cards/${row.id}.png`); } catch { /* already gone, ignore */ }
  if (row.audioR2Key) { try { await deleteObject(row.audioR2Key); } catch { /* ignore */ } }
}
```

Imports: `interactions` from schema, `deleteObject` from `@/lib/r2/client`.
- [ ] **Step 2:** Manual QA on preview: create a capture, delete the contact, confirm the card PNG and audio object are gone from the R2 bucket (Cloudflare dashboard or `listObjects`). Commit: `contacts: delete r2 cards + audio when a contact is deleted`

### Task 10: `interactions.userId` FK + orphan cleanup — ⚠️ contains a DELETE

**Files:**
- Create: `drizzle/00NN_interactions_user_fk.sql` + `_journal.json` entry
- Modify: `src/lib/db/schema.ts` (interactions.userId)

- [ ] **Step 1 — dry run against prod Neon first, show Tim the count before proceeding:**

```sql
SELECT count(*) FROM interactions WHERE user_id IS NOT NULL AND user_id NOT IN (SELECT id FROM users);
```

- [ ] **Step 2 — migration** (orphan delete + constraint, one transaction):

```sql
DELETE FROM interactions WHERE user_id IS NOT NULL AND user_id NOT IN (SELECT id FROM users);
ALTER TABLE interactions ADD CONSTRAINT interactions_user_id_users_id_fk
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
```

- [ ] **Step 3 — schema.ts:** `userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),`
- [ ] **Step 4:** `pnpm db:migrate` (confirm `[✓]`), typecheck. From now on, account deletion also removes processing/failed stubs that never got a contact. Commit: `interactions: fk to users so orphaned stubs die with the account`

### Task 11: Upstream fetch timeouts

**Files:**
- Modify: `src/services/TranscriptionService.ts:38`, `src/services/ExtractionService.ts` (~line 276, the `generateObject` call)

- [ ] **Step 1 — Whisper:** add `signal: AbortSignal.timeout(30_000)` to the fetch init in `callWhisper`. Extend the retry predicate in `transcribe()` to also retry timeouts: `if (err instanceof DOMException && (err.name === 'TimeoutError' || err.name === 'AbortError')) return true;`
- [ ] **Step 2 — Gemini:** pass `abortSignal: AbortSignal.timeout(45_000)` in the `generateObject({...})` options (Vercel AI SDK supports `abortSignal`).
- [ ] **Step 3:** Rationale for a future reader (one comment at each site): a hung upstream previously burned the whole function budget silently; now it fails fast enough for one retry to fit inside the function ceiling. `pnpm typecheck && pnpm test -- --run`. Commit: `pipeline: timeouts on whisper + gemini so hangs fail fast enough to retry`
- [ ] **Note:** if the conversation-capture branch (Nova-3) has landed by build time, apply the same `AbortSignal.timeout(30_000)` to `callNova3`.

### Task 12: Admin allowlist from env

**Files:**
- Modify: `src/lib/env.ts` (schema), `src/app/app/diagnostics/page.tsx:9`, plus any other `ADMIN_EMAILS` Set found by `grep -rn "ADMIN_EMAILS" src/` (PR #19 adds `/api/admin/recording-audio/[id]` — update it too if merged)

- [ ] **Step 1 — env.ts:** add to the schema:

```ts
ADMIN_EMAILS: z.string().default('timmy.nan@gmail.com,tim.nan.91@gmail.com'),
```

and a helper in `src/lib/admin.ts`:

```ts
import { env } from './env';
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return env().ADMIN_EMAILS.split(',').map((e) => e.trim().toLowerCase()).includes(email.toLowerCase());
}
```

- [ ] **Step 2:** Replace every hardcoded `ADMIN_EMAILS` Set with `isAdminEmail(session.user.email)`. Add the env var to Vercel (both scopes): `vercel env add ADMIN_EMAILS production` + `preview` — value `timmy.nan@gmail.com,tim.nan.91@gmail.com`. (Default keeps local dev working without the var.)
- [ ] **Step 3:** QA on preview: diagnostics loads for Tim, 404/redirects for a non-admin account. Commit: `admin: allowlist from env instead of hardcoded set`

### Task 13 (OPTIONAL — lost-update fixes, skip unless it starts biting)

`updateRecap` (`InteractionService.ts:5-17`) and email/phone array edits (`ContactService.ts:~107`) are read-modify-write; two concurrent edits lose one. Real exposure is a single user editing on two devices simultaneously — rare. If fixing: do the merge in SQL (`structured_data = structured_data || jsonb_build_object('recap', ${recap})` via `sql` template; array ops with `array_append`/`array_remove`). Not worth speculative work now; recorded so the decision is deliberate.

### Task 14: Verify, deploy, hand off

- [ ] **Step 1:** `pnpm typecheck && pnpm test -- --run` — green.
- [ ] **Step 2:** Push branch, `vercel` preview, `curl -X PUT https://<preview>/api/inngest`.
- [ ] **Step 3 — QA script:**
  1. Record a normal memo → processes as before (claim + guards invisible on happy path).
  2. Record on iPhone (audio/mp4) AND a desktop browser (webm) → both pass the sniffer.
  3. Request 3 OTPs in a minute → third rejected; 6 wrong codes → code invalidated.
  4. Delete a contact → card PNG + audio gone from R2.
  5. `curl -s https://<preview>/c/<id> | grep -i robots` → noindex present.
  6. Poll `/api/cards/<someone-elses-uuid>` signed in → 404.
- [ ] **Step 4:** Re-sync Inngest to prod after the eventual prod deploy: `curl -X PUT https://connectyall.vercel.app/api/inngest`.
- [ ] **Step 5:** Update `PM-OS/outputs/portfolio/connectyall-session-state.md` (audit section: mark findings fixed, note anything deferred) and `connectyall-journey.md`.
- [ ] **Step 6:** Open PR: title `hardening — capture races, upload abuse, otp limits, small fixes`, body leads with the audit as the source and lists the QA script.

## Deliberately not in this plan (decided 2026-07-06, don't re-litigate silently)

- **Session length / reauth on destructive ops** — 365-day sessions are a deliberate UX call for a personal-use app; delete-account already requires typed confirmation. Revisit when sign-ups open to strangers (pairs with the custom-domain/Resend backlog item).
- **`/c/[id]` expiry or revocation** — product feature, not hardening; recipients keep their link by design. Backlog if a user asks.
- **Prompt-injection mitigations** — audit confirmed no cross-user sink (a user's memo only feeds that user's own outputs); no action needed.
