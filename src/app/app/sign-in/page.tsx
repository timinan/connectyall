'use client';

import { useState } from 'react';
import { signIn, authClient } from '@/lib/auth/client';
import { PageHeader } from '@/components/page-header';

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
    <><span className="text-brand">●</span> ENTER CODE</>;

  return (
    <div className="px-6 py-6 pb-8 max-w-xl mx-auto w-full min-h-[100dvh] flex flex-col">
      <PageHeader status={status_label} />
      <div className="flex-1 flex flex-col pt-3 gap-8">
        {step === 'email' && (
          <Top
            label="VOICE TO CONNECTION"
            headlineFirst="Welcome."
            headlineAccent="Sign in to start."
            sub="Drop your email and we'll send a 6-digit code. No password, no magic link."
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
                  required
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-[22px] py-[22px] rounded-3xl bg-surface border border-line text-[17px] text-neutral-950 placeholder:text-muted shadow-[0_6px_20px_rgba(124,92,255,0.10),0_2px_4px_rgba(0,0,0,0.04)]"
                />
                <button
                  type="submit"
                  disabled={status === 'sending'}
                  className="w-full px-5 py-5 rounded-full bg-brand text-white font-bold text-[16px] disabled:opacity-50 hover:bg-brand/90 transition shadow-[0_12px_32px_rgba(124,92,255,0.35)]"
                >
                  {status === 'sending' ? 'Sending…' : 'Send code'}
                </button>
              </form>
            )}
            {step === 'code' && (
              <form
                onSubmit={verifyCode}
                className="relative z-10 w-full max-w-[320px] flex flex-col gap-3"
              >
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
                  className="w-full px-6 py-6 text-center text-[34px] font-extrabold tracking-[0.35em] rounded-3xl bg-surface border border-line text-neutral-950 placeholder:text-muted shadow-[0_6px_20px_rgba(124,92,255,0.10),0_2px_4px_rgba(0,0,0,0.04)]"
                />
                <button
                  type="submit"
                  disabled={status === 'verifying' || otp.length < 6}
                  className="w-full px-5 py-5 rounded-full bg-brand text-white font-bold text-[16px] disabled:opacity-50 hover:bg-brand/90 transition shadow-[0_12px_32px_rgba(124,92,255,0.35)]"
                >
                  {status === 'verifying' ? 'Signing in…' : 'Sign in'}
                </button>
              </form>
            )}
          </div>
          {step === 'email' && (
            <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-muted font-medium">
              <span className="text-brand mr-1">●</span> CODE ARRIVES IN 2 SECONDS
            </div>
          )}
          {step === 'code' && (
            <button
              type="button"
              onClick={resetToEmail}
              className="font-mono text-[10px] tracking-[0.2em] uppercase text-muted hover:text-neutral-950 font-medium transition"
            >
              USE A DIFFERENT EMAIL
            </button>
          )}
          {errorMsg && <p className="text-red-600 text-sm text-center max-w-[320px]">{errorMsg}</p>}
        </div>
      </div>
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
    <div>
      <div className="font-mono text-[13px] tracking-[0.2em] font-semibold uppercase text-muted">
        {label}
      </div>
      <h1 className="mt-3 text-5xl font-black leading-[1.02] tracking-tight">
        {headlineFirst}
        <br />
        <span className="text-brand">{headlineAccent}</span>
      </h1>
      <p className="mt-4 text-[15px] text-neutral-600 leading-relaxed max-w-[280px]">{sub}</p>
    </div>
  );
}

function GlowRings() {
  return (
    <div
      aria-hidden
      className="absolute w-[320px] h-[320px] rounded-full"
      style={{
        background: 'radial-gradient(circle, rgba(124, 92, 255, 0.14) 0%, rgba(124, 92, 255, 0.04) 60%, rgba(124, 92, 255, 0) 80%)',
      }}
    >
      <div className="absolute inset-[30px] rounded-full" style={{ background: 'rgba(124, 92, 255, 0.06)' }} />
      <div className="absolute inset-[60px] rounded-full" style={{ background: 'rgba(124, 92, 255, 0.12)' }} />
    </div>
  );
}
