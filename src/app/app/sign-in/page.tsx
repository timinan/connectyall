'use client';

import { useEffect, useState } from 'react';
import { signIn, authClient } from '@/lib/auth/client';
import { PageHeader } from '@/components/page-header';
import { LANDING_CONTAINER_FLEX } from '../_layout-constants';
import { pingEnabled } from '@/lib/ping/config';
import { pingOidcClient, pingDisplayName, type PingUserInfo } from '@/lib/ping/oidc';

type Step = 'email' | 'code' | 'ping-user';
type Status = 'idle' | 'sending' | 'verifying' | 'ping-redirect' | 'ping-exchange';

export default function SignInPage() {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pingUser, setPingUser] = useState<PingUserInfo | null>(null);

  const showPing = pingEnabled();

  // The sign-in page doubles as the OAuth redirect URI. On return from the
  // PingOne hosted experience the URL carries ?code&state — exchange them for
  // tokens, fetch the user via the userinfo endpoint, and show the result.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    if (params.get('error')) {
      // Provider-denied callback (user cancelled, policy failure, ...).
      setErrorMsg("Ping sign-in didn't complete. Try again, or use the email code instead.");
      window.history.replaceState(null, '', '/app/sign-in');
      return;
    }
    if (!code || !state) return;
    window.history.replaceState(null, '', '/app/sign-in');
    setStatus('ping-exchange');
    (async () => {
      try {
        const client = await pingOidcClient();
        const tokens = await client.token.exchange(code, state);
        if (tokens && typeof tokens === 'object' && 'error' in tokens) {
          throw new Error(String((tokens as { error: unknown }).error));
        }
        const info = await client.user.info();
        if (info && typeof info === 'object' && 'error' in info) {
          throw new Error(String((info as { error: unknown }).error));
        }
        setPingUser(info as PingUserInfo);
        setStep('ping-user');
      } catch {
        setErrorMsg("Ping sign-in didn't complete. Try again, or use the email code instead.");
      } finally {
        setStatus('idle');
      }
    })();
  }, []);

  async function signInWithPing() {
    setErrorMsg(null);
    setStatus('ping-redirect');
    try {
      const client = await pingOidcClient();
      const authorizeUrl = await client.authorize.url();
      if (typeof authorizeUrl !== 'string') {
        throw new Error('authorize.url failed');
      }
      window.location.assign(authorizeUrl);
    } catch {
      setStatus('idle');
      setErrorMsg('Could not reach Ping. Try again, or use the email code instead.');
    }
  }

  async function continueToApp() {
    setErrorMsg(null);
    // Bridge the PingOne session into an app session: better-auth's oauth2
    // flow redirects to PingOne, which SSO's silently off the session the SDK
    // flow just established, then the callback mints the Better Auth session.
    const { error } = await signIn.oauth2({
      providerId: 'pingone',
      callbackURL: '/app',
      errorCallbackURL: '/app/sign-in?error=ping',
    });
    if (error) setErrorMsg(error.message ?? 'Could not start an app session');
  }

  async function signOutOfPing() {
    setErrorMsg(null);
    try {
      const client = await pingOidcClient();
      // Two distinct things happen here, deliberately:
      // 1. revoke(): invalidates the access/refresh tokens server-side AND
      //    deletes the SDK's local copies.
      // 2. logout(): ends the user's session at the authorization server, so
      //    the next authorize call shows the login page again instead of SSO.
      await client.token.revoke();
      await client.user.logout();
    } finally {
      setPingUser(null);
      setStep('email');
    }
  }

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setStatus('sending');
    setErrorMsg(null);
    const { error } = await authClient.emailOtp.sendVerificationOtp({ email, type: 'sign-in' });
    setStatus('idle');
    if (error) {
      setErrorMsg(error.message ?? 'Could not send code');
      return;
    }
    setStep('code');
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setStatus('verifying');
    setErrorMsg(null);
    const { error } = await signIn.emailOtp({ email, otp });
    if (error) {
      setStatus('idle');
      setErrorMsg(error.message ?? 'Invalid or expired code');
      return;
    }
    window.location.href = '/app';
  }

  function resetToEmail() {
    setStep('email');
    setOtp('');
    setErrorMsg(null);
  }

  const status_label =
    step === 'email' ? <><span className="text-brand">●</span> SIGN IN</> :
    step === 'ping-user' ? <><span className="text-brand">●</span> PING IDENTITY</> :
    <><span className="text-brand">●</span> ENTER CODE</>;

  return (
    <div className={LANDING_CONTAINER_FLEX}>
      <PageHeader status={status_label} />
      <div className="flex-1 flex flex-col pt-3 gap-8">
        {step === 'email' && (
          <Top
            label="NO PASSWORD NEEDED"
            headlineFirst="Welcome."
            headlineAccent="Sign in to start."
            sub="Drop your email and we'll send a 6-digit code. No password, no magic link."
          />
        )}
        {step === 'ping-user' && (
          <Top
            label="PING IDENTITY"
            headlineFirst="Signed in"
            headlineAccent="with Ping."
            sub="Verified by PingOne over OpenID Connect. This is you, straight from the userinfo endpoint."
          />
        )}
        {step === 'code' && (
          <Top
            label="CHECK YOUR INBOX"
            headlineFirst="Drop the"
            headlineAccent="6-digit code."
            sub={<>We sent it to <strong className="text-neutral-950">{email}</strong>. It expires in 10 minutes.</>}
          />
        )}
        <div className="flex-1 flex flex-col items-center justify-center gap-5">
          <div className="relative flex items-center justify-center w-full">
            <GlowRings />
            {step === 'email' && (
              <form
                onSubmit={sendCode}
                className="relative z-10 w-full max-w-[320px] flex flex-col gap-3"
              >
                <input
                  type="email"
                  name="email"
                  autoComplete="email"
                  required
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full h-16 px-5 rounded-3xl bg-surface border border-line text-[17px] text-neutral-950 placeholder:text-muted shadow-[0_6px_20px_rgba(124,92,255,0.10),0_2px_4px_rgba(0,0,0,0.04)]"
                />
                <button
                  type="submit"
                  disabled={status === 'sending'}
                  className="w-full h-16 px-5 rounded-full bg-brand text-white font-mono text-[13px] tracking-[0.18em] font-bold uppercase disabled:opacity-50 hover:bg-brand/90 transition shadow-[0_16px_36px_rgba(124,92,255,0.42),0_2px_6px_rgba(124,92,255,0.20)]"
                >
                  {status === 'sending' ? 'Sending…' : 'Send code'}
                </button>
              </form>
            )}
            {step === 'ping-user' && pingUser && (
              <div className="relative z-10 w-full max-w-[320px] flex flex-col gap-3">
                <div className="bg-surface border border-line rounded-3xl px-5 py-5 shadow-[0_6px_20px_rgba(124,92,255,0.10),0_2px_4px_rgba(0,0,0,0.04)] flex flex-col gap-3">
                  <UserRow label="NAME" value={pingDisplayName(pingUser)} />
                  <UserRow label="USERNAME" value={pingUser.preferred_username} />
                  <UserRow label="EMAIL" value={pingUser.email} />
                </div>
                <button
                  type="button"
                  onClick={continueToApp}
                  className="w-full h-16 px-5 rounded-full bg-brand text-white font-mono text-[13px] tracking-[0.18em] font-bold uppercase hover:bg-brand/90 transition shadow-[0_16px_36px_rgba(124,92,255,0.42),0_2px_6px_rgba(124,92,255,0.20)]"
                >
                  Continue to app
                </button>
                <button
                  type="button"
                  onClick={signOutOfPing}
                  className="w-full h-16 px-5 rounded-full bg-surface border border-line text-neutral-950 font-mono text-[13px] tracking-[0.18em] font-bold uppercase hover:border-brand transition shadow-[0_6px_20px_rgba(124,92,255,0.10),0_2px_4px_rgba(0,0,0,0.04)]"
                >
                  Sign out
                </button>
              </div>
            )}
            {step === 'code' && (
              <form
                onSubmit={verifyCode}
                className="relative z-10 w-full max-w-[320px] flex flex-col gap-3"
              >
                <input
                  type="text"
                  name="otp"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="one-time-code"
                  enterKeyHint="go"
                  maxLength={6}
                  required
                  placeholder="123456"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  autoFocus
                  className="w-full h-16 px-5 text-center text-[24px] font-extrabold tracking-[0.35em] rounded-3xl bg-surface border border-line text-neutral-950 placeholder:text-muted shadow-[0_6px_20px_rgba(124,92,255,0.10),0_2px_4px_rgba(0,0,0,0.04)]"
                />
                <button
                  type="submit"
                  disabled={status === 'verifying' || otp.length < 6}
                  className="w-full h-16 px-5 rounded-full bg-brand text-white font-mono text-[13px] tracking-[0.18em] font-bold uppercase disabled:opacity-50 hover:bg-brand/90 transition shadow-[0_16px_36px_rgba(124,92,255,0.42),0_2px_6px_rgba(124,92,255,0.20)]"
                >
                  {status === 'verifying' ? 'Signing in…' : 'Sign in'}
                </button>
              </form>
            )}
          </div>
          {step === 'email' && showPing && (
            <div className="relative z-10 w-full max-w-[320px] flex flex-col gap-3">
              <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-muted font-medium text-center">
                <span className="text-brand mr-1">●</span> OR
              </div>
              <button
                type="button"
                onClick={signInWithPing}
                disabled={status === 'ping-redirect' || status === 'ping-exchange'}
                className="w-full h-16 px-5 rounded-full bg-surface border border-line text-neutral-950 font-mono text-[13px] tracking-[0.18em] font-bold uppercase disabled:opacity-50 hover:border-brand transition shadow-[0_6px_20px_rgba(124,92,255,0.10),0_2px_4px_rgba(0,0,0,0.04)]"
              >
                {status === 'ping-redirect' ? 'Heading to Ping…' :
                 status === 'ping-exchange' ? 'Verifying…' :
                 'Sign in with Ping'}
              </button>
              <a
                href="/app/sign-up"
                className="font-mono text-[10px] tracking-[0.2em] uppercase text-muted hover:text-neutral-950 font-medium text-center transition"
              >
                <span className="text-brand mr-1">●</span> NEW HERE? CREATE A PING ACCOUNT
              </a>
            </div>
          )}
          {step === 'email' && (
            <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-muted font-medium text-center">
              <span className="text-brand mr-1">●</span> CODE ARRIVES IN 2 SECONDS
            </div>
          )}
          {step === 'code' && (
            <button
              type="button"
              onClick={resetToEmail}
              className="font-mono text-[10px] tracking-[0.2em] uppercase text-muted hover:text-neutral-950 font-medium text-center transition"
            >
              <span className="text-brand mr-1">●</span> USE A DIFFERENT EMAIL
            </button>
          )}
          {errorMsg && <p className="text-red-600 text-sm text-center max-w-[320px]">{errorMsg}</p>}
        </div>
      </div>
    </div>
  );
}

