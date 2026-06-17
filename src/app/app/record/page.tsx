'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Greeting } from './greeting';

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
    router.push(`/app/cards/${interactionId}`);
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="w-full max-w-sm space-y-8">
        {state === 'idle' && <Greeting />}
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold">{state === 'recording' ? 'Recording…' : 'Tap to start'}</h1>
          <p className="text-neutral-400 text-sm">{state === 'recording' ? `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}` : 'Tell me about who you just met.'}</p>
        </div>
        <div className="flex items-end justify-center gap-1 h-20">
          {levels.map((v, i) => (
            <div key={i} style={{ height: `${Math.max(8, v * 80)}px` }} className="w-1 bg-white/70 rounded" />
          ))}
        </div>
        <div className="flex justify-center">
          <button
            onClick={() => (state === 'idle' ? start() : state === 'recording' ? stop() : undefined)}
            disabled={state === 'uploading'}
            className={`w-24 h-24 rounded-full flex items-center justify-center font-semibold transition ${
              state === 'recording' ? 'bg-red-500 text-white' : 'bg-white text-neutral-950'
            } disabled:opacity-50`}
          >
            {state === 'idle' ? '●' : state === 'recording' ? '■' : '…'}
          </button>
        </div>
        {state === 'uploading' && <p className="text-center text-neutral-400 text-sm">Cooking your card…</p>}
      </div>
    </div>
  );
}
