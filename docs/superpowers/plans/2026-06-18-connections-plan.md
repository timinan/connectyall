# Connections — Implementation Plan

> Use `superpowers:subagent-driven-development` to execute task-by-task.

**Goal:** Build the Connections list + detail experience, wire navigation, and add backwards-compat redirects for the old `/app/cards/*` URLs.

**Architecture:**
- New routes: `/app/connections`, `/app/connections/[id]`
- New API: `GET /api/connections`, `GET /api/connections/[id]`
- New nav toggle component (client) at top-right of every logged-in page
- `/app/cards` and `/app/cards/[id]` become redirects
- After recording, navigate to `/app/connections/<contactId>` instead of the old card URL
- No DB migration

---

### Task 1: Helper + both connections API endpoints

**Files:**
- Create: `src/lib/relative-date.ts`
- Create: `src/lib/relative-date.test.ts`
- Create: `src/app/api/connections/route.ts`
- Create: `src/app/api/connections/[id]/route.ts`

**Step 1: Failing test for `relativeDate`**

Create `src/lib/relative-date.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { relativeDate } from './relative-date';

describe('relativeDate', () => {
  const now = new Date('2026-06-18T12:00:00Z');

  it('returns "today" for same calendar day', () => {
    expect(relativeDate('2026-06-18T09:00:00Z', now)).toBe('today');
  });

  it('returns "yesterday" for previous calendar day', () => {
    expect(relativeDate('2026-06-17T23:00:00Z', now)).toBe('yesterday');
  });

  it('returns "N days ago" within the last week', () => {
    expect(relativeDate('2026-06-15T12:00:00Z', now)).toBe('3 days ago');
  });

  it('returns short date for older same-year', () => {
    expect(relativeDate('2026-02-12T12:00:00Z', now)).toBe('Feb 12');
  });

  it('returns date with year for different year', () => {
    expect(relativeDate('2024-12-01T12:00:00Z', now)).toBe('Dec 1, 2024');
  });
});
```

**Step 2: Run test — expect FAIL (module not found)**

```
pnpm test -- relative-date.test.ts
```

**Step 3: Implement helper**

Create `src/lib/relative-date.ts`:

```typescript
const FORMATTER = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const FORMATTER_WITH_YEAR = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

function startOfUTCDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function relativeDate(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const dayDiff = Math.round(
    (startOfUTCDay(now).getTime() - startOfUTCDay(then).getTime()) / 86_400_000
  );

  if (dayDiff <= 0) return 'today';
  if (dayDiff === 1) return 'yesterday';
  if (dayDiff < 7) return `${dayDiff} days ago`;

  if (then.getUTCFullYear() === now.getUTCFullYear()) return FORMATTER.format(then);
  return FORMATTER_WITH_YEAR.format(then);
}
```

**Step 4: Run test — expect PASS (5/5)**

```
pnpm test -- relative-date.test.ts
```

**Step 5: Create `GET /api/connections`**

Create `src/app/api/connections/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { and, eq, desc, sql, max } from 'drizzle-orm';
import { getServerSession } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { contacts, interactions } from '@/lib/db/schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const rows = await db()
    .select({
      contactId: contacts.id,
      name: contacts.name,
      company: contacts.company,
      role: contacts.role,
      preferredChannel: contacts.preferredChannel,
      lastTouchedAt: contacts.lastTouchedAt,
      meetingsCount: sql<number>`count(${interactions.id})::int`,
    })
    .from(contacts)
    .leftJoin(interactions, eq(interactions.contactId, contacts.id))
    .where(eq(contacts.userId, session.user.id))
    .groupBy(contacts.id)
    .orderBy(desc(contacts.lastTouchedAt))
    .limit(100);

  return NextResponse.json({ connections: rows });
}
```

**Step 6: Create `GET /api/connections/[id]`**

