# Parts 2 to 8. Application, SDK, sign-in and sign-out, architecture, DX

Continues from `pingone-configuration.md`. Branch `feature/ping-sdk-exercise` in the connectyall repo.

## Part 2. The application

Platform is JavaScript. Instead of a throwaway sample I built the integration into connectyall, my production Next.js 16 PWA. The Ping SDK flow replaced the app's previous Ping sign-in on the existing `/app/sign-in` page. Email OTP, the app's own passwordless flow, stays primary and Ping is the "or" option under it.

To honor the from-scratch requirement I removed the entire previous integration first. That was the DaVinci client and its renderer, the Better Auth genericOAuth server-side OIDC which was a confidential client with a secret, and the server env vars that held Ping credentials. In their place is `@forgerock/oidc-client` 2.1.1, the guide's package, doing OIDC entirely in the browser as a public client.

The three states the exercise asks for map to the page like this. Sign In is the SIGN IN WITH PING button. Authenticated user info is a card with name, username, and email rendered after the redirect back. Sign Out is a button on that card.

One scope decision I made. The SDK flow keeps its own tokens and does not by itself create a connectyall session. I added that bridge later as a separate follow-on, see the epilogue, but for the exercise the sign-in, user info, and sign-out loop is self contained on the page. Verified live on 2026-09-28.

## Part 3. SDK configuration

Config lives in `src/lib/ping/config.ts` and the client factory in `src/lib/ping/oidc.ts`.

```ts
oidc({
  config: {
    clientId: NEXT_PUBLIC_PING_CLIENT_ID,
    redirectUri: `${window.location.origin}/app/sign-in`,
    scope: 'openid profile email phone',
    serverConfig: { wellknown: 'https://auth.pingone.ca/<ENV_ID>/as/.well-known/openid-configuration' },
  },
})
```

The client ID and environment ID ship to the browser as NEXT_PUBLIC vars on purpose, they appear in every authorize URL anyway. There is no client secret anywhere, public client plus PKCE. The redirect URI is the sign-in page itself and must exactly match the console registration. The wellknown URL is the only endpoint I hardcode, authorize, token, userinfo, signoff, and revoke are all discovered.

One implementation note. The `oidc()` factory resolves to a union of an error object or the client, with every client member optional. I narrow it once in `pingOidcClient()` so page code gets a guaranteed client, and I don't cache a failed init so the next call retries.

## Part 4. Sign-in flow

What happens when you press the button, mapped to the exercise's eight steps.

1. The button calls `client.authorize.url()`. The SDK generates the PKCE verifier and state and builds the authorize URL.
2. `window.location.assign(url)` sends the browser to the PingOne hosted sign-on, which runs the Multi_Factor policy assigned to my app.
3. The user enters username and password.
4. PingOne emails an OTP to the user's paired email device and the user enters it.
5. PingOne redirects back to `http://localhost:3000/app/sign-in?code=...&state=...`.
6. On mount my page sees code and state, scrubs them from the URL with history.replaceState, and
7. calls `client.token.exchange(code, state)`. The SDK checks state, posts the code plus PKCE verifier to the token endpoint, and stores the tokens.
8. `client.user.info()` hits the userinfo endpoint with the access token and I render the result.

If the callback carries an error param, for example the user cancelled, or if the exchange fails, I show one friendly message and point at email OTP as the fallback.

## Part 5. Displaying the user

Nothing is hard coded. The card shows whatever userinfo returns for name, preferred_username, and email, which come from the openid profile email phone scopes.

Live run observation. Username and email rendered, name came back empty. PingOne does not synthesize a `name` claim from given and family name. I added a fallback that joins given_name and family_name, the same rule my earlier integration needed.

## Part 6. Sign-out

My sign out button runs two calls on purpose.

1. `client.token.revoke()` invalidates the tokens at the server and deletes the local copies.
2. `client.user.logout()` is supposed to end the PingOne session.

The three concepts the exercise asks about. Removing tokens locally means the app forgets its keys but the tokens stay valid and the IdP session survives. Revoking means the server invalidates the tokens but the IdP session still survives, so the next authorize silently signs you back in. Ending the authorization server session means the IdP forgets you and the next sign-in asks for credentials again.

