'use client';

import { useState } from 'react';
import { signIn } from '@/lib/auth/client';

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
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="max-w-sm w-full space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-4xl font-bold">Connectyall</h1>
          <p className="text-neutral-400 text-sm">Voice notes that connect y&apos;all.</p>
        </div>
        {status === 'sent' ? (
          <p className="text-center text-neutral-300">Magic link sent to <strong>{email}</strong>. Check your inbox.</p>
        ) : (
          <form onSubmit={onSubmit} className="space-y-3">
            <input
              type="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-lg bg-neutral-900 border border-neutral-800 text-white"
            />
            <button
              type="submit"
              disabled={status === 'sending'}
              className="w-full px-4 py-3 rounded-lg bg-white text-neutral-950 font-semibold disabled:opacity-50"
            >
              {status === 'sending' ? 'Sending…' : 'Send magic link'}
            </button>
            {errorMsg && <p className="text-red-400 text-sm">{errorMsg}</p>}
          </form>
        )}
      </div>
    </div>
  );
}