Create `src/app/api/connections/[id]/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { eq, desc } from 'drizzle-orm';
import { getServerSession } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { contacts, interactions } from '@/lib/db/schema';
import { env } from '@/lib/env';

const NULLISH = new Set(['null', 'none', 'n/a', 'undefined', '']);
function nullify(v: string | null | undefined): string | null {
  if (v == null) return null;
  return NULLISH.has(v.toLowerCase()) ? null : v;
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id: contactId } = await params;

  const [contact] = await db()
    .select()
    .from(contacts)
    .where(eq(contacts.id, contactId))
    .limit(1);

  if (!contact) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (contact.userId !== session.user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const allInteractions = await db()
    .select({
      id: interactions.id,
      occurredAt: interactions.occurredAt,
      structuredData: interactions.structuredData,
    })
    .from(interactions)
    .where(eq(interactions.contactId, contactId))
    .orderBy(desc(interactions.occurredAt));

  const latest = allInteractions[0] ?? null;
  const previous = allInteractions.slice(1).map((i) => ({
    interactionId: i.id,
    occurredAt: i.occurredAt,
    recap: (i.structuredData as { recap?: string } | null)?.recap ?? null,
  }));

  const latestRecap = (latest?.structuredData as { recap?: string } | null)?.recap ?? null;

  return NextResponse.json({
    contact: {
      id: contact.id,
      name: contact.name,
      role: contact.role,
      company: contact.company,
      emails: contact.emails ?? [],
      phones: contact.phones ?? [],
      preferredChannel: contact.preferredChannel ?? null,
      notes: nullify(contact.notes),
      telegram: nullify(contact.links?.telegram),
      x: nullify(contact.links?.x),
      linkedin: nullify(contact.links?.linkedin),
      website: nullify(contact.links?.website),
      whatsapp: nullify(contact.links?.whatsapp),
      wechat: nullify(contact.links?.wechat),
      line: nullify(contact.links?.line),
    },
    latestInteractionId: latest?.id ?? null,
    latestRecap,
    previousMeetings: previous,
    shareUrl: latest ? `${env().BASE_URL}/c/${latest.id}` : null,
  });
}
```

**Step 7: Run all tests and typecheck**

```
pnpm typecheck && pnpm test
```

Expect: clean + 88 passing (previous 87 + 5 new relative-date tests = should be 92, but if test count differs that's fine — what matters is `pnpm test` is green).

**Step 8: Commit**

```bash
git add src/lib/relative-date.ts src/lib/relative-date.test.ts src/app/api/connections
git commit -m "add connections api + relative-date helper"
```

---

### Task 2: Nav toggle component

**Files:**
- Create: `src/components/nav-toggle.tsx`

**Step 1: Create the component**

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LuArrowLeft, LuArrowRight } from 'react-icons/lu';

export function NavToggle() {
  const pathname = usePathname();
  const onConnections = pathname.startsWith('/app/connections');
  const target = onConnections ? '/app/record' : '/app/connections';
  const label = onConnections ? 'Record' : 'Connections';
  const Icon = onConnections ? LuArrowLeft : LuArrowRight;

  return (
    <Link
      href={target}
      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-neutral-950 text-white text-sm font-semibold hover:bg-neutral-800 transition"
    >
      {onConnections && <Icon size={14} />}
      {label}
      {!onConnections && <Icon size={14} />}
    </Link>
  );
}
```

**Step 2: Typecheck**

```
pnpm typecheck
```

**Step 3: Commit**

```bash
git add src/components/nav-toggle.tsx
git commit -m "add record↔connections nav toggle"
```

---

### Task 3: Connections list page

**Files:**
- Create: `src/app/app/connections/page.tsx`

**Step 1: Implement the list page**

```tsx
'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { APP_CONTAINER } from '../_layout-constants';
import { NavToggle } from '@/components/nav-toggle';
import { ChannelIcon, type ChannelKind } from '../cards/[id]/channel-icons';
import { relativeDate } from '@/lib/relative-date';

