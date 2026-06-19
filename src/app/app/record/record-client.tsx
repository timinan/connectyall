'use client';

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { LuMic } from 'react-icons/lu';
import { PageHeader } from '@/components/page-header';
import { BottomNav } from '@/components/bottom-nav';
import { getGreetingLabel } from '@/lib/greeting';
import { APP_CONTAINER_FLEX } from '../_layout-constants';

type State = 'idle' | 'recording' | 'uploading';

type RecError = { title: string; body: string };

// Map a raw failure (DOMException from getUserMedia/MediaRecorder, a fetch
// TypeError, or an API response body) to a sentence a non-technical person can
// act on. Whenever we add a new failure mode, add a case here — not a new alert.
function decodeMediaError(err: unknown): RecError {
  if (err instanceof DOMException) {
    switch (err.name) {
      case 'NotAllowedError':
      case 'PermissionDeniedError':
        return {
          title: 'Microphone access blocked',
          body: 'Your browser blocked the microphone. Open site settings, allow the mic, then try again.',
        };
      case 'NotFoundError':
      case 'DevicesNotFoundError':
        return {
          title: 'No microphone found',
          body: "We couldn't find a microphone on this device. Plug one in (or switch devices) and try again.",
        };
      case 'NotReadableError':
      case 'TrackStartError':
        return {
          title: 'Microphone busy',
          body: 'Another app is using the mic. Close it and try again.',
        };
      case 'SecurityError':
        return {
          title: 'Not a secure connection',
          body: 'The mic only works on HTTPS pages. Reload the page over https and try again.',
        };
      case 'AbortError':
        return {
          title: 'Recording cut off',
          body: 'The recording stopped before it finished. Try again.',
        };
    }
  }
  if (err instanceof TypeError) {
    // fetch network failures land here as TypeError("Failed to fetch")
    return {
      title: "Couldn't reach the server",
      body: 'Check your internet connection and try again.',
    };
  }
  return {
    title: 'Something went wrong',
    body: 'We hit an unexpected error starting the recording. Try again.',
  };
}

function decodeUploadError(status: number, raw: string): RecError {
  // The capture API returns either `{ "error": "..." }` JSON or plain text.
  let apiMessage = raw;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed?.error === 'string') apiMessage = parsed.error;
  } catch { /* not JSON, use raw */ }

  if (status === 401) {
    return {
      title: 'Signed out',
      body: 'Your session expired. Sign in again to keep recording.',
    };
  }
  if (status === 413 || /too large/i.test(apiMessage)) {
    return {
      title: 'Recording too long',
      body: 'That recording is over 20 MB. Try a shorter memo (under about a minute).',
    };
  }
  if (/unsupported mime/i.test(apiMessage)) {
    return {
      title: 'Audio format not supported',
      body: "Your browser saved the recording in a format we can't read yet. Try a different browser or device.",
    };
  }
  if (/audio file required/i.test(apiMessage)) {
    return {
      title: 'Recording came through empty',
      body: 'Your mic might not have captured any sound. Check the device and try again.',
    };
  }
  return {
    title: "Couldn't upload that recording",
    body: 'The server rejected the upload. Try again in a moment — if it keeps happening, restart the app.',
  };
}

function processingError(): RecError {
  return {
    title: "We couldn't make sense of that one",
    body: "Our processor had trouble pulling a name and details from the recording. Try again — speak a bit clearer, or move somewhere quieter.",
  };
}

function processingTimeoutError(): RecError {
  return {
    title: 'Taking longer than usual',
    body: "We're still working on it. Your recording might appear in Connections in a minute. Try again if you don't want to wait.",
  };
}

