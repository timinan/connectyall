'use client';

import { useEffect, useRef, useState } from 'react';
import { signIn } from '@/lib/auth/client';
import { useDavinciFlow } from '@/lib/ping/use-davinci-flow';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

// --- shared design-system class strings (lifted verbatim from sign-in page) ---
const INPUT_CLASS =
  'w-full h-16 px-5 rounded-3xl bg-surface border border-line text-[17px] text-neutral-950 placeholder:text-muted shadow-[0_6px_20px_rgba(124,92,255,0.10),0_2px_4px_rgba(0,0,0,0.04)]';
const PRIMARY_PILL_CLASS =
  'w-full h-16 px-5 rounded-full bg-brand text-white font-mono text-[13px] tracking-[0.18em] font-bold uppercase disabled:opacity-50 hover:bg-brand/90 transition shadow-[0_16px_36px_rgba(124,92,255,0.42),0_2px_6px_rgba(124,92,255,0.20)]';
const SECONDARY_PILL_CLASS =
  'w-full h-16 px-5 rounded-full bg-surface border border-line text-neutral-950 font-mono text-[13px] tracking-[0.18em] font-bold uppercase hover:border-brand transition shadow-[0_6px_20px_rgba(124,92,255,0.10),0_2px_4px_rgba(0,0,0,0.04)]';
const MONO_LABEL_CLASS =
  'font-mono text-[13px] tracking-[0.2em] font-semibold uppercase text-muted';
const MONO_LINK_CLASS =
  'font-mono text-[10px] tracking-[0.2em] uppercase text-muted hover:text-neutral-950 font-medium text-center transition';
const SUB_PARA_CLASS = 'text-[15px] text-neutral-600 leading-relaxed';
const ERROR_PARA_CLASS = 'text-red-600 text-sm text-center max-w-[320px]';

const isTitleText = (key: string | undefined) => Boolean(key && key.startsWith('title-text'));
const isErrorDisplay = (key: string | undefined, type: string | undefined) =>
  type === 'ERROR_DISPLAY' || Boolean(key && key.toLowerCase().includes('error'));

function Loading({ label }: { label: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3">
      <div className={`${MONO_LABEL_CLASS} text-center`}>
        <span className="text-brand mr-1">●</span> {label}
      </div>
    </div>
  );
}

export function PingJourney({ onBackToOtp }: { onBackToOtp: () => void }) {
  const state = useDavinciFlow();
  const { status, collectors, errorText, start, submit, chooseFlow } = state;
  const [values, setValues] = useState<Record<string, string>>({});
  const oauthFired = useRef(false);

  // Parent mounts this component to begin; kick off the flow once.
  const started = useRef(false);
  useEffect(() => {
    if (!started.current) {
      started.current = true;
      void start();
    }
  }, [start]);

  // Success => hand off to better-auth's PingOne provider exactly once.
  useEffect(() => {
    if (status === 'success' && !oauthFired.current) {
      oauthFired.current = true;
      void signIn.oauth2({
        providerId: 'pingone',
        callbackURL: '/app',
        errorCallbackURL: '/app/sign-in?error=ping',
      });
    }
  }, [status]);

  if (status === 'idle' || status === 'loading') {
    return <Loading label="SIGNING IN" />;
  }

  if (status === 'success') {
    return <Loading label="FINISHING SIGN-IN" />;
  }

  if (status === 'failed') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-5 w-full">
        {errorText && <p className={ERROR_PARA_CLASS}>{errorText}</p>}
        <div className="w-full max-w-[320px] flex flex-col gap-3">
          <button type="button" onClick={() => void start()} className={SECONDARY_PILL_CLASS}>
            Try again
          </button>
          <button type="button" onClick={onBackToOtp} className={MONO_LINK_CLASS}>
            <span className="text-brand mr-1">●</span> USE EMAIL CODE INSTEAD
          </button>
        </div>
      </div>
    );
  }

  // status === 'continue'
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit(values);
      }}
      className="flex-1 flex flex-col items-center justify-center gap-4 w-full"
    >
      <div className="w-full max-w-[320px] flex flex-col gap-3">
        {collectors.map((c: Any, i: number) => {
          const out = c?.output ?? {};
          const key: string | undefined = out.key;
          const label: string | undefined = out.label;
          const content: string | undefined = out.content;
          const reactKey = key ?? `${c?.type}-${i}`;

          if (c?.type === 'RichTextCollector' || c?.type === 'ReadOnlyCollector') {
            if (isErrorDisplay(key, c?.type)) {
              const text = content ?? label;
              return text ? (
                <p key={reactKey} className={ERROR_PARA_CLASS}>
                  {text}
                </p>
              ) : null;
            }
            if (isTitleText(key)) {
              return (
                <div key={reactKey} className={MONO_LABEL_CLASS}>
                  ● {label}
                </div>
              );
            }
            // help text
            return content ? (
              <p key={reactKey} className={SUB_PARA_CLASS}>
                {content}
              </p>
            ) : null;
          }

          if (c?.type === 'TextCollector' || c?.type === 'PasswordCollector') {
            const isPassword = c.type === 'PasswordCollector';
            return (
              <input
                key={reactKey}
                type={isPassword ? 'password' : 'text'}
                autoComplete={isPassword ? 'current-password' : 'username'}
                placeholder={label ?? ''}
                value={key ? (values[key] ?? '') : ''}
                onChange={(e) =>
                  key && setValues((v) => ({ ...v, [key]: e.target.value }))
                }
                className={INPUT_CLASS}
              />
            );
          }

          if (c?.type === 'SubmitCollector') {
            return (
              <button key={reactKey} type="submit" className={PRIMARY_PILL_CLASS}>
                {label || 'Continue'}
              </button>
            );
          }

          if (c?.type === 'FlowCollector') {
            // Passkey retired 2026-09-22 (Tim: more trouble than it's worth).
            // Also remove Passkey as a first factor in the PingOne DaVinci
            // experience; this filter just guarantees the link never renders.
            if (/passkey|fido|biometric/i.test(`${key ?? ''} ${label ?? ''}`)) {
              return null;
            }
            return (
              <button
                key={reactKey}
                type="button"
                onClick={() => void chooseFlow(c)}
                className={MONO_LINK_CLASS}
              >
                <span className="text-brand mr-1">●</span> {(label ?? '').toUpperCase()}
              </button>
            );
          }

          return null;
        })}
        {errorText && <p className={ERROR_PARA_CLASS}>{errorText}</p>}
      </div>
    </form>
  );
}