type Connection = {
  contactId: string;
  name: string;
  company: string | null;
  role: string | null;
  preferredChannel: ChannelKind | null;
  lastTouchedAt: string;
  meetingsCount: number;
};

const PALETTE = ['#0E7C7B', '#3B3B6D', '#A23B72', '#D1495B', '#2E294E'];
function pickBg(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

function Bubble({ name }: { name: string }) {
  const letter = (name.trim().charAt(0) || '?').toUpperCase();
  return (
    <div
      className="w-12 h-12 rounded-full flex items-center justify-center text-white text-xl font-bold flex-shrink-0"
      style={{ backgroundColor: pickBg(name) }}
    >
      {letter}
    </div>
  );
}

export default function ConnectionsPage() {
  const [rows, setRows] = useState<Connection[] | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/connections', { cache: 'no-store' });
      if (!res.ok) { setRows([]); return; }
      const json = await res.json();
      setRows(json.connections ?? []);
    })();
  }, []);

  return (
    <div className={APP_CONTAINER}>
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Your connections</h1>
        <NavToggle />
      </div>

      {rows === null && <p className="text-neutral-600 text-sm">Loading…</p>}

      {rows && rows.length === 0 && (
        <div className="rounded-3xl bg-gradient-to-br from-purple-100 via-purple-50 to-amber-50 border border-purple-200/60 shadow-sm px-5 py-8 text-center space-y-3">
          <p className="text-neutral-700">No connections yet.</p>
          <Link href="/app/record" className="inline-block px-4 py-2 rounded-full bg-neutral-950 text-white text-sm font-semibold hover:bg-neutral-800 transition">
            + Record your first
          </Link>
        </div>
      )}

      <ul className="space-y-3">
        {rows && rows.map((c) => {
          const sub = [c.company, c.role].filter(Boolean).join(' · ');
          return (
            <li key={c.contactId}>
              <Link
                href={`/app/connections/${c.contactId}`}
                className="flex items-center gap-3 p-3 rounded-3xl bg-gradient-to-br from-purple-100 via-purple-50 to-amber-50 border border-purple-200/60 shadow-sm hover:border-purple-300 transition"
              >
                <Bubble name={c.name} />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-neutral-950 truncate">{c.name}</p>
                  {sub && <p className="text-xs text-neutral-600 truncate">{sub}</p>}
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  {c.preferredChannel && <ChannelIcon kind={c.preferredChannel} size={16} />}
                  <p className="text-xs text-neutral-600 whitespace-nowrap">{relativeDate(c.lastTouchedAt)}</p>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
```

**Step 2: Typecheck + build (catches client/server boundary mistakes)**

```
pnpm typecheck && pnpm build
```

**Step 3: Commit**

```bash
git add src/app/app/connections/page.tsx
git commit -m "add connections list page"
```

---

### Task 4: Connection detail page

**Files:**
- Create: `src/app/app/connections/[id]/page.tsx`

The fastest path: copy the existing `src/app/app/cards/[id]/page.tsx` to the new location, then change four things:

1. Fetch URL: `/api/cards/${id}` → `/api/connections/${id}`
2. Response handling: the new shape returns `contact`, `latestInteractionId`, `latestRecap`, `previousMeetings`, `shareUrl` (no `status` polling needed because the contact already exists by the time we're on this page — but keep a fallback for safety)
3. Recap save target: was `/api/interactions/${interactionId}` keyed by `interaction.id` from the response. After change: keyed by `latestInteractionId`.
4. Add `NavToggle` at the top-right next to (or replacing) any existing header content.
5. Add the **Previous meetings** card below the channels block, before the Done button.

**Step 1: Copy the file**

```bash
mkdir -p src/app/app/connections/\[id\]
cp src/app/app/cards/\[id\]/page.tsx src/app/app/connections/\[id\]/page.tsx
```

**Step 2: Update the new file's imports and state**

In `src/app/app/connections/[id]/page.tsx`:

- Add at top: `import { NavToggle } from '@/components/nav-toggle';`
- The existing import `import { APP_CONTAINER } from '../../_layout-constants';` should be changed to `'../../_layout-constants'` (one fewer `../` because the file is now under `connections/[id]/` not `cards/[id]/`). Verify the relative path is correct after copy.
- The existing import `import { ChannelIcon, type ChannelKind } from './channel-icons';` won't resolve — change to `import { ChannelIcon, type ChannelKind } from '../../cards/[id]/channel-icons';`. We're not moving the channel-icons file; cross-import is fine for now.

**Step 3: Change the data fetch**

Find the existing fetch (currently `/api/cards/${id}`) and replace with `/api/connections/${id}`.

The response shape changes — adjust the local `Data` type and any reads. The new payload is:

```ts
{
  contact: { id, name, role, company, emails, phones, preferredChannel, notes, telegram, x, linkedin, website, whatsapp, wechat, line },
  latestInteractionId: string | null,
  latestRecap: string | null,
  previousMeetings: Array<{ interactionId, occurredAt, recap }>,
  shareUrl: string | null
}
```

There's no `status` field on this response — the contact already exists. Remove the `status === 'processing' / 'failed'` early-returns; if `contact` is null on the response (404 or 403 case), show a "Connection not found" message and a button back to the list.

**Step 4: Update recap save**

The existing recap save calls `/api/interactions/${interactionId}` and uses `data.interaction.id`. After the change, use `data.latestInteractionId`.

If `latestInteractionId` is null (a contact with zero interactions — shouldn't happen but guard for it), disable the recap editor or hide it.

**Step 5: Add NavToggle at the top**

Wrap the existing top of the page (the name banner) in a header that also has the NavToggle. Something like:

```tsx
<div className="flex justify-end">
  <NavToggle />
</div>
{/* existing name banner */}
```

The NavToggle on this page reads "← Record" because `usePathname()` will match `/app/connections/[id]`.

**Step 6: Add Previous meetings section**

Right above the Done button at the bottom of the page, add:

```tsx
{data.previousMeetings.length > 0 && (
  <div className="rounded-3xl bg-gradient-to-br from-purple-100 via-purple-50 to-amber-50 border border-purple-200/60 shadow-sm px-5 py-4 space-y-3">
    <p className="text-sm text-neutral-700 font-medium">Previous meetings ({data.previousMeetings.length})</p>
    <ul className="space-y-2">
      {data.previousMeetings.map((m) => (
        <PastMeeting key={m.interactionId} occurredAt={m.occurredAt} recap={m.recap} />
      ))}
    </ul>
  </div>
)}
```

And add the `PastMeeting` component to the same file (above `ConnectionDetailPage` function):

```tsx
function PastMeeting({ occurredAt, recap }: { occurredAt: string; recap: string | null }) {
  const [expanded, setExpanded] = useState(false);
  const date = new Date(occurredAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const preview = recap ? (recap.length > 80 ? recap.slice(0, 80) + '…' : recap) : '(no recap)';
  return (
    <li>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="text-left w-full p-2 rounded-lg hover:bg-white/50 transition"
      >
        <p className="text-xs text-neutral-700 font-medium">{date}</p>
        <p className="text-sm text-neutral-700">{expanded ? (recap ?? '(no recap)') : preview}</p>
      </button>
    </li>
  );
}
```

**Step 7: Done button stays unchanged**

The full-width dark pill linking to `/app/record` at the bottom stays exactly as it is.

**Step 8: Typecheck + build**

```
pnpm typecheck && pnpm build
```

Expect: clean.

**Step 9: Commit**

```bash
git add src/app/app/connections
git commit -m "add connections detail page with previous meetings"
```

---

### Task 5: Wire everything — record nav, nav toggle on other pages, old-route redirects

**Files:**
- Modify: `src/app/app/record/page.tsx`
- Modify: `src/app/app/profile/page.tsx`
- Modify: `src/app/app/cards/page.tsx`
- Modify: `src/app/app/cards/[id]/page.tsx`

**Step 1: Record page — redirect to connections after capture**

In `src/app/app/record/page.tsx`, find the existing flow that polls and navigates. Currently:

```ts
const { interactionId } = await res.json();
router.push(`/app/cards/${interactionId}`);
```

The current code navigates immediately after upload, before processing is complete. With the new connection-keyed URL we need the contact ID, which comes back from the polling endpoint. Replace the post-upload navigation with a poll loop:

```ts
const { interactionId } = await res.json();
// Poll until processing finishes, then navigate to the contact page.
const start = Date.now();
while (Date.now() - start < 60_000) {
  await new Promise((r) => setTimeout(r, 1500));
  const poll = await fetch(`/api/cards/${interactionId}`, { cache: 'no-store' });
  if (!poll.ok) continue;
  const payload = await poll.json();
  if (payload.status === 'failed') {
    alert('Sorry — that recording could not be processed.');
    setState('idle');
    return;
  }
  if (payload.status === 'ready') {
    router.push(`/app/connections/${payload.contact.id}`);
    return;
  }
}
// Timeout fallback — drop them on the connections list so they can find it once it's ready.
router.push('/app/connections');
```

Verify the existing `/api/cards/[id]` returns `payload.contact.id` (it already does — see Task 1 reference). Don't change that endpoint.

**Step 2: Record page — add NavToggle**

Find the existing greeting banner at the top of the idle state. Above it (inside the wrapper but before the greeting card), add:

```tsx
{state === 'idle' && (
  <div className="flex justify-end">
    <NavToggle />
  </div>
)}
```

Import: `import { NavToggle } from '@/components/nav-toggle';`

The NavToggle only renders in idle state (matching the greeting banner's pattern) so the recording UI stays focused.

**Step 3: Profile page — add NavToggle**

In `src/app/app/profile/page.tsx`, at the very top of the outer wrapper div, before the form, add:

```tsx
<div className="flex justify-end">
  <NavToggle />
</div>
```

Import: `import { NavToggle } from '@/components/nav-toggle';`

Note: profile page's NavToggle will read "← Record" because `/app/profile` doesn't start with `/app/connections`. That's the right destination from profile — back to record.

**Step 4: Old card list → redirect**

Replace the entire body of `src/app/app/cards/page.tsx` with:

```tsx
import { redirect } from 'next/navigation';

export default function CardsListRedirect() {
  redirect('/app/connections');
}
```

Delete the unused imports.

**Step 5: Old card detail → redirect to contact page**

Replace `src/app/app/cards/[id]/page.tsx` with:

```tsx
import { redirect, notFound } from 'next/navigation';
import { getInteractionWithContact } from '@/services/ContactService';
import { getServerSession } from '@/lib/auth/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function OldCardDetailRedirect({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession();
  if (!session) redirect('/app/sign-in');

  const { id } = await params;
  const found = await getInteractionWithContact(id);
  if (!found) redirect('/app/connections');
  if (found.contact.userId !== session.user.id) notFound();

  redirect(`/app/connections/${found.contact.id}`);
}
```

This replaces the entire 708-line file with a ~20-line redirect.

**Step 6: Verify**

```
pnpm typecheck && pnpm test && pnpm build
```

All green.

**Step 7: Commit**

```bash
git add src/app/app/record/page.tsx src/app/app/profile/page.tsx src/app/app/cards/page.tsx src/app/app/cards/[id]/page.tsx
git commit -m "wire connections — record redirect, nav toggle, /app/cards backwards compat"
```

---

## Final verification

```
pnpm typecheck && pnpm test && pnpm build
```

Push, deploy, sync Inngest, share preview URL.
