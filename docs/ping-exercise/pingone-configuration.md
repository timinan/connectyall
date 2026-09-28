# Part 1 — PingOne environment configuration

Working log for the SDK PM technical exercise. Each item below records the decision, the reasoning, and (once done in the console) what we actually configured. Status legend: ✅ done · 🔲 planned, not yet done in the console.

Guide we're following: [JavaScript centralized login](https://developer.pingidentity.com/orchsdks/oidc/usage/javascript-centralized-login.html) with `@forgerock/oidc-client`.

**Screen recordings** (in `~/Downloads`, replayable step-by-step):
- `ping-exercise-01-create-environment.gif` — item 1
- `ping-exercise-02-create-test-user.gif` — item 2 (password set off-camera by Tim)
- `ping-exercise-03-register-oidc-app.gif` — items 3–7
- `ping-exercise-04-mfa-and-policies.gif` — items 9–10

## 1. Create or identify a PingOne environment for testing ✅

**Plan:** Reuse the existing PingOne account (Canada region, `auth.pingone.ca`) but create a **new environment** inside it dedicated to this exercise — Environments → Add Environment. That keeps the existing connectyall production environment (`b78444d2-…`) untouched while still doing every configuration step from scratch: new environment, new user, new application, new policies. A new environment gets its own environment ID, and therefore its own discovery endpoint, so nothing bleeds over from the earlier integration.

When adding the environment, pick the option that includes PingOne SSO + MFA services (needed for items 9–10).

**Done (2026-09-28):**
- Environment name: **SDK Exercise** (type Sandbox, use case Customer)
- Environment ID: `28c0e2b4-22df-4092-be2d-5f493b57b528`
- Region: Canada (`auth.pingone.ca`), Organization `2ab285d5-e470-4294-b387-8140bb1c88a4`
- Services enabled: PingOne SSO + PingOne MFA; sample users **off**, DaVinci flows **off** (we want plain authentication policies, not orchestration, for this exercise)
- License: TRIAL, expires **2026-10-14** — demo must happen before then
- Clean-slate note: the old integration's app client (`9fb3669e-…`) and the "Connectyall Sign-On" DaVinci experience were deleted from the original `Connectyall` env (`b78444d2-…`); prod's SIGN IN WITH PING is intentionally dead until the new integration ships.

## 2. Create a test user ✅

**Plan:** Directory → Users → Add User in the sandbox environment. Username `demo` (matching the guide), with a real reachable email address — this matters because the OTP second factor (item 10) is email-based, so the inbox must be one we can open during the demo. Set a password at creation and mark it as not requiring change, so first sign-in doesn't detour through a password-reset flow.

Also confirm the user is in a population covered by the sign-on policy we configure in item 9 (trial default population is fine).

**Done (2026-09-28):** Directory → Users → + → Create User. `Demo User`, username `demo`, email `timmy.nan@gmail.com` (real inbox for the email OTP), population Default. The Add User form has **no password field** — password is set afterwards via the user's ⋮ menu → Reset Password → "Create or generate password" (Tim set it; PingOne treats an admin-set password as **one-time**, so the first sign-on forces a change — we'll burn that step before the demo). User card shows `MFA: Disabled` at creation — item 10 has to flip that.

## 3. Register an OIDC application for our selected platform ✅

**Platform:** JavaScript (web). The integration replaces connectyall's existing SIGN IN WITH PING path (Better Auth `genericOAuth` + DaVinci client) with the `@forgerock/oidc-client` SDK on the existing `/app/sign-in` page, pointed at the new trial tenant. From PingOne's perspective it's a browser-based OIDC relying party.

**Plan:** Applications → Applications → + → name `connectyall-ping-demo`, type **OIDC Web App** (see item 4), then enable it. Grab the Client ID from the Configuration tab — public client, so there is no secret to manage.

**Done (2026-09-28):** app `connectyall-ping-demo` created and **enabled**. Client ID `c93fe4f5-5e54-4ee0-819f-bc6a7aeb3d48`. Console still shows a Client Secret on the app even with Token Auth = None (unused for a public client — mild DX confusion, logged below).


## 4. Determine the appropriate application/client type ✅

**Decision: OIDC Web App configured as a public client (Token Endpoint Auth Method = None) with PKCE.** 

Reasoning: the code runs entirely in the browser — Next.js serves the page, but the SDK does the authorization redirect, code exchange, and token storage client-side. A confidential client would need a secret, and a secret embedded in browser JavaScript is public by definition. So the correct shape is a public client using Authorization Code + PKCE, where the PKCE code verifier replaces the client secret as proof that the token request comes from the same party that started the flow.

PingOne's console offers both a "Single-Page App" template and "OIDC Web App"; the guide we're following uses **OIDC Web App** with token auth set to None, which produces the same effective public-client behavior while leaving grant/response types fully editable. We follow the guide and note the template ambiguity as a DX finding (two templates that can be configured into the same thing, with no guidance on which to pick).

