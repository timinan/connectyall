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

export function RecordClient({ displayName }: { displayName: string | null }) {
  const router = useRouter();
  const [state, setState] = useState<State>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [levels, setLevels] = useState<number[]>(Array(15).fill(0));
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  async function start() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;

    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/mp4')
      ? 'audio/mp4'
      : '';
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
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
    const res = await fetch('/api/capture', { method: 'POST', body: fd });
    if (!res.ok) {
      alert(`Upload failed: ${await res.text()}`);
      setState('idle');
      return;
    }
    const { interactionId } = await res.json();
    const startTime = Date.now();
    while (Date.now() - startTime < 60_000) {
      await new Promise((r) => setTimeout(r, 1500));
      const poll = await fetch(`/api/cards/${interactionId}`, { cache: 'no-store' });
      if (!poll.ok) continue;
      const payload = await poll.json();
      if (payload.status === 'failed') {
        alert('Sorry — that recording could not be processed.');
        setState('idle');
        return;
      }
      if (payload.status === 'ready') {
        router.push(`/app/connections/${payload.contact.id}`);
        return;
      }
    }
    router.push('/app/connections');
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
        <div className="relative flex-1 flex flex-col items-center justify-center">
          {/* Mic / logo + glow — centered in the available whitespace */}
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
          {/* Waveform + caption — out of flow so the mic stays at the true center */}
          <div className="absolute left-0 right-0 bottom-0 flex flex-col items-center gap-3">
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
