# UI Refresh — Design

## Goal

Top-to-bottom visual rebuild matching the cream + bold-display mockups Tim shared on 2026-06-18. Drop the purple-amber gradient cards, drop the navy footer, add a floating 3-tab bottom nav (Profile · Record · Connections), introduce monospace meta labels, and bring split-color headlines as the new signature treatment.

## Why

The current light theme works but feels visually noisy — purple gradients on every card, a heavy navy footer, no clear "moment" treatment for the record action. The new mockup is cleaner, more confident, and gives the record button the visual weight it deserves. Tim got design feedback that pointed at all of this.

## Scope

Every user-facing surface gets re-skinned:

- `/app/record` — full rebuild matching mockup #1 directly
- `/app/connections` — full rebuild matching mockup #2 directly
- `/app/connections/[id]` — port the existing structure (name banner / notes+recap / channels / previous meetings / save) into the new visual language; no structural rethink
- `/app/profile` — re-skin in the new style; keep current sections
- `/app/sign-in` — re-skin matching the new aesthetic
- `/` (marketing root) — re-skin, plus add Privacy + Terms links here (Tim flagged the footer was the wrong home for them)
- `/privacy`, `/terms` — adopt the new bg + typography; content unchanged
- `/c/[id]` (public landing) — re-skin

Out of scope:
- Flow changes beyond the bottom-nav default and post-record landing destination
- Adding any new pages
- New copy (we only change visual treatment; existing strings stay)

## Design

### Tokens

In `src/app/globals.css`:

```css
:root {
  --bg-page: #F5F1E8;      /* cream — Tim picked option B */
  --bg-surface: #FFFFFF;   /* white card */
  --foreground: #0A0A0A;   /* near-black */
  --muted: #6B7280;        /* secondary text */
  --border: #E7E3D7;       /* subtle warm border */
}
```

In the existing `@theme` block:

```css
@theme inline {
  --color-foreground: var(--foreground);
  --color-brand: #7C5CFF;       /* unchanged */
  --color-cream: var(--bg-page);
  --color-surface: var(--bg-surface);
  --color-muted: var(--muted);
  --color-line: var(--border);
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);  /* mono labels everywhere */
}
```

Body background switches from the white→violet-50 gradient to flat `bg-cream`.

### Monospace meta pattern

Anywhere we show meta info (greeting label, "5 PEOPLE · 5 MEMOS", channel tags like `EMAIL` / `IN` / `WA`, dates like `TODAY` / `MAR 12`, status indicators like `● READY`) we use **Geist Mono uppercase with `tracking-[0.18em]`**, smaller than body text (`text-[10px]` or `text-xs`), color `text-muted`. Brand-purple variant for channel tags so they pop on the white card.

### Bottom navigation pill

A new client component `src/components/bottom-nav.tsx`:

- `position: fixed`, bottom `1rem`, horizontally centered
- Dark pill (`bg-[#0F0F12]`), rounded full, padding `8px`
- 3 children, all reached via `Link`:
  - **Left:** Profile (`/app/profile`) — `<LuUser />` icon
  - **Center:** Record (`/app/record`) — `<LuMic />` icon
  - **Right:** Connections (`/app/connections`) — `<LuUsers />` icon
- Active tab (computed from `usePathname()`):
  - Background `bg-brand` (purple)
  - Wider (icon + text label, e.g. `🎤 Record`)
  - Color `text-white`
- Inactive tabs:
  - Width 42px, square aspect (`w-10 h-10` or `w-11 h-11`)
  - Color `text-zinc-400`

The nav renders ONLY on the three app pages it routes between (`/app/record`, `/app/profile`, `/app/connections*`). It does NOT render on marketing, sign-in, privacy/terms, public landing. So the nav lives at the page level (each app page mounts it), not in the root layout.

The existing `NavToggle` component is removed.

### Drop the navy footer

`src/components/footer.tsx` is deleted. The `<Footer />` mount in `src/app/layout.tsx` is removed. Body no longer needs the `pb-12` clearance (the bottom nav has its own pinned positioning and pages will add their own bottom padding to account for it).

A new constant in `src/app/app/_layout-constants.ts`:

