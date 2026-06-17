# Logged-in Home Round 2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bump the record-page avatar to 128px, add a camera-badge photo editor on the profile page, redesign the profile socials block to mirror the post-capture inline-edit pattern, and extend the API/service layer to support all 9 channels with set/clear semantics.

**Architecture:** Pure jsonb extension to `Socials` (`phone?`), no SQL migration. The `/api/profile` PUT route adopts a `{ action, social, value? }` discriminated union — telegram routes to its dedicated column, everything else to the `socials` jsonb. The profile page is rebuilt: hero avatar + camera badge at the top, then form fields, then a per-row channel list with brand icons and an `+ Add field` chip. The `Avatar` component already in `greeting.tsx` is exported for reuse.

**Tech Stack:** Next.js 16 App Router client components, Drizzle ORM (jsonb `||` and `-` operators), Zod discriminated unions, `react-icons/lu` + the existing `channel-icons.tsx`.

---

### Task 1: API + service-layer changes

**Files:**
- Modify: `src/lib/db/schema.ts`
- Modify: `src/services/UserProfileService.ts`
- Modify: `src/app/api/profile/route.ts`

- [ ] **Step 1: Extend the `Socials` type**

In `src/lib/db/schema.ts`, find:

```typescript
export type Socials = { x?: string; linkedin?: string; email?: string; website?: string; whatsapp?: string; wechat?: string; line?: string };
```

Replace with:

```typescript
export type Socials = { x?: string; linkedin?: string; email?: string; website?: string; whatsapp?: string; wechat?: string; line?: string; phone?: string };
```

- [ ] **Step 2: Add `clearSocial` to `UserProfileService`**

In `src/services/UserProfileService.ts`, append a new export at the bottom of the file (after `setPhotoFromBytes`):

```typescript
export async function clearSocial(userId: string, kind: keyof Socials): Promise<void> {
  await db()
    .update(users)
    .set({ socials: sql`${users.socials} - ${kind}` })
    .where(eq(users.id, userId));
}
```

Verify `sql` and `eq` are already imported at the top of the file. If `sql` is not imported, add it: `import { eq, sql } from 'drizzle-orm';`. (Check the existing imports first — `sql` is used in `setSocial` so it should already be there.)

- [ ] **Step 3: Refactor `SocialSchema` and PUT handler**

In `src/app/api/profile/route.ts`:

Add `clearSocial` to the existing UserProfileService import:
```typescript
import { upsertProfile, setSocial, clearSocial, setPhotoFromBytes, getById } from '@/services/UserProfileService';
```

Replace the existing `SocialSchema`:

```typescript
const SocialSchema = z.object({
  social: z.enum(['x', 'linkedin', 'email', 'website']),
  value: z.string().min(1).max(255),
});
```

With:

```typescript
const ChannelEnum = z.enum(['x', 'linkedin', 'email', 'website', 'telegram', 'whatsapp', 'wechat', 'line', 'phone']);

const SocialSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('set'),
    social: ChannelEnum,
    value: z.string().min(1).max(255),
  }),
  z.object({
    action: z.literal('clear'),
    social: ChannelEnum,
  }),
]);
```

Replace the social-handling block inside the PUT handler:

```typescript
const social = SocialSchema.safeParse(body);
if (social.success) {
  let value = social.data.value;
  if (social.data.social === 'linkedin') value = linkedinHandle(value);
  else if (social.data.social === 'x') value = xHandle(value);
  await setSocial(session.user.id, social.data.social, value);
  return NextResponse.json({ ok: true });
}
```

With:

