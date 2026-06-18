# UI Refresh — Implementation Plan

> Use `superpowers:subagent-driven-development`. Spec is at `docs/superpowers/specs/2026-06-18-ui-refresh-design.md`.

**Goal:** Top-to-bottom visual rebuild matching the locked Desktop mockup (`connectyall-ui-refresh-mockup.html`). Cream-to-iris background, mono labels, split-color headlines, bottom nav pill, no gradients, no navy footer.

**Architecture:**
- 7 sequential tasks
- No DB or API changes — purely presentational + nav restructure
- Shared `PageHeader` + `BottomNav` components used by every app page

---

### Task 1: Foundation — tokens, shared components, delete old

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/app/layout.tsx`
- Modify: `src/app/app/_layout-constants.ts`
- Create: `src/components/page-header.tsx`
- Create: `src/components/bottom-nav.tsx`
- Create: `src/lib/greeting.ts`
- Delete: `src/components/footer.tsx`
- Delete: `src/components/nav-toggle.tsx`
- Delete: `src/app/app/record/greeting.tsx`

**Step 1: Update `globals.css`** to the iris palette:

```css
@import "tailwindcss";

:root {
  --background: #F2F2F8;
  --foreground: #0A0A0A;
}

@theme inline {
  --color-foreground: var(--foreground);
  --color-brand: #7C5CFF;
  --color-cream: #F2F2F8;
  --color-surface: #FFFFFF;
  --color-muted: #6B7280;
  --color-line: #ECEAF3;
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}

body {
  background: var(--background);
  color: var(--foreground);
  font-family: var(--font-geist-sans), Arial, Helvetica, sans-serif;
}

@keyframes logo-flip {
  0%   { transform: rotateY(0deg); }
  100% { transform: rotateY(360deg); }
}

.logo-spinner {
  animation: logo-flip 1.6s linear infinite;
  transform-style: preserve-3d;
}
```

The white-via-violet gradient body is gone — flat iris.

**Step 2: Update `src/app/layout.tsx`** — drop the `<Footer />` import and mount. Body classes become `min-h-full flex flex-col bg-cream text-neutral-950`.

**Step 3: Update `_layout-constants.ts`:**

```ts
// Mobile (<640px): px-4 / py-6 tight.
// sm+: px-6 + max-w-xl.
// pb-28 leaves room for the floating bottom-nav pill.
export const APP_CONTAINER = 'px-4 py-6 pb-28 sm:px-6 sm:max-w-xl sm:mx-auto space-y-4 w-full';
```

**Step 4: Create `src/components/page-header.tsx`:**

```tsx
import type { ReactNode } from 'react';

export function PageHeader({ status }: { status?: ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <div className="inline-flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-brand text-white flex items-center justify-center font-extrabold text-sm">c</div>
        <span className="text-base font-bold">Connectyall</span>
      </div>
      {status && <div className="font-mono text-[11px] tracking-[0.2em] text-muted font-semibold uppercase">{status}</div>}
    </div>
  );
}
```

**Step 5: Create `src/components/bottom-nav.tsx`:**

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LuMic, LuUser, LuUsers } from 'react-icons/lu';

const TABS = [
  { href: '/app/profile', icon: LuUser, label: 'Profile', match: '/app/profile' },
  { href: '/app/record', icon: LuMic, label: 'Record', match: '/app/record' },
  { href: '/app/connections', icon: LuUsers, label: 'Network', match: '/app/connections' },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 bg-[#0F0F12] text-white rounded-full p-1.5 flex gap-1 items-center shadow-[0_6px_20px_rgba(0,0,0,0.25)]">
      {TABS.map(({ href, icon: Icon, label, match }) => {
        const active = pathname.startsWith(match);
        return active ? (
          <Link
            key={href}
            href={href}
            className="inline-flex items-center gap-1.5 px-4 h-10 rounded-full bg-brand text-white text-sm font-semibold"
          >
            <Icon size={16} />
            <span>{label}</span>
          </Link>
        ) : (
          <Link
            key={href}
            href={href}
            aria-label={label}
            className="w-10 h-10 rounded-full flex items-center justify-center text-zinc-400 hover:text-white transition"
          >
            <Icon size={16} />
          </Link>
        );
      })}
    </nav>
  );
}
```