**Done (2026-09-28):** Token Endpoint Auth Method changed from the default Client Secret Basic to **None** on the Configuration edit panel.

## 5. Configure the required OAuth grant types ✅

**Decision: Authorization Code (with PKCE enforced) + Refresh Token.**

- **Authorization Code** — the only grant appropriate for an interactive user sign-in in 2026. Implicit is deprecated (tokens in URL fragments leak via history/referrer); Client Credentials is for machines, not users.
- **PKCE** — set "PKCE Enforcement" to `S256_REQUIRED` so the environment rejects any non-PKCE authorization attempt.
- **Refresh Token** — lets the SDK renew access tokens without bouncing the user through the redirect again; the guide's config includes it.

Response type: Code only (no token/id_token response types — that would re-open the implicit door).

**Done (2026-09-28):** Authorization Code + Refresh Token (opaque format, 30-day / 180-day-rolling defaults kept), PKCE `S256_REQUIRED`, response type Code.

## 6. Configure the redirect URI for your application ✅

**Plan:** register exactly:

- `http://localhost:3000/app/sign-in` — local development (`npm run dev`)
- `https://connectyall.timnan.xyz/app/sign-in` — production, if we ship the new integration for the interview demo

Reasoning: the redirect URI is the security boundary of the authorization code flow — PingOne will only deliver codes to an exact-match registered URI. The sign-in page doubles as the callback: after PingOne redirects back with `?code&state`, the SDK on that page performs the token exchange. Lesson learned from the earlier connectyall Ping work: Vercel preview URLs churn on every deploy, and each new preview host needs to be added in the console or the flow dies with a redirect_uri mismatch. We avoid that by demoing on localhost (and optionally the stable prod domain).

## 7. Configure the scopes required by your application ✅

**Decision: `openid profile email phone`** (the guide's set).

- `openid` — mandatory; makes it an OIDC request at all and yields the ID token.
- `profile` — name/given_name/family_name for the "display the authenticated user" requirement.
- `email` — the user's email for the same screen.
- `phone` — included because the guide's client config requests it; the trial user may have no phone number, in which case the claim simply comes back absent. Worth a DX note: requesting a scope the directory can't fulfill fails silently rather than loudly.

These must be enabled on the application's Resources/Scopes tab AND requested by the SDK config — a mismatch (SDK asks for a scope the app wasn't granted) is a classic silent-failure spot to watch for.

**Done (2026-09-28):** Resources → Edit: `email`, `phone`, `profile` checked (`openid` always granted). Allowed scopes now: openid, email, phone, profile.

## 8. Find the OIDC discovery endpoint for your PingOne environment ✅

**Pattern:** `https://auth.pingone.<tld>/<ENV_ID>/as/.well-known/openid-configuration`

where `<tld>` is region-dependent (`com` NA, `ca` Canada, `eu` Europe, `asia` APAC) and `<ENV_ID>` is the environment UUID from Settings → Environment Properties. The console also shows the full URL on the application's Configuration tab under "URLs".

Everything the SDK needs (authorization, token, userinfo, end-session, revocation, JWKS endpoints) is discovered from this one URL — it's the only endpoint we hardcode.

**Done (2026-09-28):** `https://auth.pingone.ca/28c0e2b4-22df-4092-be2d-5f493b57b528/as/.well-known/openid-configuration` — curl returns 200 the moment the environment exists, before any application is registered. Key endpoints it advertises:

- authorize: `…/as/authorize`
- token: `…/as/token`
- userinfo: `…/as/userinfo`
- end session: `…/as/signoff` (PingOne names it `signoff`, not the more common `end_session_endpoint` path — the discovery doc maps it correctly, another reason to never hand-build endpoint URLs)
- revocation: `…/as/revoke`

## 9. Configure the authentication experience required for the test user ✅

**Plan:** the trial ships with default sign-on policies/experiences. We need the flow to be: **username + password → email OTP**. Two ways PingOne can express this:

- **Authentication policies** (PingOne SSO): a policy with Step 1 = Login (password), Step 2 = MFA. Assign the policy to our application (or leave as environment default).
- **DaVinci flows / experiences**: trials increasingly route through DaVinci orchestration. If the trial defaults to a DaVinci experience, we either edit that experience or point the application at a plain authentication policy instead.

