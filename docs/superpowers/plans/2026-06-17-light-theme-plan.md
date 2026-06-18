# Light-theme Rebrand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Re-skin the whole app from dark (`bg-neutral-950 text-white`) to a light palette anchored on brand purple `#7C5CFF`, matching the look-and-feel reference the user provided. Recreate the logo as SVG, swap the favicon, register the brand color in Tailwind's `@theme` block, and walk every user-facing page through the conversion.

**Design tokens (reference for every task):**

| Token | Class / value | Used for |
|---|---|---|
| Page bg | `bg-neutral-50` | Every page background |
| Surface | `bg-white` | Inputs, cards, channel rows |
| Text primary | `text-neutral-950` | Headings |
| Text body | `text-neutral-700` | Paragraphs |
| Text muted | `text-neutral-500` | Hints, placeholders |
| Border | `border-neutral-200` | Inputs, dividers |
| Brand purple | `text-brand` / `bg-brand` (custom token, see Task A) | Logo tile, accent words |
| Primary CTA | `bg-neutral-950 text-white` | Form submit, "Open the app" |
| Recording red | `bg-red-500 text-white` | Mic button while recording |
| Accent badge | `bg-amber-100 text-amber-800` | Pill badges (used sparingly) |

**Tech Stack:** Next.js 16, Tailwind v4 (`@theme` block in globals.css), react-icons (Lucide + Simple Icons + Font Awesome).

---

### Task A: Tokens, Logo component, favicon

**Files:**
- Modify: `src/app/globals.css`
- Create: `src/components/logo.tsx`
- Create: `public/icon.svg`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Register the brand color in `@theme`**

In `src/app/globals.css`, find the `@theme inline` block and add a brand color. Also drop the auto-dark behavior since the design is intentionally light-only. Final globals.css:

```css
@import "tailwindcss";

:root {
  --background: #fafafa;
  --foreground: #0a0a0a;
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-brand: #7C5CFF;
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}

body {
  background: var(--background);
  color: var(--foreground);
  font-family: var(--font-geist-sans), Arial, Helvetica, sans-serif;
}
```

This makes `bg-brand` and `text-brand` available as Tailwind classes app-wide. The auto-dark `prefers-color-scheme` block is removed — we want light always.

- [ ] **Step 2: Build the `Logo` component**

Create `src/components/logo.tsx`:

```tsx
type Props = { size?: number; className?: string };

export function LogoMark({ size = 40, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Connectyall"
      role="img"
    >
      <rect x="0" y="0" width="40" height="40" rx="10" fill="#7C5CFF" />
      <text
        x="20"
        y="29"
        textAnchor="middle"
        fontFamily="Inter, system-ui, sans-serif"
        fontSize="24"
        fontWeight="800"
        fill="#FFFFFF"
      >
        c
      </text>
    </svg>
  );
}

export function Logo({ size = 40, className }: Props) {
  return (
    <div className={`inline-flex items-center gap-2 ${className ?? ''}`}>
      <LogoMark size={size} />
      <span className="text-2xl font-bold tracking-tight text-neutral-950">connectyall</span>
    </div>
  );
}
```

- [ ] **Step 3: Save the favicon mark to `public/icon.svg`**

Create `public/icon.svg`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="40" height="40" rx="10" fill="#7C5CFF"/>
  <text x="20" y="29" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="24" font-weight="800" fill="#FFFFFF">c</text>
</svg>
```

- [ ] **Step 4: Wire the favicon in `layout.tsx`**

In `src/app/layout.tsx`, extend the `metadata` export to include the icon:

```typescript
export const metadata: Metadata = {
  title: "Connectyall: voice notes that connect y'all",
  description: "Connectyall turns the voice memo you record after meeting someone into a connection you can pass along the same day. Talk it out, we handle the rest. They get your details, you remember theirs.",
  icons: { icon: '/icon.svg' },
};
```

Also flip the body background — replace `<body className="min-h-full flex flex-col">` with `<body className="min-h-full flex flex-col bg-neutral-50 text-neutral-950">`.

- [ ] **Step 5: Run checks**

```
pnpm typecheck && pnpm test && pnpm build
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/app/globals.css src/app/layout.tsx src/components/logo.tsx public/icon.svg
git commit -m "feat(theme): brand purple token + SVG logo + light-mode globals"
```

---

### Task B: Flip channel icons for light backgrounds

**Files:**
- Modify: `src/app/app/cards/[id]/channel-icons.tsx`

- [ ] **Step 1: Replace `#FFFFFF` with `#0F0F0F` for monochrome icons**

