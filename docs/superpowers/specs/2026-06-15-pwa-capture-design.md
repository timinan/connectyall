# Connectyall PWA Capture — Design Spec

**Date:** 2026-06-15
**Branch:** `feature/pwa-capture`
**Status:** Approved for implementation planning
**Supersedes:** none (additive to v1 Telegram bot)

## Goal

Add a phone-first web app surface that lets anyone — including users who don't have Telegram — record a voice memo about someone they met, get a designed card, and share it to that person via the OS native share sheet (iMessage, WhatsApp, SMS, Mail, etc.).

The Telegram bot continues to work unchanged. The PWA is a parallel capture surface backed by the same services and the same contacts CRM.

## Why this exists

V1 of Connectyall is locked to Telegram on both sides: the user records inside Telegram and the recipient must also be on Telegram (via Forward). This excludes most of the user's real network and limits the portfolio story to "Telegram bot." A PWA + native OS share covers everyone: the sender records in a browser, and the recipient gets the card on whatever platform they actually use.

The strongest payoff is the **public card landing page** with a "Save to Contacts" vCard button — a retention loop that a Telegram caption can't deliver.

## Strategic frame

Portfolio project supporting Tim's PM job search. Success bar = polished cross-platform artifact that proves multi-surface execution and a coherent product story, not "real business."

Three priorities in order:
1. Web-first capture that works on iOS Safari and Android Chrome in 60 seconds end-to-end
2. A public card landing page with vCard download — the recipient experience that justifies sharing the URL
3. Backwards compatibility with the Telegram bot — same DB, same CRM, no functional regression for existing bot users

## Architecture

```
Browser (PWA)                           Server (Next.js)
─────────                               ────────────────
/                ─ marketing landing ─ unchanged
/app             ─ PWA shell         ─ new
  /app/sign-in   ─ email magic-link  ─ new
  /app/record    ─ tap-to-record UI  ─ new (the hot path)
  /app/cards     ─ recent cards list ─ new
  /app/cards/<id>─ post-capture view ─ new (share + edit)
  /app/profile   ─ identity setup    ─ new (+ Connect Telegram)

/c/<interactionId> ─ public card page (rich UI + vCard download) ─ new
/api/auth/*       ─ Better Auth handlers (email magic-link)      ─ new
/api/capture      ─ audio upload → enqueue Inngest               ─ new
/api/cards/<id>   ─ polling endpoint for client                  ─ new

/api/telegram     ─ Telegram bot webhook ─ unchanged
/api/inngest      ─ Inngest serve        ─ unchanged
```

Both surfaces hit the same `processCapture` Inngest function and the same service modules (TranscriptionService, ExtractionService, CardService, ContactService, UserProfileService). Zero duplication of business logic.

## Identity model (schema change)

The v1 `users` table uses `telegramUserId` as its primary key, which prevents users without Telegram from existing. The migration:

| Before | After |
|---|---|
| `users.telegramUserId bigint PK` | `users.id uuid PK defaultRandom` |
| n/a | `users.email text unique` (nullable initially for legacy rows) |
| n/a | `users.emailVerifiedAt timestamp` |
| `users.telegramUserId` was PK | `users.telegramUserId bigint unique nullable` (demoted) |
| `contacts.userId bigint → users.telegramUserId` | `contacts.userId uuid → users.id` |
| `interactions.contactId NOT NULL` | `interactions.contactId NULLABLE` (NULL while `status='processing'`) |
| n/a | `interactions.status enum('processing'\|'ready'\|'failed') default 'ready'` |

**One-shot data migration:**

```sql
ALTER TABLE users ADD COLUMN id uuid;
UPDATE users SET id = gen_random_uuid() WHERE id IS NULL;
ALTER TABLE users ALTER COLUMN id SET NOT NULL;

ALTER TABLE contacts ADD COLUMN user_id_new uuid;
UPDATE contacts SET user_id_new = (SELECT id FROM users WHERE telegram_user_id = contacts.user_id);
ALTER TABLE contacts ALTER COLUMN user_id_new SET NOT NULL;

ALTER TABLE contacts DROP CONSTRAINT contacts_user_id_users_telegram_user_id_fk;
ALTER TABLE contacts DROP COLUMN user_id;
ALTER TABLE contacts RENAME COLUMN user_id_new TO user_id;
ALTER TABLE contacts ADD CONSTRAINT contacts_user_id_users_id_fk
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE users DROP CONSTRAINT users_pkey;
ALTER TABLE users ADD PRIMARY KEY (id);
ALTER TABLE users ADD COLUMN email text;
ALTER TABLE users ADD COLUMN email_verified_at timestamp with time zone;
CREATE UNIQUE INDEX users_email_unique ON users(email) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX users_telegram_user_id_unique ON users(telegram_user_id) WHERE telegram_user_id IS NOT NULL;
```

Existing bot users keep working: same `telegramUserId`, just no longer the PK. UserProfileService gets a small refactor to query by either `id` (web sessions) or `telegramUserId` (bot context).

