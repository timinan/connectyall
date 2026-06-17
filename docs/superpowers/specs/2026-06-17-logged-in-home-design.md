# Logged-in Home (Record Page) — Greeting + Avatar Design

## Goal

When a user lands on `/app/record` (the post-login home), they should see a personal greeting and their avatar before the recording UI. The avatar acts as a quick-edit affordance to their profile.

## Why

Today `/app/record` jumps straight into "Tap to start" with no acknowledgement of who the user is. There is no entry point to edit profile info after onboarding — the user would have to know to type `/app/profile` in the URL. This makes the app feel impersonal and gives no path to fix a typo in their name, swap their photo, or update socials.

## Scope

Only the logged-in record page. The profile page (`/app/profile`) already supports editing every relevant field and is reused as-is. No new API endpoints, no schema changes, no migrations.

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

## Files Affected

- **Modify** `src/app/app/record/page.tsx` — import the new component, render it when `state === 'idle'`.
- **Create** `src/app/app/record/greeting.tsx` — fetches profile, renders greeting + avatar + edit badge wrapped in a `<Link>`.
- **No changes** to `src/app/app/profile/page.tsx` — the existing form already saves and routes back to `/app/record`.
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
- Logged-in user with photo set → sees photo + first name greeting.
- Logged-in user without photo → sees initial-bubble fallback.
- Tap avatar → lands on `/app/profile`. Edit, click "Done" → returns to `/app/record` and the new info shows.
- Start recording → greeting + avatar disappear, mic UI shifts up. Stop / upload finishes → navigates to `/app/cards/[id]` as before.

## Risks

- **Layout shift on slow networks:** if the profile fetch is slow, the skeleton is visible for a noticeable beat. Acceptable for v1 — most users will have it cached after their first session.
- **Photo R2 URL caching:** R2 returns long-cache headers. If the user changes their photo and immediately comes back here, the browser may still show the old one. Existing `/app/profile` uploads have the same property; we'll fix at the platform level if it becomes a complaint.
