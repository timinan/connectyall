# Logged-in Home — Greeting + Avatar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a greeting + avatar header to `/app/record` and a context-aware headline to `/app/profile`, so the logged-in app feels personal and the profile is easy to find.

**Architecture:** One new client component (`src/app/app/record/greeting.tsx`) that fetches the existing `GET /api/profile` endpoint, renders a greeting + round avatar + pencil edit badge wrapped in a `<Link>` to `/app/profile`. The record page renders it only when idle. The profile page imports the same `getFirstName` helper from `greeting.tsx` to produce a matching headline.

**Tech Stack:** Next.js 16 App Router, React client components, Tailwind CSS, `react-icons/lu` (already installed), the existing `/api/profile` endpoint.

---

### Task 1: Build `greeting.tsx` with `getFirstName` helper

**Files:**
- Create: `src/app/app/record/greeting.tsx`
- Test: `src/app/app/record/greeting.test.ts`

- [ ] **Step 1: Write failing test for `getFirstName`**

Create `src/app/app/record/greeting.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { getFirstName } from './greeting';

describe('getFirstName', () => {
  it('returns the first whitespace-separated word', () => {
    expect(getFirstName('Tim Nan')).toBe('Tim');
  });

  it('trims surrounding whitespace', () => {
    expect(getFirstName('   Tim  ')).toBe('Tim');
  });

  it('returns the whole string if there is only one word', () => {
    expect(getFirstName('Tim')).toBe('Tim');
  });

  it('returns null for empty string', () => {
    expect(getFirstName('')).toBe(null);
  });

  it('returns null for whitespace-only', () => {
    expect(getFirstName('   ')).toBe(null);
  });

  it('returns null for null input', () => {
    expect(getFirstName(null)).toBe(null);
  });
});
```

- [ ] **Step 2: Run the test — expect failure**

Run: `pnpm test -- greeting.test.ts`
Expected: FAIL — `Cannot find module './greeting'` or similar.

- [ ] **Step 3: Implement `getFirstName` plus the `Greeting` component**

Create `src/app/app/record/greeting.tsx`:

```typescript
'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { LuPencil } from 'react-icons/lu';

export function getFirstName(displayName: string | null | undefined): string | null {
  if (!displayName) return null;
  const trimmed = displayName.trim();
  if (!trimmed) return null;
  return trimmed.split(/\s+/)[0];
}

type Profile = {
  displayName: string;
  photoR2Url: string | null;
};

const PALETTE = ['#0E7C7B', '#3B3B6D', '#A23B72', '#D1495B', '#2E294E'];
function pickBg(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

function Avatar({ profile }: { profile: Profile | null | 'loading' }) {
  if (profile === 'loading') {
    return <div className="w-24 h-24 rounded-full bg-neutral-800" />;
  }
  if (!profile) {
    return (
      <div
        className="w-24 h-24 rounded-full flex items-center justify-center text-white text-4xl font-bold"
        style={{ backgroundColor: PALETTE[0] }}
      >
        ?
      </div>
    );
  }
  if (profile.photoR2Url) {
    return (
      <img
        src={profile.photoR2Url}
        alt={profile.displayName}
        className="w-24 h-24 rounded-full object-cover"
      />
    );
  }
  const initial = (profile.displayName.trim().charAt(0) || '?').toUpperCase();
  return (
    <div
      className="w-24 h-24 rounded-full flex items-center justify-center text-white text-4xl font-bold"
      style={{ backgroundColor: pickBg(profile.displayName) }}
    >
      {initial}
    </div>
  );
}

export function Greeting() {
  const [profile, setProfile] = useState<Profile | null | 'loading'>('loading');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/profile', { cache: 'no-store' });
        if (!res.ok) {
          if (!cancelled) setProfile(null);
          return;
        }
        const json = await res.json();
        if (!cancelled) setProfile(json.profile ?? null);
      } catch {
        if (!cancelled) setProfile(null);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const firstName = profile && profile !== 'loading' ? getFirstName(profile.displayName) : null;

  return (
    <div className="flex flex-col items-center gap-4">
      {profile !== 'loading' && (
        <h2 className="text-xl font-semibold text-center">
          {firstName ? `Hello, ${firstName} 👋` : 'Hello 👋'}
        </h2>
      )}
      <Link href="/app/profile" className="relative inline-block" aria-label="Edit profile">
        <Avatar profile={profile} />
        <span className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-white text-neutral-950 flex items-center justify-center shadow ring-2 ring-neutral-950">
          <LuPencil size={14} />
        </span>
      </Link>
    </div>
  );
}
```

