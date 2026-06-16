'use client';

import { use, useEffect, useState } from 'react';

type CardData = {
  status: 'processing' | 'ready' | 'failed';
  interaction?: { id: string; recap: string };
  contact?: { id: string; name: string; telegram: string | null };
  cardUrl?: string;
  caption?: string;
  shareUrl?: string;
};

export default function CardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<CardData>({ status: 'processing' });
  const [editingHandle, setEditingHandle] = useState(false);
  const [newHandle, setNewHandle] = useState('');

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

  async function share() {
    if (!data.cardUrl || !data.caption || !data.shareUrl) return;
    try {
      const res = await fetch(data.cardUrl);
      const blob = await res.blob();
      const file = new File([blob], 'card.png', { type: 'image/png' });
      const payload: ShareData = { title: `Card for ${data.contact?.name ?? ''}`, text: data.caption, url: data.shareUrl };
      if (navigator.canShare?.({ files: [file] })) payload.files = [file];
      await navigator.share(payload);
    } catch {
      // user cancelled or unsupported — fall through
    }
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
      <button onClick={share} className="w-full px-4 py-3 rounded-lg bg-white text-neutral-950 font-semibold">📤 Share</button>
      <button
        onClick={() => navigator.clipboard.writeText(data.caption ?? '')}
        className="w-full px-4 py-3 rounded-lg bg-neutral-900 border border-neutral-800 text-white"
      >
        📋 Copy caption
      </button>
      <a href={data.cardUrl} download className="block w-full text-center px-4 py-3 rounded-lg bg-neutral-900 border border-neutral-800 text-white">💾 Save image</a>
    </div>
  );
}