```ts
// Reserve space at the bottom of every logged-in page for the floating nav pill.
export const NAV_HEIGHT_PX = 84;
export const APP_CONTAINER = 'px-4 py-6 pb-28 sm:px-6 sm:max-w-xl sm:mx-auto space-y-4 w-full';
```

(`pb-28` ≈ `7rem` clears the nav pill comfortably.)

### Header strip pattern

Every app page (Record, Connections list, Profile, Connection detail) opens with a small header strip:

```
[c] Connectyall                          ● READY
```

- Left: small black-bubble logo (28-32px) with white `c` + bold "Connectyall" wordmark next to it (smaller than the marketing wordmark)
- Right: a mono status indicator. For Record it reads `● READY` (with a purple dot when idle, red when recording, gray when uploading). For other pages it can be the count meta (e.g. `5 CONNECTIONS`) or just blank — TBD per page.

A new shared component `src/components/page-header.tsx`:

```tsx
export function PageHeader({ status }: { status?: ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <div className="inline-flex items-center gap-2">
        <div className="w-7 h-7 rounded-full bg-neutral-950 text-white flex items-center justify-center font-bold text-sm">c</div>
        <span className="text-base font-bold">Connectyall</span>
      </div>
      {status && <div className="font-mono text-[10px] tracking-[0.2em] text-muted">{status}</div>}
    </div>
  );
}
```

### Split-color headline

The signature treatment from the mockup. Big bold display, two halves on different lines, second half in brand purple. Used on:

- Record: "Who did you / **just meet?**"
- Connections: "Your / **network**" (one-line variant — accent the noun)
- Marketing: "Voice notes that / **connect** y'all." (we already do something like this, just bigger)
- Profile: "Hey **Tim**, / keep your details fresh." (purple on name)

Tailwind:

```tsx
<h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight leading-[1.05]">
  Who did you<br />
  <span className="text-brand">just meet?</span>
</h1>
```

### Card pattern

No more gradient cards. White surfaces, soft shadow, generous rounding:

```tsx
className="rounded-3xl bg-surface border border-line/60 shadow-[0_2px_8px_rgba(0,0,0,0.04)] px-5 py-4"
```

Used for: notes/recap card on detail page, channels card, previous-meetings card, "Your info" card on profile, etc. Connections list rows use the same treatment but with smaller padding.

### Record page — full redesign

Following mockup #1:

```
[header strip]

GOOD MORNING, TIM                          (mono label)
Who did you
just meet?                                  (split headline)

Tap to record. We'll pull a name, channels,
and the gist — no typing.                   (sub text)

         ╭───╮
       ╭─┤ 🎤 ├─╮                          (mic with concentric purple glow rings)
         ╰───╯

       ▍▎▎▍▎▍▎▍▎▍                        (purple waveform bars, lower opacity)

   ● TAP TO RECORD · UP TO 60S            (mono caption)

                                          (bottom nav)
```

**Greeting label:** `GOOD MORNING/AFTERNOON/EVENING, <first-name>` based on local hour. Display name fetched from `getServerSession()` + `getById()` — `/app/record/page.tsx` is currently client-only; we'll convert the data fetch to happen via a server component wrapper OR keep it client and use the existing greeting profile fetch (which is what `Greeting` component does today).

