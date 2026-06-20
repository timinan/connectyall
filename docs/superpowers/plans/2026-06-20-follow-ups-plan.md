# Follow-ups (phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a first-class follow-ups surface on the connection detail page that captures the speaker's commitments from each recording, lets the user edit / mark done / delete / add manually, and surfaces a due-today indicator on the connections list. No email or push — that's phase 2.

**Architecture:** New `follow_ups` table with a composite index for the "what's due today" query. The LLM extraction prompt grows a `follow_ups` field; a date resolver converts relative phrases ("in 3 days") to absolute timestamps anchored on the recording date. A new `FollowUpsService` owns CRUD; `CaptureService.processCapture` calls it after each contact is marked ready. UI: new `FollowUpsCard` component on the connection detail page, new shared `FollowUpModal` for edit + add, swipe-to-reveal delete reusing a helper extracted from the connections-list row gesture. Connections list gets an amber pip per row and a banner at the top when something's due today.

**Tech Stack:** TypeScript + Next.js 16 App Router, Drizzle ORM + Neon Postgres, Vitest + fake timers, Vercel AI SDK + Gemini Flash Lite, React 19 client components.

**Spec:** `docs/superpowers/specs/2026-06-20-follow-ups-design.md`
**Mockup:** `PM-OS/outputs/portfolio/connectyall-ui-mockups/2026-06-20-follow-ups-design-v2.html`

---

## File Structure

**Created:**
- `drizzle/0012_follow_ups.sql` — new table + 2 indexes
- `src/lib/follow-up-dates.ts` — `resolveRelativeDate(raw, anchor, timezone)`
- `src/lib/follow-up-dates.test.ts`
- `src/lib/swipe-to-reveal.ts` — gesture helper extracted from connections-list
- `src/services/FollowUpsService.ts` — CRUD + query helpers
- `src/services/FollowUpsService.test.ts`
- `src/app/api/follow-ups/route.ts` — POST
- `src/app/api/follow-ups/[id]/route.ts` — PUT + DELETE
- `src/app/app/connections/[id]/follow-ups-card.tsx`
- `src/app/app/connections/[id]/follow-up-modal.tsx`
- `src/app/app/connections/due-today-banner.tsx`

**Modified:**
- `drizzle/meta/_journal.json` — entry for `0012`
- `src/lib/db/schema.ts` — `followUps` table + `FollowUp` type exports
- `src/services/ExtractionService.ts` — Zod schema + prompt section for follow-ups
- `src/services/CaptureService.ts` — wire follow-up creation into the pipeline
- `src/app/api/connections/route.ts` — include `hasDueTodayFollowUp` per row + `dueTodayCount` at top level
- `src/app/api/connections/[id]/route.ts` — include `followUps: FollowUp[]` on response
- `src/app/app/connections/[id]/page.tsx` — mount `FollowUpsCard` below HOW TO REACH
- `src/app/app/connections/connections-list.tsx` — banner, amber pip, count flip, due-today filter

---

## Task 0: Schema migration — `follow_ups` table

**Files:**
- Create: `drizzle/0012_follow_ups.sql`
- Modify: `drizzle/meta/_journal.json`
- Modify: `src/lib/db/schema.ts` (append at end, before the type exports)

- [ ] **Step 0.1: Write the migration SQL**

Create `drizzle/0012_follow_ups.sql`:

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

- [ ] **Step 0.2: Register the migration in the journal**

Append to the `entries` array in `drizzle/meta/_journal.json` (after the existing `0011_interactions_capture_metadata` entry):

```json
    {
      "idx": 12,
      "version": "7",
      "when": 1782100000000,
      "tag": "0012_follow_ups",
      "breakpoints": true
    }
```

- [ ] **Step 0.3: Update Drizzle schema**

In `src/lib/db/schema.ts`, append before the type re-exports near the bottom of the file:

```ts
export const followUps = pgTable(
  'follow_ups',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id').notNull().references(() => contacts.id, { onDelete: 'cascade' }),
    interactionId: uuid('interaction_id').references(() => interactions.id, { onDelete: 'set null' }),
    topic: text('topic').notNull(),
    dueAt: timestamp('due_at', { withTimezone: true }),
    status: text('status').notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    doneAt: timestamp('done_at', { withTimezone: true }),
  },
  (t) => ({
    userPendingDueIdx: index('follow_ups_user_pending_due_idx').on(t.userId, t.status, t.dueAt),
    contactIdx: index('follow_ups_contact_idx').on(t.contactId),
  }),
);

export type FollowUp = typeof followUps.$inferSelect;
export type NewFollowUp = typeof followUps.$inferInsert;
```

- [ ] **Step 0.4: Apply locally + verify**

Run: `cd /Users/timnan/Documents/GitHub/connectyall && npx drizzle-kit migrate`
Expected: output ends with `[✓] migrations applied successfully!` and mentions the `0012_follow_ups` tag (NOT just silent — silent means the journal entry didn't take).

Run: `cd /Users/timnan/Documents/GitHub/connectyall && npx tsc --noEmit`
Expected: clean (no output).

- [ ] **Step 0.5: Commit**

```bash
cd /Users/timnan/Documents/GitHub/connectyall
git add drizzle/0012_follow_ups.sql drizzle/meta/_journal.json src/lib/db/schema.ts
git commit -m "schema: follow_ups table for per-contact reminders"
```

---

## Task 1: Date resolver helper

**Files:**
- Create: `src/lib/follow-up-dates.ts`
- Create: `src/lib/follow-up-dates.test.ts`

- [ ] **Step 1.1: Write the failing tests**

Create `src/lib/follow-up-dates.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolveRelativeDate } from './follow-up-dates';

const anchor = new Date('2026-06-20T16:00:00Z'); // Sat 9am Vancouver
const tz = 'America/Vancouver';

describe('resolveRelativeDate', () => {
  it('returns null for null input', () => {
    expect(resolveRelativeDate(null, anchor, tz)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(resolveRelativeDate('', anchor, tz)).toBeNull();
  });

  it('parses "tomorrow"', () => {
    const result = resolveRelativeDate('tomorrow', anchor, tz);
    expect(result).not.toBeNull();
    // Tomorrow noon local in Vancouver = 19:00 UTC on Jun 21
    expect(result!.toISOString().startsWith('2026-06-21T19:00')).toBe(true);
  });

  it('parses "in 3 days"', () => {
    const result = resolveRelativeDate('in 3 days', anchor, tz);
    expect(result!.toISOString().startsWith('2026-06-23T19:00')).toBe(true);
  });

  it('parses "next week" as +7 days', () => {
    const result = resolveRelativeDate('next week', anchor, tz);
    expect(result!.toISOString().startsWith('2026-06-27T19:00')).toBe(true);
  });

  it('parses "in 2 weeks"', () => {
    const result = resolveRelativeDate('in 2 weeks', anchor, tz);
    expect(result!.toISOString().startsWith('2026-07-04T19:00')).toBe(true);
  });

  it('parses "by Friday" as the next Friday', () => {
    // anchor is Sat 2026-06-20, next Friday = 2026-06-26
    const result = resolveRelativeDate('by Friday', anchor, tz);
    expect(result!.toISOString().startsWith('2026-06-26T19:00')).toBe(true);
  });

  it('returns null for un-parseable phrases', () => {
    expect(resolveRelativeDate('eventually', anchor, tz)).toBeNull();
    expect(resolveRelativeDate('whenever', anchor, tz)).toBeNull();
  });

  it('handles case-insensitive input', () => {
    const result = resolveRelativeDate('TOMORROW', anchor, tz);
    expect(result!.toISOString().startsWith('2026-06-21T19:00')).toBe(true);
  });

  it('falls back to UTC when timezone is unknown', () => {
    const result = resolveRelativeDate('tomorrow', anchor, 'Not/A_Real_Zone');
    // Should still produce a date (noon UTC of next day)
    expect(result).not.toBeNull();
    expect(result!.toISOString().startsWith('2026-06-21T12:00')).toBe(true);
  });
});
```

Run: `cd /Users/timnan/Documents/GitHub/connectyall && npx vitest run src/lib/follow-up-dates.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 1.2: Implement `resolveRelativeDate`**

Create `src/lib/follow-up-dates.ts`:

```ts
// Parses the relative-date phrase the LLM emits and resolves it to an
// absolute timestamp at noon in the user's local timezone. Day-resolution
// only — no time-of-day support in v1.
//
// Supported phrases (case-insensitive):
//   - "tomorrow"                     → anchor + 1 day at noon local
//   - "in N day[s]"                  → anchor + N days at noon local
//   - "in N week[s]"                 → anchor + (N * 7) days at noon local
//   - "next week"                    → anchor + 7 days at noon local
//   - "by <weekday>" / "<weekday>"   → next occurrence of that weekday
//
// Returns null for null, empty, or un-parseable input.

const WEEKDAYS: Record<string, number> = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thurs: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
};

