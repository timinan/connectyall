'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { LANDING_CONTAINER_FLEX } from '../_layout-constants';

// External-link registration target for the PingOne sign-on flow. One email
// field, one password — the server enforces username = email at creation, so
// users never type an identifier twice and the policy can't drift.
export default function SignUpPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'done'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function register(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    if (password !== confirm) {
      setErrorMsg('passwords do not match');
      return;
    }
    setStatus('submitting');
    const res = await fetch('/api/ping-register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => null);
      setErrorMsg(json?.error ?? 'could not create the account, try again');
      setStatus('idle');
      return;
    }
    setStatus('done');
  }

  return (
    <div className={LANDING_CONTAINER_FLEX}>
      <PageHeader status={<><span className="text-brand">●</span> SIGN UP</>} />
      <div className="flex-1 flex flex-col pt-3 gap-8">
        <div className="min-h-[220px]">
          <div className="bg-surface border-l-4 border-brand rounded-r-xl px-4 py-3 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
            <h1 className="text-4xl font-black leading-[1.02] tracking-tight">
              {status === 'done' ? 'Account' : 'Create your'}
              <br />
              <span className="text-brand">{status === 'done' ? 'created.' : 'Ping account.'}</span>
            </h1>
          </div>
          <div className="mt-4 pl-5 font-mono text-[13px] tracking-[0.2em] font-semibold uppercase text-muted">
            ● {status === 'done' ? 'YOU ARE ALL SET' : 'EMAIL IS YOUR USERNAME'}
          </div>
          <p className="mt-2 pl-5 text-[15px] text-neutral-600 leading-relaxed max-w-[280px]">
            {status === 'done'
              ? 'Sign in with Ping using your email and new password. A one-time code will land in your inbox.'
              : 'One email, one password. Your email doubles as your username, so there is nothing else to remember.'}
          </p>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-5">
          {status !== 'done' ? (
            <form onSubmit={register} className="relative z-10 w-full max-w-[320px] flex flex-col gap-3">
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
              <input
                type="password"
                name="new-password"
                autoComplete="new-password"
                required
                minLength={8}
                placeholder="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-16 px-5 rounded-3xl bg-surface border border-line text-[17px] text-neutral-950 placeholder:text-muted shadow-[0_6px_20px_rgba(124,92,255,0.10),0_2px_4px_rgba(0,0,0,0.04)]"
              />
              <input
                type="password"
                name="confirm-password"
                autoComplete="new-password"
                required
                minLength={8}
                placeholder="confirm password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full h-16 px-5 rounded-3xl bg-surface border border-line text-[17px] text-neutral-950 placeholder:text-muted shadow-[0_6px_20px_rgba(124,92,255,0.10),0_2px_4px_rgba(0,0,0,0.04)]"
              />
              <button
                type="submit"
                disabled={status === 'submitting'}
                className="w-full h-16 px-5 rounded-full bg-brand text-white font-mono text-[13px] tracking-[0.18em] font-bold uppercase disabled:opacity-50 hover:bg-brand/90 transition shadow-[0_16px_36px_rgba(124,92,255,0.42),0_2px_6px_rgba(124,92,255,0.20)]"
              >
                {status === 'submitting' ? 'Creating…' : 'Create account'}
              </button>
            </form>
          ) : (
            <a
              href="/app/sign-in"
              className="relative z-10 w-full max-w-[320px] h-16 px-5 rounded-full bg-brand text-white font-mono text-[13px] tracking-[0.18em] font-bold uppercase hover:bg-brand/90 transition shadow-[0_16px_36px_rgba(124,92,255,0.42),0_2px_6px_rgba(124,92,255,0.20)] flex items-center justify-center"
            >
              Go to sign in
            </a>
          )}
          {errorMsg && <p className="text-red-600 text-sm text-center max-w-[320px]">{errorMsg}</p>}
        </div>
      </div>
    </div>
  );
}