export function RecordClient({ displayName }: { displayName: string | null }) {
  const router = useRouter();
  const [state, setState] = useState<State>('idle');
  const [error, setError] = useState<RecError | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [levels, setLevels] = useState<number[]>(Array(15).fill(0));
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);

  // Stop everything still running and reset visual state — called both when
  // bailing on an error AND when the user taps Try again.
  function resetToIdle() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    rafRef.current = null;
    timerRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
    setLevels(Array(15).fill(0));
    setElapsed(0);
    setState('idle');
  }

  function failWith(err: RecError) {
    resetToIdle();
    setError(err);
  }

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  async function start() {
    setError(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      failWith(decodeMediaError(err));
      return;
    }
    streamRef.current = stream;

    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/mp4')
      ? 'audio/mp4'
      : '';
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    } catch (err) {
      failWith(decodeMediaError(err));
      return;
    }
    chunksRef.current = [];
    rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    rec.start();
    recorderRef.current = rec;
    setState('recording');
    setElapsed(0);

    timerRef.current = window.setInterval(() => setElapsed((e) => e + 1), 1000);

    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 64;
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    function tick() {
      analyser.getByteFrequencyData(data);
      const next = Array.from({ length: 15 }, (_, i) => {
        const idx = Math.floor((i / 15) * data.length);
        return data[idx] / 255;
      });
      setLevels(next);
      rafRef.current = requestAnimationFrame(tick);
    }
    tick();
  }

  async function stop() {
    const rec = recorderRef.current;
    if (!rec) return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (timerRef.current) clearInterval(timerRef.current);

    await new Promise<void>((resolve) => {
      rec.onstop = () => resolve();
      rec.stop();
    });
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setState('uploading');

    const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });
    const fd = new FormData();
    fd.append('audio', new File([blob], `memo.${(rec.mimeType || 'webm').split('/')[1].split(';')[0]}`, { type: blob.type }));
    let res: Response;
    try {
      res = await fetch('/api/capture', { method: 'POST', body: fd });
    } catch (err) {
      failWith(decodeMediaError(err));
      return;
    }
    if (!res.ok) {
      failWith(decodeUploadError(res.status, await res.text()));
      return;
    }
    const { interactionId } = await res.json();
    const startTime = Date.now();
    while (Date.now() - startTime < 60_000) {
      await new Promise((r) => setTimeout(r, 1500));
      let poll: Response;
      try {
        poll = await fetch(`/api/cards/${interactionId}`, { cache: 'no-store' });
      } catch {
        // transient network blip during polling — skip this tick and retry
        continue;
      }
      if (!poll.ok) continue;
      const payload = await poll.json();
      if (payload.status === 'failed') {
        failWith(processingError());
        return;
      }
      if (payload.status === 'ready') {
        // Invalidate the connections-list router cache now that a new contact
        // exists, so taps on the Connections tab from anywhere show it without
        // a manual refresh.
        router.refresh();
        router.push(`/app/connections/${payload.contact.id}`);
        return;
      }
    }
    failWith(processingTimeoutError());
  }

  const status: ReactNode =
    state === 'recording' ? <span className="text-red-600">● REC</span> :
    state === 'uploading' ? <span><span className="text-brand">●</span> THINKING</span> :
    <span><span className="text-brand">●</span> READY</span>;

  const greeting = getGreetingLabel(displayName);

  return (
    <div className={APP_CONTAINER_FLEX}>
      <PageHeader status={status} />
      <div className="flex-1 flex flex-col pt-3 gap-8">
        {state === 'idle' && (
          <Top
            label={greeting}
            headlineFirst="Who did you"
            headlineAccent="just meet?"
            sub="Tap to record. We'll pull a name, channels, and the gist — no typing."
          />
        )}
        {state === 'recording' && (
          <Top
            label={<>RECORDING · {fmtTime(elapsed)}</>}
            labelTone="red"
            headlineFirst="Listening"
            headlineAccent="closely."
            sub="When you're done, tap stop. We'll turn it into a connection."
          />
        )}
        {state === 'uploading' && (
          <Top
            label="PROCESSING"
            headlineFirst="Connecting"
            headlineAccent="y'all…"
            sub="Hang tight while we turn your voice into a connection."
          />
        )}
        <div className="flex-1 flex flex-col">
          {/* Mic / logo + glow — vertically centered in the whitespace ABOVE the waveform */}
          <div className="flex-1 flex items-center justify-center">
            <div className="relative flex items-center justify-center">
              <GlowRings tone={state === 'recording' ? 'red' : 'brand'} />
              {state === 'idle' && (
                <button
                  onClick={start}
                  className="relative z-10 w-[150px] h-[150px] rounded-full bg-brand text-white flex items-center justify-center shadow-[0_14px_36px_rgba(124,92,255,0.40)]"
                  aria-label="Tap to record"
                >
                  <LuMic size={50} />
                </button>
              )}
              {state === 'recording' && (
                <button
                  onClick={stop}
                  className="relative z-10 w-[150px] h-[150px] rounded-full bg-red-500 text-white flex items-center justify-center shadow-[0_14px_36px_rgba(220,38,38,0.40)]"
                  aria-label="Tap to stop"
                >
                  <div className="w-12 h-12 rounded bg-white" />
                </button>
              )}
              {state === 'uploading' && (
                <div
                  className="logo-spinner relative z-10 w-[150px] h-[150px] rounded-3xl bg-brand text-white flex items-center justify-center font-extrabold text-[78px] shadow-[0_14px_36px_rgba(124,92,255,0.40)]"
                  style={{ perspective: 600 }}
                  aria-hidden
                >
                  c
                </div>
              )}
            </div>
          </div>
          {/* Waveform + caption — in flex flow at the bottom of the section */}
          <div className="flex flex-col items-center gap-3 pb-2">
            <div className="flex items-end justify-center gap-1 h-14 px-4">
              {levels.map((_v, i) => {
                if (state === 'uploading') {
                  return (
                    <div
                      key={i}
                      className="w-1 bg-brand/55 rounded wave-bar"
                      style={{ animationDelay: `${i * 0.07}s` }}
                    />
                  );
                }
                return (
                  <div
                    key={i}
                    style={{ height: `${Math.max(8, _v * 56)}px` }}
                    className={`w-1 ${state === 'recording' ? 'bg-red-500/55' : 'bg-brand/55'} rounded`}
                  />
                );
              })}
            </div>
            <Caption state={state} />
          </div>
        </div>
      </div>
      <BottomNav />
      {error && (
        <ErrorModal
          error={error}
          onTryAgain={() => {
            setError(null);
            resetToIdle();
          }}
        />
      )}
    </div>
  );
}