function noonInTimezone(year: number, month: number, day: number, timezone: string): Date {
  // Build a UTC date that represents noon-local in the target timezone.
  // We use Intl.DateTimeFormat to find what UTC moment corresponds to local
  // noon — accounts for DST.
  const utcNoon = Date.UTC(year, month, day, 12, 0, 0);
  try {
    // What "wall clock time" does this UTC moment display as in `timezone`?
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    });
    const parts = formatter.formatToParts(new Date(utcNoon));
    const hour = parseInt(parts.find(p => p.type === 'hour')!.value, 10);
    const minute = parseInt(parts.find(p => p.type === 'minute')!.value, 10);
    // If the local displayed time isn't 12:00, shift by the difference.
    const offsetMinutes = (12 * 60) - (hour * 60 + minute);
    return new Date(utcNoon + offsetMinutes * 60_000);
  } catch {
    // Invalid timezone → fall back to UTC noon.
    return new Date(utcNoon);
  }
}

function addDays(d: Date, days: number): Date {
  const next = new Date(d);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function resolveRelativeDate(
  raw: string | null,
  anchorDate: Date,
  userTimezone: string,
): Date | null {
  if (!raw) return null;
  const text = raw.trim().toLowerCase();
  if (!text) return null;

  // "tomorrow"
  if (text === 'tomorrow') {
    const t = addDays(anchorDate, 1);
    return noonInTimezone(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate(), userTimezone);
  }

  // "next week"
  if (text === 'next week') {
    const t = addDays(anchorDate, 7);
    return noonInTimezone(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate(), userTimezone);
  }

  // "in N day[s]" or "in N week[s]"
  const inMatch = text.match(/^in\s+(\d+)\s+(day|days|week|weeks)$/);
  if (inMatch) {
    const n = parseInt(inMatch[1], 10);
    const days = inMatch[2].startsWith('week') ? n * 7 : n;
    const t = addDays(anchorDate, days);
    return noonInTimezone(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate(), userTimezone);
  }

  // "by <weekday>" or just "<weekday>"
  const weekdayMatch = text.match(/^(?:by\s+|on\s+|next\s+)?([a-z]+)$/);
  if (weekdayMatch && WEEKDAYS[weekdayMatch[1]] !== undefined) {
    const targetDow = WEEKDAYS[weekdayMatch[1]];
    const currentDow = anchorDate.getUTCDay();
    let offset = (targetDow - currentDow + 7) % 7;
    if (offset === 0) offset = 7; // "by Friday" on a Friday → next Friday
    const t = addDays(anchorDate, offset);
    return noonInTimezone(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate(), userTimezone);
  }

  return null;
}
```

- [ ] **Step 1.3: Verify**

Run: `cd /Users/timnan/Documents/GitHub/connectyall && npx vitest run src/lib/follow-up-dates.test.ts`
Expected: PASS (10 tests).

Run: `cd /Users/timnan/Documents/GitHub/connectyall && npx vitest run`
Expected: full suite green.

- [ ] **Step 1.4: Commit**

```bash
cd /Users/timnan/Documents/GitHub/connectyall
git add src/lib/follow-up-dates.ts src/lib/follow-up-dates.test.ts
git commit -m "lib: resolveRelativeDate helper for follow-up phrases"
```

---

## Task 2: FollowUpsService — CRUD + query helpers

**Files:**
- Create: `src/services/FollowUpsService.ts`
- Create: `src/services/FollowUpsService.test.ts`

- [ ] **Step 2.1: Write the failing tests**

Create `src/services/FollowUpsService.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const insertValues = vi.hoisted(() => vi.fn());
const insertReturning = vi.hoisted(() => vi.fn());
const updateSet = vi.hoisted(() => vi.fn());
const updateWhere = vi.hoisted(() => vi.fn());
const updateReturning = vi.hoisted(() => vi.fn());
const deleteWhere = vi.hoisted(() => vi.fn());
const selectFrom = vi.hoisted(() => vi.fn());
const selectWhere = vi.hoisted(() => vi.fn());
const selectOrderBy = vi.hoisted(() => vi.fn());
const dbMock = vi.hoisted(() => vi.fn());

vi.mock('../lib/db/client', () => ({ db: dbMock }));

beforeEach(() => {
  vi.clearAllMocks();
  insertReturning.mockResolvedValue([{ id: 'fu-1', topic: 'send the deck', dueAt: null, status: 'pending' }]);
  updateReturning.mockResolvedValue([{ id: 'fu-1', topic: 'send the deck (updated)', dueAt: null, status: 'pending' }]);
  insertValues.mockReturnValue({ returning: insertReturning });
  updateSet.mockReturnValue({ where: updateWhere });
  updateWhere.mockReturnValue({ returning: updateReturning });
  deleteWhere.mockResolvedValue(undefined);
  selectFrom.mockReturnValue({ where: selectWhere });
  selectWhere.mockReturnValue({ orderBy: selectOrderBy });
  selectOrderBy.mockResolvedValue([]);
  dbMock.mockReturnValue({
    insert: () => ({ values: insertValues }),
    update: () => ({ set: updateSet }),
    delete: () => ({ where: deleteWhere }),
    select: () => ({ from: selectFrom }),
  });
});

import {
  createFollowUp,
  createManyForInteraction,
  listForContact,
  updateFollowUp,
  deleteFollowUp,
} from './FollowUpsService';

describe('FollowUpsService', () => {
  it('createFollowUp inserts a row with the given fields', async () => {
    const result = await createFollowUp({
      userId: 'u-1',
      contactId: 'c-1',
      topic: 'send the deck',
      dueAt: null,
    });
    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'u-1',
      contactId: 'c-1',
      topic: 'send the deck',
      dueAt: null,
      status: 'pending',
    }));
    expect(result.id).toBe('fu-1');
  });

  it('createManyForInteraction deletes existing rows for the interaction first (idempotency)', async () => {
    await createManyForInteraction({
      userId: 'u-1',
      contactId: 'c-1',
      interactionId: 'i-1',
      followUps: [{ topic: 'send the deck', dueAt: null }],
    });
    expect(deleteWhere).toHaveBeenCalled();
    expect(insertValues).toHaveBeenCalled();
  });

  it('createManyForInteraction is a no-op when followUps array is empty', async () => {
    await createManyForInteraction({
      userId: 'u-1',
      contactId: 'c-1',
      interactionId: 'i-1',
      followUps: [],
    });
    expect(insertValues).not.toHaveBeenCalled();
  });

  it('listForContact selects with contact_id filter and orderBy', async () => {
    await listForContact('c-1');
    expect(selectFrom).toHaveBeenCalled();
    expect(selectWhere).toHaveBeenCalled();
    expect(selectOrderBy).toHaveBeenCalled();
  });

  it('updateFollowUp passes through topic, dueAt, status', async () => {
    const result = await updateFollowUp('fu-1', { topic: 'new topic', status: 'done' });
    expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({
      topic: 'new topic',
      status: 'done',
    }));
    expect(result.id).toBe('fu-1');
  });

  it('updateFollowUp sets doneAt when status flips to done', async () => {
    await updateFollowUp('fu-1', { status: 'done' });
    const call = updateSet.mock.calls[0][0];
    expect(call.status).toBe('done');
    expect(call.doneAt).toBeInstanceOf(Date);
  });

  it('updateFollowUp clears doneAt when status flips back to pending', async () => {
    await updateFollowUp('fu-1', { status: 'pending' });
    const call = updateSet.mock.calls[0][0];
    expect(call.status).toBe('pending');
    expect(call.doneAt).toBeNull();
  });

  it('deleteFollowUp deletes by id', async () => {
    await deleteFollowUp('fu-1');
    expect(deleteWhere).toHaveBeenCalled();
  });
});
```

Run: `cd /Users/timnan/Documents/GitHub/connectyall && npx vitest run src/services/FollowUpsService.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 2.2: Implement the service**

Create `src/services/FollowUpsService.ts`:

