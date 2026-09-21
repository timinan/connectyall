'use client';

// THROWAWAY SPIKE — do not merge. Tests two questions:
// 1) Can @forgerock/davinci-client run the "Connectyall Sign-On" experience
//    natively (which collectors do our nodes emit)?
// 2) After a successful embedded flow, does the browser hold a Ping SSO
//    session that lets our normal Better Auth redirect complete silently?

import { useState } from 'react';
import { signIn } from '@/lib/auth/client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export default function PingSpike() {
  const [log, setLog] = useState<string[]>([]);
  const [client, setClient] = useState<Any>(null);
  const [node, setNode] = useState<Any>(null);
  const [values, setValues] = useState<Record<string, string>>({});

  function append(line: string) {
    setLog((l) => [...l, line]);
    console.log('[spike]', line);
  }

  async function begin() {
    const { davinci } = await import('@forgerock/davinci-client');
    const c = await davinci({
      config: {
        clientId: process.env.NEXT_PUBLIC_PING_CLIENT_ID ?? '9fb3669e-8bfa-494b-a0eb-40f4d6cd36fa',
        responseType: 'code',
        scope: 'openid profile email',
        redirectUri: 'http://localhost:3000/api/auth/oauth2/callback/pingone',
        serverConfig: {
          wellknown:
            'https://auth.pingone.ca/b78444d2-7dd1-450f-9ed9-8dd48ccf6e1c/as/.well-known/openid-configuration',
        },
      },
    } as Any);
    setClient(c);
    const n = await (c as Any).start();
    setNode(n);
    append(`start(): status=${n.status}`);
    dumpNode(n, c);
  }

  function dumpNode(n: Any, c: Any) {
    if (n.status === 'continue') {
      const collectors = (c.getCollectors?.() ?? n.client?.collectors ?? []) as Any[];
      collectors.forEach((col: Any, i: number) =>
        append(`collector[${i}]: type=${col.type} key=${col.output?.key ?? ''} label=${col.output?.label ?? ''}`),
      );
    } else if (n.status === 'success') {
      const info = c.getClient?.() ?? {};
      append(`SUCCESS code=${(info.authorization?.code ?? '').slice(0, 12)}… state=${info.authorization?.state ?? ''}`);
    } else {
      append(`node=${n.status} error=${JSON.stringify(n.error ?? c.getError?.() ?? null)}`);
    }
  }

  async function submit() {
    const collectors = (client.getCollectors?.() ?? []) as Any[];
    for (const col of collectors) {
      if (col.type === 'FidoAuthenticationCollector') {
        append('running WebAuthn ceremony via sdk fido().authenticate…');
        const { fido } = await import('@forgerock/davinci-client');
        const assertion = await fido().authenticate(col.output?.config?.publicKeyCredentialRequestOptions ?? col.output?.config);
        append(`fido result: ${assertion && 'code' in assertion ? 'ERROR ' + JSON.stringify(assertion) : 'assertion ok'}`);
        client.update(col)(assertion);
        continue;
      }
      const key = col.output?.key;
      if (key && values[key] !== undefined) client.update(col)(values[key]);
    }
    const n = await client.next();
    setNode(n);
    append(`next(): status=${n.status}`);
    dumpNode(n, client);
  }

  async function silentRedirect() {
    append('attempting silent signIn.oauth2 redirect…');
    await signIn.oauth2({ providerId: 'pingone', callbackURL: '/app', errorCallbackURL: '/ping-spike?error=1' });
  }

  const collectors = client && node?.status === 'continue' ? ((client.getCollectors?.() ?? []) as Any[]) : [];

  return (
    <div style={{ padding: 24, fontFamily: 'monospace', fontSize: 13, maxWidth: 640, margin: '0 auto' }}>
      <h1>ping davinci spike</h1>
      <button onClick={begin} disabled={!!client} style={{ border: '1px solid #333', padding: 8, marginRight: 8 }}>
        start flow
      </button>
      <button onClick={submit} disabled={!client || node?.status !== 'continue'} style={{ border: '1px solid #333', padding: 8, marginRight: 8 }}>
        submit
      </button>
      <button onClick={silentRedirect} disabled={node?.status !== 'success'} style={{ border: '1px solid #333', padding: 8 }}>
        try silent redirect
      </button>
      <div style={{ marginTop: 16 }}>
        {collectors.map((col: Any, i: number) => {
          const key = col.output?.key ?? `c${i}`;
          if (col.type === 'TextCollector' || col.type === 'PasswordCollector') {
            return (
              <div key={key} style={{ margin: '8px 0' }}>
                <label>
                  {col.output?.label ?? key}:{' '}
                  <input
                    type={col.type === 'PasswordCollector' ? 'password' : 'text'}
                    value={values[key] ?? ''}
                    onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                    style={{ border: '1px solid #999', padding: 4 }}
                  />
                </label>
              </div>
            );
          }
          return (
            <div key={key} style={{ margin: '8px 0', color: '#666' }}>
              [{col.type}] {col.output?.label ?? key}
            </div>
          );
        })}
      </div>
      <pre style={{ marginTop: 16, background: '#f4f4f4', padding: 12, whiteSpace: 'pre-wrap' }}>{log.join('\n')}</pre>
    </div>
  );
}