function ErrorModal({ error, onTryAgain }: { error: RecError; onTryAgain: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="rec-error-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 sm:p-6 bg-black/40"
    >
      <div className="bg-white rounded-3xl shadow-xl max-w-sm w-full px-6 py-6 space-y-4">
        <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-brand font-bold">
          <span className="mr-1">●</span> RECORDING DIDN&apos;T LAND
        </div>
        <h2 id="rec-error-title" className="text-xl font-extrabold text-neutral-950 leading-tight">
          {error.title}
        </h2>
        <p className="text-[14px] text-neutral-700 leading-relaxed">
          {error.body}
        </p>
        <button
          type="button"
          onClick={onTryAgain}
          autoFocus
          className="w-full px-4 py-4 rounded-full bg-brand text-white font-mono text-[13px] tracking-[0.18em] font-bold uppercase shadow-[0_16px_36px_rgba(124,92,255,0.42),0_2px_6px_rgba(124,92,255,0.20)]"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

function Top({
  label,
  labelTone,
  headlineFirst,
  headlineAccent,
  sub,
}: {
  label: ReactNode;
  labelTone?: 'red';
  headlineFirst: string;
  headlineAccent: string;
  sub: string;
}) {
  return (
    <div>
      <div className="bg-surface border-l-4 border-brand rounded-r-xl px-4 py-3 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
        <h1 className="text-4xl font-black leading-[1.02] tracking-tight">
          {headlineFirst}
          <br />
          <span className="text-brand">{headlineAccent}</span>
        </h1>
      </div>
      <div className={`mt-4 pl-5 font-mono text-[13px] tracking-[0.2em] font-semibold uppercase ${labelTone === 'red' ? 'text-red-600' : 'text-muted'}`}>
        ● {label}
      </div>
      <p className="mt-2 pl-5 text-[15px] text-neutral-600 leading-relaxed max-w-[280px]">{sub}</p>
    </div>
  );
}

function GlowRings({ tone }: { tone: 'brand' | 'red' }) {
  const rgb = tone === 'red' ? '220, 38, 38' : '124, 92, 255';
  return (
    <div
      aria-hidden
      className="glow-breathe absolute w-[320px] h-[320px] rounded-full pointer-events-none"
      style={{
        background: `radial-gradient(circle, rgba(${rgb}, 0.18) 0%, rgba(${rgb}, 0.05) 60%, rgba(${rgb}, 0) 80%)`,
      }}
    >
      <div className="glow-breathe-d1 absolute inset-[36px] rounded-full" style={{ background: `rgba(${rgb}, 0.07)` }} />
      <div className="glow-breathe-d2 absolute inset-[70px] rounded-full" style={{ background: `rgba(${rgb}, 0.14)` }} />
    </div>
  );
}

function Caption({ state }: { state: State }) {
  if (state === 'recording') {
    return (
      <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-red-600 font-medium">
        <span className="mr-1">●</span> TAP TO STOP
      </div>
    );
  }
  if (state === 'uploading') {
    return (
      <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-muted font-medium">
        <span className="text-neutral-400 mr-1">●</span> PROCESSING…
      </div>
    );
  }
  return (
    <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-muted font-medium">
      <span className="text-brand mr-1">●</span> TAP TO RECORD <span className="text-neutral-400">·</span> UP TO 60S
    </div>
  );
}

function fmtTime(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