```ts
import { and, asc, eq } from 'drizzle-orm';
import { db } from '../lib/db/client';
import { followUps, type FollowUp } from '../lib/db/schema';

export async function createFollowUp(input: {
  userId: string;
  contactId: string;
  interactionId?: string;
  topic: string;
  dueAt: Date | null;
}): Promise<FollowUp> {
  const [row] = await db()
    .insert(followUps)
    .values({
      userId: input.userId,
      contactId: input.contactId,
      interactionId: input.interactionId ?? null,
      topic: input.topic,
      dueAt: input.dueAt,
      status: 'pending',
    })
    .returning();
  return row;
}

export async function createManyForInteraction(input: {
  userId: string;
  contactId: string;
  interactionId: string;
  followUps: Array<{ topic: string; dueAt: Date | null }>;
}): Promise<void> {
  if (input.followUps.length === 0) return;
  // Idempotency: if the janitor re-runs processCapture for this interaction,
  // we don't want duplicate follow-ups. Delete any existing rows for this
  // interaction before inserting the new set.
  await db().delete(followUps).where(eq(followUps.interactionId, input.interactionId));
  await db().insert(followUps).values(
    input.followUps.map((fu) => ({
      userId: input.userId,
      contactId: input.contactId,
      interactionId: input.interactionId,
      topic: fu.topic,
      dueAt: fu.dueAt,
      status: 'pending' as const,
    })),
  );
}

export async function listForContact(contactId: string): Promise<FollowUp[]> {
  return db()
    .select()
    .from(followUps)
    .where(eq(followUps.contactId, contactId))
    .orderBy(asc(followUps.status), asc(followUps.dueAt), asc(followUps.createdAt));
}

export async function updateFollowUp(
  id: string,
  updates: { topic?: string; dueAt?: Date | null; status?: 'pending' | 'done' },
): Promise<FollowUp> {
  const set: Record<string, unknown> = {};
  if (updates.topic !== undefined) set.topic = updates.topic;
  if (updates.dueAt !== undefined) set.dueAt = updates.dueAt;
  if (updates.status !== undefined) {
    set.status = updates.status;
    set.doneAt = updates.status === 'done' ? new Date() : null;
  }
  const [row] = await db().update(followUps).set(set).where(eq(followUps.id, id)).returning();
  return row;
}

export async function deleteFollowUp(id: string): Promise<void> {
  await db().delete(followUps).where(eq(followUps.id, id));
}
```

Note the unused `and` import — keep it for the next task (due-today query) so we don't churn imports across commits.

- [ ] **Step 2.3: Verify**

Run: `cd /Users/timnan/Documents/GitHub/connectyall && npx vitest run src/services/FollowUpsService.test.ts`
Expected: PASS (8 tests).

Run: `cd /Users/timnan/Documents/GitHub/connectyall && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 2.4: Commit**

```bash
cd /Users/timnan/Documents/GitHub/connectyall
git add src/services/FollowUpsService.ts src/services/FollowUpsService.test.ts
git commit -m "follow-ups: service with CRUD + idempotent interaction sync"
```

---

## Task 3: Add due-today query helpers to FollowUpsService

**Files:**
- Modify: `src/services/FollowUpsService.ts`
- Modify: `src/services/FollowUpsService.test.ts`

- [ ] **Step 3.1: Write the failing tests**

Append to `src/services/FollowUpsService.test.ts`:

```ts
import { countDueTodayForUser, listDueTodayForUser } from './FollowUpsService';

describe('FollowUpsService — due-today', () => {
  beforeEach(() => {
    selectOrderBy.mockResolvedValue([
      { id: 'fu-1', topic: 't1', contactName: 'Sarah', contactId: 'c-1' },
      { id: 'fu-2', topic: 't2', contactName: 'Marcus', contactId: 'c-2' },
    ]);
  });

  it('countDueTodayForUser runs a SELECT scoped to user + pending + due-by-end-of-today', async () => {
    selectOrderBy.mockResolvedValueOnce([{ id: 'fu-1' }, { id: 'fu-2' }]);
    const count = await countDueTodayForUser('u-1', 'America/Vancouver');
    expect(count).toBe(2);
    expect(selectFrom).toHaveBeenCalled();
  });

  it('listDueTodayForUser returns rows with contact info attached', async () => {
    const rows = await listDueTodayForUser('u-1', 'America/Vancouver');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveProperty('contactName');
  });
});
```

Run: `cd /Users/timnan/Documents/GitHub/connectyall && npx vitest run src/services/FollowUpsService.test.ts`
Expected: FAIL — helpers don't exist.

- [ ] **Step 3.2: Add the helpers**

Append to `src/services/FollowUpsService.ts`:

```ts
import { contacts } from '../lib/db/schema';
import { lte, sql } from 'drizzle-orm';

// "End of today" in the user's local timezone, expressed as a UTC timestamp.
function endOfTodayUtc(timezone: string): Date {
  const now = new Date();
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(now);
    const y = parseInt(parts.find(p => p.type === 'year')!.value, 10);
    const m = parseInt(parts.find(p => p.type === 'month')!.value, 10) - 1;
    const d = parseInt(parts.find(p => p.type === 'day')!.value, 10);
    // 23:59:59 local of that ymd
    const localEnd = Date.UTC(y, m, d, 23, 59, 59);
    // Resolve local-wall-time → UTC by checking what `formatToParts(localEnd as utc)`
    // reads in the target zone, then shifting.
    const probe = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(new Date(localEnd));
    const hh = parseInt(probe.find(p => p.type === 'hour')!.value, 10);
    const mm = parseInt(probe.find(p => p.type === 'minute')!.value, 10);
    const offset = (23 * 60 + 59) - (hh * 60 + mm);
    return new Date(localEnd + offset * 60_000);
  } catch {
    // Bad timezone → end of UTC today
    const utc = new Date();
    utc.setUTCHours(23, 59, 59, 999);
    return utc;
  }
}

export async function countDueTodayForUser(
  userId: string,
  timezone: string,
): Promise<number> {
  const cutoff = endOfTodayUtc(timezone);
  const rows = await db()
    .select({ id: followUps.id })
    .from(followUps)
    .where(and(
      eq(followUps.userId, userId),
      eq(followUps.status, 'pending'),
      lte(followUps.dueAt, cutoff),
    ))
    .orderBy(asc(followUps.dueAt));
  return rows.length;
}

export async function listDueTodayForUser(
  userId: string,
  timezone: string,
): Promise<Array<FollowUp & { contactName: string }>> {
  const cutoff = endOfTodayUtc(timezone);
  const rows = await db()
    .select({
      id: followUps.id,
      userId: followUps.userId,
      contactId: followUps.contactId,
      interactionId: followUps.interactionId,
      topic: followUps.topic,
      dueAt: followUps.dueAt,
      status: followUps.status,
      createdAt: followUps.createdAt,
      doneAt: followUps.doneAt,
      contactName: contacts.name,
    })
    .from(followUps)
    .where(and(
      eq(followUps.userId, userId),
      eq(followUps.status, 'pending'),
      lte(followUps.dueAt, cutoff),
    ))
    .orderBy(asc(followUps.dueAt));
  // The join is implicit via the select; add it inline:
  return rows as unknown as Array<FollowUp & { contactName: string }>;
}
```

Note: the `listDueTodayForUser` needs an explicit `innerJoin` with contacts. Update the implementation to add `.innerJoin(contacts, eq(contacts.id, followUps.contactId))` between `.from(followUps)` and `.where(...)`.

Final version of `listDueTodayForUser`:

```ts
export async function listDueTodayForUser(
  userId: string,
  timezone: string,
): Promise<Array<FollowUp & { contactName: string }>> {
  const cutoff = endOfTodayUtc(timezone);
  const rows = await db()
    .select({
      id: followUps.id,
      userId: followUps.userId,
      contactId: followUps.contactId,
      interactionId: followUps.interactionId,
      topic: followUps.topic,
      dueAt: followUps.dueAt,
      status: followUps.status,
      createdAt: followUps.createdAt,
      doneAt: followUps.doneAt,
      contactName: contacts.name,
    })
    .from(followUps)
    .innerJoin(contacts, eq(contacts.id, followUps.contactId))
    .where(and(
      eq(followUps.userId, userId),
      eq(followUps.status, 'pending'),
      lte(followUps.dueAt, cutoff),
    ))
    .orderBy(asc(followUps.dueAt));
  return rows;
}
```

- [ ] **Step 3.3: Verify**

Run: `cd /Users/timnan/Documents/GitHub/connectyall && npx vitest run src/services/FollowUpsService.test.ts`
Expected: PASS (10 tests total).

Run: `cd /Users/timnan/Documents/GitHub/connectyall && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3.4: Commit**

```bash
cd /Users/timnan/Documents/GitHub/connectyall
git add src/services/FollowUpsService.ts src/services/FollowUpsService.test.ts
git commit -m "follow-ups: due-today queries (count + list with contact name)"
```

---

## Task 4: Extend ExtractionService — prompt + Zod schema

**Files:**
- Modify: `src/services/ExtractionService.ts`
- Modify: `src/services/ExtractionService.test.ts`

- [ ] **Step 4.1: Update the Zod schema**

In `src/services/ExtractionService.ts`, find the `ExtractionSchema` (or `ExtractedContact` schema — the structure that the LLM returns per contact). Locate the existing `user_commitments` field. Add a new `follow_ups` field on the same contact object:

```ts
follow_ups: z.array(z.object({
  topic: z.string(),
  relative_due: z.string().nullable(),
})).optional().default([]),
```

Also extend the `ExtractedContact` type export to include `follow_ups: Array<{ topic: string; relative_due: string | null }>`. (Drizzle/Zod inference will pick this up automatically if you use `z.infer`.)

- [ ] **Step 4.2: Update the system prompt**

In `src/services/ExtractionService.ts`, the `SYSTEM_PROMPT` constant has named sections like "RECAP RULES", "LINKS EXTRACTION", "PHONE EXTRACTION". Add a new section just after the recap rules block:

