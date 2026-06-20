# Follow-ups (phase 1) — Design

**Date:** 2026-06-20
**Status:** approved by Tim, ready for plan
**Mockup:** `PM-OS/outputs/portfolio/connectyall-ui-mockups/2026-06-20-follow-ups-design-v2.html`

## Problem

The LLM extraction service already captures `user_commitments` from every recording — what the speaker said they'd do — but we throw them on the floor. The user has no way to see, edit, or be reminded of what they committed to. Tim's primary use case is "I need to follow up with them in 3 days about the role" — that intent vanishes the moment the recording finishes.

## What ships in phase 1

A first-class **follow-ups** surface on the connection detail page. Each follow-up has a topic (free text) and an optional due date. Users can edit, mark done, delete, and add new ones manually. The connections list shows an amber pip next to contacts with pending follow-ups and a banner at the top when something's due today or overdue. No email or push notifications yet — that's phase 2.

## What's out of scope (phase 2 and beyond)

- **9am daily email digest** via Resend + Inngest cron — separate branch, doesn't block this UI work
- **Web push notifications** — punted indefinitely; iOS PWA push adoption isn't worth the dev cost yet
- **Recurring follow-ups** ("check in monthly") — not in v1, may never ship
- **The other person's commitments** as follow-ups — those stay as plain notes; only `user_commitments` become follow-ups
- **Time-of-day resolution** — day-resolution only ("TOMORROW", "IN 3 DAYS"). No 3pm reminders.

## Design summary

The mockup v2 file in PM-OS has frame-by-frame screens. This spec captures the locked decisions; treat the mockup as the visual source of truth.

### Connection detail page — new order

From top to bottom:
1. Headline banner (existing)
2. Mono label (existing)
3. `WHAT WE CHATTED ABOUT` card (existing)
4. `HOW TO REACH [name]` card (existing)
5. **`FOLLOW-UPS` card (new)**
6. Save / continue button (existing)

The follow-ups card sits below channels because in-the-moment "who and how do I reach them" is more important than "what do I owe them later."

### The FOLLOW-UPS card

Header label: mono uppercase `FOLLOW-UPS`, with a leading status dot that flips color based on the most urgent pending state in the card:
- Amber dot when there are items due-soon or due-today
- Red dot when there are overdue items
- No leading color (white/none) when only done items remain

Each row:
- Left: status meta in mono uppercase 9.5px — `IN 3 DAYS`, `TOMORROW`, `TODAY`, `2D OVERDUE`, `NO DATE`, `DONE · MON`
- Middle: topic text in Sora 13.5px
- Right: `EDIT` chip — **brand-soft purple** (`bg: #E9DDFF`, `text: #7C5CFF`), mono uppercase 10px, matches the existing `+ Add field` chip language on the profile page
- Tap anywhere on the row also opens the edit modal — the EDIT chip is the explicit affordance
- Status states for the row's meta:
  - Due-soon: amber text + amber dot (`#B45309` / `#F59E0B`)
  - Overdue: red text + red dot (`#B91C1C` / `#DC2626`)
  - No date: gray text + gray dot
  - Done: gray text + strikethrough on the topic + 55% row opacity (still editable to re-open)

Footer of the card:
- Hairline divider
- `+ ADD FOLLOW-UP` chip in brand-soft purple, left-aligned

Empty state: card still renders, single-sentence empty message ("Nothing on your list for [name]."), prominent `+ ADD FOLLOW-UP` chip. No shaming language.

### Swipe-left delete

