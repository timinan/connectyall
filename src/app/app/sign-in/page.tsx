'use client';

import { useState } from 'react';
import { signIn, authClient } from '@/lib/auth/client';
import { Logo } from '@/components/logo';

type Step = 'email' | 'code';
type Status = 'idle' | 'sending' | 'verifying';

export default function SignInPage() {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setStatus('sending');
    setErrorMsg(null);
    try {
      await authClient.emailOtp.sendVerificationOtp({ email, type: 'sign-in' });
      setStep('code');
      setStatus('idle');
    } catch (err) {
      setStatus('idle');
      setErrorMsg(err instanceof Error ? err.message : 'Could not send code');
    }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setStatus('verifying');
    setErrorMsg(null);
    try {
      await signIn.emailOtp({ email, otp });
      window.location.href = '/app';
    } catch (err) {
      setStatus('idle');
      setErrorMsg(err instanceof Error ? err.message : 'Invalid code');
    }
  }

  function resetToEmail() {
    setStep('email');
    setOtp('');
    setErrorMsg(null);
  }

  return (
    <div className="min-h-[calc(100dvh-3rem)] text-neutral-950 px-6 py-8 flex flex-col">
      <header>
        <Logo />
      </header>
      <div className="flex-1 flex flex-col items-center justify-center">
        <div className="w-full max-w-sm space-y-6">
          <div className="space-y-3 text-center">
            <p className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-semibold">
              ✨ One-time code sign-in
            </p>
            <h1 className="text-3xl font-bold">
              Voice notes that <span className="text-brand">connect</span> y&apos;all.
            </h1>
          </div>

          {step === 'email' && (
            <form onSubmit={sendCode} className="space-y-3">
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
                {status === 'sending' ? 'Sending…' : 'Send code'}
              </button>
            </form>
          )}

          {step === 'code' && (
            <form onSubmit={verifyCode} className="space-y-3">
              <p className="text-center text-neutral-700 text-sm">
                We sent a 6-digit code to <strong>{email}</strong>.
              </p>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="one-time-code"
                maxLength={6}
                required
                placeholder="123456"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                autoFocus
                className="w-full px-4 py-3 rounded-lg bg-white border border-neutral-200 text-neutral-950 placeholder:text-neutral-500 text-center text-2xl tracking-[0.4em] font-semibold"
              />
              <button
                type="submit"
                disabled={status === 'verifying' || otp.length < 6}
                className="w-full px-4 py-3 rounded-full bg-neutral-950 text-white font-semibold disabled:opacity-50 hover:bg-neutral-800 transition"
              >
                {status === 'verifying' ? 'Signing in…' : 'Sign in'}
              </button>
              <button
                type="button"
                onClick={resetToEmail}
                className="block mx-auto text-sm text-neutral-500 hover:text-neutral-950 transition pt-2"
              >
                Use a different email
              </button>
            </form>
          )}

          {errorMsg && <p className="text-red-600 text-sm text-center">{errorMsg}</p>}
        </div>
      </div>
    </div>
  );
}