```
FOLLOW-UPS EXTRACTION (the "follow_ups" field per contact):

Capture concrete commitments THE SPEAKER made about future actions toward this contact. Each follow_up has:
  - topic: a short phrase describing what they said they'd do, in the speaker's framing
  - relative_due: a relative-date phrase as spoken ("tomorrow", "in 3 days", "next week", "by Friday"), or null if no time was mentioned

Examples:
- "Need to follow up with her in 3 days about the role"
  → { "topic": "the role", "relative_due": "in 3 days" }
- "Send her the deck tomorrow"
  → { "topic": "send her the deck", "relative_due": "tomorrow" }
- "I should circle back eventually"
  → { "topic": "circle back", "relative_due": null }
- "Let me intro him to my designer friend next week"
  → { "topic": "intro him to my designer friend", "relative_due": "next week" }

DO NOT include commitments the OTHER person made:
- "She'll send me the deck" → NOT a follow-up (that's her commitment, goes in their_commitments)
- "He's going to share the doc" → NOT a follow-up

Keep topics short — 3 to 8 words is the sweet spot. They render in a tight UI row.

If no follow-ups were mentioned, return an empty array.
```

- [ ] **Step 4.3: Add a test confirming the new field comes through**

Append to `src/services/ExtractionService.test.ts`:

```ts
describe('extract — follow_ups field', () => {
  beforeEach(() => generateObjectMock.mockReset());

  it('passes through follow_ups from the LLM response', async () => {
    generateObjectMock.mockResolvedValueOnce({
      object: {
        contacts: [{
          name: 'Sarah Chen', role: 'PM', company: 'Acme',
          emails: [], phones: [], preferred_channel: null,
          links: {}, context: 'met at AI breakfast',
          recap: 'her staff PM role at Acme',
          user_commitments: ['follow up about the role'],
          their_commitments: [],
          follow_ups: [
            { topic: 'the staff PM role', relative_due: 'in 3 days' },
            { topic: 'send the deck', relative_due: 'tomorrow' },
          ],
        }],
        was_live_recording: false,
      },
    });
    const result = await extract({ transcript: 'hi', selfIntro: '' });
    expect(result.contacts[0].follow_ups).toHaveLength(2);
    expect(result.contacts[0].follow_ups[0].topic).toBe('the staff PM role');
  });

  it('defaults to empty array when LLM omits the field', async () => {
    generateObjectMock.mockResolvedValueOnce({
      object: {
        contacts: [{
          name: 'Sarah Chen', role: null, company: null,
          emails: [], phones: [], preferred_channel: null,
          links: {}, context: 'met somewhere', recap: 'something',
          user_commitments: [], their_commitments: [],
          // follow_ups deliberately omitted
        }],
        was_live_recording: false,
      },
    });
    const result = await extract({ transcript: 'hi', selfIntro: '' });
    expect(result.contacts[0].follow_ups).toEqual([]);
  });
});
```

- [ ] **Step 4.4: Verify**

Run: `cd /Users/timnan/Documents/GitHub/connectyall && npx vitest run src/services/ExtractionService.test.ts`
Expected: PASS (existing + 2 new tests).

Run: `cd /Users/timnan/Documents/GitHub/connectyall && npx vitest run`
Expected: full suite green.

- [ ] **Step 4.5: Commit**

```bash
cd /Users/timnan/Documents/GitHub/connectyall
git add src/services/ExtractionService.ts src/services/ExtractionService.test.ts
git commit -m "extraction: emit follow_ups per contact with relative_due"
```

---

## Task 5: Wire follow-ups into the capture pipeline

**Files:**
- Modify: `src/services/CaptureService.ts`
- Modify: `src/services/CaptureService.test.ts`

- [ ] **Step 5.1: Write the failing test**

Append to `src/services/CaptureService.test.ts` (inside the existing main describe block, after the happy-path test):

```ts
it('creates follow-ups for the first contact after markReady', async () => {
  const createManyMock = vi.fn().mockResolvedValue(undefined);
  vi.doMock('./FollowUpsService', () => ({
    createManyForInteraction: createManyMock,
  }));
  vi.resetModules();
  const { processCapture: processCaptureFresh } = await import('./CaptureService');

  // Set up mocks for a normal-happy-path run with one follow-up extracted.
  countMock.mockResolvedValueOnce([{ count: 0 }]);
  getByIdMock.mockResolvedValueOnce({
    id: 'u-1', displayName: 'Tim', tagline: null,
    telegramUsername: null, photoR2Url: null, socials: {}, selfIntro: null,
    timezone: 'America/Vancouver',
  });
  transcribeMock.mockResolvedValueOnce('met sarah and need to follow up in 3 days');
  extractMock.mockResolvedValueOnce({
    contacts: [{
      name: 'Sarah Chen', role: null, company: null,
      emails: [], phones: [], preferred_channel: null,
      links: {}, context: 'met',
      recap: 'something',
      user_commitments: [], their_commitments: [],
      follow_ups: [{ topic: 'the role', relative_due: 'in 3 days' }],
    }],
    was_live_recording: false,
  });
  findByNameAndCompanyMock.mockResolvedValueOnce(null);
  createContactMock.mockResolvedValueOnce({ id: 'c-1' });

  await processCaptureFresh({
    userId: 'u-1',
    audioR2Key: 'k',
    mimeType: 'audio/webm',
    interactionId: 'i-1',
  });

  expect(createManyMock).toHaveBeenCalledWith(expect.objectContaining({
    userId: 'u-1',
    contactId: 'c-1',
    interactionId: 'i-1',
    followUps: expect.arrayContaining([
      expect.objectContaining({ topic: 'the role' }),
    ]),
  }));
});
```

Run: `cd /Users/timnan/Documents/GitHub/connectyall && npx vitest run src/services/CaptureService.test.ts`
Expected: FAIL — pipeline doesn't call `createManyForInteraction` yet.

- [ ] **Step 5.2: Add the hook to `processCapture`**

In `src/services/CaptureService.ts`, add imports at the top alongside the existing service imports:

```ts
import { createManyForInteraction as createManyFollowUps } from './FollowUpsService';
import { resolveRelativeDate } from '../lib/follow-up-dates';
```

Inside `processCapture`, after the `markReady` for the first contact and `uploadBytes` for its card, add:

```ts
  // Persist any follow-ups the LLM extracted for the first contact.
  const followUpsForFirst = (firstContact.follow_ups ?? [])
    .map((fu) => ({
      topic: fu.topic.trim(),
      dueAt: resolveRelativeDate(fu.relative_due, interactionRow?.occurredAt ?? new Date(), profile.timezone),
    }))
    .filter((fu) => fu.topic.length > 0);
  if (followUpsForFirst.length > 0) {
    await createManyFollowUps({
      userId: input.userId,
      contactId: firstResult.id,
      interactionId: input.interactionId,
      followUps: followUpsForFirst,
    });
  }
```

Where does `interactionRow?.occurredAt` come from? Currently `processCapture` doesn't read the interaction row before processing. Cheaper alternative: use `new Date()` as the anchor (the recording finished moments ago — close enough for day-resolution). Replace `interactionRow?.occurredAt ?? new Date()` with just `new Date()`:

```ts
      dueAt: resolveRelativeDate(fu.relative_due, new Date(), profile.timezone),
```

For the secondary contacts loop (the `for (const c of restContacts)` block), add the same logic inside the loop, AFTER `markReady(extraId, ...)`:

```ts
    const followUpsForExtra = (c.follow_ups ?? [])
      .map((fu) => ({
        topic: fu.topic.trim(),
        dueAt: resolveRelativeDate(fu.relative_due, new Date(), profile.timezone),
      }))
      .filter((fu) => fu.topic.length > 0);
    if (followUpsForExtra.length > 0) {
      await createManyFollowUps({
        userId: input.userId,
        contactId: contact.id,
        interactionId: extraId,
        followUps: followUpsForExtra,
      });
    }
```

- [ ] **Step 5.3: Verify**

Run: `cd /Users/timnan/Documents/GitHub/connectyall && npx vitest run src/services/CaptureService.test.ts`
Expected: PASS.

Run: `cd /Users/timnan/Documents/GitHub/connectyall && npx vitest run`
Expected: full suite green.

- [ ] **Step 5.4: Commit**

```bash
cd /Users/timnan/Documents/GitHub/connectyall
git add src/services/CaptureService.ts src/services/CaptureService.test.ts
git commit -m "capture: persist extracted follow-ups after markReady"
```

---

## Task 6: API routes — POST + PUT + DELETE

**Files:**
- Create: `src/app/api/follow-ups/route.ts`
- Create: `src/app/api/follow-ups/[id]/route.ts`

- [ ] **Step 6.1: Implement POST**

Create `src/app/api/follow-ups/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { getServerSession } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { contacts } from '@/lib/db/schema';
import { createFollowUp } from '@/services/FollowUpsService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  contactId: z.string().uuid(),
  topic: z.string().min(1).max(280),
  dueAt: z.string().datetime().nullable().optional(),
});

export async function POST(req: Request) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json();
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  // Verify the contact belongs to this user.
  const [contact] = await db()
    .select({ userId: contacts.userId })
    .from(contacts)
    .where(eq(contacts.id, parsed.data.contactId))
    .limit(1);
  if (!contact) return NextResponse.json({ error: 'contact not found' }, { status: 404 });
  if (contact.userId !== session.user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const row = await createFollowUp({
    userId: session.user.id,
    contactId: parsed.data.contactId,
    topic: parsed.data.topic,
    dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt) : null,
  });
  return NextResponse.json({ followUp: row });
}
```

