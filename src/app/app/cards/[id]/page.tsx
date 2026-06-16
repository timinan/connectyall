'use client';

import { use, useEffect, useState } from 'react';

type CardData = {
  status: 'processing' | 'ready' | 'failed';
  interaction?: { id: string; recap: string };
  contact?: {
    id: string;
    name: string;
    telegram: string | null;
    x: string | null;
    linkedin: string | null;
    email: string | null;
  };
  cardUrl?: string;          // same-origin proxy
  cardUrlExternal?: string;  // direct R2 URL — useful for download attribute
  caption?: string;
  shareUrl?: string;
};

export default function CardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<CardData>({ status: 'processing' });
  const [editingHandle, setEditingHandle] = useState(false);
  const [newHandle, setNewHandle] = useState('');
  const [shareFile, setShareFile] = useState<File | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async function poll() {
      while (!cancelled) {
        const res = await fetch(`/api/cards/${id}`, { cache: 'no-store' });
        if (!res.ok) {
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }
        const j = (await res.json()) as CardData;
        if (cancelled) return;
        setData(j);
        if (j.status !== 'processing') return;
        await new Promise((r) => setTimeout(r, 2000));
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  // Pre-fetch the card PNG once the card is ready, so navigator.share can be called
  // synchronously inside the click handler (iOS Safari requires the user gesture to
  // still be active when share() is called — any await beforehand kills the gesture).
  useEffect(() => {
    if (data.status !== 'ready' || !data.cardUrl) return;
    let cancelled = false;
    fetch(data.cardUrl)
      .then((r) => r.blob())
      .then((blob) => {
        if (cancelled) return;
        setShareFile(new File([blob], 'card.png', { type: 'image/png' }));
      })
      .catch(() => { /* fall back to text+url-only share */ });
    return () => { cancelled = true; };
  }, [data.status, data.cardUrl]);

  function share() {
    if (!data.caption || !data.shareUrl) return;
    const payload: ShareData = {
      title: `Card for ${data.contact?.name ?? ''}`,
      text: data.caption,
      url: data.shareUrl,
    };
    if (shareFile && navigator.canShare?.({ files: [shareFile] })) {
      payload.files = [shareFile];
    }
    if (!navigator.share) {
      alert('This browser does not support the Web Share API. Long-press the card image to forward it.');
      return;
    }
    navigator.share(payload).catch(() => { /* user cancelled */ });
  }

  async function saveHandle() {
    if (!data.contact) return;
    const res = await fetch(`/api/contacts/${data.contact.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telegram: newHandle.replace(/^@/, '') }),
    });
    if (res.ok) {
      const refreshed = await fetch(`/api/cards/${id}`, { cache: 'no-store' });
      setData(await refreshed.json());
      setEditingHandle(false);
      setNewHandle('');
    }
  }

  if (data.status === 'processing') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <p className="text-neutral-400">Cooking your card…</p>
      </div>
    );
  }

  if (data.status === 'failed') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <p className="text-red-400 mb-4">Something went wrong with this capture.</p>
        <a href="/app/record" className="px-4 py-2 rounded-lg bg-white text-neutral-950 font-semibold">Try again</a>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-md mx-auto space-y-4">
      {data.cardUrl && <img src={data.cardUrl} alt="card" className="w-full rounded-2xl" />}
      <div className="space-y-1">
        <p className="text-lg font-semibold">For {data.contact?.name}</p>
        <p className="italic text-neutral-300">&quot;{data.interaction?.recap}&quot;</p>
      </div>
      <div className="flex items-center gap-2 text-sm text-neutral-400">
        {data.contact?.telegram ? (
          <span>@{data.contact.telegram}</span>
        ) : (
          <span>No Telegram handle captured</span>
        )}
        <button onClick={() => setEditingHandle(true)} className="underline">✏️ Fix</button>
      </div>
      {editingHandle && (
        <div className="space-y-2">
          <input
            placeholder="@handle"
            value={newHandle}
            onChange={(e) => setNewHandle(e.target.value)}
            className="w-full px-4 py-3 rounded-lg bg-neutral-900 border border-neutral-800"
          />
          <button onClick={saveHandle} className="w-full px-4 py-3 rounded-lg bg-white text-neutral-950 font-semibold">Save</button>
        </div>
      )}
      <button onClick={share} className="w-full px-4 py-3 rounded-lg bg-white text-neutral-950 font-semibold">📤 Share (pick app)</button>

      {(data.contact?.telegram || data.contact?.email || data.contact?.x || data.contact?.linkedin) && (
        <div className="space-y-2 pt-2">
          <p className="text-xs uppercase tracking-wide text-neutral-500">Send directly to {data.contact?.name?.split(' ')[0] ?? 'them'}</p>
          {data.contact?.telegram && (
            <a
              href={`https://t.me/${data.contact.telegram}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full text-center px-4 py-3 rounded-lg bg-neutral-900 border border-neutral-800 text-white"
            >
              📱 Open Telegram with @{data.contact.telegram}
            </a>
          )}
          {data.contact?.email && (
            <a
              href={`mailto:${data.contact.email}?subject=${encodeURIComponent(`Card from ${data.interaction?.recap ? '' : 'me'}`)}&body=${encodeURIComponent(data.caption ?? '')}%0A%0A${encodeURIComponent(data.shareUrl ?? '')}`}
              className="block w-full text-center px-4 py-3 rounded-lg bg-neutral-900 border border-neutral-800 text-white"
            >
              ✉️ Email {data.contact.email}
            </a>
          )}
          {data.contact?.x && (
            <a
              href={`https://x.com/${data.contact.x}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full text-center px-4 py-3 rounded-lg bg-neutral-900 border border-neutral-800 text-white"
            >
              🐦 Open X profile of @{data.contact.x}
            </a>
          )}
          {data.contact?.linkedin && (
            <a
              href={`https://linkedin.com/in/${data.contact.linkedin.replace(/^in\//, '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full text-center px-4 py-3 rounded-lg bg-neutral-900 border border-neutral-800 text-white"
            >
              💼 Open LinkedIn of {data.contact.linkedin.replace(/^in\//, '')}
            </a>
          )}
          <p className="text-xs text-neutral-500 pt-1">After their chat opens, come back here and tap “📤 Share” → pick the same app to attach the card.</p>
        </div>
      )}

      <div className="pt-2 space-y-2">
        <button
          onClick={() => navigator.clipboard.writeText(data.caption ?? '')}
          className="w-full px-4 py-3 rounded-lg bg-neutral-900 border border-neutral-800 text-white"
        >
          📋 Copy caption
        </button>
        <a href={data.cardUrlExternal ?? data.cardUrl} download className="block w-full text-center px-4 py-3 rounded-lg bg-neutral-900 border border-neutral-800 text-white">💾 Save image</a>
      </div>
    </div>
  );
}
