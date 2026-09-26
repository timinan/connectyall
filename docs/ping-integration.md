# Learning Ping Identity through a real integration

A learning document built from hands-on experience: integrating PingOne into connectyall, a shipped production app. Structured for the Product Manager, Developer Experience role, whose mission is making "Time to First Integration" fast and frictionless for both human developers and AI agents.

The meta-point that makes this document different: **the integration was executed end-to-end by an AI coding agent (Claude Code), with a human in the loop for console steps and QA.** That's exactly the workflow the DX role wants to optimize for. Every point of friction below was experienced by an AI agent trying to complete an integration autonomously, which makes it a direct answer to the role's question: what happens when an agent, not a human, reads your docs and calls your APIs?

## 1. Ping in one paragraph

Ping Identity sells identity and access management (IAM) to the largest enterprises (more than half of the Fortune 100). The pitch is "digital freedom": secure experiences without friction. The platform, PingOne, is a cloud identity layer covering sign-on, MFA, passwordless (passkeys/FIDO2), risk, and orchestration. The strategic product is DaVinci, a visual flow canvas where identity teams draw login and registration journeys as node graphs instead of shipping app code. Developers touch Ping through OIDC/OAuth endpoints, SDKs (web, iOS, Android, hybrid), and the DaVinci widget.

## 2. The standards you need to speak

These came up concretely in our integration, not as trivia:

- **OAuth 2.0 authorization code flow with PKCE.** The browser gets redirected to Ping with a one-time challenge; Ping sends back a code; the server exchanges it for tokens. We used exactly this, via an off-the-shelf OIDC client.
- **OIDC on top of OAuth.** Adds the ID token (who the user is) and the discovery document, a JSON file at `/.well-known/openid-configuration` that tells clients every endpoint. Discovery is why our integration needed only an environment ID, not six URLs.
- **FIDO2/WebAuthn (passkeys).** Public-key credentials bound to a device, phishing-resistant. In PingOne this is pure policy configuration: we never wrote a line of WebAuthn code, and users enroll Touch ID during sign-on.
- **Token endpoint client authentication.** The spec allows credentials in an HTTP Basic header or the POST body. Both are compliant; defaults differ across vendors. This exact mismatch broke our integration for an hour (issue 6 below).
- **SAML** didn't appear in this project; it's the legacy enterprise federation protocol PingFederate handles.

## 3. What we built, as a case study

### The app in brief

Connectyall is a phone-first PWA for people who meet someone and want to stay in touch: you record a short voice memo about who you just met, and the app turns it into a contact card with a recap, extracted contact channels, dated follow-up reminders, and a shareable landing page with a vCard. It's a real shipped product at connectyall.timnan.xyz, not a demo repo.

The AI pipeline behind a capture:

- **Whisper (Cloudflare Workers AI)** transcribes the voice memo. When a user has set custom vocabulary, the app passes it as an initial prompt so unusual names and product terms transcribe correctly.
- **Gemini 2.5 Flash Lite (via the Vercel AI SDK)** does structured extraction from the transcript: the person's name, role, company, emails and phones (including spelled-out forms like "S-A-R-A-H at gmail dot com"), social handles, notes, a recap phrased to read naturally in the share message, and follow-up commitments with relative dates ("call them in two weeks"). The provider is env-swappable; Claude Haiku is the configured alternative.
- **Deepgram Nova-3** (also on Cloudflare Workers AI) is built but dark behind a provider switch, for diarized two-speaker conversation capture.
- Non-LLM supporting cast: Satori + Resvg render the share image server-side, Inngest runs background jobs, Neon Postgres + Drizzle hold the data.

Relevant to this document: the app already deals with structured-output drift, prompt versioning, and per-user personalization of model behavior — so identity was integrated into a product that takes AI plumbing seriously.

### The integration

Connectyall (Next.js, Better Auth for sessions, email-OTP sign-in) gained a "Sign in with Ping" button. PingOne owns the login journey: password, passkey MFA with enrollment during sign-on, and self-service registration. The app consumes the OIDC result and links accounts by verified email. Division of labor was the design principle: the identity platform owns identity, the app owns sessions, and nobody hand-rolls token verification.

Phase 2 took it further: the same journey now renders **natively inside the app's own sign-in page** via the `@forgerock/davinci-client` SDK, behind a feature flag. The SDK walks the DaVinci flow node by node and hands back collectors (text fields, password fields, a passkey step) that the app renders in its own design system — no redirect, no iframe. On success the SDK yields an authorization code and the app completes the same OIDC flow it already had, so the session layer didn't change at all. The redirect button remains the fallback when the flag is off.