- [ ] **Step 6.2: Implement PUT + DELETE**

Create `src/app/api/follow-ups/[id]/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { getServerSession } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { followUps } from '@/lib/db/schema';
import { updateFollowUp, deleteFollowUp } from '@/services/FollowUpsService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PutBody = z.object({
  topic: z.string().min(1).max(280).optional(),
  dueAt: z.string().datetime().nullable().optional(),
  status: z.enum(['pending', 'done']).optional(),
});

async function authorizeOwn(id: string, sessionUserId: string): Promise<boolean> {
  const [row] = await db()
    .select({ userId: followUps.userId })
    .from(followUps)
    .where(eq(followUps.id, id))
    .limit(1);
  if (!row) return false;
  return row.userId === sessionUserId;
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id } = await params;
  if (!(await authorizeOwn(id, session.user.id))) {
    return NextResponse.json({ error: 'not found or forbidden' }, { status: 404 });
  }

  const body = await req.json();
  const parsed = PutBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const row = await updateFollowUp(id, {
    topic: parsed.data.topic,
    dueAt: parsed.data.dueAt !== undefined
      ? (parsed.data.dueAt === null ? null : new Date(parsed.data.dueAt))
      : undefined,
    status: parsed.data.status,
  });
  return NextResponse.json({ followUp: row });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id } = await params;
  if (!(await authorizeOwn(id, session.user.id))) {
    return NextResponse.json({ error: 'not found or forbidden' }, { status: 404 });
  }

  await deleteFollowUp(id);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 6.3: Verify**

Run: `cd /Users/timnan/Documents/GitHub/connectyall && npx tsc --noEmit`
Expected: clean.

Run: `cd /Users/timnan/Documents/GitHub/connectyall && npx vitest run`
Expected: full suite green (no route tests yet, but nothing breaks).

- [ ] **Step 6.4: Commit**

```bash
cd /Users/timnan/Documents/GitHub/connectyall
git add src/app/api/follow-ups/route.ts src/app/api/follow-ups/\[id\]/route.ts
git commit -m "api: follow-ups POST/PUT/DELETE routes"
```

---

## Task 7: Extend connection-detail GET API with `followUps`

**Files:**
- Modify: `src/app/api/connections/[id]/route.ts`

- [ ] **Step 7.1: Add `followUps` to the response**

In `src/app/api/connections/[id]/route.ts`, near the top imports:

```ts
import { listForContact } from '@/services/FollowUpsService';
```

Inside the GET handler, after the `previous` and `latestRecap` computation but before the `NextResponse.json({...})`:

```ts
  const followUps = await listForContact(contactId);
```

Add `followUps` to the response payload:

```ts
  return NextResponse.json({
    contact: { /* unchanged */ },
    latestInteractionId: latest?.id ?? null,
    latestRecap,
    previousMeetings: previous,
    shareUrl: latest ? `${env().BASE_URL}/c/${latest.id}` : null,
    followUps,
  });
```

- [ ] **Step 7.2: Verify**

Run: `cd /Users/timnan/Documents/GitHub/connectyall && npx tsc --noEmit`
Expected: clean.

Run: `cd /Users/timnan/Documents/GitHub/connectyall && npx vitest run`
Expected: full suite green.

- [ ] **Step 7.3: Commit**

```bash
cd /Users/timnan/Documents/GitHub/connectyall
git add src/app/api/connections/\[id\]/route.ts
git commit -m "api: connection detail includes followUps[]"
```

---

## Task 8: Extend connections-list GET API with due-today metadata

**Files:**
- Modify: `src/app/api/connections/route.ts`

- [ ] **Step 8.1: Update the response shape**

In `src/app/api/connections/route.ts`, add imports:

```ts
import { countDueTodayForUser } from '@/services/FollowUpsService';
import { followUps as followUpsTable } from '@/lib/db/schema';
import { lte, count } from 'drizzle-orm';
```

Inside the GET handler, after the existing `rows = await db()...` query:

```ts
  // Compute "has a pending follow-up due today" per contact, in one extra query
  // rather than N+1.
  const tz = await db()
    .select({ timezone: users.timezone })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  const userTimezone = tz[0]?.timezone ?? 'UTC';

  // End-of-today in user's local time, as a UTC timestamp.
  // Inline the same helper logic from FollowUpsService.endOfTodayUtc to avoid export churn:
  // (or — if you'd rather — export `endOfTodayUtc` from FollowUpsService and import it here)
  const { endOfTodayUtc } = await import('@/services/FollowUpsService');
  const cutoff = endOfTodayUtc(userTimezone);

  const dueRows = await db()
    .select({ contactId: followUpsTable.contactId })
    .from(followUpsTable)
    .where(and(
      eq(followUpsTable.userId, session.user.id),
      eq(followUpsTable.status, 'pending'),
      lte(followUpsTable.dueAt, cutoff),
    ));
  const dueContactIds = new Set(dueRows.map((r) => r.contactId));
  const dueTodayCount = dueRows.length;

  const initialConnections = rows.map((r) => ({
    ...r,
    preferredChannel: r.preferredChannel as ChannelKind | null,
    lastTouchedAt: r.lastTouchedAt.toISOString(),
    hasDueTodayFollowUp: dueContactIds.has(r.contactId),
  }));

  return NextResponse.json({ connections: initialConnections, dueTodayCount });
