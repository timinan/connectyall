# Ping Identity integration — what we did and what we hit

Plain-English record of adding "Sign in with Ping" to connectyall. Written as interview prep material: the story of the integration, in order, with every real issue we ran into and how each one got solved.

## What we built

Connectyall already had passwordless email sign-in (a 6-digit code sent by Resend, handled by Better Auth). We added a second way in: a "Sign in with Ping" button that hands authentication to PingOne, Ping Identity's cloud platform. Clicking it sends you to Ping's hosted login page, which handles password, MFA with a passkey (Touch ID), and even brand-new user registration. When Ping is satisfied it sends you back, and the app creates or links your account by email and starts a normal session.

The design principle: let each side do what it's good at. PingOne owns the login journey, policies, and MFA. Better Auth keeps owning sessions and the database. We deliberately did not hand-write any token verification or session code. The whole integration is standard OIDC (authorization code flow with PKCE), which Better Auth's genericOAuth plugin speaks out of the box.

Everything is gated behind env vars. Without the four PING_* variables set, the plugin isn't registered and the button doesn't render, so the feature can be turned off by deleting config, no code change needed.

## The pieces

1. A PingOne trial tenant (Canada region, so all URLs are `auth.pingone.ca`), with an OIDC Web App configured: authorization code flow, scopes openid/profile/email, and redirect URIs for localhost, the preview host, and both production hosts.
2. Three optional env vars for the server (environment ID, client ID, client secret) plus a public flag that shows or hides the button.
3. About 30 lines in the Better Auth server config: the genericOAuth plugin pointed at PingOne's discovery URL, plus account linking so a Ping login with a known email attaches to the existing user instead of creating a duplicate.
4. A secondary button on the sign-in page, styled to the design system, that calls `signIn.oauth2({ providerId: 'pingone' })`.
5. Console-side (zero app code): an authentication policy requiring MFA, passkey enrollment during sign-on, and self-service registration so strangers can sign up.

## Every issue we hit, in order

**1. The trial needs a business email.** Ping's signup form rejects gmail. Solution: bought `timnan.xyz` at Porkbun (~$2) and used its free email forwarding to make `tim@timnan.xyz` deliver to gmail. Bonus: the domain became `connectyall.timnan.xyz`, the app's production URL.

**2. New-domain DNS limbo.** For the first hour the .xyz registry hadn't published the domain, so email and the site both looked broken while everything was configured correctly. Lesson: check the authoritative nameservers directly before assuming a config mistake.

**3. Wrong environment ID.** A PingOne trial creates two environments, and we wired the app against the ID of the wrong one. Every auth request failed with a generic INVALID_MESSAGE error that named neither the app nor the environment. Diagnosed by noticing both IDs answered on the discovery endpoint, then testing the authorize URL against each. Lesson: PingOne's generic errors usually mean the request never matched an app; check env ID and client ID pairing first.

**4. MFA policy vs user MFA flag.** PingOne treats MFA as both a policy requirement and a per-user switch. Our policy demanded MFA but the test user had the switch off: "MFA is disabled for user." Enabling the switch then produced "Couldn't find authenticating device" because no method was paired. The fix that made everything flow: allow device enrollment during sign-on in the policy, so users without a method get walked through pairing a passkey right inside the login. The same issue came back for self-registered users (their MFA switch defaults to off) and was fixed the same way, in the policy rather than per user.

**5. Errors landed on an ugly default page.** When Ping denied a login, Better Auth showed its own dark "ERROR" screen instead of our sign-in page. The per-request errorCallbackURL doesn't apply to provider-denied callbacks; the fix is the server-level `onAPIError.errorURL` option, which redirects those errors back to our sign-in page where a friendly message renders.

**6. Token exchange rejected: "Unsupported authentication method."** PingOne's app default expects client credentials in an HTTP Basic header at the token endpoint; Better Auth sends them in the POST body by default. One line (`authentication: 'basic'`) aligned them. This is the classic OIDC interop gotcha: both sides are spec-compliant, they just default to different options.

**7. "Unable to get user info."** Ping's tokens carried the email but no name, and Better Auth refuses to create a user without one. Fixed with a `mapProfileToUser` hook: use Ping's name if present, else given + family name, else the part of the email before the @.

**8. Preview URLs churn.** Every Vercel preview deploy gets a fresh URL, and each one has to be registered as a redirect URI in PingOne or logins fail. Workaround during development: test on localhost (registered once). Real fix someday: the stable per-branch URL that comes with Vercel's git integration.

**9. Custom-domain cookie gotcha.** Going to production on `connectyall.timnan.xyz` required moving BETTER_AUTH_URL to that domain so the OAuth callback and session cookie live where the user is browsing. Share links stayed on the old domain on purpose so nothing already sent to people breaks.

## Security notes worth knowing

Account linking trusts the email Ping asserts. That's safe because PingOne verifies email addresses at registration. If the Ping app were ever reconfigured to allow unverified emails, linking would become an account-takeover vector. The trust is a deliberate, documented decision, not an accident.

The client secret never reaches the browser. The public env var is only a UI flag.

## What's next

Part 2 of the plan: build a DaVinci orchestration flow (a "verify this contact's email" journey drawn in Ping's visual flow canvas) and embed it in the app with their widget SDK. That showcases the product Ping's enterprise customers actually live in.
