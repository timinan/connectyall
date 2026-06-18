'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Greeting } from './greeting';
import { NavToggle } from '@/components/nav-toggle';

type State = 'idle' | 'recording' | 'uploading';

export default function RecordPage() {
  const router = useRouter();
  const [state, setState] = useState<State>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [levels, setLevels] = useState<number[]>(Array(20).fill(0));
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
      const next = Array.from({ length: 20 }, (_, i) => {
        const idx = Math.floor((i / 20) * data.length);
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
    // Poll until processing finishes, then go to the contact page.
    const start = Date.now();
    while (Date.now() - start < 60_000) {
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
    // Timeout fallback — drop them on the connections list so they can find it once it's ready.
    router.push('/app/connections');
  }

  return (
    <div className="flex-1 flex flex-col p-6 gap-4 max-w-md w-full mx-auto">
      {state === 'idle' && (
        <div className="flex justify-end">
          <NavToggle />
        </div>
      )}
      {state === 'idle' && (
        <div className="rounded-3xl bg-gradient-to-br from-purple-100 via-purple-50 to-amber-50 border border-purple-200/60 shadow-sm px-5 py-5">
          <Greeting />
        </div>
      )}
      <div className="rounded-3xl bg-gradient-to-br from-purple-100 via-purple-50 to-amber-50 border border-purple-200/60 shadow-sm px-5 py-6 flex-1 flex flex-col items-center justify-center gap-5">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold">{state === 'recording' ? 'Recording…' : "Who'd you meet?"}</h1>
          <p className="text-neutral-600 text-sm">{state === 'recording' ? `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}` : 'Tell me about who you just met.'}</p>
        </div>
        <div className="flex items-end justify-center gap-1 h-16">
          {levels.map((v, i) => (
            <div key={i} style={{ height: `${Math.max(8, v * 64)}px` }} className="w-1 bg-neutral-700/70 rounded" />
          ))}
        </div>
        <button
          onClick={() => (state === 'idle' ? start() : state === 'recording' ? stop() : undefined)}
          disabled={state === 'uploading'}
          className={`w-24 h-24 rounded-full flex items-center justify-center font-semibold transition shadow-lg ${
            state === 'recording' ? 'bg-red-500 text-white' : 'bg-neutral-950 text-white'
          } disabled:opacity-50`}
        >
          {state === 'idle' ? '●' : state === 'recording' ? '■' : '…'}
        </button>
        {state === 'uploading' && <p className="text-center text-neutral-600 text-sm">Connecting y&apos;all…</p>}
      </div>
    </div>
  );
}