Elapsed time from "create a trial account" to "working passkey login in production": roughly one working day, of which the code itself was perhaps an hour. The other hours went to friction. That ratio is the DX story.

## 4. The friction log: fourteen issues, and what each teaches about DX

**1. The trial requires a business email.** Bought a $2 domain with email forwarding to get past the form. DX lesson: the very first gate in the funnel filters out individual developers, the exact audience an SDK adoption strategy courts. Time to First Integration starts at the signup form, not the first API call.

**2. New-domain DNS limbo** made correctly-configured email look broken for an hour. Not Ping's fault, but part of the honest funnel picture: prerequisite yaks add real elapsed time.

**3. Wrong environment ID.** Trials create two environments; we wired the app against the wrong one. Every request failed with `INVALID_MESSAGE: An unexpected error occurred, please contact your administrator`. Nothing named the actual problem. Diagnosis required probing discovery endpoints for both IDs. DX lesson: this is the single best example of an error message optimized for neither humans nor agents. An agent can only fix what an error names. "Client ID not found in this environment" would have cost seconds instead of the better part of an hour.

**4. The MFA policy vs per-user MFA flag split.** PingOne treats MFA as a policy requirement and as a per-user switch, and they can disagree. Sequence of failures: "MFA is disabled for user," then "Couldn't find authenticating device," then the same block again for every self-registered user. Each fix lived in a different console screen. The durable fix (enable device enrollment during sign-on, at the policy level) took three rounds to discover. DX lesson: conceptual models that live across scattered console pages are where integrators stall; a single "why can't this user sign in?" diagnostic view, or defaults where registration implies enrollment, would erase the whole class.

**5. Provider-denied errors landed on the client library's raw error page,** not our sign-in screen. This one is a client-library (Better Auth) gap rather than Ping's, and it's instructive for an SDK PM from the other direction: your SDK's error ergonomics are part of someone else's user experience. The fix was an obscure server-level option, found by reading the library's dist source. An agent did that source-diving autonomously; a human might have filed a support ticket.

**6. Token exchange rejected: `invalid_client: Unsupported authentication method`.** PingOne's app default is Basic auth at the token endpoint; the client library defaults to POST-body credentials. Both spec-compliant. One config line fixed it, but only after reading server logs. DX lesson: interop defaults are a matrix your quick-start should pin down explicitly ("if you use library X, set authentication to basic"). This is precisely the kind of pairing knowledge an agent-readable integration guide, or an MCP server exposing "validate my app config against my code," would eliminate.

**7. "Unable to get user info": Ping's tokens carried no name claim,** and the client library refuses to create users without one. Fixed by mapping given/family name with an email-prefix fallback. DX lesson: claim shape differences between providers are a top-three integration bug class; documenting the exact claims your tokens carry per scope, in machine-readable form, serves humans and agents alike.

**8. Redirect URI churn.** Every preview deployment got a new URL, each needing manual registration in the console. Workaround: develop against localhost. DX lesson: redirect URI management is a known OAuth pain; wildcard support for dev environments, or an API-first flow an agent can call to register URIs, keeps the loop autonomous. (PingOne does have a management API; the friction is that the console path is what docs teach first.)

**9. Custom-domain cookie topology.** Moving production to a new domain meant the auth base URL and session cookies had to move with it. Standard OAuth deployment knowledge, but the kind that belongs in a "going to production" checklist.

Phase 2, the native SDK embed, added five more:

**10. CORS produced a misleading error.** The app's CORS setting was "Allow any CORS-safe origin," which excludes localhost, so the SDK's very first browser call failed — with `FETCH_ERROR: Please ensure a correct Client ID`. The client ID was fine. DX lesson: when an SDK's transport layer fails, the error must say "request blocked" rather than guess at a config cause. An agent chased the client ID for a while because that's what the error named; a "check your CORS allowlist includes this origin" message is one line and would have ended it instantly. The quick-start should also state upfront that embedded SDKs require an explicit origin allowlist.

**11. The SDK silently defaults `redirect_uri` to the current page URL.** The config field is documented as optional; omitting it produced `INVALID_DATA: Redirect URI mismatch` because the SDK filled in the page's own URL, which isn't a registered redirect URI. DX lesson: an "optional" field whose default is almost never what an OAuth integration wants is effectively required — the docs should say so, or the error should print the value it actually sent.

**12. Calling `start()` twice invalidates the flow.** A second start silently kills the first interaction; the next step then fails with a bare 401 "Session expired." Easy to trigger from React strict-mode double-effects or a double-tapped button. DX lesson: single-use handles need either idempotent starts or an error that names the cause ("this interaction was superseded by a newer start()").

