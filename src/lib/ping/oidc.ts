import { oidc } from '@forgerock/oidc-client';
import { PING_CLIENT_ID, PING_WELLKNOWN } from './config';

// The factory resolves to a union: a { error } result when the discovery doc
// can't be fetched, or the real client. Narrow once here so callers get a
// client whose authorize/token/user members are guaranteed present.
type OidcResult = Awaited<ReturnType<typeof oidc>>;
export type OidcClient = Extract<OidcResult, { subscribe: unknown }>;

// One client per page load is fine — the factory just fetches the discovery
// doc and wires storage; tokens live in the browser via the SDK's own store.
let clientPromise: Promise<OidcClient> | null = null;

export function pingOidcClient(): Promise<OidcClient> {
  if (!clientPromise) {
    clientPromise = oidc({
      config: {
        clientId: PING_CLIENT_ID,
        // The sign-in page doubles as the OAuth callback; must exactly match
        // a redirect URI registered on the PingOne application.
        redirectUri: `${window.location.origin}/app/sign-in`,
        scope: 'openid profile email phone',
        serverConfig: {
          wellknown: PING_WELLKNOWN,
        },
      },
    }).then((client) => {
      if (!client.authorize || !client.token || !client.user) {
        // Let the next call retry rather than caching the failure.
        clientPromise = null;
        throw new Error('error' in client ? String(client.error) : 'oidc init failed');
      }
      return client as OidcClient;
    });
  }
  return clientPromise;
}

export type PingUserInfo = {
  name?: string;
  given_name?: string;
  family_name?: string;
  preferred_username?: string;
  email?: string;
  sub?: string;
};

// PingOne's userinfo omits `name` unless explicitly populated — it does not
// synthesize it from given/family name. Same rule the OTP flow uses.
export function pingDisplayName(u: PingUserInfo): string | undefined {
  return u.name ?? ([u.given_name, u.family_name].filter(Boolean).join(' ') || undefined);
}
