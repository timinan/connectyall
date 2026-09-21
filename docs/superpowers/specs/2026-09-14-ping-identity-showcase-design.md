# Ping Identity showcase — design

**Date:** 2026-09-14
**Status:** Draft, awaiting Tim review
**Goal:** Integrate Ping Identity's platform into connectyall as a job-interview showcase: real OIDC sign-in through PingOne, MFA/passkeys on that login, and a DaVinci flow embedded via their widget SDK. Demonstrates hands-on understanding of the platform, not a toy.

## Why / context

Tim is interviewing and wants to walk through a live integration of developer.pingidentity.com in his own shipped product. The demo has two halves he can screen-share:

1. **Sign in with Ping** — real OIDC redirect to PingOne's hosted login, with a passkey/MFA prompt configured as an authentication policy in the console.
2. **DaVinci flow embed** — a flow built visually in the DaVinci canvas, rendered inline in connectyall by Ping's widget SDK, with the app consuming the flow result.

Approach chosen (from brainstorming): **hybrid**. Session issuance stays on Better Auth's proven path (its `genericOAuth` plugin speaks standard OIDC to PingOne). The Ping SDK surface lives on a low-stakes demo page via the DaVinci widget. We do NOT hand-roll token verification or session minting.

## Constraints

- Existing auth (Better Auth 1.6.x + email OTP via Resend) keeps working untouched. Ping is side-by-side, not a replacement.
- Ping-authenticated users map into the existing `users` table **by email** — same account whether you sign in via OTP or Ping.
- All Ping env vars go on the **preview scope only** at first. Prod stays Ping-free until Tim decides to merge and enable.
- PingOne trial tenant does not exist yet — Tim signs up; console setup steps are part of this work (documented, done together).
- Auth is a high-risk area: any ambiguity mid-build stops and surfaces rather than improvising.

## Part 0 — PingOne tenant setup (console, Tim + Claude together)

1. Tim signs up for a PingOne trial at pingidentity.com (free trial includes DaVinci and MFA).
2. In the admin console: note **Environment ID** and **region** (drives the auth base URL, e.g. `https://auth.pingone.com/{envId}/as`).
3. Create an **OIDC Web App** connection: authorization code flow, scopes `openid profile email`, redirect URI `https://<preview-host>/api/auth/oauth2/callback/pingone` (plus `http://localhost:3000/...` for local dev). Capture client ID + secret.
4. Enable an **authentication policy** with MFA: passkey (FIDO2) as primary, with a fallback factor (email or TOTP) so the demo can't dead-end on an unsupported device. Attach the policy to the app connection.
5. In **DaVinci**: build the demo flow (Part 2 below), publish, create an application + flow policy, capture the DaVinci **company ID, API key, and policy ID** for the widget.

Deliverable: `docs/ping-setup.md` in the repo recording every console step with the values redacted — doubles as interview talking material.

## Part 0.5 — Custom domain `connectyall.timnan.xyz`

Tim bought `timnan.xyz` (Porkbun, 2026-09-14) for the Ping trial's business email (`tim@timnan.xyz`, Porkbun forwarding → gmail). As part of this work, connectyall production also gets `connectyall.timnan.xyz` — a nicer URL on the interview screen:

- Vercel: add `connectyall.timnan.xyz` to the project domains (CLI or dashboard).
- Porkbun DNS: CNAME `connectyall` → `cname.vercel-dns.com`. HTTPS is automatic.
- `connectyall.vercel.app` keeps working; **`BASE_URL` stays on `connectyall.vercel.app`** so previously shared `/c/<id>` links remain canonical. Switching `BASE_URL` (and `BETTER_AUTH_URL` prod value) to the new domain is a deliberate later step, out of scope here.
- Ping OIDC redirect URIs registered in the PingOne console should include both hosts plus the preview host used for the demo.
- Path-based hosting (`timnan.xyz/connectyall`) was considered and rejected: requires Next `basePath` + proxying, breaks existing share links and PWA install. Root `timnan.xyz` stays free for a future portfolio landing page.

## Part 1 — Sign in with Ping (OIDC via Better Auth genericOAuth)

