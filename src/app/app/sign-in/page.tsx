'use client';

import { useState } from 'react';
import { signIn } from '@/lib/auth/client';
import { Logo } from '@/components/logo';

export default function SignInPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('sending');
    setErrorMsg(null);
    try {
      await signIn.magicLink({ email, callbackURL: '/app' });
      setStatus('sent');
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'Unknown error');
    }
  }

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-950 px-6 py-10 flex flex-col">
      <header>
        <Logo />
      </header>
      <div className="flex-1 flex flex-col items-center justify-center">
        <div className="w-full max-w-sm space-y-6">
          <div className="space-y-3 text-center">
            <p className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-semibold">
              ✨ Magic-link sign-in
            </p>
            <h1 className="text-3xl font-bold">Voice notes that <span className="text-brand">connect</span> y&apos;all.</h1>
          </div>
          {status === 'sent' ? (
            <p className="text-center text-neutral-700">Magic link sent to <strong>{email}</strong>. Check your inbox.</p>
          ) : (
            <form onSubmit={onSubmit} className="space-y-3">
              <input
                type="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-lg bg-white border border-neutral-200 text-neutral-950 placeholder:text-neutral-500"
              />
              <button
                type="submit"
                disabled={status === 'sending'}
                className="w-full px-4 py-3 rounded-full bg-neutral-950 text-white font-semibold disabled:opacity-50 hover:bg-neutral-800 transition"
              >
                {status === 'sending' ? 'Sending…' : 'Send magic link'}
              </button>
              {errorMsg && <p className="text-red-600 text-sm">{errorMsg}</p>}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