Better Auth manages its own tables: `sessions`, `accounts`, `verifications`. Drizzle adapter writes them in our schema.

## Authentication

**Primary: magic-link email** via `better-auth` with `resend` for delivery.

- User enters email → server generates a one-time token → emails a link → token verifies on click → session cookie set
- 30-day rolling session
- No passwords, no social login (v1 scope)

**Optional: Connect Telegram** from `/app/profile`.

- User clicks "Connect Telegram" → server generates a deep link `https://t.me/connectyallbot?start=link_<token>`
- The bot's existing `/start` handler accepts the token, looks up the pending link, sets the user's row's `telegramUserId`, and replies "Linked. Your bot and web account share the same CRM now."
- For existing bot users opening the PWA first time: after sign-in the PWA prompts "Are you the same as @<handle> on the bot? Confirm to merge your contacts." — same flow, just initiated from the web side.

## Hot path: record → card → share

### `/app/record` (frontend)

1. Page renders one big mic button (tap-to-toggle from approved mockup)
2. First tap: `navigator.mediaDevices.getUserMedia({ audio: true })` + `MediaRecorder` start
3. Recording state shows live waveform + elapsed timer (under 90s soft cap)
4. Second tap: `MediaRecorder.stop()` produces a Blob (webm/opus, ~16kbps)
5. POST blob to `/api/capture` as multipart/form-data
6. Show a skeleton card while the pipeline runs (~10-15s)
7. Server responds with `{ interactionId }` immediately after the row exists
8. Page redirects to `/app/cards/<interactionId>` and polls `/api/cards/<id>` every 2s until `status='ready'`

### `/api/capture` (server)

1. `getSession()` from Better Auth — reject if not authed
2. Reject blob > 20MB or unsupported MIME type
3. Stream the audio bytes into an Inngest event (`name: 'capture/process'`, `data: { userId, audioBytes, source: 'web' }`)
4. Return `{ interactionId: null, status: 'queued' }` along with a stable interaction id we mint upfront so the client can poll
   - To make this work we mint the interaction row stub before extraction, then the Inngest function fills it in

### Audio upload path

Audio blobs can exceed Inngest's event payload limit (~512KB). We upload to R2 first, then enqueue an event that references the R2 key:

1. `/api/capture` receives the multipart form
2. Upload the audio bytes to R2 at `captures/<uuid>.webm` (or whatever mime extension matches)
3. Mint a stub `interactions` row with `status='processing'`, no contact_id yet (nullable while pending)
4. Emit `inngest.send({ name: 'capture/process', data: { userId, audioKey, interactionId, source: 'web' } })`
5. Return `{ interactionId }` to the client

### `processCapture` (existing Inngest function — extend, don't rewrite)

The existing `processCapture` takes `{ userId, chatId, fileId, mimeType, kind }`. We generalize:

```ts
type CaptureInput = {
  userId: string;                          // always users.id uuid (bot handler does the telegramUserId → id lookup before enqueueing)
  source: 'telegram-voice' | 'telegram-audio' | 'telegram-video' | 'web';
  audio:
    | { kind: 'telegram-file'; fileId: string }
    | { kind: 'r2-key'; key: string; mimeType: string };
  // The interaction stub is minted by the caller (web flow) so the client can poll immediately.
  // For telegram, no stub — the existing flow mints the interaction inside processCapture.
  preMintedInteractionId?: string;
  replyTo:
    | { surface: 'telegram'; chatId: number }
    | { surface: 'web' };
};
```

The pipeline branches at the very end (where we currently call `sendPhoto`):

- `replyTo.surface === 'telegram'` → existing behavior (sendPhoto + Send-to button + Fix-handle button)
- `replyTo.surface === 'web'` → update the pre-minted interaction row: link `contact_id`, store structuredData, mark `status='ready'`. Polling client sees `ready` and renders the post-capture screen.

Everything before that branch — transcription, extraction, contact lookup, card render, R2 upload, caption build — stays identical. The card R2 key (`cards/<interactionId>.png`) already keys off interactionId, which works for both pre-minted and mid-pipeline-minted ids.

### Interaction status column

Add `status` to the `interactions` table:

```diff
interactions
+ status  enum('processing' | 'ready' | 'failed')  default 'ready'
```

Default `'ready'` so existing rows are unaffected. New web captures start `'processing'` and flip to `'ready'` (or `'failed'`) when the pipeline finishes.

`contactId` becomes nullable (only filled in once extraction succeeds).

### `/app/cards/<id>` (post-capture screen)

Renders:

- The card PNG (from R2)
- The extracted contact name and the recap quote
- A pencil button to inline-edit name or Telegram handle (same `setContactLink` + a new `renameContact` we'll add)
- A primary "📤 Share" button → calls `navigator.share({ title, text, url, files })` with the caption text, the `/c/<id>` URL, and the PNG as a File
- Secondary: "📋 Copy caption" (clipboard API), "💾 Save image" (download attribute)

### Web Share API call

```ts
await navigator.share({
  title: `Card for ${contact.name}`,
  text: caption,                                       // same template buildCaption produces
  url: `${BASE_URL}/c/${interactionId}`,               // rich landing page
  files: [new File([pngBlob], 'card.png', { type: 'image/png' })],
});
```

Browser support gate: feature-detect `navigator.canShare({ files })`. If false (rare — old Android), fall back to download + copy.

### `/c/<interactionId>` (public card landing page)

The recipient opens this URL. It renders as a single Next.js page that:

- Reads `interactionId` from the URL, queries the interaction row + contact row + user (sender) row, builds the same caption template, fetches the card PNG URL from R2
- Renders an HTML page (NOT just the image) with:
  - The card image as the hero
  - The sender's display name, tagline, photo
  - Tappable buttons for every social the sender has set (deep links to t.me/, x.com/, mailto:, https://linkedin.com/in/, https://)
  - A primary "💾 Save Tim to Contacts" button that downloads a `.vcf` (vCard 3.0) file with the sender's name, tagline (as title), email, phone (skip — we don't store), URLs as social entries
- Subtle "made with Connectyall →" link to `/` at the bottom

The vCard is generated server-side at request time (no separate API route needed — `/c/<id>?download=vcf` returns the .vcf with the right content-type).

**Why this matters:** the vCard turns a transient share into a persistent contact entry in the recipient's phone. That's the retention payoff a Telegram caption can never produce.

## Onboarding for new web-only users

```
1. /app           → not authed → /app/sign-in
2. /app/sign-in   → email → "Magic link sent."
3. Email link     → /api/auth/callback → cookie → /app
4. /app           → first visit → "Set up your card so contacts have something to look at."
5. /app/profile   → display name (prefilled from email local-part) → optional photo → tagline → socials
6. Tap Done       → /app/record
```

Steps 4-6 are gated only on the first capture attempt. We don't force full profile completion — but `/app/record` shows a banner "Add a display name first" if `users.displayName` is empty, since otherwise the card has nothing to show.

## Existing bot user opening PWA for first time

Same flow, plus a merge prompt:

```
After session set on /api/auth/callback:
  - Look up users.email matching the entered email → no row
  - Render /app with a "Are you @timnan on the bot? Click to merge." prompt
  - Click → server emits a Telegram deep link → bot DMs the user a confirm code → user enters it in PWA → merge: update existing user row's email field (now the user has both telegramUserId and email)
  - Skip → fresh user row with email only, separate CRM from any bot identity
```

If they merge, their bot-captured contacts appear immediately in `/app/cards`.

## Tech stack additions

- **better-auth** (~50KB) — magic-link email auth with Drizzle adapter
- **resend** — transactional email delivery (free 3k/mo)
- **Web Share API, MediaRecorder API** — browser native, no deps

## Things explicitly NOT in v1 of the PWA

- Service worker, offline support, installable PWA manifest — punt to PWA-v2
- Google / Apple / Telegram social login — magic-link only
- Push notifications — punt
- Re-sharing or editing cards after they've been generated (beyond name/handle fix)
- Multi-language support
- Analytics beyond what Vercel provides

## Risks + mitigations

| Risk | Mitigation |
|---|---|
| Browser support for `navigator.share({ files })` is uneven (some Android < 12 misses) | Feature-detect with `navigator.canShare({ files })`. Fall back to "Save image + copy caption" buttons if false. |
| MediaRecorder format inconsistency (Safari does webm/mp4 with opus differently from Chrome) | Send whatever the browser produces. Cloudflare Whisper accepts opus/mp3/wav. |
| Magic-link emails landing in spam | Use Resend with proper DKIM, send from a verified subdomain (`auth.connectyall.app`). |
| Schema migration on a live DB | Run during a quiet window, single transaction. Migration includes a rollback SQL. |
| Existing bot users surprised by the schema change | They shouldn't notice — UserProfileService takes either id or telegramUserId. |
| Public `/c/<id>` URLs are guessable by uuid | UUIDs are 122-bit random — practical attack surface ≈ 0. If concerned later, add a short HMAC suffix. |
| vCard parsing differences across iOS / Android / Outlook | Use vCard 3.0 (best compatibility). Test on real devices before launch. |

## Success criteria (the PWA portion)

- New user signs up with email, sets up profile, records a memo, shares to themselves via iMessage in under 90 seconds
- Public card page on `/c/<id>` renders in <1s and the vCard import works on real iOS and Android phones
- Schema migration runs without data loss
- Telegram bot continues to work unchanged after the migration
- Branch merges cleanly to `main`

## Open decisions deferred to implementation

- Exact display name prefill behavior (email local-part vs first half of email)
- Recording soft cap (60s vs 90s vs 120s)
- vCard field set (just X/LinkedIn/Email/Website, or also include `NOTE` with the recap?)
- Color palette pick on the public card page (match the card's bg or override?)
