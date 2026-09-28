# Parts 2–8 — Application, SDK, sign-in/out, architecture, DX

Working log for the SDK PM technical exercise, continuing from `pingone-configuration.md` (Part 1). Same convention: decision + reasoning per item, ✅ once verified. Branch: `feature/ping-sdk-exercise` in the connectyall repo.

## Part 2 — Create the application ✅ (live run verified 2026-09-28)

**Platform:** JavaScript. Rather than a throwaway sample app, the integration lives inside **connectyall**, a real production Next.js 16 PWA — the Ping SDK flow replaces the app's previous "SIGN IN WITH PING" implementation on the existing sign-in page (`/app/sign-in`). Email OTP (the app's own passwordless flow) stays primary; Ping is the "or" option below it.

**What came out (from-scratch requirement):** the entire previous Ping integration —
- `@forgerock/davinci-client` (embedded DaVinci orchestration) and its renderer/hook (`ping-journey.tsx`, `use-davinci-flow.ts`)
- Better Auth `genericOAuth` server-side OIDC (confidential client with client secret) and its `trustedProviders` account linking
- server env vars `PING_ENV_ID` / `PING_CLIENT_ID` / `PING_CLIENT_SECRET`

**What went in:** `@forgerock/oidc-client@2.1.1` (the guide's package), doing OIDC entirely in the browser as a public client. Three UI states on the sign-in page: **Sign In** (button below the email form) → **Authenticated user info** (name / username / email card) → **Sign Out**.

The user experience the exercise asks for maps to:
- Sign In → `SIGN IN WITH PING` button
- Authenticated user info → the card rendered from the userinfo endpoint after redirect-back
- Sign Out → `SIGN OUT` button on that card

**Scope decision:** the SDK flow is self-contained — it does NOT mint a connectyall (Better Auth) session. Entering the app proper still uses email OTP. Bridging Ping tokens into an app session is deliberately out of scope for the exercise; it's the natural "productionize" follow-on.

## Part 3 — Configure the SDK ✅

`src/lib/ping/config.ts` (client-safe values) + `src/lib/ping/oidc.ts` (client factory):

```ts
oidc({
  config: {
    clientId: NEXT_PUBLIC_PING_CLIENT_ID,            // c93fe4f5-…
    redirectUri: `${window.location.origin}/app/sign-in`,
    scope: 'openid profile email phone',
    serverConfig: {
      wellknown: `https://auth.pingone.ca/<ENV_ID>/as/.well-known/openid-configuration`,
    },
  },
})
```

- **Client ID / env ID** ship to the browser via `NEXT_PUBLIC_*` — by design, they appear in every authorize URL anyway. There is **no client secret anywhere**: public client + PKCE.
- **Redirect URI** is the sign-in page itself, matching the console registration exactly.
- **Discovery** (`wellknown`) is the only hardcoded endpoint; authorize/token/userinfo/signoff/revoke are all discovered.
- The factory returns an error-or-client union; we narrow once in `pingOidcClient()` so the page code gets a guaranteed client (and a failed init isn't cached, so retry works).
- Platform note (browser vs mobile): no custom scheme or app link needed — the redirect is a plain same-origin navigation back to the page, which reads `?code&state` off the URL.

## Part 4 — Implement sign-in ✅ (live run verified 2026-09-28)

Flow, mapped to the exercise's eight steps:

1. `SIGN IN WITH PING` → `client.authorize.url()` builds the authorize URL (PKCE verifier generated + stashed by the SDK, state stored per-tab in sessionStorage).
2. `window.location.assign(url)` → PingOne-hosted sign-on (the `Multi_Factor` policy assigned to the app).
3. User authenticates with username + password.
4. MFA step: PingOne emails an OTP to the user's directory email (no device paired), user enters it.
5. PingOne 302s back to `http://localhost:3000/app/sign-in?code=…&state=…`.
6. On mount, the page detects `code`+`state`, scrubs them from the URL (`history.replaceState`), and calls
7. `client.token.exchange(code, state)` — the SDK verifies state, sends the code + PKCE verifier to the token endpoint, stores the returned tokens.
8. `client.user.info()` → userinfo endpoint with the access token → the page renders name / preferred_username / email.

Error paths: `?error=` on the callback (user cancelled / policy failure) and a failed exchange both land on the same friendly message with email-OTP as the fallback.

## Part 5 — Display the authenticated user ✅ (live run verified 2026-09-28)

Nothing hard-coded: the card renders whatever the **userinfo endpoint** returns (`name`, `preferred_username`, `email`), fetched by the SDK with the access token it holds. Claims come out of the `openid profile email phone` scopes granted to the app.

**Live-run observation:** username and email rendered; NAME came back empty — PingOne does **not synthesize a `name` claim** from given/family name (the same gap the earlier Better Auth integration had to patch with `mapProfileToUser`). Follow-up: fall back to `given_name + family_name` in the card.

## Part 6 — Implement sign-out ✅ (live run 2026-09-28, with a finding)

`SIGN OUT` runs two deliberate, distinct calls:

1. `client.token.revoke()` — revokes the tokens **at the server** (revocation endpoint) and deletes the local copies.
2. `client.user.logout()` — ends the **PingOne session** (signoff endpoint), so the next authorize shows the login page instead of silently SSO-ing back in.

The three concepts the exercise asks us to distinguish:
- **Removing tokens locally** — the app forgets its keys; the tokens remain valid if leaked, and the IdP session survives.
- **Revoking tokens** — the authorization server invalidates them; nobody can use them again, but the IdP session still survives (next authorize = instant re-login without credentials).
- **Ending the AS session** — the IdP forgets the user; the next authorize requires full authentication again.
Only doing all of (2) and (3) gives users what they mean by "sign out."