**Step 6: Create `src/lib/greeting.ts`:**

```ts
export function getFirstName(displayName: string | null | undefined): string | null {
  if (!displayName) return null;
  const trimmed = displayName.trim();
  if (!trimmed) return null;
  return trimmed.split(/\s+/)[0];
}

export function getGreetingLabel(displayName: string | null | undefined, now: Date = new Date()): string {
  const firstName = getFirstName(displayName);
  const hour = now.getHours();
  const timeOfDay = hour < 12 ? 'MORNING' : hour < 18 ? 'AFTERNOON' : 'EVENING';
  return firstName ? `GOOD ${timeOfDay}, ${firstName.toUpperCase()}` : `GOOD ${timeOfDay}`;
}
```

**Step 7: Delete the three orphan files** (`footer.tsx`, `nav-toggle.tsx`, `greeting.tsx`). Verify no remaining imports — grep `from '@/components/footer'`, `from '@/components/nav-toggle'`, `from './greeting'` (record/), `from '../record/greeting'` (profile/), `from '@/app/app/record/greeting'`. Any consumers are updated in later tasks; if grep returns hits, leave the file in place and the subagent handling that page will fix it.

**Step 8: Verify**

```
pnpm typecheck
pnpm test
pnpm build
```

Build will fail until consumer pages are updated — that's expected. Typecheck should still pass.

**Step 9: Commit:**

```bash
git add src/app/globals.css src/app/layout.tsx src/app/app/_layout-constants.ts src/components/page-header.tsx src/components/bottom-nav.tsx src/lib/greeting.ts
git rm src/components/footer.tsx src/components/nav-toggle.tsx src/app/app/record/greeting.tsx 2>/dev/null || true
git commit -m "foundation for ui refresh — iris tokens, header + bottom nav, drop old chrome"
```

The `git rm` may fail if a file doesn't exist or is still referenced; safe to ignore (we'll handle deletions inside the relevant page tasks where needed).

---

### Task 2: Record page rebuild

**Files:**
- Modify: `src/app/app/record/page.tsx`

Drop the `Greeting` import (was deleted in Task 1). Use `useEffect` to fetch `/api/profile`, compute `getGreetingLabel(profile?.displayName)` for the mono label, and render the three states.

**Step 1: Replace `src/app/app/record/page.tsx`** with:

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LuMic } from 'react-icons/lu';
import { PageHeader } from '@/components/page-header';
import { BottomNav } from '@/components/bottom-nav';
import { getGreetingLabel } from '@/lib/greeting';

type State = 'idle' | 'recording' | 'uploading';

