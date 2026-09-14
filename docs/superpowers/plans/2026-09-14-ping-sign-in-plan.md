# Ping Sign-In (Part 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add "Sign in with Ping" (PingOne OIDC via Better Auth's genericOAuth plugin) side-by-side with the existing email-OTP flow, env-flag-gated.

**Architecture:** Better Auth already owns sessions and the `accounts` table. We add the `genericOAuth` server plugin with one `pingone` provider (discovery URL from `PING_ENV_ID`), the matching client plugin, and a secondary button on the sign-in page. Account linking by email is enabled with `pingone` trusted. No new tables, no migration.

**Tech Stack:** Next.js 16 App Router, Better Auth 1.6.x, PingOne (trial tenant, Canada region — `auth.pingone.ca`), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-14-ping-identity-showcase-design.md` (this plan implements Part 1 only; Part 2 DaVinci is a separate plan once the console flow exists)

## Global Constraints

- All Ping env vars OPTIONAL — the app must boot and pass tests with none of them set (prod today).
- Ping UI only renders when `NEXT_PUBLIC_PING_ENABLED === '1'`.
- Existing email-OTP flow untouched in behavior and layout primacy (OTP form stays visually primary).
- Buttons follow Concept-1 mono-uppercase language from `docs/design-system.html`; sign-in page container/label conventions unchanged.
- Commit style: short lowercase subjects, no AI credits.
- Working values already in `.env.local`: `PING_ENV_ID=b78444d2-7dd1-450f-9ed9-8dd48ccf6e1c` (Canada region), `PING_CLIENT_ID`, `PING_CLIENT_SECRET`, `NEXT_PUBLIC_PING_ENABLED=1`. Redirect URI registered in PingOne: `http://localhost:3000/api/auth/oauth2/callback/pingone` (+ prod hosts).
- Branch: `feature/ping-identity` off fresh main.

---

### Task 1: Env schema — optional Ping vars

**Files:**
- Modify: `src/lib/env.ts` (schema object, ~line 24)
- Test: `src/lib/env.test.ts` (or wherever loadEnv tests live — check `git grep -l loadEnv src` first; create `src/lib/env.test.ts` if none)

**Interfaces:**
- Produces: `env().PING_ENV_ID | PING_CLIENT_ID | PING_CLIENT_SECRET` as `string | undefined`, and exported helper `pingEnabled(e: Env): boolean` returning true only when all three are set.

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { loadEnv, pingEnabled } from './env';

// build a minimal valid raw env; reuse the existing test fixture if the
// repo already has one for loadEnv, otherwise:
const base = {
  DATABASE_URL: 'postgres://x/y',
  CLOUDFLARE_ACCOUNT_ID: 'a', CLOUDFLARE_API_TOKEN: 'a',
  R2_ACCESS_KEY_ID: 'a', R2_SECRET_ACCESS_KEY: 'a', R2_BUCKET_NAME: 'a',
  R2_PUBLIC_URL_BASE: 'https://r2.example.com',
  INNGEST_EVENT_KEY: 'a', INNGEST_SIGNING_KEY: 'a',
  BASE_URL: 'https://connectyall.vercel.app',
  RESEND_API_KEY: 'a', RESEND_FROM_EMAIL: 'a@b.c',
  BETTER_AUTH_SECRET: '0123456789abcdef', BETTER_AUTH_URL: 'http://localhost:3000',
  ANTHROPIC_API_KEY: 'a',
} as unknown as NodeJS.ProcessEnv;