```typescript
const social = SocialSchema.safeParse(body);
if (social.success) {
  const { action, social: kind } = social.data;
  if (action === 'clear') {
    if (kind === 'telegram') {
      await db().update(users).set({ telegramUsername: null }).where(eq(users.id, session.user.id));
    } else {
      await clearSocial(session.user.id, kind as Exclude<typeof kind, 'telegram'>);
    }
    return NextResponse.json({ ok: true });
  }
  // action === 'set'
  let value = social.data.value;
  if (kind === 'linkedin') value = linkedinHandle(value);
  else if (kind === 'x') value = xHandle(value);
  else if (kind === 'telegram') value = telegramHandle(value);
  if (kind === 'telegram') {
    await db().update(users).set({ telegramUsername: value }).where(eq(users.id, session.user.id));
  } else {
    await setSocial(session.user.id, kind, value);
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Run typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 5: Run existing tests**

Run: `pnpm test`
Expected: 87/87 still pass. Round-1 tests don't touch these files, so this is a regression check.

- [ ] **Step 6: Commit**

```bash
git add src/lib/db/schema.ts src/services/UserProfileService.ts src/app/api/profile/route.ts
git commit -m "feat(profile): API+service support for 9-channel set/clear"
```

---

### Task 2: Bump avatar size and export `Avatar`

**Files:**
- Modify: `src/app/app/record/greeting.tsx`

- [ ] **Step 1: Bump constants and export `Avatar`**

In `src/app/app/record/greeting.tsx`:

Change the `Avatar` function declaration from `function Avatar(...)` to `export function Avatar(...)` so it can be imported by the profile page.

Replace all three instances of `w-24 h-24` inside `Avatar` with `w-32 h-32` (bumps 96px → 128px).

In the `Greeting` component's return JSX, replace the pencil badge:

```tsx
<span className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-white text-neutral-950 flex items-center justify-center shadow ring-2 ring-neutral-950">
  <LuPencil size={14} />
</span>
```

With:

```tsx
<span className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-white text-neutral-950 flex items-center justify-center shadow ring-2 ring-neutral-950">
  <LuPencil size={16} />
</span>
```

- [ ] **Step 2: Run typecheck and tests**

Run: `pnpm typecheck` — expect clean.
Run: `pnpm test` — expect 87/87 pass.

- [ ] **Step 3: Commit**

```bash
git add src/app/app/record/greeting.tsx
git commit -m "feat(home): bump avatar 96→128 and export Avatar for reuse"
```

---

### Task 3: Profile page hero avatar with camera badge

**Files:**
- Modify: `src/app/app/profile/page.tsx`

- [ ] **Step 1: Add imports**

In `src/app/app/profile/page.tsx`, the existing imports near the top include `useEffect, useState` from React and `useRouter` from `next/navigation`. Add:

```typescript
import { useRef } from 'react';
import { Avatar } from '../record/greeting';
import { LuCamera } from 'react-icons/lu';
```

If `useRef` can be merged into the existing react import, do so (e.g. `import { useEffect, useRef, useState } from 'react';`). Don't duplicate the import line.

- [ ] **Step 2: Add a file-input ref and update the upload handler**

Inside `ProfilePage`, near the existing `useState` declarations, add:

```typescript
const fileInputRef = useRef<HTMLInputElement | null>(null);
```

Replace the existing `uploadPhoto` with a version that refreshes local state:

```typescript
async function uploadPhoto(file: File) {
  const fd = new FormData();
  fd.append('photo', file);
  const res = await fetch('/api/profile', { method: 'PUT', body: fd });
  if (!res.ok) return;
  const { photoR2Url } = await res.json();
  setProfile((p) => (p ? { ...p, photoR2Url } : p));
}
```

This requires the local `Profile` type to include `photoR2Url`. Find the existing `Profile` type (already extended in round 1 with `onboardedAt`):

```typescript
type Profile = {
  displayName: string;
  tagline: string | null;
  socials: { x?: string; linkedin?: string; email?: string; website?: string };
  telegramUsername: string | null;
  onboardedAt: string | null;
};
```

Replace with:

```typescript
type Profile = {
  displayName: string;
  tagline: string | null;
  socials: { x?: string; linkedin?: string; email?: string; website?: string; whatsapp?: string; wechat?: string; line?: string; phone?: string };
  telegramUsername: string | null;
  photoR2Url: string | null;
  onboardedAt: string | null;
};
```

- [ ] **Step 3: Render hero avatar block above the form**

Inside the existing outer `<div className="p-6 max-w-md mx-auto space-y-6">`, replace the current header block:

```tsx
<h1 className="text-2xl font-bold">{headline()}</h1>
```

With:

```tsx
<div className="flex flex-col items-center gap-4">
  <h1 className="text-2xl font-bold text-center">{headline()}</h1>
  <div className="relative inline-block">
    <Avatar
      profile={profile ? { displayName: profile.displayName, photoR2Url: profile.photoR2Url } : 'loading'}
    />
    <button
      type="button"
      onClick={() => fileInputRef.current?.click()}
      aria-label="Change photo"
      className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-white text-neutral-950 flex items-center justify-center shadow ring-2 ring-neutral-950"
    >
      <LuCamera size={16} />
    </button>
    <input
      ref={fileInputRef}
      type="file"
      accept="image/*"
      className="hidden"
      onChange={(e) => e.target.files?.[0] && uploadPhoto(e.target.files[0])}
    />
  </div>