export default function RecordPage() {
  const router = useRouter();
  const [state, setState] = useState<State>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [levels, setLevels] = useState<number[]>(Array(15).fill(0));
  const [displayName, setDisplayName] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/profile', { cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        setDisplayName(json.profile?.displayName ?? null);
      }
    })();
  }, []);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  async function start() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;

    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/mp4')
      ? 'audio/mp4'
      : '';
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    chunksRef.current = [];
    rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    rec.start();
    recorderRef.current = rec;
    setState('recording');
    setElapsed(0);

    timerRef.current = window.setInterval(() => setElapsed((e) => e + 1), 1000);

    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 64;
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    function tick() {
      analyser.getByteFrequencyData(data);
      const next = Array.from({ length: 15 }, (_, i) => {
        const idx = Math.floor((i / 15) * data.length);
        return data[idx] / 255;
      });
      setLevels(next);
      rafRef.current = requestAnimationFrame(tick);
    }
    tick();
  }

  async function stop() {
    const rec = recorderRef.current;
    if (!rec) return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (timerRef.current) clearInterval(timerRef.current);

    await new Promise<void>((resolve) => {
      rec.onstop = () => resolve();
      rec.stop();
    });
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setState('uploading');

    const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });
    const fd = new FormData();
    fd.append('audio', new File([blob], `memo.${(rec.mimeType || 'webm').split('/')[1].split(';')[0]}`, { type: blob.type }));
    const res = await fetch('/api/capture', { method: 'POST', body: fd });
    if (!res.ok) {
      alert(`Upload failed: ${await res.text()}`);
      setState('idle');
      return;
    }
    const { interactionId } = await res.json();
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
    router.push('/app/connections');
  }

  const status =
    state === 'recording' ? <span className="text-red-600">● REC</span> :
    state === 'uploading' ? <span>● PROCESSING</span> :
    <span><span className="text-brand">●</span> READY</span>;

  const greeting = getGreetingLabel(displayName);

  return (
    <div className="px-6 py-6 pb-28 max-w-xl mx-auto w-full min-h-[calc(100dvh)] flex flex-col">
      <PageHeader status={status} />
      <div className="flex-1 flex flex-col pt-3 gap-8">
        {state === 'idle' && (
          <Top
            label={greeting}
            headlineFirst="Who did you"
            headlineAccent="just meet?"
            sub="Tap to record. We'll pull a name, channels, and the gist — no typing."
          />
        )}
        {state === 'recording' && (
          <Top
            label={<><span className="text-red-600">●</span> RECORDING · {fmtTime(elapsed)}</>}
            labelTone="red"
            headlineFirst="Listening"
            headlineAccent="closely."
            sub="When you're done, tap stop. We'll turn it into a connection."
          />
        )}
        {state === 'uploading' && (
          <Top
            label={<>● PROCESSING</>}
            headlineFirst="Connecting"
            headlineAccent="y'all…"
            sub="Hang tight while we turn your voice into a connection."
          />
        )}
        <div className="flex-1 flex flex-col items-center justify-center gap-5">
          <div className="relative flex items-center justify-center">
            <GlowRings tone={state === 'recording' ? 'red' : 'brand'} />
            {state === 'idle' && (
              <button
                onClick={start}
                className="relative z-10 w-[150px] h-[150px] rounded-full bg-brand text-white flex items-center justify-center shadow-[0_14px_36px_rgba(124,92,255,0.40)]"
              >
                <LuMic size={50} />
              </button>
            )}
            {state === 'recording' && (
              <button
                onClick={stop}
                className="relative z-10 w-[150px] h-[150px] rounded-full bg-red-500 text-white flex items-center justify-center shadow-[0_14px_36px_rgba(220,38,38,0.40)]"
              >
                <div className="w-12 h-12 rounded bg-white" />
              </button>
            )}
            {state === 'uploading' && (
              <div className="logo-spinner relative z-10 w-[150px] h-[150px] rounded-3xl bg-brand text-white flex items-center justify-center font-extrabold text-[78px] shadow-[0_14px_36px_rgba(124,92,255,0.40)]" style={{ perspective: 600 }}>
                c
              </div>
            )}
          </div>
          <div className="flex items-end justify-center gap-1 h-14 px-4">
            {levels.map((v, i) => (
              <div key={i} style={{ height: `${Math.max(8, v * 56)}px` }} className={`w-1 ${state === 'recording' ? 'bg-red-500/55' : 'bg-brand/55'} rounded`} />
            ))}
          </div>
          <Caption state={state} elapsed={elapsed} />
        </div>
      </div>
      <BottomNav />
    </div>
  );
}

function Top({ label, labelTone, headlineFirst, headlineAccent, sub }: { label: React.ReactNode; labelTone?: 'red'; headlineFirst: string; headlineAccent: string; sub: string; }) {
  return (
    <div>
      <div className={`font-mono text-[13px] tracking-[0.2em] font-semibold uppercase ${labelTone === 'red' ? 'text-red-600' : 'text-muted'}`}>{label}</div>
      <h1 className="mt-3 text-5xl font-extrabold leading-[1.02] tracking-tight">
        {headlineFirst}
        <br />
        <span className="text-brand">{headlineAccent}</span>
      </h1>
      <p className="mt-4 text-[15px] text-neutral-600 leading-relaxed max-w-[280px]">{sub}</p>
    </div>
  );
}

