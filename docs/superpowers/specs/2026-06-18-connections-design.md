# Connections — Design

## Goal

Give people a way to browse, find, and revisit everyone they've recorded a voice note about. Rebrand the orphan `/app/cards` list as the "Connections" surface, key it by contact (not by interaction), and wire navigation so the page is actually reachable.

## Why

The data is there — every contact and interaction is already stored — but the user has no way into it. The `/app/cards` list page exists but isn't linked from anywhere. The detail page (`/app/cards/[id]`) is keyed by interaction, so meeting the same person three times produces three separate detail pages and three separate list rows. That's not how anyone thinks about their network.

## Scope

- New `/app/connections` list page (replaces today's `/app/cards`).
- New `/app/connections/[contactId]` detail page (replaces today's `/app/cards/[id]` URL structure, keeps all the same edit behaviour and adds a "Previous meetings" section).
- A single toggle button at the top-right of every logged-in page that flips between Record and Connections.
- Backwards-compat redirect: `/app/cards/[id]` → `/app/connections/[contactId]`.
- After recording, the record page redirects to `/app/connections/[contactId]` instead of the old card URL.

Out of scope (revisit if/when needed): search, filter, bulk delete, contact merge, reorder, per-contact photo upload, bottom nav, contact tags / groups.

## Design

### Naming

User-facing: **Connection** / **Connections**. The DB table stays `contacts` internally — no migration. The "Save to Contacts" vCard button stays as-is because it refers to the phone's address book.

### Routes

| URL | What it does |
|---|---|
| `/app/record` | Recording. Unchanged. |
| `/app/connections` | List of all your connections, newest activity first. |
| `/app/connections/[contactId]` | Single contact detail. Editable. Shows the latest meeting recap plus a list of previous meetings. |
| `/app/cards/[id]` | Redirect to `/app/connections/[contactId]` so any in-flight share URLs or bookmarks keep working. |
| `/c/[interactionId]` | Public share page for one specific meeting. Unchanged. |
| `/app/profile` | Profile edit. Unchanged. Reachable only via the avatar pencil badge on the record page. |

### The toggle button

A compact pill at the top-right of every logged-in page.

- On `/app/record`: `Connections →`
- On `/app/connections` and `/app/connections/[id]`: `← Record`

Styling: `inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-neutral-950 text-white text-sm font-semibold hover:bg-neutral-800 transition`. Same pill style as the existing "+ Record" CTA.

The button lives outside any gradient card — sits in the page header strip above the cards.

The record-page greeting banner keeps its avatar-as-link to profile; we don't change that. So Profile is reachable from Record only, exactly as the user requested.

### Connections list

`GET /api/connections` returns one row per contact, ordered by `lastTouchedAt DESC`, limit 100:

```ts
type ConnectionRow = {
  contactId: string;
  name: string;
  company: string | null;
  role: string | null;
  preferredChannel: ChannelKind | null;
  lastTouchedAt: string;  // ISO
  meetingsCount: number;  // count of interactions
};
```

Each row in the UI:

```
[bubble]  John Smith                                       💬
          Meta · Product manager                  3 days ago
```

- Initial-bubble avatar (we don't store contact photos — use the same `pickBg(name)` palette as the sender's profile fallback).
- Name in bold (`text-neutral-950`).
- Company + role on a second line, separated by `·`. If either is null, render only the non-null one. If both null, omit the line.
- Preferred-channel icon at the top-right (uses existing `ChannelIcon`). If no preferred channel, omit.
- Relative date at the bottom-right ("today", "yesterday", "3 days ago", "Feb 12"). Implement a small `relativeDate(iso)` helper.

Tap the row → `/app/connections/[contactId]`.

Empty state: `No connections yet. Record your first voice note.` with a primary CTA `+ Record` linking to `/app/record`.

### Connection detail page

Keep everything today's `/app/cards/[id]` page does — editable name, notes, "What we talked about" recap, channels block, send buttons per channel, save-to-vCard, Done button — but key the page by contact ID and add a meetings history section.

Layout, top to bottom:

1. **Name banner** — gradient card with editable contact name (`EditableHeading` component, unchanged).
2. **Notes + Latest meeting** — gradient card with "Private note" (the contact-level `notes` field) on top and "What we talked about" (the latest interaction's `structuredData.recap`) below. Both editable. This is the same UI as today; the only change is that the recap belongs to the *most recent* interaction for this contact.
3. **Channels block** — gradient card with the per-row inline editor + send buttons + Add field + Save to contacts vCard. Unchanged.
4. **Previous meetings** — **new** gradient card. Lists all interactions for this contact *except* the most recent one (the most recent is already shown above). Each row: date (e.g. "Jun 12, 2026") + a one-line truncated recap. Tap to expand the full recap inline. Only renders if there's more than one interaction.
5. **Done button** — full-width dark pill → `/app/record`. Unchanged.

### Data shape changes

`GET /api/connections/[contactId]` returns:

```ts
type ConnectionDetail = {
  contact: { ... full contact object ... };
  latestInteractionId: string;  // for share URL / public landing
  latestRecap: string | null;
  previousMeetings: Array<{
    interactionId: string;
    occurredAt: string;
    recap: string | null;
  }>;
};
```

We need a way to update the latest recap. Today the post-capture page calls `PUT /api/interactions/[interactionId]` with `{ recap }`. That stays — we just need the latest interaction's ID surfaced on the detail page payload.

### Post-record flow

The record page currently does:

```tsx
const { interactionId } = await res.json();
router.push(`/app/cards/${interactionId}`);
```

After this change:

1. `POST /api/capture` keeps returning `{ interactionId }` (no change to the API).
2. The record page polls `GET /api/cards/[interactionId]` (existing endpoint) for `status === 'ready'`.
3. Once ready, the polled payload now also returns `contact.id` (it already does — `contact` is in the response).
4. Record page navigates to `/app/connections/${contact.id}`.

This avoids any new API endpoint for the redirect step.

### Backwards-compat redirect

`/app/cards/[id]/page.tsx` becomes a server component that:

1. Looks up the interaction by ID.
2. Reads its `contactId`.
3. Calls `redirect('/app/connections/' + contactId)`.

If the interaction is not found, redirect to `/app/connections` (list) with no error — assume the user landed on a stale link.

This means we don't have to chase down every reference to `/app/cards/[id]` in production share URLs or browser history. Any path with `/app/cards/[id]` Just Works.

### Removing `/app/cards` (the list)

The list lives at `/app/cards/page.tsx` today. With the new list at `/app/connections/page.tsx`, the old route becomes redundant. Replace it with a redirect to `/app/connections`. Same reasoning as the detail redirect — no broken links.

## Files affected

**New**
- `src/app/app/connections/page.tsx` — the list page
- `src/app/app/connections/[id]/page.tsx` — the contact detail page (mostly ported from the existing `/app/cards/[id]/page.tsx`)
- `src/app/api/connections/route.ts` — `GET` returning `ConnectionRow[]`
- `src/app/api/connections/[id]/route.ts` — `GET` returning `ConnectionDetail`
- `src/components/nav-toggle.tsx` — the Record ↔ Connections pill button (client component, uses `usePathname` to flip its label/destination)
- `src/lib/relative-date.ts` — `relativeDate(iso: string): string` helper

**Modified**
- `src/app/app/record/page.tsx` — after polling resolves, navigate to `/app/connections/${contact.id}`
- `src/app/app/cards/page.tsx` — replace body with `redirect('/app/connections')`
- `src/app/app/cards/[id]/page.tsx` — replace body with a server component that looks up the contact and redirects, OR delete the file and add a static rewrite. **Pick the server-component approach** because we need a DB lookup to know which contact to redirect to.

**No DB migration.** All tables, columns, and APIs already support this.

## Testing

Unit tests:
- `relativeDate('2026-06-18T...')` returns `'today'`
- `relativeDate(yesterday)` returns `'yesterday'`
- `relativeDate(3 days ago)` returns `'3 days ago'`
- `relativeDate(>30 days ago)` returns `'Feb 12'` (date format, year omitted when same year, included otherwise)

Browser smoke on preview:
- Record a memo → lands on `/app/connections/[contactId]`. URL contains a contact ID, not an interaction ID.
- Visit `/app/connections` → see your new connection at the top with the right preferred channel icon and "today" date.
- Tap a row → opens the contact detail page with the recap visible.
- Visit `/app/cards/<oldInteractionId>` (paste in URL bar) → redirects to the right contact page.
- Visit `/app/cards` → redirects to `/app/connections`.
- Toggle button: on Record, reads "Connections →"; on Connections, reads "← Record". Tap navigates.
- Profile still reachable via the avatar pencil badge on Record. Profile is NOT reachable from Connections (sanity check — there's no link).
- Record a second memo about the same person → both meetings appear; the "Previous meetings" section shows the earlier one. Latest recap shows at the top.

## Risks

- **Counting meetings is a join.** The list query joins `contacts` to `interactions` and counts. On Tim's data volumes this is fine. If it ever gets slow, we'd add a materialized `meetings_count` column or a denormalized counter — both easy.
- **`lastTouchedAt` is updated on every edit, not only on new meetings.** That means editing a typo bumps the contact to the top of the list. Acceptable for v1 — feels like Slack's behavior. If it ever annoys, we can switch the list ordering to `latestInteractionOccurredAt`.
- **Old `/app/cards/[id]` server component does a DB lookup on every visit.** Fine for now. Could be cached if it ever becomes hot.