- [ ] **Step 4: Run the test — expect pass**

Run: `pnpm test -- greeting.test.ts`
Expected: PASS — 6/6.

- [ ] **Step 5: Run typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/app/record/greeting.tsx src/app/app/record/greeting.test.ts
git commit -m "feat(home): Greeting component with avatar + edit badge"
```

---

### Task 2: Wire `Greeting` into the record page

**Files:**
- Modify: `src/app/app/record/page.tsx`

- [ ] **Step 1: Import and conditionally render `Greeting`**

In `src/app/app/record/page.tsx`, add the import at the top (after the existing imports):

```typescript
import { Greeting } from './greeting';
```

Then modify the JSX. The current structure starts with:

```tsx
return (
  <div className="flex-1 flex flex-col items-center justify-center p-8">
    <div className="w-full max-w-sm space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold">{state === 'recording' ? 'Recording…' : 'Tap to start'}</h1>
        <p className="text-neutral-400 text-sm">{state === 'recording' ? `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}` : 'Tell me about who you just met.'}</p>
      </div>
```

Insert the greeting just inside the inner wrapper, before the existing `text-center` block:

```tsx
return (
  <div className="flex-1 flex flex-col items-center justify-center p-8">
    <div className="w-full max-w-sm space-y-8">
      {state === 'idle' && <Greeting />}
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold">{state === 'recording' ? 'Recording…' : 'Tap to start'}</h1>
        <p className="text-neutral-400 text-sm">{state === 'recording' ? `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}` : 'Tell me about who you just met.'}</p>
      </div>
```

The existing `space-y-8` on the wrapper gives the greeting room above the "Tap to start" block. No other changes to this file.

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Run the full test suite**

Run: `pnpm test`
Expected: all pass (82/82 — Task 1 added 6 tests on top of 81).

- [ ] **Step 4: Commit**

```bash
git add src/app/app/record/page.tsx
git commit -m "feat(home): show greeting + avatar on /app/record when idle"
```

---

### Task 3: Context-aware headline on the profile page

**Files:**
- Modify: `src/app/app/profile/page.tsx`

- [ ] **Step 1: Extend the `Profile` type to include `onboardedAt`**

In `src/app/app/profile/page.tsx`, the existing local `Profile` type is:

```typescript
type Profile = {
  displayName: string;
  tagline: string | null;
  socials: { x?: string; linkedin?: string; email?: string; website?: string };
  telegramUsername: string | null;
};
```

Replace with:

```typescript
type Profile = {
  displayName: string;
  tagline: string | null;
  socials: { x?: string; linkedin?: string; email?: string; website?: string };
  telegramUsername: string | null;
  onboardedAt: string | null;
};
```

The `/api/profile` GET already returns the full user row from `getById`, so `onboardedAt` is present on the wire — we just need to make the local type include it. (It's serialized as an ISO string by `NextResponse.json`.)

- [ ] **Step 2: Import `getFirstName`**

Add to the existing imports near the top:

```typescript
import { getFirstName } from '../record/greeting';
```

- [ ] **Step 3: Replace the static headline with a context-aware one**

Find:

```tsx
<h1 className="text-2xl font-bold">Set up your card</h1>
```

Replace with:

```tsx
<h1 className="text-2xl font-bold">{headline()}</h1>
```

And add a helper function inside the `ProfilePage` component, above the `return`:

```typescript
function headline() {
  if (!profile) return 'Hello';
  const firstName = getFirstName(profile.displayName);
  if (profile.onboardedAt) {
    return firstName
      ? `Hello, ${firstName}, please edit your profile below`
      : 'Hello, please edit your profile below';
  }
  return 'Hello, please set up your profile below';
}
```

- [ ] **Step 4: Run typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 5: Run the full test suite**

Run: `pnpm test`
Expected: 82/82 pass (no new tests in this task — pure UI text).

- [ ] **Step 6: Commit**

```bash
git add src/app/app/profile/page.tsx
git commit -m "feat(profile): context-aware headline (first-time vs returning)"
```

---

## Final verification

After all three tasks land, run a manual sanity check before pushing:

- [ ] `pnpm typecheck` clean
- [ ] `pnpm test` all green
- [ ] `pnpm build` succeeds (Next.js production build catches client/server boundary mistakes that typecheck misses)

Push the branch and dispatch the preview deploy — that's where the visual verification happens.