function UserRow({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-muted font-medium">
        <span className="text-brand mr-1">●</span> {label}
      </div>
      <div className="text-[17px] font-bold text-neutral-950 break-all">{value ?? '—'}</div>
    </div>
  );
}

function Top({
  label,
  headlineFirst,
  headlineAccent,
  sub,
}: {
  label: React.ReactNode;
  headlineFirst: string;
  headlineAccent: string;
  sub: React.ReactNode;
}) {
  return (
    // Fixed min-height so the form below lands at the same y-position
    // regardless of how many lines the sub paragraph wraps to.
    <div className="min-h-[220px]">
      <div className="bg-surface border-l-4 border-brand rounded-r-xl px-4 py-3 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
        <h1 className="text-4xl font-black leading-[1.02] tracking-tight">
          {headlineFirst}
          <br />
          <span className="text-brand">{headlineAccent}</span>
        </h1>
      </div>
      <div className="mt-4 pl-5 font-mono text-[13px] tracking-[0.2em] font-semibold uppercase text-muted">
        ● {label}
      </div>
      <p className="mt-2 pl-5 text-[15px] text-neutral-600 leading-relaxed max-w-[280px]">{sub}</p>
    </div>
  );
}

function GlowRings() {
  return (
    <div
      aria-hidden
      className="glow-breathe absolute w-[480px] h-[480px] rounded-full pointer-events-none"
      style={{
        background: 'radial-gradient(circle, rgba(124, 92, 255, 0.20) 0%, rgba(124, 92, 255, 0.06) 60%, rgba(124, 92, 255, 0) 80%)',
      }}
    >
      <div className="glow-breathe-d1 absolute inset-[60px] rounded-full" style={{ background: 'rgba(124, 92, 255, 0.07)' }} />
      <div className="glow-breathe-d2 absolute inset-[120px] rounded-full" style={{ background: 'rgba(124, 92, 255, 0.14)' }} />
    </div>
  );
}