In `src/app/app/cards/[id]/channel-icons.tsx`, the `CHANNEL_ICONS` map currently uses `'#FFFFFF'` for `email`, `phone`, `x`, `website`. Those would vanish on the new white/cream surfaces.

Replace all four to `'#0F0F0F'`:

```typescript
export const CHANNEL_ICONS: Record<ChannelKind, IconConfig> = {
  email:    { Icon: LuMail,       color: '#0F0F0F', label: 'Email'    },
  phone:    { Icon: LuPhone,      color: '#0F0F0F', label: 'Phone'    },
  telegram: { Icon: SiTelegram,   color: '#26A5E4', label: 'Telegram' },
  x:        { Icon: SiX,          color: '#0F0F0F', label: 'X'        },
  linkedin: { Icon: FaLinkedin,   color: '#0A66C2', label: 'LinkedIn' },
  website:  { Icon: LuGlobe,      color: '#0F0F0F', label: 'Website'  },
  whatsapp: { Icon: SiWhatsapp,   color: '#25D366', label: 'WhatsApp' },
  wechat:   { Icon: SiWechat,     color: '#07C160', label: 'WeChat'   },
  line:     { Icon: SiLine,       color: '#06C755', label: 'Line'     },
};
```

The colorful brand icons (Telegram, LinkedIn, WhatsApp, WeChat, Line) stay — they're recognizable in brand color on white.

- [ ] **Step 2: Run checks and commit**

```
pnpm typecheck && pnpm test
git add src/app/app/cards/[id]/channel-icons.tsx
git commit -m "feat(theme): channel icons readable on light backgrounds"
```

---

### Task C: Re-skin root + sign-in pages

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/app/app/sign-in/page.tsx`

- [ ] **Step 1: Rewrite root landing (`src/app/page.tsx`)**

Replace the entire file with:

```tsx
import Link from 'next/link';
import { Logo } from '@/components/logo';

export default function Home() {
  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-950 px-6 py-10 flex flex-col">
      <header>
        <Logo />
      </header>
      <div className="flex-1 flex flex-col justify-center max-w-2xl">
        <p className="inline-flex w-fit items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-semibold mb-6">
          ✨ Voice-to-Connection
        </p>
        <h1 className="text-5xl sm:text-6xl font-bold tracking-tight leading-[1.05]">
          Voice notes that <span className="text-brand">connect</span> y&apos;all.
        </h1>
        <p className="mt-6 text-lg text-neutral-700 leading-relaxed">
          Connectyall turns the voice memo you record after meeting someone into a connection you can pass along the same day. Talk it out, we handle the rest. They get your details, you remember theirs.
        </p>
        <Link
          href="/app"
          className="mt-8 inline-flex w-fit items-center px-6 py-3 rounded-full bg-neutral-950 text-white font-semibold hover:bg-neutral-800 transition"
        >
          Open the app →
        </Link>
      </div>
      <footer className="mt-12 text-sm text-neutral-500">
        A portfolio project by Tim Nan.
      </footer>
    </main>
  );
}
```

- [ ] **Step 2: Rewrite sign-in (`src/app/app/sign-in/page.tsx`)**

Replace the file with:

```tsx
'use client';

import { useState } from 'react';
import { signIn } from '@/lib/auth/client';
import { Logo } from '@/components/logo';