</div>
```

- [ ] **Step 4: Remove the old naked file input**

Find inside the form:

```tsx
<input
  type="file"
  accept="image/*"
  onChange={(e) => e.target.files?.[0] && uploadPhoto(e.target.files[0])}
  className="block text-sm"
/>
```

Delete this block. The avatar block above the form is now the only photo entry point.

- [ ] **Step 5: Run typecheck and tests**

Run: `pnpm typecheck` — expect clean.
Run: `pnpm test` — expect 87/87 pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/app/profile/page.tsx
git commit -m "feat(profile): hero avatar with camera badge replaces naked file input"
```

---

### Task 4: Profile page channels redesign

**Files:**
- Modify: `src/app/app/profile/page.tsx`

This is the biggest single change. Read the entire file before starting and keep the form fields (`displayName`, `tagline`, `selfIntro`) and submit handler untouched.

- [ ] **Step 1: Add imports**

In `src/app/app/profile/page.tsx`, add:

```typescript
import { ChannelIcon, type ChannelKind } from '../cards/[id]/channel-icons';
import { LuX, LuCheck } from 'react-icons/lu';
```

- [ ] **Step 2: Add channel constants**

Below the existing `type Profile = { ... }` declaration, add:

```typescript
type ProfileChannel = 'x' | 'linkedin' | 'email' | 'website' | 'telegram' | 'whatsapp' | 'wechat' | 'line' | 'phone';

const PROFILE_CHANNELS: ProfileChannel[] = ['email', 'phone', 'telegram', 'x', 'linkedin', 'website', 'whatsapp', 'wechat', 'line'];

const PROFILE_CHANNEL_LABELS: Record<ProfileChannel, string> = {
  email: 'Email',
  phone: 'Phone',
  telegram: 'Telegram',
  x: 'X',
  linkedin: 'LinkedIn',
  website: 'Website',
  whatsapp: 'WhatsApp',
  wechat: 'WeChat',
  line: 'Line',
};

const PROFILE_CHANNEL_PLACEHOLDERS: Record<ProfileChannel, string> = {
  email: 'email@example.com',
  phone: '+1 555 1234',
  telegram: 'handle (no @)',
  x: 'x handle',
  linkedin: 'linkedin handle',
  website: 'website.com',
  whatsapp: 'phone digits (e.g. 14155551234)',
  wechat: 'WeChat ID',
  line: 'Line ID',
};

function readChannel(profile: Profile, kind: ProfileChannel): string | null {
  if (kind === 'telegram') return profile.telegramUsername;
  return profile.socials[kind] ?? null;
}
```

- [ ] **Step 3: Add the channel save/clear helpers**

Inside `ProfilePage`, replace the existing `setSocial` function:

```typescript
async function setSocial(kind: string, value: string) {
  await fetch('/api/profile', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ social: kind, value }),
  });
}
```

With:

```typescript
async function saveChannel(kind: ProfileChannel, value: string) {
  await fetch('/api/profile', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'set', social: kind, value }),
  });
  setProfile((p) => {
    if (!p) return p;
    if (kind === 'telegram') return { ...p, telegramUsername: value };
    return { ...p, socials: { ...p.socials, [kind]: value } };
  });
}

async function clearChannel(kind: ProfileChannel) {
  await fetch('/api/profile', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'clear', social: kind }),
  });
  setProfile((p) => {
    if (!p) return p;
    if (kind === 'telegram') return { ...p, telegramUsername: null };
    const next = { ...p.socials };
    delete next[kind as keyof Profile['socials']];
    return { ...p, socials: next };
  });
}
```

- [ ] **Step 4: Add `ChannelRow` and `AddChannel` components**

Add these two new components below the `ProfilePage` function in the same file (not exported):

