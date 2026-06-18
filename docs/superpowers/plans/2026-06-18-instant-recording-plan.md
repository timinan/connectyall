# Instant Recording — Implementation Plan

> Use `superpowers:subagent-driven-development` to execute task-by-task.

**Goal:** Cut returning users from 2 clicks to record down to 1 tap (from a home-screen PWA icon), while keeping the marketing page for new visitors.

**Architecture:**
- 4 small, sequential changes — no API or DB changes
- One throwaway Node script to generate PNG icons from the existing SVG
- Otherwise it's a config tweak (sessions), a `redirect()` (root page), and metadata exports (PWA)

---

### Task 1: 365-day sessions

**File:**
- Modify: `src/lib/auth/server.ts`

**Step 1:** Inside the `betterAuth({ ... })` config object in `auth()`, add a `session` block right after the existing `advanced` block (or alongside it — order doesn't matter):

```ts
session: {
  expiresIn: 60 * 60 * 24 * 365, // 365 days
  updateAge: 60 * 60 * 24,        // refresh the cookie's expiry every 24 h of activity
},
```

**Step 2:** Verify nothing else references session lengths. (Grep `expiresIn` — only the `magicLink` plugin should still own its own 15-min expiry, which is for the link URL, not the session.)

**Step 3:** Run `pnpm typecheck && pnpm test`. Expect clean.

**Step 4:** Commit:

```bash
git add src/lib/auth/server.ts
git commit -m "extend session expiry to 365 days"
```

---

### Task 2: Root page server-side redirect

**File:**
- Modify: `src/app/page.tsx`

Right now `/` is a static client-style component rendering the marketing hero. We're converting it to an async server component that checks the session and redirects when appropriate.

**Step 1:** Replace the file contents with:

```tsx
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSession } from '@/lib/auth/session';
import { getById } from '@/services/UserProfileService';
import { Logo } from '@/components/logo';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const session = await getServerSession();
  if (session) {
    const profile = await getById(session.user.id);
    if (profile?.onboardedAt) redirect('/app/record');
  }

  return (
    <main className="min-h-[calc(100dvh-3rem)] text-neutral-950 px-6 py-8 flex flex-col">
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
    </main>
  );
}
```

Key differences from today:
- `async` function (server component)
- `getServerSession` + `getById` at the top
- Conditional `redirect('/app/record')` if signed in + onboarded
- `export const dynamic = 'force-dynamic'` so Next.js doesn't try to statically prerender it

**Step 2:** Run `pnpm typecheck && pnpm build`. Expect clean. The build catches client/server boundary mistakes.

**Step 3:** Commit:

```bash
git add src/app/page.tsx
git commit -m "redirect signed-in users from / straight to record"
```

---

### Task 3: PWA manifest + icons + meta

**Files:**
- Create: `scripts/generate-pwa-icons.ts`
- Create: `public/manifest.webmanifest`
- Create: `public/icon-192.png`
- Create: `public/icon-512.png`
- Create: `public/apple-touch-icon.png`
- Modify: `src/app/layout.tsx`

**Step 1: Generate the icons.** Create `scripts/generate-pwa-icons.ts`:

```typescript
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';

const svg = readFileSync(join(process.cwd(), 'public', 'icon.svg'), 'utf-8');

const sizes: Array<{ filename: string; size: number }> = [
  { filename: 'icon-192.png', size: 192 },
  { filename: 'icon-512.png', size: 512 },
  { filename: 'apple-touch-icon.png', size: 180 },
];

for (const { filename, size } of sizes) {
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: size } });
  const png = resvg.render().asPng();
  writeFileSync(join(process.cwd(), 'public', filename), png);
  console.log(`wrote public/${filename} (${size}×${size})`);
}
```

Run it with `pnpm tsx scripts/generate-pwa-icons.ts`. Confirm the three PNGs land in `public/`. (`@resvg/resvg-js` is already in dependencies — used by `CardService.ts`.)

**Step 2: Create `public/manifest.webmanifest`:**

```json
{
  "name": "Connectyall",
  "short_name": "Connectyall",
  "description": "Voice notes that connect y'all.",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#FFFFFF",
  "theme_color": "#7C5CFF",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

**Step 3: Update `src/app/layout.tsx`:**

Extend the existing `metadata` export with `manifest` and `appleWebApp`:

```ts
export const metadata: Metadata = {
  title: "Connectyall: voice notes that connect y'all",
  description: "Connectyall turns the voice memo you record after meeting someone into a connection you can pass along the same day. Talk it out, we handle the rest. They get your details, you remember theirs.",
  icons: { icon: '/icon.svg' },
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Connectyall',
    statusBarStyle: 'default',
  },
};
```

Add `themeColor` to the existing `viewport` export:

```ts
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#7C5CFF',
};
```

Next.js automatically picks up `public/apple-touch-icon.png` and emits the right `<link rel="apple-touch-icon">` — no additional config needed.

**Step 4:** Run `pnpm typecheck && pnpm build`. Expect clean. Confirm the build output mentions `manifest.webmanifest` (or doesn't complain about it).

**Step 5:** Commit:

```bash
git add scripts/generate-pwa-icons.ts public/manifest.webmanifest public/icon-192.png public/icon-512.png public/apple-touch-icon.png src/app/layout.tsx
git commit -m "installable as a PWA"
```

---

### Task 4: Sign-out button on profile

**File:**
- Modify: `src/app/app/profile/page.tsx`

**Step 1:** Add an import at the top (near the existing better-auth client import — there may already be one):

```ts
import { signOut } from '@/lib/auth/client';
```

(Confirm the existing client export — sign-in is currently exported as `signIn` from `'@/lib/auth/client'`. If `signOut` isn't already exported, add it: open `src/lib/auth/client.ts` and check what's exported. If only `signIn` is exported, add `export const { signOut } = authClient;` — replacing `authClient` with whatever name is already in scope.)

**Step 2:** Add a sign-out handler inside `ProfilePage`:

```ts
async function handleSignOut() {
  await signOut();
  router.push('/');
}
```

**Step 3:** Render a small "Sign out" link at the bottom of the page, after the existing `<form>` but inside the same outer wrapper:

```tsx
<button
  type="button"
  onClick={handleSignOut}
  className="block mx-auto text-sm text-neutral-500 hover:text-neutral-950 transition pt-2"
>
  Sign out
</button>
```

Place it directly after the `</form>` closing tag but before the outer `</div>`. The `mx-auto` centers it horizontally.

**Step 4:** Run `pnpm typecheck && pnpm test && pnpm build`. Expect clean.

**Step 5:** Commit:

```bash
git add src/app/app/profile/page.tsx src/lib/auth/client.ts
git commit -m "sign-out button on profile"
```

---

## Final verification

```
pnpm typecheck && pnpm test && pnpm build
```

Push, deploy, sync inngest, share URL.
