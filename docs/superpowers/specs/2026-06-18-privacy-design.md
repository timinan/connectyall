# Privacy Hardening — Design

## Goal

Three things in one branch: lock the R2 audio bucket down so it isn't publicly browsable, give users a real "Delete my account" path, and stand up `/privacy` and `/terms` pages linked from the footer. Beta is fine today for trusted friends; this is the prep work for anyone outside that circle.

## Why

We did a billing + security review on 2026-06-18 and flagged three concrete gaps:

- Anyone with an R2 audio URL can listen to it forever. UUIDs are 128-bit so guessing is implausible, but URL leaks (logs, screenshots, copy-paste in a Slack channel) become permanent.
- There's no way for a user to delete their data short of asking Tim to run a SQL query. Painful for the user, painful for us if anyone ever asserts a right-to-be-forgotten request.
- No privacy policy or terms means we're unable to onboard EU users at all and we're flying blind on what we even promise people.

## Scope

- **R2 audio private.** Bucket setting flipped to private in Cloudflare dashboard (Tim does this), then code paths that read from R2 use the S3 SDK with credentials.
- **Card PNGs stay reachable** through the existing `/api/cards/[id]/image` proxy. The proxy currently fetches the public R2 URL — it changes to use the S3 SDK so it keeps working after the bucket goes private.
- **Audio file keys user-prefixed.** New captures are stored as `captures/<userId>/<uuid>.<ext>` instead of `captures/<uuid>.<ext>`. Old captures untouched — we'll just leave them orphaned (small files, no PII leak as long as bucket is private). The user-prefix gives account-delete a clean "list and remove" path going forward.
- **Delete-my-account.** Subtle red link on profile → typed "delete my account" confirmation modal → server endpoint wipes R2 objects + user row (cascade handles contacts / interactions / sessions) → sign out → land on `/`.
- **Privacy + terms.** Two new static routes at `/privacy` and `/terms`, drafted in plain language. Linked from the navy footer (small "privacy · terms" line, right of the existing logo + tagline).

Out of scope:
- Application-layer encryption of `notes` / `recap` columns. Useful but a separate, bigger change.
- "Sign out of all devices." Single-session sign-out is what we have today; that's fine.
- Audio file deletion for the user's OLD pre-prefix captures. Best-effort scan would require a `ListObjectsV2` call with no user filter — too heavy. Tracked in the risk section below.
- GDPR-grade data export. We say "contact us" for now.

## Design

### Private R2 bucket

The R2 client (`src/lib/r2/client.ts`) already has an S3 client with credentials. We add a `downloadObject(key)` function that uses `GetObjectCommand` and returns the bytes:

```ts
export async function downloadObject(key: string): Promise<Uint8Array> {
  const e = env();
  const res = await s3().send(new GetObjectCommand({ Bucket: e.R2_BUCKET_NAME, Key: key }));
  const stream = res.Body as Readable;
  return Buffer.concat(await collect(stream));
}
```

We also add a `deleteObject(key)` (used by account-delete) and a `listObjects(prefix)` (used by account-delete for the user-prefixed audio path):

```ts
export async function deleteObject(key: string): Promise<void> { ... }
export async function listObjects(prefix: string): Promise<string[]> { ... }
```

Three places switch from public URL fetches to SDK reads:

| Where | Today | After |
|---|---|---|
| `CaptureService.downloadFromR2()` | `fetch(${R2_PUBLIC_URL_BASE}/${key})` | `downloadObject(key)` |
| `/api/cards/[id]/image/route.ts` | `fetch(${R2_PUBLIC_URL_BASE}/cards/${id}.png)` | `downloadObject(\`cards/${id}.png\`)` |
| `uploadPhoto()` in `r2/client.ts` (return value) | returns `${R2_PUBLIC_URL_BASE}/${key}` | returns the proxy URL `/api/r2/photo?key=...` OR keeps returning the public URL **only if Tim wants to keep photos public-readable** |

**Open call on profile photos:** photos are stored at `profiles/<userId>.png|jpg`. Today they're served via the public R2 URL embedded in `<img>` tags in the app. Two ways to keep them working after we go private:

- **(a)** Mirror the card-PNG pattern — add a `/api/profile/photo/[userId]` proxy route, swap all `<img>` references to use it.
- **(b)** Generate a long-lived presigned URL once per upload and store that. R2 presigned URLs cap at 7 days, which would force re-signing.

Default: **(a)** — same pattern as card PNGs, consistent, no expiry concerns. The bandwidth cost is negligible at beta scale.