**Live-run finding — the theory demonstrated itself:** after SIGN OUT (revoke + logout), clicking SIGN IN WITH PING again signed the user **straight back in with no prompt**. The app's tokens were gone (local state cleared, revoke succeeded), but the **PingOne session survived** — the SDK's `user.logout()` background call evidently doesn't end the AS session the way a top-level redirect to `/as/signoff?id_token_hint=…` does. This is the textbook "I signed out but it logged me right back in" gap, reproduced on the first try. Fix direction: perform logout as a browser redirect to the discovered `signoff` endpoint with `id_token_hint` (and `post_logout_redirect_uri` back to the sign-in page).

## Part 7 — Architecture (interview prep)

- **Application (Next.js page):** owns UX state, kicks off the flow, renders the result. Never sees credentials, never talks to the password/OTP steps.
- **Ping SDK (`@forgerock/oidc-client`):** protocol mechanics — discovery, PKCE generation, state management, code exchange, token storage, userinfo, revoke/signoff. The app calls five methods and stays out of the OAuth weeds.
- **PingOne:** the authorization server + IdP — hosts the sign-on UI, runs the authentication policy (password → email OTP), issues the code and tokens, answers userinfo.
- **Browser redirect:** authentication happens ON PingOne, not in the app, so credentials never transit app code, the IdP can enforce arbitrary policy (MFA, risk, passkeys) without app changes, and the IdP session enables SSO across apps.
- **Authorization code:** a short-lived, single-use receipt delivered via the browser redirect; it's useless without the PKCE verifier, and the SDK immediately trades it for tokens over a direct HTTPS call.
- **PKCE:** the verifier/challenge pair proves the token request comes from the same party that started the authorize request. For a public client (no secret possible in a browser) it's the defense against a stolen code being replayed — which is why the env enforces `S256_REQUIRED`.
- **Tokens:** **access token** (call APIs — here, userinfo), **ID token** (JWT of identity claims for the app itself), **refresh token** (renew access without re-authentication; opaque, 30d/180d rolling per app config).
- **User info:** userinfo endpoint, authorized by the access token (Part 5).
- **Sessions:** the app's authenticated state (its tokens/UI) and the PingOne session cookie are independent; that's exactly why sign-out is a two-step (Part 6), and why revoking tokens without signoff produces the "I signed out but it logged me straight back in" surprise.

## Part 8 — Developer experience (running; finalize after the live run)

Friction log lives in `pingone-configuration.md`. Code-side additions:

- **Guide accuracy (positive):** the JavaScript centralized-login guide's API surface matched the shipped package exactly — every call worked as documented on the first try (typecheck-level).
- **Union-typed factory:** `oidc()` resolves to `{ error } | client` with all client members `?:` optional — TypeScript forces a narrowing dance (`client.token is possibly undefined`) that every consumer must hand-roll. A throwing factory or a discriminated union with a type guard would remove boilerplate from 100% of integrations.
- **Naming/versioning confusion:** the product is "Ping SDK," the docs URL says `orchsdks`, the exercise says "orchestration SDK," and the npm package is scoped `@forgerock/oidc-client`. A developer searching npm for "pingone oidc" won't find it.
- **Package split is clean (positive):** OIDC-only client is ~small, no DaVinci/journey baggage — right-sized for the redirect use case.
- **No console path to pair an MFA device.** The MFA sign-on step authenticates against paired devices but doesn't enroll them, the admin console has no "add device" for a user, and the trial's hosted login doesn't offer email enrollment mid-flow. We had to route the test user through the **MyAccount self-service portal** (which itself only worked because the *default* policy is password-only) to pair their email. Three products had to line up for one OTP to send — the single biggest DX wall of the exercise.
- **"User has no usable devices" is shown to the end user** — admin-grade jargon at the worst moment, with a "View Details" that doesn't help the person locked out.
- **Passcode/OTP and flow lifetimes are demo-hostile.** One-time admin passwords expire fast and are consumed by *failed* flows; the authorize flow itself times out ("The request has expired or is invalid") if the user dawdles at the OTP email; each retry restarts from the app.
- **`user.logout()` doesn't end the PingOne session** (see Part 6) — the API's naming implies more than it delivers, and the resulting silent SSO-back-in will confuse every first-time integrator.

## Prioritized improvement (Part 8 — the pick)

**Problem:** first-time MFA setup dead-ends ("User has no usable devices") because nothing in the sign-on flow can enroll a device.
**Who:** every developer doing exactly what the getting-started guide says (create user → require MFA → sign in), and ultimately their end users.
**Why it matters:** it's a hard block at the exercise's core moment — the first MFA sign-in — and diagnosing it requires knowledge that spans three surfaces (auth policy step config, MFA device policy, self-service portal).
**Why first:** the other findings (jargon errors, logout semantics, scope sorting) degrade the experience; this one terminates it.
**Proposed change:** offer inline enrollment in the hosted sign-on MFA step — if the user has no usable device and the device policy enables Email/SMS with pairing, prompt to verify the directory email and pair it right there (opt-in per policy: "Allow enrollment during sign-on"). Console side: an "add device" action on the user's Methods panel for admins/demo setups.
**Success measure:** drop in NO_USABLE_DEVICES flow failures per new environment; time-to-first-successful-MFA-sign-in in trial telemetry; support-ticket volume mentioning the error string.

**Deliverables status:** README 🔲 · PingOne config summary ✅ (`pingone-configuration.md`) · assumptions/problems captured inline · DX prioritization 🔲 (after live run).