- **Server** (`src/lib/auth/server.ts`): add Better Auth's `genericOAuth` plugin with one provider entry `pingone`: discovery URL `https://auth.pingone.ca/{PING_ENV_ID}/as/.well-known/openid-configuration`, client ID/secret from env, scopes `openid profile email`. Better Auth handles the redirect, PKCE, code exchange, ID-token handling, and account linking.
- **Account linking by email**: enable Better Auth's trusted-provider linking for `pingone` so a Ping sign-in with an email that already exists attaches to that user instead of erroring or duplicating. (PingOne verifies email on registration, so trusting it is acceptable for this demo; noted as a talking point.)
- **Client** (`src/lib/auth/client.ts`): add `genericOAuthClient()` plugin; sign-in page calls `signIn.oauth2({ providerId: 'pingone' })`.
- **UI** (`src/app/sign-in/…`): a `SIGN IN WITH PING` mono-pill button below the email-OTP form, separated by a small `● OR` mono label. Styling follows `docs/design-system.html` Concept-1 button language exactly — secondary/outline treatment so OTP stays the visually primary path. Hidden unless `NEXT_PUBLIC_PING_ENABLED=1`, so main can merge without Ping appearing in prod.
- **Schema**: none expected — Better Auth's existing `account` table (already present for OTP) stores the OAuth link. Verify at build time; if a migration is needed it follows the hand-written-SQL + `_journal.json` rule.
- **Env vars** (preview scope + `.env.local`): `PING_ENV_ID`, `PING_CLIENT_ID`, `PING_CLIENT_SECRET`, `NEXT_PUBLIC_PING_ENABLED`.

MFA/passkeys require **zero app code**: the authentication policy attached to the app connection makes PingOne's hosted login demand a passkey during the redirect. The demo shows enrollment on first sign-in and a passkey prompt on the second.

## Part 2 — Native Ping login via DaVinci + JS Orchestration SDK (REVISED 2026-09-21; supersedes the earlier "verify a connection's email" widget plan)

Tim's call: instead of a side-feature widget demo, the Orchestration SDK powers the actual login. The Ping login journey renders **natively inside our sign-in page** (our design system, no redirect), driven by a DaVinci flow. Email OTP stays untouched as the primary/backup path — the whole Ping surface remains env-flag removable, because the trial tenant is disposable (interview demo; may revert to Better Auth-only later).

**Flow (DaVinci canvas): connectyall sign-on.** Identifier → password (or passwordless) → passkey MFA with enrollment → registration branch for new users. Published behind a DaVinci application + flow policy attached to the PingOne OIDC app.

**Session bridge (the load-bearing decision, unchanged from Part 1):** the DaVinci login flow terminates by issuing a standard OIDC authorization code. That code lands on the existing Better Auth `genericOAuth` callback (`/api/auth/oauth2/callback/pingone`), which validates, links by email, and mints the session. The SDK changes where the journey RENDERS, not who owns sessions. No hand-rolled token verification, ever.

**In-app surface:** the sign-in page's Ping path upgrades from `signIn.oauth2` redirect to an embedded journey: Ping's JS Orchestration SDK (`davinci-client` / JS SDK DaVinci module) starts the flow, we render each returned step (identifier form, password, OTP/passkey step, registration) as connectyall-styled components, post responses back, and on completion hand the authorization code to the Better Auth callback. The redirect path stays in code as a fallback behind the same flag family.

**Known risks to friction-log:** step-type coverage (every node type the flow emits needs a renderer), WebAuthn/passkey inside an embedded flow may need our domain registered with Ping (RP ID config), trial licensing surface for DaVinci, and SDK docs quality — all primary research for the DX PM interview.

**Env vars:** TBD by SDK docs at build time (expect company/environment ID + flow policy ID; client-side-safe only — any API key stays server-side).

## Error handling

- Ping OAuth failure/cancel → Better Auth redirects back to sign-in with an error param; sign-in page decodes it into the existing brand-styled error surface (no raw JSON).
- DaVinci token route failures → widget page shows the app's standard error card with a Try Again.
- Widget flow failure/timeout → flow's failure node message surfaces in the widget itself; page offers a back link. No partial writes: `email_verified_at` is only stamped on an explicit success payload.
- Trial-tenant expiry (after ~30 days) → Ping button and VERIFY chip are both env-flag-gated, so killing the flags cleanly removes the feature.

## Testing

- Unit: davinci-token route (auth gate, error mapping), verified-stamp endpoint (authz: contact must belong to session user), sign-in error decoding.
- Integration (manual, on preview): full OTP path regression; Ping sign-in with a fresh email (new user created); Ping sign-in with an existing OTP account's email (links, no duplicate); passkey enroll + second-login prompt; DaVinci verify happy path + wrong-code retry.
- `pnpm test` green + `next build` before any preview claim; preview deployed via `vercel` per the standing QA rule.

## Out of scope (YAGNI)

- Replacing OTP, PingOne Protect risk scores, DaVinci form theming, SCIM/user sync, sign-out federation (RP-initiated logout), prod enablement, verified-email badges anywhere beyond the connection detail page.

## Sequencing

Branch `feature/ping-identity` off main (independent of PRs #19–#22; touches sign-in UI + auth plugin config, no overlap with the capture services those PRs share — verify at rebase time). Migration number picked at build time after checking the journal (#19–#22 hold 0015–0022).
