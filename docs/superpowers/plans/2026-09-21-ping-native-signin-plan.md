# Ping Native Sign-In (Part 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the PingOne "Connectyall Sign-On" experience natively inside the sign-in page via `@forgerock/davinci-client`, with email-OTP untouched as the primary path and the flow's success bridged to a Better Auth session via the proven silent `signIn.oauth2` redirect.

**Architecture:** A `useDavinciFlow` hook wraps the SDK's orchestration loop (start → collectors → next), collector components render each step in the design system, and on `status === 'success'` we call the EXISTING `signIn.oauth2({ providerId: 'pingone' })` — Ping's SSO session makes that redirect complete silently and Better Auth mints the session. No token handling in our code, ever. Everything gated by `NEXT_PUBLIC_PING_ENABLED`; a second flag `NEXT_PUBLIC_PING_NATIVE` chooses native embed vs the Part 1 redirect button (instant rollback lever).

**Tech Stack:** Next.js 16 App Router, `@forgerock/davinci-client` 2.2.0 (already in package.json from the spike), Better Auth 1.6.x, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-14-ping-identity-showcase-design.md` (Part 2, revised 2026-09-21). Working reference code: branch `spike/davinci-native`, `src/app/ping-spike/page.tsx` (NEVER merge that branch). SDK research: `.superpowers/ping-sdk-research.md`.

## Global Constraints

- Email-OTP flow untouched in behavior; OTP form stays visually primary on the sign-in page.
- All Ping UI renders ONLY when `NEXT_PUBLIC_PING_ENABLED === '1'`. Native embed additionally requires `NEXT_PUBLIC_PING_NATIVE === '1'`; when unset, the Part 1 redirect button renders unchanged.
- Design system (`docs/design-system.html`) binds all new UI: cream boxes, mono uppercase buttons/labels, brand purple primary, existing input classes from the sign-in page. No Ping branding.
- Env/config facts (verbatim): env ID `b78444d2-7dd1-450f-9ed9-8dd48ccf6e1c`, region base `https://auth.pingone.ca`, client ID `9fb3669e-8bfa-494b-a0eb-40f4d6cd36fa`, wellknown `https://auth.pingone.ca/{envId}/as/.well-known/openid-configuration`, redirectUri = `${window.location.origin}/api/auth/oauth2/callback/pingone` (all three origins are registered + CORS-allowed in PingOne).
- Spike-proven gotchas that are requirements: pass `redirectUri` explicitly (SDK's default breaks); never call `start()` twice on one client (disable/guard); `fido().authenticate` SecurityError must render a friendly "passkeys work on connectyall.timnan.xyz" style message, not crash; a `davinci_error` node with `internalHttpStatus: 401` (stale interaction) restarts the flow automatically once.
- Auto-collectors (`ProtectCollector`, `MetadataCollector`) are not rendered; they're handled by the SDK/submitted as-is.
- Commit style: short lowercase subjects, no AI credits. Branch: `feature/ping-native-signin` off fresh main.

---

### Task 1: Public env plumbing

**Files:**
- Modify: `src/app/app/sign-in/page.tsx` (flag read only — no UI yet)
- Modify: `.env.local` + Vercel preview scope (controller handles Vercel)

**Interfaces:**
- Produces: `NEXT_PUBLIC_PING_ENV_ID`, `NEXT_PUBLIC_PING_CLIENT_ID`, `NEXT_PUBLIC_PING_NATIVE` env vars; helper `pingNativeEnabled()` in `src/lib/ping/config.ts`.

- [ ] **Step 1: Create `src/lib/ping/config.ts`** (new dir `src/lib/ping/`):

```ts
// Client-safe PingOne values. Env ID and client ID appear in every
// authorize URL, so exposing them via NEXT_PUBLIC_* is by design.
export const PING_ENV_ID = process.env.NEXT_PUBLIC_PING_ENV_ID ?? '';
export const PING_CLIENT_ID = process.env.NEXT_PUBLIC_PING_CLIENT_ID ?? '';
export const PING_AUTH_BASE = `https://auth.pingone.ca/${PING_ENV_ID}/as`;
export const PING_WELLKNOWN = `${PING_AUTH_BASE}/.well-known/openid-configuration`;

export function pingEnabled(): boolean {
  return process.env.NEXT_PUBLIC_PING_ENABLED === '1' && Boolean(PING_ENV_ID && PING_CLIENT_ID);
}

export function pingNativeEnabled(): boolean {
  return pingEnabled() && process.env.NEXT_PUBLIC_PING_NATIVE === '1';
}
```

- [ ] **Step 2: Add to `.env.local`:** `NEXT_PUBLIC_PING_ENV_ID=b78444d2-7dd1-450f-9ed9-8dd48ccf6e1c`, `NEXT_PUBLIC_PING_CLIENT_ID=9fb3669e-8bfa-494b-a0eb-40f4d6cd36fa`, `NEXT_PUBLIC_PING_NATIVE=1`.
- [ ] **Step 3: Verify** — `pnpm tsc --noEmit` clean.
- [ ] **Step 4: Commit** — `feat(ping): client-safe config module + native flag`

### Task 2: `useDavinciFlow` hook

**Files:**
- Create: `src/lib/ping/use-davinci-flow.ts`
- Test: `src/lib/ping/use-davinci-flow.test.ts`

**Interfaces:**
- Consumes: `PING_CLIENT_ID`, `PING_WELLKNOWN` from Task 1.
- Produces:

```ts
export type FlowStatus = 'idle' | 'loading' | 'continue' | 'success' | 'failed';
export interface DavinciFlowState {
  status: FlowStatus;
  collectors: Any[];          // current node's renderable collectors
  errorText: string | null;   // node ERROR_DISPLAY or friendly failure copy
  start: () => Promise<void>;         // guarded: no-op while a flow is live
  submit: (values: Record<string, string>) => Promise<void>; // fills text/password collectors by output.key, runs fido for FidoAuthenticationCollector, calls next()
  chooseFlow: (collector: Any) => Promise<void>;  // FlowCollector links (register / recovery / passkey button)
}
export function useDavinciFlow(): DavinciFlowState;
```

- [ ] **Step 1: Write failing tests.** Mock `@forgerock/davinci-client` (`vi.mock`) with a scripted client: `start()` → continue node with text+password collectors; `next()` → success. Assert: (a) `start` transitions idle→loading→continue and exposes collectors; (b) calling `start` twice only creates one client (guard); (c) `submit` calls `update` for each provided key then `next`, landing on success; (d) a `next` returning `{status:'error', internalHttpStatus:401}` triggers exactly one automatic `start()` retry; (e) fido SecurityError from a mocked `fido().authenticate` sets a friendly `errorText` containing "passkey" and does NOT call `next`.
- [ ] **Step 2: Run** — `pnpm vitest run src/lib/ping/use-davinci-flow.test.ts` → FAIL (module missing).
- [ ] **Step 3: Implement.** Port the spike's logic (`spike/davinci-native` branch, `src/app/ping-spike/page.tsx`) into the hook: dynamic-import `davinci`/`fido`, config `{ clientId: PING_CLIENT_ID, responseType: 'code', scope: 'openid profile email', redirectUri: window.location.origin + '/api/auth/oauth2/callback/pingone', serverConfig: { wellknown: PING_WELLKNOWN } }`. Filter collectors for rendering: drop `ProtectCollector`/`MetadataCollector`. Map failure nodes to friendly copy (generic "Ping sign-in hit a snag. Try again or use the email code." — never raw JSON). FidoAuthenticationCollector: run `fido().authenticate(col.output?.config?.publicKeyCredentialRequestOptions ?? col.output?.config)`; on `code:'SecurityError'` set errorText `Passkeys only work on connectyall.timnan.xyz — use your password here, or sign in on the live site.`; else `client.update(col)(result)` before `next()`.
- [ ] **Step 4: Run tests** → PASS. `pnpm tsc --noEmit` clean.
- [ ] **Step 5: Commit** — `feat(ping): useDavinciFlow hook wrapping davinci-client loop`

### Task 3: Collector renderer, design-system styled

**Files:**
- Create: `src/app/app/sign-in/ping-journey.tsx`

**Interfaces:**
- Consumes: `useDavinciFlow` from Task 2; `signIn` from `@/lib/auth/client`.
- Produces: `<PingJourney onBackToOtp={() => void} />` client component, self-contained.

- [ ] **Step 1: Implement the component.** Renders by `state.status`:
  - `idle`: nothing (parent triggers `start`).
  - `loading`: the existing brand spinner pattern (reuse the sign-in page's disabled-button "Signing in…" language, mono uppercase).
  - `continue`: map collectors in order —
    - `RichTextCollector` key `title-text-*`: mono label line (`● {label}` uppercase, same classes as the page's status labels). Help-text RichText renders as the muted sub-paragraph style.
    - `TextCollector` / `PasswordCollector`: the sign-in page's exact input classes (`w-full h-16 px-5 rounded-3xl bg-surface border border-line …`), controlled via local `values` state keyed by `output.key`. Label from `output.label` as placeholder.
    - `SubmitCollector`: primary brand pill (`bg-brand text-white font-mono text-[13px] tracking-[0.18em] font-bold uppercase`, h-16 rounded-full) calling `submit(values)`.
    - `FlowCollector`: mono text-link style (like "USE A DIFFERENT EMAIL"): `font-mono text-[10px] tracking-[0.2em] uppercase text-muted hover:text-neutral-950` with `● ` prefix, calling `chooseFlow(c)`.
    - `ERROR_DISPLAY` with content, or `state.errorText`: the page's red error paragraph style.
  - `success`: immediately `useEffect`-fire `signIn.oauth2({ providerId: 'pingone', callbackURL: '/app', errorCallbackURL: '/app/sign-in?error=ping' })` (exactly once, ref-guarded) and render the loading treatment with label `● FINISHING SIGN-IN`.
  - `failed`: errorText + a retry pill (`TRY AGAIN`, secondary surface style) calling `start()` + a `USE EMAIL CODE INSTEAD` mono link calling `onBackToOtp`.
- [ ] **Step 2: Verify** — `pnpm tsc --noEmit && pnpm vitest run && pnpm build` all clean.
- [ ] **Step 3: Commit** — `feat(sign-in): ping journey renderer in design system`

### Task 4: Sign-in page integration

**Files:**
- Modify: `src/app/app/sign-in/page.tsx`

**Interfaces:**
- Consumes: `PingJourney` (Task 3), `pingNativeEnabled` (Task 1). Existing: `pingEnabled` gate for the Part 1 redirect button.

- [ ] **Step 1: Implement.** Add `'ping'` to the `Step` union. The existing SIGN IN WITH PING button keeps its styling and position but its `onClick` becomes: `pingNativeEnabled() ? setStep('ping') (and the journey's start() fires on mount) : signInWithPing()` (existing redirect). Step `'ping'` renders: the `Top` banner (headline "Sign in / with Ping." split-color per the design system, label `● PING IDENTITY`), then `<PingJourney onBackToOtp={() => setStep('email')} />` inside the same 320px column. OTP email step remains the default step and default screen.
- [ ] **Step 2: Verify** — `pnpm tsc --noEmit && pnpm vitest run && pnpm build`. Existing sign-in tests (if any touch the page) still green.
- [ ] **Step 3: Commit** — `feat(sign-in): native ping journey behind NEXT_PUBLIC_PING_NATIVE`

### Task 5: Verification, console passkey RP-ID, preview + prod

**Files:** none (controller + Tim task)

- [ ] **Step 1 (controller, browser):** localhost e2e — SIGN IN WITH PING → native panel renders in design system (pixel-check screenshot) → Tim enters credentials → success → silent redirect → `/app` session. Error path: wrong password shows inline Ping error in our styling. OTP regression. Double-click SIGN IN WITH PING produces one flow.
- [ ] **Step 2 (Tim, console):** FIDO policy → Relying Party ID = `timnan.xyz` (enables embedded passkeys on prod domain); expect passkey re-enrollment on next MFA login.
- [ ] **Step 3 (controller):** add `NEXT_PUBLIC_PING_ENV_ID` / `NEXT_PUBLIC_PING_CLIENT_ID` / `NEXT_PUBLIC_PING_NATIVE` to Vercel preview AND production scopes; `npx vercel` preview; verify preview host CORS/redirect registration needs (preview host is NOT in Ping's allowed origins — native embed on ephemeral previews will CORS-fail; QA the native path on localhost + prod domain, per the known preview-churn gotcha; the preview still verifies build + OTP + redirect fallback).
- [ ] **Step 4:** Tim QA on prod domain after merge (his call to merge; native passkey test happens there: passkey button → Touch ID inline). Session-state update; friction-log additions to `docs/ping-integration.md` (RP-ID, CORS-per-origin, redirectUri default, double-start, silent-bridge design) as a final commit.

---

## Self-review notes

- Spec Part 2 coverage: native render (T2/T3), session bridge via existing callback (T3 success effect), OTP untouched + flag rollback (T4, Global Constraints), risks friction-logged (T5). Registration/recovery/passkey links ride along as FlowCollectors — no extra work.
- Type consistency: `useDavinciFlow` produced in T2 = consumed T3; `pingNativeEnabled` T1 = T4; collector type names match the spike's observed values (RichTextCollector, TextCollector, PasswordCollector, SubmitCollector, FlowCollector, FidoAuthenticationCollector, ProtectCollector, ERROR_DISPLAY).
- No migration, no server auth changes — Part 1's server config is untouched, which is what keeps this low-risk.