Decision: keep client-side fetch via the existing `/api/profile` route, but move the data into a new tiny `useGreeting()` hook that returns `{ greetingLabel, firstName }` derived from the profile + local hour. Avatar component is no longer rendered on record page (the mockup doesn't show it).

**Mic button:** 124×124 brand-purple circle with `shadow-[0_12px_32px_rgba(124,92,255,0.35)]` glow. Three concentric translucent purple rings behind it for visual presence. Implemented as nested `div`s with `radial-gradient` background and absolute positioning.

**Waveform:** stays as 20-bar dynamic waveform (already wired to AudioContext). Bars become `bg-[#7C5CFF]/55` purple at lower opacity. Same animation logic as today.

**Caption:** `● TAP TO RECORD · UP TO 60S` mono uppercase. Changes per state:
- idle: `● TAP TO RECORD · UP TO 60S` (purple dot)
- recording: `● RECORDING · 0:12` (red dot, live timer)
- uploading: `● PROCESSING…` (gray dot)

**Status indicator** in the header strip mirrors:
- idle: `● READY` (purple)
- recording: `● REC` (red)
- uploading: `● PROCESSING` (gray)

### Connections list — full redesign

Following mockup #2:

```
[header strip with status = `5 PEOPLE · 5 MEMOS`]

Your network                                  (split headline, "network" purple)   [+]

[🔍 Search names, roles, tags...]              (rounded pill input)

[avatar bubble] Sarah Jenkins        TODAY  ↗
                VP of Design at Atmos · EMAIL

[avatar bubble] David Chen           MAR 12 ↗
                Partner, Foundry Ventures · IN

...

                                          (bottom nav)
```

- **Status text** in header: `<N> PEOPLE · <M> MEMOS` (N = contact count, M = total interactions count). Add `meetingsCount` aggregation to `/api/connections` — we already return it per contact, just sum it client-side.
- **Headline** "Your network" with "network" in brand purple. (We rename internally — DB still says `contacts`, copy on UI says "network" / "people" / "connections" interchangeably matching the mockup.)
- **Purple FAB +** top-right of the headline — links to `/app/record`. Same brand purple as the mic.
- **Search bar** — rounded full pill, white surface, gray text. Placeholder "Search names, roles, tags…". For now we keep the existing name + company match. (Tags don't exist yet — that's future scope, but the placeholder hints at it.)
- **Sort dropdown** — keep it but move below the search bar OR show on tap (toolbar feels lighter without it always visible). Decision: keep it inline next to the search bar, smaller, still 3 options.
- **List row** — white card, rounded-3xl, padding tight. Inside:
  - Initial-bubble avatar (44px), color from existing palette
  - Name bold, role · company in muted text
  - Right side: monospace date label ("TODAY", "MAR 12") with `tracking-[0.2em]` and color muted
  - Tiny ↗ arrow indicator on the far right
  - Channel tag (e.g. `EMAIL`, `IN`, `WA`) below the date in mono brand-purple — uses the existing `preferredChannel` field, shown as 2-3 character code
- **Swipe-to-delete** behaviour preserved; the red trash background works the same way on the new white card surface.
- **Hint pill** (the first-visit "swipe left to delete" amber pill) keeps working but visually adopts the new typography (mono).
- **Empty state** — same content, but the gradient card becomes a white card.

### Connection detail — port to new style

Same sections in the same order; visual change only:

- Name banner becomes a white card with the contact name as the big split-color headline ("Sarah / Jenkins" — accent the surname, OR keep it as a single line and accent nothing. Both options worth trying; I'll start with a single-line bold treatment to keep it understated).
- Notes + recap card: white card with mono section labels (`PRIVATE NOTE`, `WHAT WE TALKED ABOUT`).
- Channels card: white card. Channel rows the same five-column layout (star · icon · value · send · X). Mono channel labels (e.g. `EMAIL`) next to the icon.
- Previous meetings card: white card with mono date labels.
- "Save" button at the bottom (current copy from instant-recording branch) → keep as black pill.
- The post-capture loading state's gradient card becomes a white card with the spinning logo + cream bg behind it.

### Profile — re-skin

- Header strip + bottom nav.
- Hero block: avatar (still purple-tinted initial bubble) + camera badge in the existing pattern + new split-color headline ("Hey **Tim**, / keep your details fresh.").
- "Your info" card and "Channels" card both become plain white cards with mono section labels.
- Sign-out and Delete-my-account buttons unchanged in behaviour, style adopts the cream + monospace pattern.
- The current section labels ("Your info", "How people can reach you") become mono uppercase (`YOUR INFO`, `HOW PEOPLE CAN REACH YOU`).

### Sign-in — re-skin

Header strip + cream background. Big "Welcome." / "Sign in to **Connectyall**" split-color headline. White card containing the OTP form (email step + code step). Tone-matching with the rest of the app.

### Marketing root — re-skin

Big hero block (cream bg, split-color headline, mono support text), CTA "Open the app" pill. Tim's earlier request: surface Privacy + Terms links here. Add a bottom strip with `Privacy · Terms · A portfolio project by Tim Nan.` (mono labels, muted color, centered below the CTA).

### Privacy + Terms — adopt new visual language

Same content. Re-render with cream bg + mono section labels + the new header strip pattern. Headlines get the split-color treatment ("Privacy" stays solid, or "Privacy / **policy**" — TBD; default keep single word).

### Public landing `/c/[id]` — re-skin

Cream bg, white surfaces, mono labels for "FOR <name>", split-color treatment for the sender's name (purple). Channel grid stays 2-col but cells become white cards with mono channel tags. "Save to contacts" stays the black pill at the bottom.

## Post-record flow

The user requested: "when the record is finished it actually goes to the connections tab to save the contact and once saved it shows the contact screen."

What this means in practice:
- After `/app/record` finishes processing, navigate to `/app/connections/[contactId]` (we already do this).
- The bottom nav highlights "Connections" because the path starts with `/app/connections/...`.
- The user sees the new contact's detail page with the Save button.
- After tapping Save (which today just navigates back to `/app/record`), behavior stays the same — back to record.

Functionally identical to today. The "connections tab is now active" treatment is purely visual (bottom nav highlight).

App default landing remains `/app/record` (root server-side redirect from instant-recording branch unchanged).

## Files affected

**New**
- `src/components/bottom-nav.tsx`
- `src/components/page-header.tsx`
- `src/lib/greeting.ts` — helper that computes "GOOD MORNING/AFTERNOON/EVENING, <name>" from local hour + display name

**Modified (every user-facing page)**
- `src/app/globals.css` — new tokens
- `src/app/layout.tsx` — drop Footer, drop body gradient, switch bg to cream
- `src/app/app/_layout-constants.ts` — bump `pb` to clear bottom nav
- `src/app/page.tsx` — re-skin marketing
- `src/app/privacy/page.tsx` — re-skin
- `src/app/terms/page.tsx` — re-skin
- `src/app/app/sign-in/page.tsx` — re-skin
- `src/app/app/record/page.tsx` — full rebuild
- `src/app/app/connections/page.tsx` — full rebuild
- `src/app/app/connections/[id]/page.tsx` — port to new style
- `src/app/app/profile/page.tsx` — re-skin
- `src/app/c/[id]/page.tsx` — re-skin

**Deleted**
- `src/components/footer.tsx`
- `src/components/nav-toggle.tsx` — replaced by `bottom-nav.tsx`
- `src/app/app/record/greeting.tsx` — record page no longer has the avatar greeting block; the new header pattern replaces it. The `getFirstName` helper exported from this file is used by `profile/page.tsx` too — move that helper into `src/lib/greeting.ts` before deleting.

## Testing

Smoke on preview:

- Tap through every page on a phone — visual feel matches mockup direction (cream bg, white cards, mono labels)
- Bottom nav: tap Profile / Record / Connections — page navigates and the active tab highlights correctly
- Record: idle → tap → recording (red dot in header + caption) → stop → uploading (gray dot) → land on connection detail page with Connections tab highlighted
- Connections: search filters, sort reorders, FAB + navigates to record, swipe-to-delete still triggers the confirm modal
- Profile: sign-out and delete-my-account both still work
- Sign-in: email → code → success
- Marketing root: when signed out, page renders with Privacy/Terms links below CTA. When signed in, redirects to `/app/record` as today.

No new tests required — the changes are presentational.

## Risks

- **Visual regression on edge cases.** Some smaller surfaces (error states, empty states, alert dialogs) aren't shown in the mockups. I'll apply the same pattern (cream bg, white cards, mono meta) by default and we can iterate if something feels off.
- **`Greeting` component deletion.** The current `getFirstName` helper is imported by `profile/page.tsx`. Moving it to `src/lib/greeting.ts` is a small chore — the profile page's import path updates accordingly.
- **Mono font load weight.** Geist Mono is already imported in `layout.tsx`, so no extra weight. We use Tailwind's `font-mono` token (`var(--font-geist-mono)`) which is already wired up.
- **Bottom nav z-index conflicts.** The current implementation has nothing fixed/floating to compete with (the navy footer is being deleted). The swipe-to-delete confirm modal uses `z-50`; bottom nav needs to sit below modals — using `z-40` should be safe.