Live run finding, and my favorite moment of the exercise. After sign out I clicked SIGN IN WITH PING again and got signed straight back in with no prompt. The tokens were gone but the PingOne session survived, meaning the SDK's `user.logout()` background call did not end the session the way a top level redirect to `/as/signoff` with an id_token_hint would. That is the textbook "I signed out but it logged me right back in" gap, reproduced on the first try. My fix direction is to do logout as a browser redirect to the discovered signoff endpoint.

## Part 7. Architecture notes for the walkthrough

The application owns UX state, starts the flow, and renders the result. It never sees credentials.

The SDK owns protocol mechanics. Discovery, PKCE, state, code exchange, token storage, userinfo, revoke and logout. I call five methods and stay out of the OAuth weeds.

PingOne is the authorization server and IdP. It hosts the sign-on UI, runs the authentication policy including the email OTP step, issues codes and tokens, and answers userinfo.

Why the browser redirect. Authentication happens on PingOne, not in my app, so credentials never transit my code, the IdP can add or change policy like MFA without app changes, and the IdP session enables SSO across apps.

The authorization code is a short lived single use receipt delivered through the browser. It is useless without the PKCE verifier and gets traded for tokens over a direct HTTPS call.

PKCE exists because a browser app cannot keep a secret. The verifier proves the token request comes from the same party that started the authorize request, which is why I set the environment to S256_REQUIRED.

Tokens. The access token calls APIs, here userinfo. The ID token is a JWT of identity claims for the app itself. The refresh token renews access without re-authentication, opaque, 30 days with 180 day rolling in my config.

Sessions. The app's authenticated state and the PingOne session cookie are independent. That is exactly why sign out is two operations and why my live run signed itself back in when the second one quietly failed.

## Part 8. Developer experience

The console friction log is in `pingone-configuration.md`. SDK and docs findings from the build.

What worked well. The centralized login guide's API surface matched the shipped package exactly, every call worked as documented on the first try. The OIDC-only package is small and has no orchestration baggage, right-sized for this use case. The discovery-first design means one URL configures everything.

What could be improved.

- The `oidc()` factory returns an error-or-client union with all client members optional, so every consumer hand rolls the same narrowing dance. A throwing factory or a type guard would remove that boilerplate from every integration.
- Naming. The product is the Ping SDK, the docs URL says orchsdks, the exercise says orchestration SDK, and the npm package is `@forgerock/oidc-client`. Searching npm for "pingone oidc" does not find it.
- `user.logout()` does not end the PingOne session, see Part 6. The name promises more than it delivers and the resulting silent SSO will confuse every first time integrator.
- First time MFA setup dead ends with "user has no usable devices" because nothing in the sign-on flow can enroll a device. Full detail in the Part 1 log.

## The improvement I would ship first

Problem. First MFA sign-in dead ends with "User has no usable devices" because the hosted sign-on flow cannot enroll a device, the console has no pair-a-device action, and the escape hatch is a separate self service portal.

Who hits it. Every developer doing exactly what the getting-started path suggests, create a user, require MFA, sign in. And ultimately their end users.

Why it matters and why first. The other findings degrade the experience, this one terminates it, at the exact moment a trial developer is deciding whether the product works. Diagnosing it took me three surfaces, the auth policy step, the MFA device policy, and MyAccount.

What I would build. Inline enrollment in the hosted sign-on MFA step. If the user has no usable device and the device policy enables email or SMS with pairing allowed, prompt them to verify their directory email right there and pair it, gated by a per-policy "allow enrollment during sign-on" setting. On the console side, an add-device action on the user's Methods panel for admin and demo setups.

How I would measure it. NO_USABLE_DEVICES failures per new environment, time to first successful MFA sign-in in trial telemetry, and support ticket volume mentioning the error string.

## Epilogue. Hooking it into the real app

After the exercise loop worked I connected it to the product properly. Two rules I set. The username is always the email and the email is not editable in the app. The display name is editable and propagates back to the PingOne user.

Session bridge. After the SDK flow completes, a Continue to app button runs Better Auth's oauth2 flow against the same PingOne app as a public client with PKCE. PingOne SSO's silently off the session the SDK just established, the callback verifies the identity server side, and Better Auth mints the app session, linking by verified email. The silent SSO behavior that surprised me in Part 6 is exactly what makes this bridge seamless.

Name write-back. A worker application in the environment gives my server client-credentials access to the management API. When a signed-in user edits their display name, the profile endpoint splits it into given and family and patches the matching PingOne user by email. Ping is a mirror here, not the source of truth, so a failed sync logs and never fails the save.