**13. The passkey Relying Party ID wall.** Passkeys enrolled under Ping's hosted pages are bound to `pingone.ca`; the moment the same flow runs embedded on the app's own domain, WebAuthn throws `SecurityError` — correct per spec, invisible in any Ping doc about moving from hosted to embedded. The fix is a console setting (FIDO policy RP ID → the app's domain) plus re-enrollment, and passkeys can never be tested on localhost at all. DX lesson: "migrating from hosted to embedded" is a predictable journey that crosses a WebAuthn origin boundary; a checklist item and a purpose-built error ("this credential's RP ID doesn't match your origin") would save every integrator the same afternoon.

**14. The passkey node has no submit button.** Every other DaVinci node hands the SDK collectors plus a submit collector; the FIDO node ships only the credential collector and static text. Wiring the WebAuthn ceremony to a submit action — the pattern every other node teaches — leaves the UI hanging on "Follow the directions on your screen" forever. The fix is to auto-run the ceremony when the node appears. DX lesson: when one node type breaks the interaction contract the rest of the API establishes, that exception belongs in the collector docs, ideally with a rendering recipe per collector type.

## 5. The agent-first observations, distilled

Running this integration through an AI agent surfaced a pattern worth pitching in the interview:

- **Agents are only as good as your error messages.** Every generic error forced a human-style debugging detour (log streaming, source reading, endpoint probing). Every specific error was fixed in one step. Error specificity is the highest-leverage agent-DX investment.
- **Console-only steps break agent loops.** The agent completed everything reachable by API or code autonomously; every console step (app creation, policy toggles, URI registration) required handing off to the human with written instructions, waiting, and verifying by log. A management-API-first path, or an MCP server for PingOne administration, would have kept the whole integration in one autonomous loop. That's a concrete product idea for the role.
- **Discovery documents are the model to generalize.** OIDC discovery is machine-readable config that made part of our setup trivial. The parts that hurt (claim shapes, auth-method defaults, policy semantics) are exactly the parts with no machine-readable equivalent yet.
- **The friction log is the roadmap.** Instrumenting where integrations stall (signup, first token exchange, first MFA success) gives the Time to First Integration funnel real stages with real drop-off points. Our single data point: code was ~15% of elapsed time; identity-platform configuration understanding was the rest.

## 6. Glossary for quick review

- **Environment**: a PingOne tenant partition; everything (users, apps, policies) lives inside one. Trials create two, which is how issue 3 happens.
- **Application (OIDC Web App)**: the registered client; holds client ID/secret, redirect URIs, token auth method.
- **Authentication policy / sign-on policy**: the rule chain the hosted login runs (password step, MFA step, registration toggle).
- **Population**: a user segment within an environment; self-registered users land in one.
- **DaVinci**: visual orchestration; flows are node graphs (forms, connectors, branches) published behind a flow policy and embeddable via widget SDK.
- **Hosted login vs embedded**: redirect to Ping's pages (simplest, most secure defaults) vs rendering the journey inside your own page. We shipped both: hosted in phase 1, embedded via `@forgerock/davinci-client` in phase 2.
- **Collector**: the SDK's unit of embedded UI — each DaVinci node hands back typed collectors (text, password, FIDO credential, submit action) that the app renders however it likes.

## 6.5 Epilogue: we retired passkeys

After phase 2 shipped, live QA surfaced the last wall: a passkey is bound to the domain it was enrolled on, so the device enrolled on Ping's hosted pages could never authenticate once the journey moved into the app's own domain — and MFA device state lives on the account, so every password login funneled into a dead challenge. The fixes existed (re-enroll under the new RP ID, clean up device state), but the product call was simpler: turn off MFA and passkeys for this app in the experience editor and keep password + the app's own email-code path. Two checkboxes, effective immediately, no deploy. That's a real data point for the DX funnel: when a feature's configuration surface generates more support burden than user value for a given app, integrators quietly switch it off — and the platform never finds out unless it measures it.

## 7. What phase 2 taught about the orchestration SDK

Phase 2 embedded the full sign-on journey natively using the DaVinci client SDK — the orchestration product the role's roadmap centers on. The headline finding: the SDK's core loop (start → render collectors → submit → repeat until success) is genuinely pleasant, and the app never touches a token. But the distance between "the loop works" and "production sign-in works" was five console-and-contract gotchas (issues 10–14 above), none of which live in the SDK docs. The hosted-to-embedded migration is a predictable journey — CORS allowlist, redirect URI, RP ID, per-collector rendering — and it's currently assembled by trial and error. A single "embedding checklist" page, or better, machine-readable per-node rendering contracts, is the concrete phase-2 product ask. That maps directly to the "Orchestration SDK across Web, iOS, Android, and Hybrid" ownership in the posting.