function GlowRings({ tone }: { tone: 'brand' | 'red' }) {
  const rgb = tone === 'red' ? '220, 38, 38' : '124, 92, 255';
  return (
    <div
      aria-hidden
      className="absolute w-[300px] h-[300px] rounded-full"
      style={{
        background: `radial-gradient(circle, rgba(${rgb}, 0.14) 0%, rgba(${rgb}, 0.04) 60%, rgba(${rgb}, 0) 80%)`,
      }}
    >
      <div className="absolute inset-[30px] rounded-full" style={{ background: `rgba(${rgb}, 0.06)` }} />
      <div className="absolute inset-[60px] rounded-full" style={{ background: `rgba(${rgb}, 0.12)` }} />
    </div>
  );
}

function Caption({ state, elapsed }: { state: State; elapsed: number }) {
  if (state === 'recording') {
    return <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-red-600 font-medium"><span className="mr-1">●</span> TAP TO STOP</div>;
  }
  if (state === 'uploading') {
    return <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-muted font-medium"><span className="text-neutral-400 mr-1">●</span> PROCESSING…</div>;
  }
  return <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-muted font-medium"><span className="text-brand mr-1">●</span> TAP TO RECORD <span className="text-neutral-400">·</span> UP TO 60S</div>;
}

function fmtTime(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
```

**Step 2: Verify and commit**

```
pnpm typecheck && pnpm build
git add src/app/app/record/page.tsx
git commit -m "record page rebuild for ui refresh"
```

---

### Task 3: Connections list rebuild

**File:** `src/app/app/connections/page.tsx`

Restructure with:
- `PageHeader` + status `<N> PEOPLE · <M> MEMOS` (sum `meetingsCount` from the existing API response)
- Top action row: split-color `Your **network**` headline + brand `+` FAB linking to `/app/record`
- Search bar (white pill) + sort dropdown (white pill, smaller)
- Existing rows reshaped: white card, bubble, name/sub/tag, mono date + ↗ arrow
- Existing swipe-to-delete preserved (only the row container changes)
- Existing first-visit hint preserved (already uses mono text)
- Empty state replaced with the centerpiece pattern: mono `NOBODY HERE YET` + `Your / network awaits.` + glow rings around `🎤 Record your first` CTA + caption
- `BottomNav` at bottom

The data fetch, sort, search, swipe handlers, ConfirmDelete modal all stay as-is. Only the JSX changes.

Reference visuals: frames #04 (populated) and #05 (empty) in the mockup file.

Verify, commit `connections list rebuild for ui refresh`.

---

### Task 4: Connection detail port

**File:** `src/app/app/connections/[id]/page.tsx`

Big file but the changes are surgical:

1. Add `PageHeader` + `BottomNav` to the page wrapper, status `<N> MEETINGS` (count = `previousMeetings.length + 1`).
2. Replace every gradient card (`rounded-3xl bg-gradient-to-br from-purple-100…`) with the new white card style: `rounded-3xl bg-white border border-line shadow-[0_2px_8px_rgba(0,0,0,0.04)] px-5 py-4`.
3. Name banner gets a mono `CONTACT` label and the name with an inline `LuPencil`.
4. Notes/recap card: add mono `PRIVATE NOTE` and `WHAT WE TALKED ABOUT` labels above each block; add inline `LuPencil` at the end of each text block.
5. Channel rows: bring in the mono channel tag (36px wide column) next to the channel icon. Use the iris-bg value pill with the trailing pencil icon for editing.
6. Send button stays as the black `bg-neutral-950 text-white` pill.
7. Chip row (Add field / Save to contacts) stays — adopts the new white pill styling.
8. PREVIOUS MEETINGS card uses iris-tinted past-meeting sub-cards (`bg-cream`).
9. Bottom "Save" CTA stays as black pill with check icon.

Reference: frame #06 in the mockup.

Verify, commit `connection detail rebuild for ui refresh`.

---

### Task 5: Profile rebuild

**File:** `src/app/app/profile/page.tsx`

1. Add `PageHeader` (status `PROFILE`) + `BottomNav` (Profile tab active).
2. Add `Your **profile**` headline below header.
3. Avatar with camera badge — minor change: badge bg = `bg-brand` (was dark) per the mockup (alternative: keep dark, just verify which one is in the mockup file). Use whichever matches the mockup.
4. **Drop the third input** (`Optional — extra context the AI uses for extraction`). Don't render it.
5. **YOUR INFO card** restructure: instead of one card with three `<input>` rows, render two display-style fields with mono labels + value + `LuPencil` icon. Each field's pencil opens an inline edit input (or could just be visual for now — implement as actual click-to-edit for the v1).
6. **Channels card**: each row's value pill gets an inline `LuPencil`. Functional behavior stays — they're already onBlur-editable inputs; the pencil is decorative for affordance. (Wraps existing `ChannelRow` component or modifies it.)
7. **Sign-out + Delete-my-account** as proper pill buttons: full-width, white bg, Inter bold. Sign-out has neutral border; Delete has red border + red text.

Reference: frame #07 in the mockup.

Verify, commit `profile rebuild for ui refresh`.

---

### Task 6: Sign-in rebuild

**File:** `src/app/app/sign-in/page.tsx`

Both steps wrap the form in the record-page rhythm:

- `PageHeader` with status `● SIGN IN` (purple dot) or `● ENTER CODE`
- Mono label `VOICE TO CONNECTION` or `CHECK YOUR INBOX`
- Split-color headline (`Welcome.` / `Sign in to start.` or `Drop the` / `6-digit code.`)
- Body sub
- Form area wrapped in `GlowRings` (extract the helper from the record page into `src/components/glow-rings.tsx` so it can be reused)
- Inputs are bigger now: `p-[22px]` for email, `p-[24px]` for code with `text-[34px]` `tracking-[0.35em]`, `rounded-3xl`, soft purple shadow
- CTA: brand-purple pill with strong purple glow shadow (was black before, the mockup made it brand)
- Mono caption at bottom

No `BottomNav` (sign-in is pre-auth).

Reference: frames #08 + #09 in the mockup.

Verify, commit `sign-in rebuild for ui refresh`.

---

### Task 7: Marketing root + privacy + terms + public landing

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/app/privacy/page.tsx`
- Modify: `src/app/terms/page.tsx`
- Modify: `src/app/c/[id]/page.tsx`

**Marketing root** (`src/app/page.tsx`):
- Header strip (logo + no status)
- Mono badge `● VOICE TO CONNECTION` (small amber-on-iris pill)
- Three-line headline `Voice notes / that **connect** / y'all.`
- Body sub
- Black pill `Open the app →` CTA
- Bottom footer (mono uppercase, centered): `PRIVACY · TERMS · A PORTFOLIO PROJECT BY TIM NAN`
- The logged-in redirect logic stays.

**Privacy + Terms** (`src/app/privacy/page.tsx`, `src/app/terms/page.tsx`):
- Replace top header with `PageHeader` (no status)
- Section labels (`<h2>`) become mono uppercase: `font-mono text-[11px] tracking-[0.2em] uppercase text-muted font-semibold`
- Body text unchanged
- Background flips automatically (body class is already `bg-cream`)

**Public landing** (`src/app/c/[id]/page.tsx`):
- Cream bg (auto from body)
- Mono `FOR <name>` label at top
- 116px round photo (sender's actual photo) with white border
- Sender name styled with `text-brand`
- Tagline below in muted text
- Italic recap
- 2-column grid of channel cells: white cards, `rounded-2xl`, line icon + mono channel tag (`EMAIL`, `LINKEDIN`, etc.)
- Black pill `💾 Save <name> to Contacts`
- "made with Connectyall" with the brand logo mark stays at the bottom

Reference: frames #10 + #11 in the mockup.

Verify with `pnpm build`, commit `marketing + privacy + terms + public landing for ui refresh`.

---

## Final verification

```
pnpm typecheck && pnpm test && pnpm build
```

Push, deploy, sync Inngest, share URL.