Same gesture as the connections list rows (PR #10's pattern):
- Swipe left reveals a red `DELETE` slab on the right (~82px wide, matches the existing connection-row delete)
- Tap reveals a confirmation modal: "Delete this follow-up?" with the topic quoted underneath
- Confirm modal: `CANCEL` outline + `DELETE` red primary
- Tap-anywhere outside the swiped row resets it to normal

### Edit / Add modal

A single shared bottom-sheet modal. Title and primary-button label change between modes:
- Edit: title `EDIT FOLLOW-UP`, primary button `SAVE`
- Add: title `NEW FOLLOW-UP`, primary button `ADD`

Modal contents:
1. Title (mono uppercase) + headline (`For Sarah`)
2. `TOPIC` section: full-width Sora input. Placeholder on add: "What do you want to circle back about?"
3. `DUE DATE` section: row of quick-pick chips (`TOMORROW`, `IN 3 DAYS`, `NEXT WEEK`, `NO DATE`), then a date pill showing the currently-resolved date with a `CUSTOM ▾` toggle
4. `CUSTOM ▾` expands a native calendar grid (uses `<input type="date">` underneath — gets free OS-native pickers on iOS Safari + Android Chrome)
5. Above the action buttons, a thin `MARK AS DONE` text link (visible only in edit mode). Marked as a text link so it's never accidentally tapped — deliberate secondary action
6. Action row: `CANCEL` (outline) + `SAVE` or `ADD` (primary brand purple)

Add mode defaults: TOMORROW selected, empty topic, button label `ADD`.

### Connections list amber pip + banner

When any contact has a pending follow-up due today or overdue:
- A banner at the top of the connections list: amber background, mono uppercase text `● N FOLLOW-UPS DUE TODAY` on the left, `VIEW →` on the right
- Tapping `VIEW` filters the page to a flat list grouped by contact, only showing due-today and overdue items
- Each contact row on the regular connections list gets a small amber `●` next to the name when they have a pending due-today or overdue follow-up
- The right column count flips from `1 MTG` to `2 FU` when there are pending items

When nothing's due today, the page returns to its existing pre-feature state — no banner, no pip, count reverts to `1 MTG`. **The feature is invisible when not needed.**

## Schema changes

New migration `drizzle/0012_follow_ups.sql`:

```sql
CREATE TABLE "follow_ups" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "contact_id" uuid NOT NULL REFERENCES "contacts"("id") ON DELETE CASCADE,
  "interaction_id" uuid REFERENCES "interactions"("id") ON DELETE SET NULL,
  "topic" text NOT NULL,
  "due_at" timestamptz,
  "status" text NOT NULL DEFAULT 'pending',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "done_at" timestamptz
);
CREATE INDEX "follow_ups_user_pending_due_idx"
  ON "follow_ups" ("user_id", "status", "due_at");
CREATE INDEX "follow_ups_contact_idx" ON "follow_ups" ("contact_id");
```

Plus the matching entry in `drizzle/meta/_journal.json` (memory rule — hand-written migrations need journal entries or `drizzle-kit migrate` silently skips them).

Drizzle schema appended to `src/lib/db/schema.ts`:

```ts
export const followUpStatusEnum = pgEnum('follow_up_status', ['pending', 'done']);
// or just text + runtime check, matching existing patterns in this repo

export const followUps = pgTable('follow_ups', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  contactId: uuid('contact_id').notNull().references(() => contacts.id, { onDelete: 'cascade' }),
  interactionId: uuid('interaction_id').references(() => interactions.id, { onDelete: 'set null' }),
  topic: text('topic').notNull(),
  dueAt: timestamp('due_at', { withTimezone: true }),
  status: text('status').notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  doneAt: timestamp('done_at', { withTimezone: true }),
}, (t) => ({
  userPendingDueIdx: index('follow_ups_user_pending_due_idx').on(t.userId, t.status, t.dueAt),
  contactIdx: index('follow_ups_contact_idx').on(t.contactId),
}));
```

## Server changes

### LLM extraction prompt extension

`src/services/ExtractionService.ts`:

- Add a `follow_ups` field to the Zod schema: `z.array(z.object({ topic: z.string(), relative_due: z.string().nullable() })).optional().default([])`
- Add a new section to the system prompt: **FOLLOW-UPS EXTRACTION**. Capture commitments the speaker made about future actions, with a relative date if mentioned, in the speaker's own framing.
- Examples:
  - "Need to follow up with her in 3 days about the role" → `{ topic: "the role", relative_due: "in 3 days" }`
  - "Send her the deck tomorrow" → `{ topic: "send her the deck", relative_due: "tomorrow" }`
  - "I should circle back eventually" → `{ topic: "circle back", relative_due: null }`
  - "She'll send me the deck" → NOT a follow-up (that's *her* commitment, not the speaker's)

### Date resolver

New helper `src/lib/follow-up-dates.ts`:

```ts
/**
 * Resolves a relative-date string ("tomorrow", "in 3 days", "next week",
 * "Mon June 23") to an absolute UTC timestamp at noon in the user's timezone.
 * Returns null for un-parseable or null input.
 */
export function resolveRelativeDate(
  raw: string | null,
  anchorDate: Date,
  userTimezone: string,
): Date | null
```

Uses a small handwritten parser (chrono-node is overkill at 80kb; we control the prompt to constrain phrases). Anchor is the recording's `interactions.occurredAt`. Default time is noon in user's local zone (we're day-resolution).

### Service layer

New `src/services/FollowUpsService.ts`:

```ts
export async function createFollowUp(input: { userId; contactId; interactionId?; topic; dueAt?: Date | null }): Promise<FollowUp>
export async function createManyForInteraction(input: { userId; contactId; interactionId; followUps: Array<{ topic; dueAt: Date | null }> }): Promise<FollowUp[]>
export async function listForContact(contactId: string): Promise<FollowUp[]>  // returns pending then done, each by due date
export async function updateFollowUp(id: string, updates: { topic?; dueAt?: Date | null; status?: 'pending' | 'done' }): Promise<FollowUp>
export async function deleteFollowUp(id: string): Promise<void>
export async function countDueTodayForUser(userId: string, timezone: string): Promise<number>
export async function listDueTodayForUser(userId: string, timezone: string): Promise<Array<FollowUp & { contact: { id; name } }>>
```

### Pipeline hook

`src/services/CaptureService.ts` — after `markReady` for the first contact:

```ts
const followUpsForFirst = (extraction.contacts[0].follow_ups ?? [])
  .map(fu => ({
    topic: fu.topic,
    dueAt: resolveRelativeDate(fu.relative_due, interaction.occurredAt, profile.timezone),
  }))
  .filter(fu => fu.topic.trim().length > 0);

if (followUpsForFirst.length > 0) {
  await createManyForInteraction({
    userId: input.userId,
    contactId: firstResult.id,
    interactionId: input.interactionId,
    followUps: followUpsForFirst,
  });
}
```

Same logic loops for any additional contacts in `restContacts`.

### API routes

New routes:
- `POST /api/follow-ups` — body `{ contactId, topic, dueAt?: ISO string | null }`. Returns the created row. Authorization: contact must belong to session user.
- `PUT /api/follow-ups/[id]` — body `{ topic?, dueAt?: ISO string | null, status? }`. Returns the updated row.
- `DELETE /api/follow-ups/[id]` — returns `{ ok: true }`.

GET handled inline by extending the existing `GET /api/connections/[id]` to include a `followUps: FollowUp[]` field on the response (already returns the contact + interaction; this is one more join). Avoids an extra round trip on page load.

For the connections list amber pip + banner, extend `GET /api/connections` to include `hasDueTodayFollowUp: boolean` on each row and a top-level `dueTodayCount: number`. Cheap join against `follow_ups`.

## Client changes

### `FollowUpsCard` (new component)

Lives in `src/app/app/connections/[id]/follow-ups-card.tsx`. Renders the card with rows + add chip + handles swipe-to-delete + opens the modal.

Reuses the existing swipe-left logic from `connections-list.tsx` — extract that gesture handler into `src/lib/swipe-to-reveal.ts` so both surfaces share it (already a candidate for DRY).

### `FollowUpModal` (new component)

Lives in `src/app/app/connections/[id]/follow-up-modal.tsx`. Shared between edit + add modes. Props: `mode: 'edit' | 'add'`, `contactName: string`, `initial?: FollowUp`, `onClose()`, `onSave(updates)`, `onDelete?()`, `onMarkDone?()`.

Date input: native `<input type="date">` under a styled wrapper. Quick-pick chips set the date directly. NO DATE clears it.

### Connections list integration

`src/app/app/connections/connections-list.tsx`:
- New banner at the top of the page when `dueTodayCount > 0`. Hides when zero.
- Small amber `●` next to the name when `row.hasDueTodayFollowUp`.
- Right-column text: `${followUpCount} FU` when any pending follow-up exists, else fall back to current `${meetingsCount} MTG`.

New route `GET /app/connections?filter=due-today` (just a query param the existing list page reads) — when set, the page filters to only contacts with `hasDueTodayFollowUp` and shows a different headline ("Due today"). Existing search + sort hidden in this mode.

## File map

**Created:**
- `drizzle/0012_follow_ups.sql`
- `src/lib/follow-up-dates.ts` + `.test.ts`
- `src/lib/swipe-to-reveal.ts` (extracted from connections-list.tsx)
- `src/services/FollowUpsService.ts` + `.test.ts`
- `src/app/api/follow-ups/route.ts`
- `src/app/api/follow-ups/[id]/route.ts`
- `src/app/app/connections/[id]/follow-ups-card.tsx`
- `src/app/app/connections/[id]/follow-up-modal.tsx`

**Modified:**
- `drizzle/meta/_journal.json` (entry for 0012)
- `src/lib/db/schema.ts` (`followUps` table)
- `src/services/ExtractionService.ts` (prompt + Zod schema)
- `src/services/CaptureService.ts` (pipeline hook)
- `src/app/api/connections/route.ts` (add `hasDueTodayFollowUp` + `dueTodayCount`)
- `src/app/api/connections/[id]/route.ts` (include `followUps` on response)
- `src/app/app/connections/[id]/page.tsx` (mount `FollowUpsCard` below HOW TO REACH)
- `src/app/app/connections/connections-list.tsx` (banner + amber pip + count flip)

## Failure modes

- **LLM doesn't return `follow_ups` field** — Zod default of `[]` handles it. No follow-ups get created.
- **LLM returns a relative date the resolver can't parse** — `resolveRelativeDate` returns `null`, follow-up is created with `dueAt: null` and shows as `NO DATE` in the UI. User can edit.
- **User's `timezone` field is null** — fall back to `UTC`. The schema already has `timezone: text('timezone').default('UTC').notNull()` so this shouldn't happen, but defensive.
- **Same recording extracted twice** (janitor recovery from PR #15) — `processCapture` runs idempotently, but creating follow-ups twice would duplicate. Fix: dedupe by `(interactionId, topic, dueAt)` before insert. Concretely, if `interactionId` is set, delete existing follow-ups for that interaction before inserting new ones — same idempotency story as the rest of the pipeline.

## What "done" looks like

- Recording "Need to follow up with Sarah in 3 days about the staff PM role" produces a follow-up row on Sarah's contact dated 3 days from the recording date
- The connection detail page shows the FOLLOW-UPS card below HOW TO REACH with the row visible
- Tapping EDIT opens the modal; topic + date can be changed; MARK AS DONE moves the row to the done state with strikethrough
- Swipe-left reveals DELETE; confirm modal asks before destructive action
- + ADD FOLLOW-UP chip opens the modal in add mode with TOMORROW pre-selected
- Connections list shows amber pip on Sarah's row + the top banner when due today; both disappear when nothing's pending
- 119+ tests still pass (existing + new), tsc clean, no regressions in PR #15's fast pipeline