export default function SignInPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('sending');
    setErrorMsg(null);
    try {
      await signIn.magicLink({ email, callbackURL: '/app' });
      setStatus('sent');
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'Unknown error');
    }
  }

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-950 px-6 py-10 flex flex-col">
      <header>
        <Logo />
      </header>
      <div className="flex-1 flex flex-col items-center justify-center">
        <div className="w-full max-w-sm space-y-6">
          <div className="space-y-3 text-center">
            <p className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-semibold">
              ✨ Magic-link sign-in
            </p>
            <h1 className="text-3xl font-bold">Voice notes that <span className="text-brand">connect</span> y&apos;all.</h1>
          </div>
          {status === 'sent' ? (
            <p className="text-center text-neutral-700">Magic link sent to <strong>{email}</strong>. Check your inbox.</p>
          ) : (
            <form onSubmit={onSubmit} className="space-y-3">
              <input
                type="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-lg bg-white border border-neutral-200 text-neutral-950 placeholder:text-neutral-500"
              />
              <button
                type="submit"
                disabled={status === 'sending'}
                className="w-full px-4 py-3 rounded-full bg-neutral-950 text-white font-semibold disabled:opacity-50 hover:bg-neutral-800 transition"
              >
                {status === 'sending' ? 'Sending…' : 'Send magic link'}
              </button>
              {errorMsg && <p className="text-red-600 text-sm">{errorMsg}</p>}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Run checks and commit**

```
pnpm typecheck && pnpm test
git add src/app/page.tsx src/app/app/sign-in/page.tsx
git commit -m "feat(theme): light-mode root + sign-in with logo + accent badge"
```

---

### Task D: Re-skin greeting + record page

**Files:**
- Modify: `src/app/app/record/greeting.tsx`
- Modify: `src/app/app/record/page.tsx`

- [ ] **Step 1: Update `greeting.tsx`**

In `src/app/app/record/greeting.tsx`:

- The avatar skeleton currently uses `bg-neutral-800`. Flip to `bg-neutral-200`.
- The pencil edit badge currently uses `bg-white text-neutral-950 ... ring-neutral-950`. Flip to `bg-neutral-950 text-white ring-white`.
- The greeting `<h2>` currently uses default text color (which will inherit `text-neutral-950` on light bg — good). Wrap the name in `<span className="text-brand">{firstName}</span>` for the accent word treatment:

Find:
```tsx
<h2 className="text-xl font-semibold text-center">
  {firstName ? `Hello, ${firstName} 👋` : 'Hello 👋'}
</h2>
```

Replace with:
```tsx
<h2 className="text-xl font-semibold text-center">
  {firstName ? <>Hello, <span className="text-brand">{firstName}</span> 👋</> : <>Hello 👋</>}
</h2>
```

Find the skeleton:
```tsx
return <div className="w-32 h-32 rounded-full bg-neutral-800" />;
```

Replace with:
```tsx
return <div className="w-32 h-32 rounded-full bg-neutral-200" />;
```

Find the pencil badge:
```tsx
<span className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-white text-neutral-950 flex items-center justify-center shadow ring-2 ring-neutral-950">
  <LuPencil size={16} />
</span>
```

Replace with:
```tsx
<span className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-neutral-950 text-white flex items-center justify-center shadow ring-2 ring-white">
  <LuPencil size={16} />
</span>
```

- [ ] **Step 2: Update `record/page.tsx`**

In `src/app/app/record/page.tsx`:

- Waveform bars currently use `bg-white/70`. Flip to `bg-neutral-700/70`.
- Mic button idle uses `bg-white text-neutral-950`. Flip to `bg-neutral-950 text-white`. Recording stays `bg-red-500 text-white`. Add `shadow-lg` for hierarchy on light bg.
- Subhead text (`text-neutral-400`) → `text-neutral-600`.
- The uploading text (`text-neutral-400`) → `text-neutral-600`.

Specific edits:

Find:
```tsx
<p className="text-neutral-400 text-sm">{state === 'recording' ? `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}` : 'Tell me about who you just met.'}</p>
```

Replace `text-neutral-400` with `text-neutral-600`.

Find:
```tsx
<div key={i} style={{ height: `${Math.max(8, v * 80)}px` }} className="w-1 bg-white/70 rounded" />
```

Replace `bg-white/70` with `bg-neutral-700/70`.

Find:
```tsx
className={`w-24 h-24 rounded-full flex items-center justify-center font-semibold transition ${
  state === 'recording' ? 'bg-red-500 text-white' : 'bg-white text-neutral-950'
} disabled:opacity-50`}
```

Replace with:
```tsx
className={`w-24 h-24 rounded-full flex items-center justify-center font-semibold transition shadow-lg ${
  state === 'recording' ? 'bg-red-500 text-white' : 'bg-neutral-950 text-white'
} disabled:opacity-50`}
```

Find:
```tsx
{state === 'uploading' && <p className="text-center text-neutral-400 text-sm">Connecting y&apos;all…</p>}
```

Replace `text-neutral-400` with `text-neutral-600`.

- [ ] **Step 3: Run checks and commit**

```
pnpm typecheck && pnpm test
git add src/app/app/record/greeting.tsx src/app/app/record/page.tsx
git commit -m "feat(theme): light-mode greeting + record page"
```

---

### Task E: Re-skin profile page

**Files:**
- Modify: `src/app/app/profile/page.tsx`

- [ ] **Step 1: Walk through every styled element and convert**

Use a single find-replace pass per pattern. The file (322 lines) uses these dark-theme classes that need flipping:

| Find | Replace |
|---|---|
| `bg-neutral-900 border-neutral-800` | `bg-white border-neutral-200` |
| `text-neutral-400` | `text-neutral-600` |
| `bg-white text-neutral-950 font-semibold disabled:opacity-50` | `bg-neutral-950 text-white font-semibold disabled:opacity-50 hover:bg-neutral-800 transition rounded-full` (submit button gets pill rounding) |
| `bg-neutral-900 border-neutral-700` | `bg-white border-neutral-200` |
| `bg-neutral-900` (standalone) | `bg-white` |
| `border-neutral-700` (standalone) | `border-neutral-200` |
| `bg-white text-neutral-950 flex items-center justify-center shadow ring-2 ring-neutral-950` (camera badge) | `bg-neutral-950 text-white flex items-center justify-center shadow ring-2 ring-white` |
| `text-neutral-500 hover:text-white` (X remove button) | `text-neutral-500 hover:text-neutral-950` |
| `text-white` on the AddChannel save button | `text-neutral-950` |

After the global pass, look for the camera badge specifically and the submit button — those are the highest-visibility surfaces.

Headline accent: in the `headline()` function helper, the JSX it returns can't have a `<span>` directly (it returns a string today). Update to return a JSX node. Find:

```typescript
function headline() {
  if (!profile) return 'Hello';
  const firstName = getFirstName(profile.displayName);
  if (profile.onboardedAt) {
    return firstName
      ? `Hey ${firstName}, keep your details fresh.`
      : 'Keep your details fresh.';
  }
  return "Welcome. Let's set up how people reach you.";
}
```

Replace with:

```typescript
function headline(): React.ReactNode {
  if (!profile) return 'Hello';
  const firstName = getFirstName(profile.displayName);
  if (profile.onboardedAt) {
    return firstName
      ? <>Hey <span className="text-brand">{firstName}</span>, keep your details fresh.</>
      : 'Keep your details fresh.';
  }
  return <><span className="text-brand">Welcome.</span> Let&apos;s set up how people reach you.</>;
}
```

(The existing `<h1>` already does `{headline()}` so swapping return type to ReactNode just works.)

- [ ] **Step 2: Run checks and commit**

```
pnpm typecheck && pnpm test && pnpm build
git add src/app/app/profile/page.tsx
git commit -m "feat(theme): light-mode profile page"
```

---

### Task F: Re-skin post-capture page

**Files:**
- Modify: `src/app/app/cards/[id]/page.tsx`

This is the largest file (701 lines) with the most touch points. Read the entire file first, then apply the same find-replace patterns as Task E:

| Find | Replace |
|---|---|
| `bg-neutral-900 border-neutral-800` | `bg-white border-neutral-200` |
| `bg-neutral-900 border-neutral-700` | `bg-white border-neutral-200` |
| `bg-neutral-900` (standalone) | `bg-white` |
| `border-neutral-800` (standalone) | `border-neutral-200` |
| `border-neutral-700` (standalone) | `border-neutral-200` |
| `text-neutral-400` | `text-neutral-600` |
| `text-neutral-500` | `text-neutral-600` (placeholder italic) — keep `text-neutral-500` for very-muted placeholder ghost text |
| `text-neutral-600` (italic placeholder) | `text-neutral-500` (slightly more contrast adjustment for italic) |
| `bg-white text-neutral-950 font-semibold` (any submit-style button) | `bg-neutral-950 text-white font-semibold hover:bg-neutral-800 transition` |
| `text-white` on send / save buttons | `text-neutral-950` or invert depending on context |

Important context-sensitive edits:
- **Star toggle (preferred channel):** currently might be `text-yellow-400` (or similar) — keep, it's an accent.
- **Send button per row:** currently a brand-colored pill that opens the right app. Keep brand colors but verify they read on light bg. Already do (Telegram blue, WhatsApp green, etc.).
- **"Share (pick app)" / "+ Add field" / "Save to Contacts" chip row** — keep `border border-neutral-200 bg-white` style. The text should be `text-neutral-950`.
- **Notes section ("🔒 Private note") and Recap section** — flip backgrounds to `bg-white`, borders to `border-neutral-200`.

For the contact name header at the top, apply the accent treatment if there's a name display:
```tsx
<h1>{contact.name}</h1>
```
→
```tsx
<h1>{contact.name}</h1>
```
(keep neutral; accent words go on actions/labels, not the contact's own name).

- [ ] **Step 1: Apply the find-replace patterns above across the file**

- [ ] **Step 2: Verify the page structure renders correctly**

Run `pnpm build` — Next.js will fail the build if any JSX is broken.

- [ ] **Step 3: Run all checks and commit**

```
pnpm typecheck && pnpm test && pnpm build
git add src/app/app/cards/[id]/page.tsx
git commit -m "feat(theme): light-mode post-capture page"
```

---

### Task G: Re-skin public landing `/c/[id]`

**Files:**
- Modify: `src/app/c/[id]/page.tsx`

- [ ] **Step 1: Apply find-replace patterns**

| Find | Replace |
|---|---|
| `bg-neutral-950` (any) | `bg-neutral-50` |
| `text-white` | `text-neutral-950` (only on the page wrapper / hero text; brand-colored channel chips stay) |
| `text-neutral-300` | `text-neutral-700` |
| `text-neutral-400` | `text-neutral-600` |
| `text-neutral-500` | `text-neutral-600` |
| Any `bg-neutral-900 border-neutral-800` | `bg-white border-neutral-200` |

- [ ] **Step 2: Replace the plain "made with Connectyall" footer with the logo**

Find:
```tsx
<p className="text-center text-xs text-neutral-500"><a href="/" className="underline">made with Connectyall</a></p>
```

Replace with:
```tsx
<a href="/" className="flex items-center justify-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-950 transition">
  <LogoMark size={16} /> made with Connectyall
</a>
```

Add `import { LogoMark } from '@/components/logo';` near the existing imports.

- [ ] **Step 3: Accent the sender name** at the top of the page (where `profile.displayName` is rendered):

Find:
```tsx
<h1 className="text-3xl font-bold">{profile.displayName}</h1>
```

Replace with:
```tsx
<h1 className="text-3xl font-bold"><span className="text-brand">{profile.displayName}</span></h1>
```

- [ ] **Step 4: Run checks and commit**

```
pnpm typecheck && pnpm test && pnpm build
git add src/app/c/[id]/page.tsx
git commit -m "feat(theme): light-mode public landing with logo footer"
```

---

## Final verification

After all tasks:

- [ ] `pnpm typecheck` clean
- [ ] `pnpm test` 87/87 pass (no test changes in this PR — purely visual)
- [ ] `pnpm build` succeeds

Push the branch, deploy preview, sync Inngest, share URL.