describe('ping env', () => {
  it('loads fine with no ping vars and reports disabled', () => {
    const e = loadEnv(base);
    expect(pingEnabled(e)).toBe(false);
  });
  it('reports enabled only when all three are set', () => {
    const e = loadEnv({ ...base, PING_ENV_ID: 'env', PING_CLIENT_ID: 'id', PING_CLIENT_SECRET: 's' });
    expect(pingEnabled(e)).toBe(true);
    const partial = loadEnv({ ...base, PING_ENV_ID: 'env' });
    expect(pingEnabled(partial)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm vitest run src/lib/env.test.ts` → FAIL (`pingEnabled` not exported)

- [ ] **Step 3: Implement** — in the zod object after `BETTER_AUTH_URL`:

```ts
    PING_ENV_ID: z.string().optional(),
    PING_CLIENT_ID: z.string().optional(),
    PING_CLIENT_SECRET: z.string().optional(),
```

and export below `Env`:

```ts
export function pingEnabled(e: Env): boolean {
  return Boolean(e.PING_ENV_ID && e.PING_CLIENT_ID && e.PING_CLIENT_SECRET);
}
```

- [ ] **Step 4: Run tests** — `pnpm vitest run src/lib/env.test.ts` → PASS
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(env): optional pingone vars + pingEnabled helper"`

### Task 2: Server — genericOAuth plugin + trusted account linking

**Files:**
- Modify: `src/lib/auth/server.ts`

**Interfaces:**
- Consumes: `pingEnabled(env())` from Task 1.
- Produces: Better Auth routes `POST /api/auth/sign-in/oauth2` and `GET /api/auth/oauth2/callback/pingone` (plugin-provided, providerId `pingone`).

- [ ] **Step 1: Implement** (config wiring, no meaningful unit seam — verified in Task 4's manual flow). In `src/lib/auth/server.ts`:

```ts
import { emailOTP, genericOAuth } from 'better-auth/plugins';
import { env, pingEnabled } from '../env';
```

inside `betterAuth({ ... })` add, above `plugins`:

```ts
    account: {
      accountLinking: {
        enabled: true,
        trustedProviders: ['pingone'],
      },
    },
```

and change `plugins` to:

```ts
    plugins: [
      emailOTP({
        sendVerificationOTP: async ({ email, otp }) => {
          await sendOTPEmail({ to: email, otp });
        },
        otpLength: 6,
        expiresIn: 60 * 10, // 10 minutes
      }),
      ...(pingEnabled(env())
        ? [
            genericOAuth({
              config: [
                {
                  providerId: 'pingone',
                  discoveryUrl: `https://auth.pingone.ca/${env().PING_ENV_ID}/as/.well-known/openid-configuration`,
                  clientId: env().PING_CLIENT_ID!,
                  clientSecret: env().PING_CLIENT_SECRET!,
                  scopes: ['openid', 'profile', 'email'],
                  pkce: true,
                },
              ],
            }),
          ]
        : []),
    ],
```

(Region note: `.ca` is correct for this tenant — hardcoding the Canada base is fine; a region env var is YAGNI until a second tenant exists.)

- [ ] **Step 2: Verify types + suite** — `pnpm tsc --noEmit && pnpm vitest run` → clean / all pass (existing auth tests must not break; if `genericOAuth` import fails, check better-auth version exports with `git grep genericOAuth node_modules/better-auth/dist | head -3`)
- [ ] **Step 3: Commit** — `git commit -am "feat(auth): pingone oidc via genericOAuth, trusted linking"`

### Task 3: Client plugin + sign-in button

**Files:**
- Modify: `src/lib/auth/client.ts`
- Modify: `src/app/app/sign-in/page.tsx`

**Interfaces:**
- Consumes: server routes from Task 2; `process.env.NEXT_PUBLIC_PING_ENABLED` (inlined by Next at build).
- Produces: `signIn.oauth2({ providerId: 'pingone', callbackURL, errorCallbackURL })` available to UI.

- [ ] **Step 1: Client plugin** — `src/lib/auth/client.ts`:

```ts
import { createAuthClient } from 'better-auth/react';
import { emailOTPClient, genericOAuthClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  plugins: [emailOTPClient(), genericOAuthClient()],
});

export const { signIn, signOut, useSession } = authClient;
```

- [ ] **Step 2: Sign-in page button** — in `src/app/app/sign-in/page.tsx`:

Add state + handler near the other handlers:

```ts
const pingEnabled = process.env.NEXT_PUBLIC_PING_ENABLED === '1';