```tsx
function ChannelRow({
  kind,
  initialValue,
  onSave,
  onClear,
}: {
  kind: ProfileChannel;
  initialValue: string;
  onSave: (v: string) => Promise<void>;
  onClear: () => Promise<void>;
}) {
  const [value, setValue] = useState(initialValue);
  return (
    <div className="flex items-center gap-2">
      <span className="flex items-center justify-center flex-shrink-0">
        <ChannelIcon kind={kind as ChannelKind} size={18} />
      </span>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => { if (value.trim() && value !== initialValue) onSave(value.trim()); }}
        placeholder={PROFILE_CHANNEL_PLACEHOLDERS[kind]}
        className="flex-1 px-3 py-2 rounded-lg bg-neutral-900 border border-neutral-800 text-sm"
      />
      <button
        type="button"
        onClick={onClear}
        aria-label={`Remove ${PROFILE_CHANNEL_LABELS[kind]}`}
        className="text-neutral-500 hover:text-white p-2"
      >
        <LuX size={16} />
      </button>
    </div>
  );
}

function AddChannel({
  existing,
  onAdd,
}: {
  existing: ProfileChannel[];
  onAdd: (kind: ProfileChannel, value: string) => Promise<void>;
}) {
  const available = PROFILE_CHANNELS.filter((c) => !existing.includes(c));
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<ProfileChannel | ''>('');
  const [value, setValue] = useState('');

  if (available.length === 0) return null;

  async function handleAdd() {
    if (!selected || !value.trim()) return;
    await onAdd(selected, value.trim());
    setSelected('');
    setValue('');
    setExpanded(false);
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full border border-neutral-700 bg-neutral-900 text-white text-xs"
      >
        + Add field
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value as ProfileChannel | '')}
        className="bg-neutral-900 border border-neutral-700 rounded px-2 py-2 text-sm text-neutral-300"
        autoFocus
      >
        <option value="">Pick field…</option>
        {available.map((c) => <option key={c} value={c}>{PROFILE_CHANNEL_LABELS[c]}</option>)}
      </select>
      {selected && (
        <>
          <span className="flex items-center justify-center flex-shrink-0">
            <ChannelIcon kind={selected as ChannelKind} size={18} />
          </span>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
            placeholder={PROFILE_CHANNEL_PLACEHOLDERS[selected]}
            className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-neutral-900 border border-neutral-800 text-sm"
          />
          <button
            type="button"
            onClick={handleAdd}
            aria-label="Save"
            className="p-2 text-white"
          >
            <LuCheck size={18} />
          </button>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Replace the 4-input socials block**

Find the existing socials block in the form:

```tsx
<div className="space-y-2">
  <label className="text-sm text-neutral-400">Socials (optional)</label>
  {(['x', 'linkedin', 'email', 'website'] as const).map((kind) => (
    <input
      key={`${kind}-${profile?.socials?.[kind] ?? ''}`}
      placeholder={kind}
      className="w-full px-4 py-3 rounded-lg bg-neutral-900 border border-neutral-800"
      onBlur={(e) => e.target.value && setSocial(kind, e.target.value)}
      defaultValue={profile?.socials?.[kind] ?? ''}
    />
  ))}
</div>
```

Replace with:

```tsx
<div className="space-y-2">
  <label className="text-sm text-neutral-400">Channels (optional)</label>
  {profile && PROFILE_CHANNELS.filter((k) => readChannel(profile, k) !== null && readChannel(profile, k) !== '').map((kind) => (
    <ChannelRow
      key={`${kind}-${readChannel(profile, kind)}`}
      kind={kind}
      initialValue={readChannel(profile, kind) ?? ''}
      onSave={(v) => saveChannel(kind, v)}
      onClear={() => clearChannel(kind)}
    />
  ))}
  {profile && (
    <AddChannel
      existing={PROFILE_CHANNELS.filter((k) => readChannel(profile, k) !== null && readChannel(profile, k) !== '')}
      onAdd={saveChannel}
    />
  )}
</div>
```

- [ ] **Step 6: Run typecheck and tests**

Run: `pnpm typecheck` — expect clean.
Run: `pnpm test` — expect 87/87 pass.

- [ ] **Step 7: Run a production build**

Run: `pnpm build`
Expected: builds cleanly. Catches client/server boundary mistakes that typecheck misses.

- [ ] **Step 8: Commit**

```bash
git add src/app/app/profile/page.tsx
git commit -m "feat(profile): per-row channel editor with brand icons + Add field"
```

---

## Final verification

After all four tasks land:

- [ ] `pnpm typecheck` clean
- [ ] `pnpm test` green
- [ ] `pnpm build` succeeds

Push the branch and dispatch the preview deploy. Browser-verify the flows listed in the spec's round-2 Testing section.
