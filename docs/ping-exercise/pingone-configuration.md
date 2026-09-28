# Part 1. PingOne environment configuration

My working log for Part 1 of the SDK PM exercise. For each item I wrote down what I decided, why, and what I actually configured. I followed the [JavaScript centralized login guide](https://developer.pingidentity.com/orchsdks/oidc/usage/javascript-centralized-login.html) with `@forgerock/oidc-client`.

Screen recordings of the console work are in my submission folder, one per step. They cover creating the environment, creating the test user, registering the OIDC app, and setting up MFA and policies.

## 1. Create or identify a PingOne environment

I already had a PingOne trial from an earlier integration, so instead of registering a new trial I created a fresh environment inside it. That gave me a clean slate with its own environment ID and discovery endpoint while leaving my other environment alone.

What I set up on 2026-09-28. Environment name SDK Exercise, type Sandbox, use case Customer. Environment ID `28c0e2b4-22df-4092-be2d-5f493b57b528`, Canada region so everything lives on `auth.pingone.ca`. Services enabled are PingOne SSO and PingOne MFA. I left sample users and DaVinci flows off because I wanted plain authentication policies, not orchestration. The trial license expires 2026-10-14 so the demo has to happen before then.

One thing I learned the hard way. I deleted and recreated this environment once to record the steps, and the new environment got a new ID. Every downstream reference, including the discovery URL, had to be updated.

## 2. Create a test user

Directory, Users, Create User. I made `demo` with a real email I can open, because the OTP second factor is email based and I need to read those codes during the demo.

The Add User form has no password field. The password gets set afterward through the user's menu, Reset Password, then Create or generate password. PingOne treats an admin-set password as one time use, which bit me more than once, see the friction log. The user card also showed MFA Disabled at creation, which item 10 has to fix.

## 3. Register an OIDC application

Platform is JavaScript. The integration lives inside connectyall, my production Next.js app, replacing the previous Ping sign-in on `/app/sign-in`. From PingOne's point of view it is just a browser based OIDC relying party.

I created `connectyall-ping-demo`, type OIDC Web App, and enabled it. Client ID `c93fe4f5-5e54-4ee0-819f-bc6a7aeb3d48`. The console still shows a client secret on the app even though a public client never uses one, which I found confusing.

## 4. Application and client type

I went with OIDC Web App configured as a public client, token endpoint auth method None, with PKCE.

My reasoning. The SDK runs entirely in the browser, and a secret embedded in browser JavaScript is public by definition. So the right shape is a public client using authorization code plus PKCE, where the PKCE verifier replaces the client secret as proof that the token request comes from whoever started the flow.

The console offers both a Single Page App template and an OIDC Web App template, and you can configure either into the same thing. The guide uses OIDC Web App so I followed it. I had to manually change token auth from the default Client Secret Basic to None.

## 5. OAuth grant types

Authorization Code plus Refresh Token, response type Code only.

Authorization code is the only sensible grant for interactive user sign-in. Implicit is deprecated because tokens leak through URL fragments. I set PKCE enforcement to S256_REQUIRED so the environment rejects any non PKCE attempt. Refresh token lets the SDK renew access without bouncing the user through the redirect again. I kept the refresh token defaults, opaque format, 30 days, 180 day rolling.

## 6. Redirect URIs

I registered exactly two. `http://localhost:3000/app/sign-in` for local dev and `https://connectyall.timnan.xyz/app/sign-in` for production.

The redirect URI is the security boundary of the code flow, PingOne only delivers codes to an exact match. My sign-in page doubles as the callback, after PingOne redirects back with code and state the SDK on that page does the token exchange. From my earlier Ping work I knew Vercel preview URLs churn on every deploy and each new host needs registering, so I demo on localhost and the stable prod domain only.

## 7. Scopes

`openid profile email phone`, the guide's set. openid makes it an OIDC request at all. profile and email feed the user info screen. phone is in the guide's config so I kept it, the test user has no phone number and the claim just comes back absent.

Scopes have to be enabled on the app's Resources tab and requested by the SDK. A mismatch fails quietly, so I checked both sides.

## 8. OIDC discovery endpoint

`https://auth.pingone.ca/28c0e2b4-22df-4092-be2d-5f493b57b528/as/.well-known/openid-configuration`

It returns 200 the moment the environment exists, before any app is registered, which made it a nice smoke test. Everything the SDK needs is discovered from this one URL. Worth noting PingOne's end session endpoint is called `signoff`, another reason to never hand build endpoint URLs.

## 9. Authentication experience

With DaVinci off, the environment provisions two plain authentication policies, Single_Factor which is the default, and Multi_Factor which is Login then MFA. I assigned Multi_Factor to my app on its Policies tab, which overrides the environment default for this app only.

## 10. OTP as an additional step

I chose email OTP. No enrollment friction in a trial, nothing to re-pair before a demo, no SMS credits.

What it actually took.

1. I created an MFA device policy, SDK Exercise MFA, with Email enabled and pairing allowed. Creating it did nothing by itself, the Multi_Factor policy's MFA step was still pointed at Use Default Policy, so I had to edit the step to reference my policy.
2. I enabled MFA on the demo user, the toggle under the user's Services tab.
3. The user still got blocked with "User has no usable devices." It turns out the hosted sign-on flow authenticates against paired devices but does not enroll them, and the admin console has no way to pair a device either. I ended up signing the demo user into the MyAccount self service portal, which only worked because the default policy is password only, and pairing the email there.

After that the flow worked, password, then an emailed passcode, then back to my app.

## Friction log

Running list of developer experience issues I hit. These feed Part 8.

- The console needs an environment ID in the URL. `console.pingone.ca` with nothing else errors with Invalid Sign-on URL instead of routing a signed-in admin home.
- The Add Environment wizard interrupts with a Guide Me or Do It Myself modal, with no explanation of what Guide Me does and no don't ask again.
- Environment creation itself is fast and the summary screen before save is good.
- The discovery endpoint is live the instant the environment exists. Great for smoke testing.
- The Edit Configuration panel does not scroll with the mouse wheel on macOS Chrome. Fields below the fold, redirect URIs, token auth method, the refresh token grant, are unreachable until you tab through form controls. A first-time integrator could reasonably conclude the redirect URI field does not exist.
- The scope picker sorts OIDC standard scopes and p1 API scopes together alphabetically, so profile and phone end up buried below twenty p1 scopes. The scope search box returned nothing for "profile" even though it is in the list.
- The OIDC Web App template defaults to token auth Client Secret Basic, the exact default that caused an invalid_client failure in my earlier integration.
- Apps are created disabled with no banner saying so.
- "User has no usable devices" is admin jargon shown to an end user at the worst possible moment, and the View Details link does not help them.
- Admin-set passwords are one time use and get consumed even by a sign-on attempt that later fails at the MFA step. I had to reset the demo password three times before completing one sign-in.
- The whole authorize flow times out if you are slow reading the OTP email, with a generic "request has expired" page, and you have to restart from the app.
- There is no admin path to pair an MFA device for a user. Enrollment needs the self service portal or the management API.