### Public landing page (`/c/[id]`)

The `<img>` on the public landing currently uses the public R2 URL. It changes to use the `/api/cards/[id]/image` proxy. The OG meta tags (`openGraph.images` and `twitter.images` in `generateMetadata`) similarly switch to the proxy. Crawlers (Facebook, Twitter, iMessage preview) hit the proxy URL on our domain and get the PNG. No auth on the proxy, same as today.

### Audio key prefix

In `src/app/api/capture/route.ts`, change the key construction from:

```ts
const key = `captures/${randomUUID()}.${ext}`;
```

To:

```ts
const key = `captures/${session.user.id}/${randomUUID()}.${ext}`;
```

The Inngest job downstream gets the key in `audioR2Key` — no change there. `CaptureService` just downloads whatever key it's handed.

### Delete account

UI on profile page, just below the existing "Sign out":

```tsx
<button
  onClick={() => setShowDeleteConfirm(true)}
  className="block mx-auto text-sm text-red-600 hover:text-red-700 transition pt-1"
>
  Delete my account
</button>
```

Modal:

```
[ ⚠️  Delete your account? ]

This removes your profile, every connection,
every meeting, and every recording. You can't
undo it.

Type "delete my account" to confirm:
[__________________________]

       [Cancel]  [Delete]
```

The Delete button stays disabled until the input matches `delete my account` (case-insensitive).

Backend: `DELETE /api/profile`

```ts
// In order:
// 1. List + delete user's R2 card PNGs (one per interaction)
// 2. List + delete user's R2 audio captures (prefix `captures/<userId>/`)
// 3. Delete user's profile photo (key `profiles/<userId>.png` and `.jpg` — try both)
// 4. DELETE FROM users WHERE id = ? — cascade handles contacts/interactions/sessions
// 5. Return 200
```

R2 deletes happen first because if any DB cleanup fails we'd leak data. Order is deliberate.

Client: after successful delete → `await signOut()` → `router.push('/')`.

### Privacy + terms pages

Two server components at `src/app/privacy/page.tsx` and `src/app/terms/page.tsx`. Each is a single-page MDX-style doc, plain JSX, max-width container. Content drafted as part of this branch (see "Content drafts" section below).

Footer (`src/components/footer.tsx`) gains a small inline link group:

```tsx
<span className="text-slate-500">·</span>
<a href="/privacy" className="hover:text-white">Privacy</a>
<span className="text-slate-500">·</span>
<a href="/terms" className="hover:text-white">Terms</a>
```

Right after the tagline. Stays tiny so the footer doesn't bloat.

## Content drafts

### Privacy

