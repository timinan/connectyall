# Logged-in Home (Record Page) — Greeting + Avatar Design

## Goal

When a user lands on `/app/record` (the post-login home), they should see a personal greeting and their avatar before the recording UI. The avatar acts as a quick-edit affordance to their profile.

## Why

Today `/app/record` jumps straight into "Tap to start" with no acknowledgement of who the user is. There is no entry point to edit profile info after onboarding — the user would have to know to type `/app/profile` in the URL. This makes the app feel impersonal and gives no path to fix a typo in their name, swap their photo, or update socials.

## Scope

The logged-in record page (`/app/record`) gets a greeting + avatar header. The profile page (`/app/profile`) gets a personalized headline so it feels welcoming for first-timers and consistent for returning edits. No new API endpoints, no schema changes, no migrations.

## Design

### Layout (idle state)

The record page gets a header strip above the existing record UI:

```
Hello, Tim 👋

   ┌─────┐
   │ 📷  │   ← avatar (96px, round)
   └──┬──┘
      └─[✏️]   ← pencil badge at bottom-right

(existing waveform + mic button + helper text)
```

- **Greeting:** `Hello, <first-name> 👋`. First name is `displayName.split(/\s+/)[0]`. If `displayName` is missing or empty, show `Hello 👋`.
- **Avatar:** 96×96 round image. If `photoR2Url` is set, render `<img src={photoR2Url}>`. Otherwise render an initial-bubble fallback: the first letter of `displayName` (uppercase) on a deterministic background color chosen from the same `PALETTE` used in `CardService.ts` (`#0E7C7B`, `#3B3B6D`, `#A23B72`, `#D1495B`, `#2E294E`), seeded from `displayName`. White letter, bold, large enough to read on a 96px circle.
- **Edit affordance:** a small (~28px) white circular badge with a dark pencil icon (`LuPencil` from `react-icons/lu`) overlapping the bottom-right of the avatar. The whole avatar + badge is wrapped in a single `<Link href="/app/profile">` so any tap on it navigates to the profile editor.
- **Spacing:** vertical stack centered horizontally. Greeting text above avatar, ~16px gap between them. Header strip sits above the existing waveform and mic button with comfortable vertical spacing on small phones (the existing record UI uses `space-y-8` — the header should fit within this rhythm).

### Loading state

On mount, the page fetches `GET /api/profile` (the existing endpoint — already returns `{ displayName, photoR2Url, ... }`). While the fetch is in flight:

- Show a 96×96 neutral-800 circle skeleton in the avatar slot (no spinner, no pulse — just a static placeholder so the layout doesn't shift).
- Hide the greeting text. Do **not** show "Hello, ..." — that would briefly show a default and then update, which feels janky.

If the fetch fails (network error, 401), render the avatar fallback bubble using the letter `?` and skip the greeting. The record button still works. This is a degenerate path — the user is already authenticated to land here, so the most likely cause is a transient network blip.

### Recording / uploading state

When `state` transitions away from `'idle'` (i.e., recording or uploading), the entire greeting + avatar block is conditionally not rendered (`{state === 'idle' && <Greeting … />}`). The existing record UI shifts up to take the natural vertical center. No animation — instant.

When the upload finishes, the page navigates to `/app/cards/[id]`, so we don't need to handle "returning to idle from uploading."

### Component boundary

Extract the greeting + avatar into a new client component `src/app/app/record/greeting.tsx` so `record/page.tsx` stays focused on the recording state machine. The new component is self-contained: it does its own profile fetch, owns its loading state, and renders nothing while loading except the avatar skeleton.

### Profile page headline

The existing `/app/profile` page is the same screen used for first-time onboarding (because `/app` redirects un-onboarded users to it) and for editing later. Today the headline is `Set up your card` regardless. Replace it with a context-aware greeting:

- **First-time user** (`!profile?.onboardedAt`): `Hello, please set up your profile below`
- **Returning user** (`profile.onboardedAt` is set): `Hello, <first-name>, please edit your profile below`

If `profile` hasn't loaded yet (the page already does a client-side fetch in `useEffect`), render `Hello` only (no trailing line) as a soft placeholder. Once `profile` resolves, swap to the right headline. This is one `<h1>` whose content depends on `profile`, not a separate component.

First-name resolution uses the same `getFirstName` helper introduced in `greeting.tsx`. Import it from there (the profile page is already a client component, so the import is straightforward).

## Files Affected

- **Modify** `src/app/app/record/page.tsx` — import the new component, render it when `state === 'idle'`.
- **Create** `src/app/app/record/greeting.tsx` — fetches profile, renders greeting + avatar + edit badge wrapped in a `<Link>`. Exports a `getFirstName(displayName)` helper.
- **Modify** `src/app/app/profile/page.tsx` — replace the static `Set up your card` headline with the context-aware greeting described above. Import `getFirstName` from `../record/greeting`.
- **No changes** to `src/app/api/profile/route.ts` — the existing `GET` already returns everything we need.

## Out of Scope

- Avatar editing inline on the record page (use the profile page).
- Slide-up sheet / modal patterns.
- Caching the profile across page loads (a network fetch on each visit is fine — this page isn't render-blocked by it).
- Analytics on "how often users tap edit" — we can add later if it matters.
- Showing the avatar on other pages (post-capture, public landing).

## Testing

This is purely a presentational change with no business logic. Add one unit test only:

- `getFirstName('Tim Nan') === 'Tim'`, `getFirstName('') === null`, `getFirstName(null) === null`, `getFirstName('   Tim  ') === 'Tim'`. Helper lives in `greeting.tsx`.

Browser verification on the preview deploy:
- **First-time onboarding:** Sign in with a brand-new account → land on `/app/profile` → see `Hello, please set up your profile below` headline. Fill out form, save. Lands on `/app/record` with the greeting + avatar header.
- **Returning user, edit flow:** Already-onboarded user lands on `/app/record`, sees `Hello, Tim 👋` + their avatar. Taps avatar → lands on `/app/profile` → headline reads `Hello, Tim, please edit your profile below`. Make a change, click "Done" → back on `/app/record`, header reflects the new info.
- **No photo:** Same flows with no photo set → avatar is the initial-bubble fallback.
- **Recording:** Tap mic → greeting + avatar disappear, mic UI shifts up. Stop / upload finishes → navigates to `/app/cards/[id]` as before.

## Risks

- **Layout shift on slow networks:** if the profile fetch is slow, the skeleton is visible for a noticeable beat. Acceptable for v1 — most users will have it cached after their first session.
- **Photo R2 URL caching:** R2 returns long-cache headers. If the user changes their photo and immediately comes back here, the browser may still show the old one. Existing `/app/profile` uploads have the same property; we'll fix at the platform level if it becomes a complaint.

---

# Addendum — Profile Page Redesign (round 2)

After the first round shipped, feedback was:

1. The avatar on the record page felt too small at 96px.
2. The profile page socials block (a static 4-input loop) didn't match the polished per-row inline-edit pattern we built for the post-capture contact page.
3. The profile page photo picker was a raw `<input type="file">` with no visual treatment — uneditable in a way that matched the rest of the app.

This addendum specifies those three changes together since they touch the same files.

## Avatar bump

- `greeting.tsx` `Avatar` size: **96×96 → 128×128** (`w-24 h-24` → `w-32 h-32`).
- Pencil edit badge: **28px → 32px** (`w-7 h-7` → `w-8 h-8`), icon size 14 → 16.
- Initial-bubble font: stays `text-4xl` (still reads well at 128px).
- Skeleton: tracks the new 128px size.

## Profile page — avatar with camera badge

The profile page (`/app/profile`) gets a hero avatar block above the form:

- Render the same `Avatar` component used by the greeting (export it from `greeting.tsx` to share).
- Bottom-right badge uses a **camera icon** (`LuCamera` from `react-icons/lu`), not a pencil. Camera reads as "change photo"; pencil reads as "edit text."
- Tapping the badge triggers a hidden `<input type="file" accept="image/*">`. The existing `uploadPhoto(file)` handler stays; only the trigger surface changes.
- After upload completes, optimistically refresh the local `profile` state so the new photo appears without a page reload. The endpoint already returns `{ photoR2Url }` from the multipart PUT — use that.
- Remove the existing naked `<input type="file">` element from the form.

## Profile page — channels block redesign

Replace the current 4-input loop (`x | linkedin | email | website` rendered as plain inputs) with the same per-row pattern from the post-capture contact page.

### Supported channels (9)

`x, linkedin, email, website, telegram, whatsapp, wechat, line, phone`. This matches `PreferredChannel` on the contact page so visual treatment, icons, and labels stay consistent across the app.

### Row layout (one per active channel)

```
[brand icon] [value — tap-edit input, saves onBlur]  [✕ remove]
```

- Brand icon: reuse `ChannelIcon` from `src/app/app/cards/[id]/channel-icons.tsx`. Cross-import is fine for v1; if it spreads further we'll move to `src/app/app/_components/`.
- Value: a controlled `<input>` styled like the existing form inputs. Save fires `onBlur` if the value changed (same pattern as today, just per-row). Empty value renders the channel's placeholder (e.g. `handle (no @)` for telegram, `+1 555 1234` for phone).
- Remove: an `LuX` icon button. Clicking calls the new clear endpoint (see API section) and removes the row from the UI.

### Add field component

Below the rows, an `+ Add field` chip-style button. Tapping expands inline into:

```
[channel select] [icon] [value input] [✓ save]
```

- The select shows only channels not already active.
- After save: the new row appears above, the picker collapses back to the `+ Add field` button.
- Implementation mirrors the contact page's `AddField` but is a fresh, simpler component scoped to the profile page (different data shape — single value per channel, no email/phone arrays).

### State model

The profile page's local `profile` already holds `{ displayName, tagline, socials, telegramUsername, onboardedAt }`. Extend with the union of all 9 channels via a derived helper:

```typescript
function activeChannels(p: Profile): Array<{ kind: PreferredChannel; value: string }> { ... }
```

`telegram` reads from `p.telegramUsername`; the other 8 read from `p.socials.<kind>`. Order: stable, matches `ALL_CHANNELS` definition from the contact page.

## API extension

### Type

Add `phone?: string` to the `Socials` type in `src/lib/db/schema.ts`. The remaining 6 (`x, linkedin, email, website, whatsapp, wechat, line`) are already present. No SQL migration — pure jsonb extension.

### `SocialSchema` (in `src/app/api/profile/route.ts`)

Expand the union to cover both set and clear:

```typescript
const SocialSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('set'),
    social: z.enum(['x', 'linkedin', 'email', 'website', 'telegram', 'whatsapp', 'wechat', 'line', 'phone']),
    value: z.string().min(1).max(255),
  }),
  z.object({
    action: z.literal('clear'),
    social: z.enum(['x', 'linkedin', 'email', 'website', 'telegram', 'whatsapp', 'wechat', 'line', 'phone']),
  }),
]);
```

Backwards-compat note: the existing client code on `/app/profile` sends `{ social, value }` without an `action` field. The PUT handler should accept the legacy shape and treat it as `action: 'set'`, OR — since we're rewriting the profile page UI in the same PR — just update the client to always send `action`. **Pick the second**: simpler, no compatibility shim, and there are no other clients of this endpoint.

### Handler routing

- `action: 'set'`:
  - If `social === 'telegram'`: `users.telegramUsername = value` (use existing column-level update path).
  - Else: call `setSocial(userId, social, value)` (existing jsonb merge).
- `action: 'clear'`:
  - If `social === 'telegram'`: `users.telegramUsername = null`.
  - Else: call new `clearSocial(userId, social)` which does `socials: sql\`${users.socials} - ${kind}\``.

Telegram normalization on set: run `telegramHandle(value)` (already imported) for consistency with the contact-side flow.

### New service function

`src/services/UserProfileService.ts`:

```typescript
export async function clearSocial(userId: string, kind: keyof Socials): Promise<void> {
  await db()
    .update(users)
    .set({ socials: sql`${users.socials} - ${kind}` })
    .where(eq(users.id, userId));
}
```

## Files affected (round 2)

- **Modify** `src/app/app/record/greeting.tsx` — bump avatar to 128px, bump pencil badge proportionally, export `Avatar`.
- **Modify** `src/app/app/profile/page.tsx` — new avatar+camera block, replace 4-input loop with per-row channel list + AddField, drop the existing file input.
- **Modify** `src/lib/db/schema.ts` — add `phone?: string` to `Socials`.
- **Modify** `src/app/api/profile/route.ts` — new `SocialSchema` (discriminated union with set/clear), new routing logic, telegram-as-channel branch.
- **Modify** `src/services/UserProfileService.ts` — add `clearSocial`.
- **No changes** to `src/app/app/cards/[id]/channel-icons.tsx` or the contact page — they're reused as-is.
- **No DB migration**.

## Testing (round 2)

Unit tests:
- `clearSocial` removes the key from jsonb (integration test against a test row — there's already a `ContactService.test.ts` pattern to follow).
- API PUT: `{ action: 'set', social: 'telegram', value: '@timnan' }` updates `users.telegramUsername` to `timnan` (normalized).
- API PUT: `{ action: 'clear', social: 'x' }` removes `x` from jsonb.
- API PUT: `{ action: 'clear', social: 'telegram' }` sets `telegramUsername` to null.

Browser verification:
- All 9 channels can be added one by one, persisted, edited, removed.
- Camera badge on the avatar opens the file picker. Upload completes → photo updates in place.
- Telegram round-trips correctly (set saves, edit shows current handle, remove clears).
- Avatar size feels right at 128px on a phone.

## Out of scope (round 2)

- Drag-to-reorder channels.
- Multiple emails or phones on the profile (contacts have arrays; profile stays single-value-per-channel).
- Image cropping / preview before upload.
- Removing the avatar entirely (clear photo). Add later if requested.
- Migrating telegram out of its dedicated column into `socials.telegram`. Keeping the column avoids a backfill; the UI treats it uniformly anyway.