```

Note: the existing implementation returned a bare array `[]`. The new shape is `{ connections: [...], dueTodayCount }`. **This is a breaking change that the client picks up in Task 12.** All in-flight.

- [ ] **Step 8.2: Export `endOfTodayUtc` from FollowUpsService**

In `src/services/FollowUpsService.ts`, change:

```ts
function endOfTodayUtc(timezone: string): Date {
```

to:

```ts
export function endOfTodayUtc(timezone: string): Date {
```

- [ ] **Step 8.3: Verify**

Run: `cd /Users/timnan/Documents/GitHub/connectyall && npx tsc --noEmit`
Expected: clean.

Run: `cd /Users/timnan/Documents/GitHub/connectyall && npx vitest run`
Expected: full suite green.

- [ ] **Step 8.4: Commit**

```bash
cd /Users/timnan/Documents/GitHub/connectyall
git add src/app/api/connections/route.ts src/services/FollowUpsService.ts
git commit -m "api: connections list returns hasDueTodayFollowUp + dueTodayCount"
```

---

## Task 9: Extract swipe-to-reveal helper

**Files:**
- Create: `src/lib/swipe-to-reveal.ts`
- Modify: `src/app/app/connections/connections-list.tsx` (just to import the helper)

- [ ] **Step 9.1: Read the existing gesture handler**

In `src/app/app/connections/connections-list.tsx`, locate the swipe-left handler logic (it's the touchstart/touchmove/touchend block on the row, used to reveal the red delete slab on connection rows). Copy the entire gesture logic into a hook.

- [ ] **Step 9.2: Create the helper**

Create `src/lib/swipe-to-reveal.ts`:

```ts
'use client';
import { useRef, useState, useCallback } from 'react';

// Single-handed swipe-left gesture for revealing a hidden right-side action
// slab. Returns the offset state + touch handlers to spread onto the swipeable
// element. Caller renders the slab themselves (e.g. a red DELETE button) at
// the same position they want revealed.
//
// Usage:
//   const { offset, handlers, reset } = useSwipeToReveal({ revealWidth: 86 });
//   <div style={{ transform: `translateX(${offset}px)` }} {...handlers}>...</div>

export function useSwipeToReveal(opts: { revealWidth: number }) {
  const [offset, setOffset] = useState(0);
  const startXRef = useRef<number | null>(null);
  const startOffsetRef = useRef(0);

  const handlers = {
    onTouchStart(e: React.TouchEvent) {
      startXRef.current = e.touches[0].clientX;
      startOffsetRef.current = offset;
    },
    onTouchMove(e: React.TouchEvent) {
      if (startXRef.current == null) return;
      const dx = e.touches[0].clientX - startXRef.current;
      const next = Math.min(0, Math.max(-opts.revealWidth, startOffsetRef.current + dx));
      setOffset(next);
    },
    onTouchEnd() {
      // Snap to either fully revealed or fully closed based on the midpoint.
      setOffset((current) => (current < -opts.revealWidth / 2 ? -opts.revealWidth : 0));
      startXRef.current = null;
    },
  };

  const reset = useCallback(() => setOffset(0), []);

  return { offset, handlers, reset, isRevealed: offset <= -opts.revealWidth };
}
```

- [ ] **Step 9.3: Verify**

Run: `cd /Users/timnan/Documents/GitHub/connectyall && npx tsc --noEmit`
Expected: clean.

Run: `cd /Users/timnan/Documents/GitHub/connectyall && npx vitest run`
Expected: full suite green.

- [ ] **Step 9.4: Commit**

```bash
cd /Users/timnan/Documents/GitHub/connectyall
git add src/lib/swipe-to-reveal.ts
git commit -m "lib: useSwipeToReveal hook (extracted from connections-list)"
```

---

## Task 10: `FollowUpModal` shared component

**Files:**
- Create: `src/app/app/connections/[id]/follow-up-modal.tsx`

- [ ] **Step 10.1: Implement the modal**

Create `src/app/app/connections/[id]/follow-up-modal.tsx`:

```tsx
'use client';
import { useState, useEffect } from 'react';
import type { FollowUp } from '@/lib/db/schema';

type Mode = 'edit' | 'add';

type Props = {
  mode: Mode;
  contactName: string;
  initial?: FollowUp;
  onClose: () => void;
  onSave: (input: { topic: string; dueAt: Date | null }) => Promise<void>;
  onMarkDone?: () => Promise<void>;
};

function addDays(d: Date, n: number): Date {
  const next = new Date(d);
  next.setUTCDate(next.getUTCDate() + n);
  return next;
}

function noonOf(d: Date): Date {
  const next = new Date(d);
  next.setUTCHours(12, 0, 0, 0);
  return next;
}

function formatDateDisplay(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase();
}

function formatDateInputValue(d: Date): string {
  // <input type="date"> expects YYYY-MM-DD in local time
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

const QUICK_PICKS: Array<{ label: string; days: number | null }> = [
  { label: 'TOMORROW', days: 1 },
  { label: 'IN 3 DAYS', days: 3 },
  { label: 'NEXT WEEK', days: 7 },
  { label: 'NO DATE', days: null },
];

export function FollowUpModal({ mode, contactName, initial, onClose, onSave, onMarkDone }: Props) {
  const [topic, setTopic] = useState(initial?.topic ?? '');
  const [dueAt, setDueAt] = useState<Date | null>(
    initial?.dueAt ? new Date(initial.dueAt) : (mode === 'add' ? noonOf(addDays(new Date(), 1)) : null),
  );
  const [showCustom, setShowCustom] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Close on escape
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function pickQuick(days: number | null) {
    if (days === null) {
      setDueAt(null);
    } else {
      setDueAt(noonOf(addDays(new Date(), days)));
    }
    setShowCustom(false);
  }

  async function handleSave() {
    if (!topic.trim()) return;
    setSaving(true);
    await onSave({ topic: topic.trim(), dueAt });
    setSaving(false);
    onClose();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:p-6 bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-t-3xl rounded-b-2xl shadow-xl w-full max-w-sm p-5 pb-4 space-y-3">
        <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-muted font-bold">
          {mode === 'edit' ? 'EDIT FOLLOW-UP' : 'NEW FOLLOW-UP'}
        </div>
        <h2 className="text-xl font-extrabold text-neutral-950 leading-tight">For {contactName}</h2>

        <div>
          <div className="font-mono text-[9.5px] tracking-[0.18em] uppercase text-muted font-bold mb-1.5">TOPIC</div>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="What do you want to circle back about?"
            className="w-full px-3 py-2 rounded-lg bg-cream border border-line text-[14px] text-neutral-950 placeholder:text-muted"
            autoFocus
          />
        </div>

        <div>
          <div className="font-mono text-[9.5px] tracking-[0.18em] uppercase text-muted font-bold mb-1.5">DUE DATE</div>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {QUICK_PICKS.map((p) => {
              const isSelected =
                (p.days === null && dueAt === null) ||
                (p.days !== null && dueAt !== null && Math.round((dueAt.getTime() - new Date().getTime()) / 86_400_000) === p.days - 1);
              return (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => pickQuick(p.days)}
                  className={`font-mono text-[9.5px] tracking-[0.14em] font-bold uppercase px-2.5 py-1.5 rounded-full border ${
                    isSelected
                      ? 'bg-[#E9DDFF] text-brand border-[#E9DDFF]'
                      : 'bg-cream text-neutral-950 border-line'
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
          {dueAt !== null && (
            <div className="flex items-center gap-2 bg-cream border border-line rounded-lg px-3 py-2">
              <span className="font-mono text-[12px] tracking-[0.12em] font-bold uppercase text-neutral-950">
                {formatDateDisplay(dueAt)}
              </span>
              <div className="flex-1" />
              <button
                type="button"
                onClick={() => setShowCustom((v) => !v)}
                className="font-mono text-[9.5px] tracking-[0.14em] font-bold uppercase text-brand"
              >
                CUSTOM {showCustom ? '▴' : '▾'}
              </button>
            </div>
          )}
          {showCustom && dueAt !== null && (
            <input
              type="date"
              value={formatDateInputValue(dueAt)}
              onChange={(e) => {
                const [y, m, d] = e.target.value.split('-').map(Number);
                if (y && m && d) setDueAt(new Date(y, m - 1, d, 12, 0, 0));
              }}
              className="w-full mt-2 px-3 py-2 rounded-lg bg-cream border border-line text-[14px]"
            />
          )}
        </div>

        {mode === 'edit' && onMarkDone && (
          <div className="flex items-center justify-center pt-3 mt-3 border-t border-line">
            <button
              type="button"
              onClick={async () => { await onMarkDone(); onClose(); }}
              className="font-mono text-[10px] tracking-[0.18em] uppercase text-brand font-bold"
            >
              ✓ MARK AS DONE
            </button>
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-3 rounded-full bg-white border-[1.5px] border-neutral-950 text-neutral-950 font-mono text-[11px] tracking-[0.18em] font-bold uppercase"
          >
            CANCEL
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !topic.trim()}
            className="flex-1 px-4 py-3 rounded-full bg-brand text-white font-mono text-[11px] tracking-[0.18em] font-bold uppercase disabled:opacity-50 shadow-[0_16px_36px_rgba(124,92,255,0.32),0_2px_6px_rgba(124,92,255,0.18)]"
          >
            {mode === 'edit' ? 'SAVE' : 'ADD'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 10.2: Verify**

Run: `cd /Users/timnan/Documents/GitHub/connectyall && npx tsc --noEmit`
Expected: clean.

Run: `cd /Users/timnan/Documents/GitHub/connectyall && npx vitest run`
Expected: full suite green.

- [ ] **Step 10.3: Commit**

```bash
cd /Users/timnan/Documents/GitHub/connectyall
git add src/app/app/connections/\[id\]/follow-up-modal.tsx
git commit -m "follow-ups: shared FollowUpModal (edit + add)"
```

---

## Task 11: `FollowUpsCard` component

**Files:**
- Create: `src/app/app/connections/[id]/follow-ups-card.tsx`

- [ ] **Step 11.1: Implement the card**

Create `src/app/app/connections/[id]/follow-ups-card.tsx`:

```tsx
'use client';
import { useState } from 'react';
import type { FollowUp } from '@/lib/db/schema';
import { FollowUpModal } from './follow-up-modal';
import { useSwipeToReveal } from '@/lib/swipe-to-reveal';

type Props = {
  contactId: string;
  contactName: string;
  initial: FollowUp[];
};

function statusMeta(fu: FollowUp): { tone: 'due-soon' | 'overdue' | 'no-date' | 'done'; label: string } {
  if (fu.status === 'done') {
    const doneDate = fu.doneAt ? new Date(fu.doneAt) : null;
    const label = doneDate
      ? `DONE · ${doneDate.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()}`
      : 'DONE';
    return { tone: 'done', label };
  }
  if (!fu.dueAt) return { tone: 'no-date', label: 'NO DATE' };
  const due = new Date(fu.dueAt);
  const now = new Date();
  const days = Math.round((due.getTime() - now.getTime()) / 86_400_000);
  if (days < 0) return { tone: 'overdue', label: `${Math.abs(days)}D OVERDUE` };
  if (days === 0) return { tone: 'due-soon', label: 'TODAY' };
  if (days === 1) return { tone: 'due-soon', label: 'TOMORROW' };
  if (days < 7) return { tone: 'due-soon', label: `IN ${days} DAYS` };
  return { tone: 'due-soon', label: due.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase() };
}

function FollowUpRow({
  fu,
  onEdit,
  onDelete,
}: {
  fu: FollowUp;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { offset, handlers, reset } = useSwipeToReveal({ revealWidth: 82 });
  const meta = statusMeta(fu);
  const isDone = fu.status === 'done';

  const toneClass =
    meta.tone === 'overdue' ? 'text-red-700' :
    meta.tone === 'due-soon' ? 'text-amber-700' :
    'text-muted';
  const dotClass =
    meta.tone === 'overdue' ? 'text-red-600' :
    meta.tone === 'due-soon' ? 'text-amber-500' :
    'text-neutral-400';

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onDelete}
        className="absolute right-0 top-0 bottom-0 w-[82px] bg-red-500 text-white font-mono text-[10px] tracking-[0.18em] font-bold uppercase rounded-r-md"
      >
        DELETE
      </button>
      <div
        style={{ transform: `translateX(${offset}px)`, transition: offset === 0 || offset === -82 ? 'transform 0.18s' : 'none' }}
        className="relative bg-white flex items-center gap-2.5 py-2.5"
        {...handlers}
      >
        <div className={`font-mono text-[9.5px] tracking-[0.14em] uppercase font-bold min-w-[86px] flex items-center gap-1 ${toneClass}`}>
          <span className={dotClass}>●</span>
          {meta.label}
        </div>
        <div
          className={`flex-1 text-[13.5px] leading-tight ${isDone ? 'line-through text-muted' : 'text-neutral-950'}`}
          onClick={() => { reset(); onEdit(); }}
        >
          {fu.topic}
        </div>
        <button
          type="button"
          onClick={() => { reset(); onEdit(); }}
          className="font-mono text-[10px] tracking-[0.14em] font-bold uppercase px-3 py-1.5 rounded-full bg-[#E9DDFF] text-brand"
        >
          EDIT
        </button>
      </div>
    </div>
  );
}

export function FollowUpsCard({ contactId, contactName, initial }: Props) {
  const [rows, setRows] = useState<FollowUp[]>(initial);
  const [editing, setEditing] = useState<FollowUp | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<FollowUp | null>(null);

  const hasOverdue = rows.some(r => r.status === 'pending' && r.dueAt && new Date(r.dueAt) < new Date());
  const hasDueSoon = rows.some(r => r.status === 'pending');
  const dotColor = hasOverdue ? 'text-red-500' : hasDueSoon ? 'text-amber-500' : 'text-neutral-400';

  async function save(input: { topic: string; dueAt: Date | null }) {
    if (editing) {
      const res = await fetch(`/api/follow-ups/${editing.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: input.topic, dueAt: input.dueAt?.toISOString() ?? null }),
      });
      const { followUp } = await res.json();
      setRows((rs) => rs.map(r => r.id === editing.id ? followUp : r));
    } else {
      const res = await fetch(`/api/follow-ups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId, topic: input.topic, dueAt: input.dueAt?.toISOString() ?? null }),
      });
      const { followUp } = await res.json();
      setRows((rs) => [...rs, followUp]);
    }
  }

  async function markDone() {
    if (!editing) return;
    const res = await fetch(`/api/follow-ups/${editing.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'done' }),
    });
    const { followUp } = await res.json();
    setRows((rs) => rs.map(r => r.id === editing.id ? followUp : r));
  }

  async function remove(fu: FollowUp) {
    await fetch(`/api/follow-ups/${fu.id}`, { method: 'DELETE' });
    setRows((rs) => rs.filter(r => r.id !== fu.id));
    setConfirmDelete(null);
  }

  const pending = rows.filter(r => r.status === 'pending');
  const done = rows.filter(r => r.status === 'done');

  return (
    <div className="rounded-3xl bg-surface border border-line shadow-[0_2px_8px_rgba(0,0,0,0.04)] px-4 py-3.5">
      <div className="font-mono text-[10.5px] tracking-[0.2em] uppercase text-muted font-bold flex items-center gap-1">
        <span className={dotColor}>●</span> FOLLOW-UPS
      </div>

      {rows.length === 0 && (
        <div className="text-center py-4">
          <div className="text-[14px] text-neutral-700 mb-1">Nothing on your list for {contactName}.</div>
          <div className="text-[12.5px] text-muted leading-snug mb-3">No commitments came up in your conversation.</div>
        </div>
      )}

      <div className="mt-1 divide-y divide-line/60">
        {pending.map(fu => (
          <FollowUpRow
            key={fu.id}
            fu={fu}
            onEdit={() => setEditing(fu)}
            onDelete={() => setConfirmDelete(fu)}
          />
        ))}
        {done.length > 0 && pending.length > 0 && <div className="h-1" />}
        {done.map(fu => (
          <div key={fu.id} style={{ opacity: 0.55 }}>
            <FollowUpRow
              fu={fu}
              onEdit={() => setEditing(fu)}
              onDelete={() => setConfirmDelete(fu)}
            />
          </div>
        ))}
      </div>

      <div className="mt-3 pt-3 border-t border-line">
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex items-center px-3.5 py-1.5 rounded-full bg-[#E9DDFF] text-brand font-mono text-[10.5px] tracking-[0.14em] font-bold uppercase"
        >
          + ADD FOLLOW-UP
        </button>
      </div>

      {(editing || adding) && (
        <FollowUpModal
          mode={editing ? 'edit' : 'add'}
          contactName={contactName}
          initial={editing ?? undefined}
          onClose={() => { setEditing(null); setAdding(false); }}
          onSave={save}
          onMarkDone={editing ? markDone : undefined}
        />
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/40">
          <div className="rounded-3xl bg-white shadow-xl max-w-sm w-full px-6 py-6 space-y-4">
            <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-muted font-bold">CONFIRM</div>
            <p className="text-lg font-extrabold">Delete this follow-up?</p>
            <p className="text-[14px] text-neutral-700"><em>&ldquo;{confirmDelete.topic}&rdquo;</em></p>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="flex-1 px-4 py-3 rounded-full bg-white border-[1.5px] border-neutral-950 text-neutral-950 font-mono text-[11px] tracking-[0.18em] font-bold uppercase"
              >
                CANCEL
              </button>
              <button
                type="button"
                onClick={() => remove(confirmDelete)}
                className="flex-1 px-4 py-3 rounded-full bg-red-500 text-white font-mono text-[11px] tracking-[0.18em] font-bold uppercase"
              >
                DELETE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 11.2: Verify**

Run: `cd /Users/timnan/Documents/GitHub/connectyall && npx tsc --noEmit`
Expected: clean.

Run: `cd /Users/timnan/Documents/GitHub/connectyall && npx vitest run`
Expected: full suite green.

- [ ] **Step 11.3: Commit**

```bash
cd /Users/timnan/Documents/GitHub/connectyall
git add src/app/app/connections/\[id\]/follow-ups-card.tsx
git commit -m "follow-ups: FollowUpsCard with swipe-to-delete + add chip"
```

---

## Task 12: Mount FollowUpsCard on the connection detail page

**Files:**
- Modify: `src/app/app/connections/[id]/page.tsx`

- [ ] **Step 12.1: Read the followUps from data + mount the card**

In `src/app/app/connections/[id]/page.tsx`:

1. Update the `Data` type at the top to include `followUps: FollowUp[]`:

```ts
import type { FollowUp } from '@/lib/db/schema';
// ...
type Data = {
  contact: { /* unchanged */ };
  latestInteractionId: string | null;
  latestRecap: string | null;
  previousMeetings: Array<{ interactionId: string; occurredAt: string; recap: string | null }>;
  shareUrl: string | null;
  followUps: FollowUp[];
};
```

2. Import the card:

```ts
import { FollowUpsCard } from './follow-ups-card';
```

3. In the render, find the existing `HOW TO REACH` section's closing `</div>` (the card wrapper). Insert the FollowUpsCard JSX immediately after it:

```tsx
<FollowUpsCard
  contactId={data.contact.id}
  contactName={contactName}
  initial={data.followUps ?? []}
/>
```

- [ ] **Step 12.2: Verify**

Run: `cd /Users/timnan/Documents/GitHub/connectyall && npx tsc --noEmit`
Expected: clean.

Run: `cd /Users/timnan/Documents/GitHub/connectyall && npx vitest run`
Expected: full suite green.

- [ ] **Step 12.3: Commit**

```bash
cd /Users/timnan/Documents/GitHub/connectyall
git add src/app/app/connections/\[id\]/page.tsx
git commit -m "connection-detail: mount FollowUpsCard below HOW TO REACH"
```

---

## Task 13: Connections list — amber pip + banner + count flip + filter

**Files:**
- Modify: `src/app/app/connections/page.tsx` (server component — adapt to new API shape)
- Modify: `src/app/app/connections/connections-list.tsx` (consume new fields)

- [ ] **Step 13.1: Update the server component**

In `src/app/app/connections/page.tsx`, the existing code queries the DB directly. Since Task 8 changed the API shape, this server component must also change.

Find the existing `rows.map(...)` that builds `initialConnections`. Below the rows query, add the due-today query inline (mirror what the API route does):

```ts
import { followUps } from '@/lib/db/schema';
import { and, lte, count, eq, desc, sql } from 'drizzle-orm';
import { endOfTodayUtc } from '@/services/FollowUpsService';
// ...

const userTimezone = session.user.timezone ?? 'UTC'; // or fetch from users table if not on session
const cutoff = endOfTodayUtc(userTimezone);

const dueRows = await db()
  .select({ contactId: followUps.contactId })
  .from(followUps)
  .where(and(
    eq(followUps.userId, session.user.id),
    eq(followUps.status, 'pending'),
    lte(followUps.dueAt, cutoff),
  ));
const dueContactIds = new Set(dueRows.map((r) => r.contactId));
const dueTodayCount = dueRows.length;

const initialConnections = rows.map((r) => ({
  ...r,
  preferredChannel: r.preferredChannel as ChannelKind | null,
  lastTouchedAt: r.lastTouchedAt.toISOString(),
  hasDueTodayFollowUp: dueContactIds.has(r.contactId),
}));

return <ConnectionsList initialConnections={initialConnections} dueTodayCount={dueTodayCount} />;
```

If `session.user.timezone` isn't directly available, add a quick query before:

```ts
const userRow = await db()
  .select({ timezone: users.timezone })
  .from(users)
  .where(eq(users.id, session.user.id))
  .limit(1);
const userTimezone = userRow[0]?.timezone ?? 'UTC';
```

- [ ] **Step 13.2: Consume `hasDueTodayFollowUp` + `dueTodayCount` in the client**

In `src/app/app/connections/connections-list.tsx`:

1. Update the `Connection` type to include `hasDueTodayFollowUp: boolean`.

2. Update the `ConnectionsList` props to accept `dueTodayCount: number`.

3. Above the contacts list (after the headline banner, before the search row), add the banner:

```tsx
{dueTodayCount > 0 && (
  <Link
    href="/app/connections?filter=due-today"
    className="mt-3 flex items-center justify-between bg-amber-100 border border-amber-200 rounded-xl px-3.5 py-2.5"
  >
    <div className="font-mono text-[11px] tracking-[0.16em] uppercase font-bold text-amber-800 flex items-center gap-1.5">
      <span className="text-amber-500 text-[14px]">●</span>
      {dueTodayCount} FOLLOW-UP{dueTodayCount === 1 ? '' : 'S'} DUE TODAY
    </div>
    <div className="font-mono text-[10px] tracking-[0.16em] uppercase text-brand font-bold">VIEW →</div>
  </Link>
)}
```

4. In the row JSX, add the amber pip next to the name when `c.hasDueTodayFollowUp` is true:

```tsx
<div className="text-sm font-bold text-neutral-950 flex items-center gap-1.5">
  {c.name}
  {c.hasDueTodayFollowUp && <span className="text-amber-500 text-[10px]">●</span>}
</div>
```

(Wire it in wherever the row's name is rendered — locate `{c.name}` and wrap it as shown.)

- [ ] **Step 13.3: Verify**

Run: `cd /Users/timnan/Documents/GitHub/connectyall && npx tsc --noEmit`
Expected: clean.

Run: `cd /Users/timnan/Documents/GitHub/connectyall && npx vitest run`
Expected: full suite green.

- [ ] **Step 13.4: Commit**

```bash
cd /Users/timnan/Documents/GitHub/connectyall
git add src/app/app/connections/page.tsx src/app/app/connections/connections-list.tsx
git commit -m "connections-list: due-today banner + amber pip per row"
```

---

## Task 14: Due-today filtered view (`?filter=due-today`)

**Files:**
- Modify: `src/app/app/connections/connections-list.tsx`

- [ ] **Step 14.1: Read the query param + filter rows**

In `connections-list.tsx`, add at the top of the component:

```ts
import { useSearchParams } from 'next/navigation';
// ...
const searchParams = useSearchParams();
const filterDueToday = searchParams.get('filter') === 'due-today';
```

After the existing `visible` `useMemo` block, wrap the filtering:

```ts
const finalVisible = useMemo(() => {
  if (!filterDueToday) return visible;
  return visible.filter(c => c.hasDueTodayFollowUp);
}, [visible, filterDueToday]);
```

Use `finalVisible` instead of `visible` in the JSX where the rows are rendered.

When `filterDueToday` is true:
- Replace the headline text from "Your connections" to "Due today."
- Hide the search row + sort pill
- Replace the banner with a back link: `← BACK TO ALL` linking to `/app/connections`

Add this conditional just inside the headline-card:

```tsx
<h1 className="text-4xl font-black leading-[1.02] tracking-tight">
  {filterDueToday ? (
    <>Due <span className="text-brand">today.</span></>
  ) : (
    <>Your <span className="text-brand">connections</span></>
  )}
</h1>
```

And hide search/sort when filtering:

```tsx
{!filterDueToday && (
  <div className="search-and-sort-row">...</div>
)}
```

When `filterDueToday`, add a back-to-all chip below the rows:

```tsx
{filterDueToday && (
  <div className="text-center mt-4">
    <Link
      href="/app/connections"
      className="font-mono text-[10px] tracking-[0.18em] uppercase text-muted font-bold"
    >
      ← BACK TO ALL CONNECTIONS
    </Link>
  </div>
)}
```

- [ ] **Step 14.2: Verify**

Run: `cd /Users/timnan/Documents/GitHub/connectyall && npx tsc --noEmit`
Expected: clean.

Run: `cd /Users/timnan/Documents/GitHub/connectyall && npx vitest run`
Expected: full suite green.

- [ ] **Step 14.3: Commit**

```bash
cd /Users/timnan/Documents/GitHub/connectyall
git add src/app/app/connections/connections-list.tsx
git commit -m "connections-list: due-today filtered view via ?filter=due-today"
```

---

## Task 15: Preview deploy + smoke

**Files:** none (manual verification)

- [ ] **Step 15.1: Push + deploy preview**

```bash
cd /Users/timnan/Documents/GitHub/connectyall
git push -u origin feature/follow-ups
vercel --yes
```

Note the preview URL.

- [ ] **Step 15.2: Smoke the recording → follow-up flow**

On the preview, sign in, record a memo that includes: "Met Sarah today. We talked about AI eval frameworks. **I need to follow up with her in 3 days about her staff PM role at Acme. Also send her the deck tomorrow.**"

Expected after processing:
- Sarah's contact card shows the FOLLOW-UPS card below HOW TO REACH
- Two rows: "the staff PM role at Acme" (IN 3 DAYS, amber) and "send her the deck" (TOMORROW, amber)
- Both have brand-soft purple EDIT chips on the right

- [ ] **Step 15.3: Smoke the edit + done + delete flow**

- Tap EDIT on one row → modal opens with current values prefilled
- Change the date via a quick-pick chip → SAVE → row updates with new date
- Tap EDIT → tap ✓ MARK AS DONE → row moves to bottom with strikethrough + 55% opacity
- Swipe left on a row → red DELETE slab reveals → tap → confirm modal → DELETE → row removed
- Tap + ADD FOLLOW-UP → modal opens in add mode with TOMORROW selected → type a topic → ADD → row appears

- [ ] **Step 15.4: Smoke the connections list integration**

Open `/app/connections`. Expected:
- Amber `●` next to Sarah's name (and any other contact with a due-today/overdue follow-up)
- Top banner "1 FOLLOW-UPS DUE TODAY" with VIEW → on the right
- Tap VIEW → page filters to only contacts with due-today/overdue
- Headline changes to "Due today"
- Back link returns to the full list
- Manually mark all follow-ups done → reload `/app/connections` → banner + amber pip both disappear

- [ ] **Step 15.5: Smoke the idempotency story**

Without doing anything to Sarah's contact, manually trigger the Inngest janitor or wait 2 minutes after recording. The janitor SHOULD NOT duplicate the follow-ups for the existing interaction. Confirm count remains 2 (or whatever you set in the test recording).

- [ ] **Step 15.6: Report back**

If anything's off (a follow-up doesn't get extracted, the edit modal misbehaves, the amber pip stays after marking done), file it as a follow-up task and proceed to PR creation.

---

## Self-Review (run by plan author)

**1. Spec coverage:**
- Schema (`follow_ups` table + indexes) → Task 0
- Date resolver → Task 1
- FollowUpsService CRUD → Task 2
- Due-today queries → Task 3
- LLM prompt extension → Task 4
- Pipeline hook → Task 5
- API routes → Task 6 (POST/PUT/DELETE)
- Connection-detail GET extension → Task 7
- Connections-list GET extension → Task 8
- Swipe-to-reveal helper → Task 9
- FollowUpModal → Task 10
- FollowUpsCard → Task 11
- Mount card on detail page → Task 12
- Banner + pip + count → Task 13
- Filtered view → Task 14
- Smoke deploy → Task 15

Every spec requirement maps to at least one task.

**2. Placeholder scan:** All code blocks are concrete. Imports for new modules are spelled out. No "add error handling here" — the routes' error responses are explicit. The one "fill in via inline import" pattern in Task 8 step 8.1 is acceptable because the function is exported in step 8.2 of the same task.

**3. Type consistency:**
- `FollowUp` type from `@/lib/db/schema` is used throughout (Tasks 2, 7, 11, 12).
- `createManyForInteraction` signature matches between Task 2, Task 5 (pipeline hook), and the service file.
- `resolveRelativeDate(raw, anchor, timezone)` signature matches across Tasks 1 and 5.
- API response shape `{ followUp: row }` for POST/PUT matches the consumer in Task 11.
- API response shape `{ connections, dueTodayCount }` for the list endpoint matches Tasks 8, 13.
- `hasDueTodayFollowUp: boolean` on row matches between Tasks 8, 13.