async function signInWithPing() {
  setErrorMsg(null);
  const { error } = await signIn.oauth2({
    providerId: 'pingone',
    callbackURL: '/app',
    errorCallbackURL: '/app/sign-in?error=ping',
  });
  if (error) setErrorMsg(error.message ?? 'Ping sign-in failed');
}
```

Decode the redirect-back error on mount (top of component):

```ts
useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  if (params.get('error')) {
    setErrorMsg('Ping sign-in didn\'t complete. Try again, or use the email code instead.');
    window.history.replaceState(null, '', '/app/sign-in');
  }
}, []);
```

Render below the email form (inside the `step === 'email'` form's parent, after the form, before the `CODE ARRIVES` label), following Concept-1 secondary-button styling:

```tsx
{step === 'email' && pingEnabled && (
  <div className="relative z-10 w-full max-w-[320px] flex flex-col gap-3">
    <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-muted font-medium text-center">
      <span className="text-brand mr-1">●</span> OR
    </div>
    <button
      type="button"
      onClick={signInWithPing}
      className="w-full h-16 px-5 rounded-full bg-surface border border-line text-neutral-950 font-mono text-[13px] tracking-[0.18em] font-bold uppercase hover:border-brand transition shadow-[0_6px_20px_rgba(124,92,255,0.10),0_2px_4px_rgba(0,0,0,0.04)]"
    >
      Sign in with Ping
    </button>
  </div>
)}
```

(`useEffect` needs adding to the react import.)

- [ ] **Step 3: Verify** — `pnpm tsc --noEmit && pnpm vitest run && pnpm build` → all clean. Then pixel-check: with `pnpm dev` running, render the sign-in page and confirm the button sits below the OTP form, aligned to the same 320px column, OTP form visually primary.
- [ ] **Step 4: Commit** — `git commit -am "feat(sign-in): sign in with ping button behind env flag"`

### Task 4: End-to-end verification + preview deploy

**Files:** none (verification task)

- [ ] **Step 1: Local end-to-end** — `pnpm dev`; browse to `http://localhost:3000/app/sign-in`; click SIGN IN WITH PING → PingOne hosted login → sign in as the Directory test user → expect redirect to `/app` with a live session. Verify in DB (or via `/app/profile`) that the user row exists and, if the email matched an existing OTP user, no duplicate user was created (check `users` count for that email).
- [ ] **Step 2: Error path** — start the flow, hit Cancel/back on the Ping page → expect return to `/app/sign-in` with the friendly error line, no raw error JSON.
- [ ] **Step 3: OTP regression** — full email-OTP sign-in still works locally.
- [ ] **Step 4: Vercel preview env vars** — add `PING_ENV_ID`, `PING_CLIENT_ID`, `PING_CLIENT_SECRET`, `NEXT_PUBLIC_PING_ENABLED` to the **preview scope only** (`npx vercel env add NAME preview` ×4).
- [ ] **Step 5: Deploy preview** — `npx vercel` from the branch; note the preview URL. **Add that preview host's redirect URI** (`https://<preview-host>/api/auth/oauth2/callback/pingone`) to the PingOne app's Redirect URIs (Tim or console). Repeat the sign-in test on the preview.
- [ ] **Step 6: Commit any fixes + hand off to Tim for QA** with the preview URL. Session-state update.

---

## Self-review notes

- Spec coverage: Part 1 fully (plugin, linking, button, flag, env, error decode, preview-scope vars). Part 0.5 already done outside the plan. Part 2 deliberately deferred to its own plan. MFA is console-side (currently Single_Factor for debugging; flipping back to Multi_Factor is a QA-time console step, listed in session-state).
- No schema/migration expected; Better Auth `accounts` table already exists (used by OTP adapter schema mapping). If the linking test in Task 4 reveals a missing column, stop and surface (auth = high-risk, no improvising).
- Type consistency: `pingEnabled(e: Env)` defined Task 1, consumed Task 2; `providerId: 'pingone'` consistent across Tasks 2–3 and the registered redirect URI path.