> **Connectyall keeps it simple.**
> You record voice memos about people you meet. We turn those into structured contact info you can pass along and look up later. Here's exactly what happens with your data.
>
> **What we collect**
> - Your sign-in email and a profile (display name, tagline, optional photo, optional social handles).
> - Voice recordings you make in the app.
> - The extracted structured info from those recordings (names, companies, channels, recap notes).
> - Basic sign-in metadata (IP address and user-agent, kept by Better Auth for session security).
>
> **What we do with it**
> - Send the audio to Cloudflare Workers AI (Whisper) for transcription.
> - Send the transcript to Google Gemini for structured extraction.
> - Store the structured info in our database (Neon Postgres) so you can browse it.
> - Send sign-in codes to your inbox via Resend.
>
> Audio is processed and stored. We don't share it with anyone. We don't use it to train any model.
>
> **What you can do**
> - View and edit everything from your profile and connection pages.
> - Delete your entire account (profile + connections + recordings) from the profile page — instant and permanent.
> - Sign out from any device — your session ends, your data stays.
>
> **Where the data sits**
> - **Cloudflare R2** — audio + card images, private to your account.
> - **Neon Postgres** — your profile, contacts, and meeting recaps.
> - **Vercel** — hosting, function execution.
> - **Resend** — sign-in email delivery.
> - **Cloudflare Workers AI** — transcription only; not used for training.
> - **Google Gemini** — extraction only; not used for training (see [Gemini API privacy docs](https://ai.google.dev/gemini-api/terms)).
>
> **Retention**
> Your data stays until you delete your account. Then it's gone — from our database immediately, from R2 within an hour.
>
> **Questions**
> Email tim@connectyall.<domain> or open an issue on the GitHub repo.

### Terms

> **Connectyall is a beta.**
> One person built it as a portfolio project. Use it because you like the idea — please don't expect enterprise-grade uptime.
>
> **Your data is yours.**
> We don't sell it. We don't share it. We don't use it to train models. You can export it (email us) and delete it (button on profile).
>
> **Be cool about other people.**
> The whole point of Connectyall is that you record info about people you meet. **Please get their okay before you do.** Recording voice memos about someone without their knowledge isn't illegal in most places but it's not great form. Connectyall is for "Sarah and I just exchanged numbers, here's a voice note while it's fresh" — not for covertly profiling strangers.
>
> **No warranty.**
> The app might break. Recordings might fail. Extractions might mis-spell a name. We'll fix bugs as we find them, but we don't guarantee anything.
>
> **We can change these terms.**
> If something material changes (data uses, who we share with, etc.) we'll send you a sign-in email about it.
>
> **Questions**
> Same address as the privacy page.

## Files affected

**Create**
- `src/app/privacy/page.tsx`
- `src/app/terms/page.tsx`
- `src/app/api/profile/photo/[id]/route.ts` — proxy for profile photos
- New helper functions in `src/lib/r2/client.ts`: `downloadObject`, `deleteObject`, `listObjects`

**Modify**
- `src/services/CaptureService.ts` — `downloadFromR2` uses S3 SDK
- `src/app/api/cards/[id]/image/route.ts` — uses `downloadObject`
- `src/app/api/capture/route.ts` — user-prefix the audio key
- `src/app/c/[id]/page.tsx` — img src + OG meta tags switch to proxy URL
- `src/app/api/profile/route.ts` — add `DELETE` handler
- `src/app/app/profile/page.tsx` — Delete button + confirmation modal
- `src/services/UserProfileService.ts` — add `getById` returns photo URL helper if needed (might already)
- `src/components/footer.tsx` — small `privacy · terms` links
- Anywhere else that embeds `R2_PUBLIC_URL_BASE/profiles/…` — switch to the new proxy

**No DB migration.** The user/contact/interaction schemas don't change. Cascade FKs already in place.

## Testing

### Smoke tests on preview

| Check | How |
|---|---|
| Old card PNGs still load | Visit any existing `/c/[id]` URL — image must render. |
| New audio capture works end-to-end | Record a memo → wait for processing → land on `/app/connections/<contactId>` with recap. |
| Audio path is user-prefixed | After above, in Vercel logs grep for `audioR2Key` — should match `captures/<uuid>/<uuid>.webm`. |
| Bucket actually private | Get a card PNG key from logs. Hit `${R2_PUBLIC_URL_BASE}/cards/<id>.png` directly with `curl` — must return 403/404 (after Tim disables public access). |
| Profile photos still load | Visit profile page — avatar shows your photo. |
| Privacy / terms render | Tap footer links → both pages render and are readable on a phone. |
| Delete account, end-to-end | Sign in on a throwaway address → record 2 memos → profile → Delete → type confirmation → confirm. Then: sign in again with same email → empty account (no contacts). Old card URLs → 404. R2 audio path empty for that user. |

### What needs Tim's hand

After merge:
1. Push deploys to production from main.
2. **In Cloudflare dashboard:** R2 → bucket → Settings → Public Access → Disable.
3. Repeat smoke test #4 above on production.
4. **Inngest re-sync** to production (same as every merge).

## Risks

- **Old `captures/<uuid>.webm` files (pre-prefix) are orphaned.** They aren't deletable by account-delete because we don't know which user they belong to. They're invisible (bucket private) but they take up storage. Acceptable: at current volume that's KB of waste. Can be cleared with a one-off cleanup script later.
- **Profile photo proxy adds a function call to every page render.** Negligible cost, but if we ever served the app to many concurrent users we'd want a CDN in front of the proxy or signed URLs.
- **R2 going private is irreversible from a permanence perspective for existing public links.** Any external URL you shared earlier (e.g. someone you sent a `/c/[id]` link to that they bookmarked) will keep working because they go through the proxy. But anyone who copied the raw R2 URL would break. Highly unlikely anyone did.
- **The privacy / terms text references "[domain]" placeholders for `tim@connectyall.<domain>`.** Once you have a verified domain on Resend, swap in the real email. Until then I'll use `tim.nan.91@gmail.com` (your Resend account email) as the contact.
- **Better Auth `sessions` table cascades from `users.id`** because of how the Drizzle schema is defined. Same for `accounts` and `verifications`. Confirm in `src/lib/db/schema.ts` before deleting — if any of them don't cascade, we add explicit deletes.