Decision deferred until we see what the fresh trial provisions (September's tenant used DaVinci experiences; this is itself a DX observation — the "which of the three auth-config surfaces am I supposed to use?" problem). Either way, the requirement is that our `demo` user can complete password → OTP without an admin in the loop.

**Done (2026-09-28):** with DaVinci flows off, the env provisions two plain authentication policies: `Single_Factor` (Login, the default) and `Multi_Factor` (Login → Multi-factor Authentication). We assigned **Multi_Factor** to the `connectyall-ping-demo` application (app → Policies → Add Policies), which overrides the environment default for this app only. Policy ID `e9638200-9a0a-4eaa-905e-29b…`.

## 10. Configure OTP as an additional authentication step ✅

**Plan:** email OTP as the second factor.

1. Ensure PingOne MFA is enabled for the environment (trials include it).
2. Enable **Email OTP** as an allowed MFA method (Authentication → MFA settings / device policy).
3. Enable MFA for the `demo` user — either "MFA Enabled" on the user directly or auto-enable at sign-on in the policy.
4. In the item-9 policy/experience, require MFA after password. With no other device enrolled, PingOne falls back to emailing an OTP to the user's directory email — which is exactly the behavior we want, and why the test user's email must be a real inbox.

Chose email over TOTP/SMS: zero enrollment friction in a trial, nothing to re-pair before the interview demo, no SMS credits required.

**Done (2026-09-28):**
- MFA device policies live under Authentication → MFA. The env had a `Default MFA Policy`; we also created **`SDK Exercise MFA`** (ID `2e9d4574-dd3c-46b9-b6ce-5e1df2c3623a`, method selection "User selected default", kept "Block authentication when user's MFA is disabled").
- **MFA enabled on the `demo` user** (user → Services → Authentication → toggle → confirm). User has **no paired methods**, so at the Multi_Factor policy's MFA step PingOne falls back to emailing an OTP to the directory email — exactly the behavior we want for the demo.
- To verify live at first sign-in: password (one-time, forced change) → email OTP to timmy.nan@gmail.com.

---

## Friction log (running)

DX observations captured as we execute; feeds Part 8.

- (from prior connectyall integration, to re-verify on the fresh trial) OIDC Web App vs Single-Page App template ambiguity; token auth method mismatch defaults (`basic` vs `post`) produce bare `invalid_client`; per-preview-host redirect URI churn; three overlapping auth-config surfaces (policies, experiences, DaVinci flows).
- **Console entry requires the env ID.** `console.pingone.ca` with no query string errors with "Invalid Sign-on URL" instead of routing a signed-in admin to their org — you must know `?env=<id>` or come in via a bookmark. First-session dead end for a new admin.
- **Add Environment interrupts with a "Guide Me / Do It Myself" modal** mid-wizard. Nice for first-timers, but there's no "don't ask again," and "Guide Me" isn't described — you can't tell what you're opting into.
- **Environment creation is fast and the summary screen is good** — name, type, capabilities, DaVinci on/off all confirmed in one place before Save. (Positive.)
- **Discovery endpoint is live instantly** at env creation, before any app exists — great for smoke-testing config. (Positive.)
- **The Edit Configuration panel doesn't scroll with the mouse wheel** (macOS Chrome) — fields below the fold (Refresh Token grant, Redirect URIs, Token Endpoint Auth Method) are unreachable until you Tab through form controls or collapse sections. Easily the worst papercut of the app setup; a first-time integrator could believe the redirect URI field doesn't exist.
- **Scope list sorts OIDC standard scopes and p1:* API scopes together alphabetically** — `phone` and `profile` end up buried BELOW ~20 PingOne API scopes (`p1` < `ph` in ASCII), and the scope search box returned no results for "profile" while the list clearly contains it.
- **OIDC Web App template defaults to Token Auth = Client Secret Basic** even though the guide's flow needs None — the exact default that produced our September `invalid_client`. The "OIDC Web App" template is really a confidential-client template you manually convert to public.
- **The app is created disabled** (toggle off) with no banner saying so — easy to configure everything and then wonder why the authorize call 404s.
- **First live sign-in blocked: "User has no usable devices."** Password step passed, then the Multi_Factor policy's MFA step rejected the user. Root cause: the MFA step was set to **"Use Default Policy"** — the auto-created `Default MFA Policy`, not our `SDK Exercise MFA` — and the step's "none or incompatible methods" behavior is **Block**. Creating a device policy does nothing until something references it; the console never hints that a brand-new policy is unreachable. Fix: edited `Multi_Factor` → MFA step → MFA Policy = `SDK Exercise MFA` (whose Email method is enabled with Allow Pairing, so an unpaired user gets an email OTP enrollment at sign-on). Kept Block — it's the right posture once email is actually available. Also: the error surface is admin-grade jargon shown to an end user, and the one-time password had **already been consumed** by the blocked attempt, forcing another admin reset. Expired/consumed OTPs on admin-set passwords are a demo-killer loop.
- **Environment recreation churns the environment ID** — deleting and recreating an env with identical settings yields a new ID, new discovery URL, and every downstream config reference must be updated. Obvious in hindsight, but worth stating for demo-reset workflows.
