# Ping SDK PM exercise — submission guide

My submission for the Ping Identity SDK PM technical exercise. The integration lives inside connectyall, my production Next.js 16 PWA, on branch `feature/ping-sdk-exercise`. I built it from scratch with `@forgerock/oidc-client` following the JavaScript centralized login guide, then went one step further and wired it into the real app.

## What's in the submission

- `pingone-configuration.md` — Part 1. Every console configuration item with what I chose, why, and a running friction log.
- `sdk-implementation.md` — Parts 2 through 8. SDK config, the sign-in and sign-out flows, architecture answers, the DX findings, the one improvement I'd ship first, and an epilogue on hooking the flow into the product for real.
- Screen recordings of the console work, one per major step, in the submission folder.

## Where the code is

- `src/lib/ping/config.ts` — client-safe PingOne values, discovery URL, feature flag
- `src/lib/ping/oidc.ts` — SDK client factory with the error-union narrowing
- `src/app/app/sign-in/` — the sign-in page. SIGN IN WITH PING button, callback handling, user info card, sign out
- `src/app/app/sign-up/` + `src/app/api/ping-register/route.ts` — self-registration that enforces username = email and pairs the email MFA device at creation
- `src/lib/ping/admin.ts` — worker-app client for the management API (name write-back)

## Run it locally

Prereqs: Node 20+, pnpm, and a PingOne environment configured per `pingone-configuration.md` (public OIDC app, PKCE S256 required, `http://localhost:3000/app/sign-in` registered as a redirect URI, Multi_Factor policy assigned with email OTP).

```bash
pnpm install
cp .env.example .env.local   # fill in values below
pnpm dev                     # http://localhost:3000/app/sign-in
```

Env vars the exercise needs:

```bash
NEXT_PUBLIC_PING_ENABLED=1
NEXT_PUBLIC_PING_ENV_ID=...        # PingOne environment ID
NEXT_PUBLIC_PING_CLIENT_ID=...     # the public OIDC app's client ID

# only needed for the epilogue pieces (name write-back + self-registration)
PING_ENV_ID=...                    # same environment ID, server side
PING_WORKER_CLIENT_ID=...          # worker app, Identity Data Admin on this env only
PING_WORKER_CLIENT_SECRET=...
```

The env ID and client ID ship to the browser on purpose. They appear in every authorize URL anyway, and there is no client secret in the OIDC flow at all. The worker secret stays server side.

The rest of the app (database, storage, email) has its own env vars per the root README, but you don't need any of them to run the exercise loop. The sign-in page's Ping flow is self contained: sign in, see your user info, sign out.

## Demo script

1. Open `/app/sign-in` and press SIGN IN WITH PING.
2. Sign on with the test user's password, then enter the emailed OTP.
3. Back on the page, the card shows name, username, and email from userinfo.
4. Press sign out. Tokens are revoked and cleared. Note the known gap: the PingOne session survives, so an immediate re-sign-in is silent. Details and the fix direction in Part 6 of `sdk-implementation.md`.
5. Optional, the epilogue flow: CONTINUE TO APP bridges the Ping identity into a real app session, and editing your display name in the profile patches the PingOne user through the management API.
6. Optional, registration: `/app/sign-up` creates a PingOne user with username = email, MFA enabled, and the email already paired as a device, so the first sign-in never hits the "no usable devices" dead end.

## Tests

```bash
pnpm test        # 160 tests, includes worker-client tests with faithful management-API mocks
pnpm typecheck
```
