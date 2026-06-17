'use client';

import { use, useEffect, useRef, useState } from 'react';
import {
  linkedinUrl, linkedinHandle, xUrl, xHandle, telegramUrl, telegramHandle,
} from '@/lib/social-urls';

const socialUrl = {
  linkedin: linkedinUrl,
  linkedinHandle,
  x: xUrl,
  xHandle,
  telegram: telegramUrl,
  telegramHandle,
};

type PreferredChannel = 'telegram' | 'email' | 'phone' | 'x' | 'linkedin' | 'website';

type CardData = {
  status: 'processing' | 'ready' | 'failed';
  interaction?: { id: string; recap: string };
  contact?: {
    id: string;
    name: string;
    telegram: string | null;
    x: string | null;
    linkedin: string | null;
    website: string | null;
    emails: string[];
    phones: string[];
    preferredChannel: PreferredChannel | null;
  };
  cardUrl?: string;
  cardUrlExternal?: string;
  caption?: string;
  shareUrl?: string;
};

// ---------------------------------------------------------------------------
// Inline-editable field row
// ---------------------------------------------------------------------------
type EditableFieldProps = {
  icon: string;
  value: string;
  placeholder?: string;
  isPreferred: boolean;
  onSave: (v: string) => Promise<void>;
  onTogglePreferred: () => Promise<void>;
  onRemove?: () => Promise<void>;
};

function EditableField({ icon, value, placeholder, isPreferred, onSave, onTogglePreferred, onRemove }: EditableFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  async function commit() {
    setEditing(false);
    if (draft !== value) await onSave(draft);
  }

  return (
    <div className="flex items-center gap-2 py-1">
      <span className="w-6 text-center flex-shrink-0">{icon}</span>
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(value); setEditing(false); } }}
          className="flex-1 px-2 py-1 rounded bg-neutral-900 border border-neutral-700 text-white text-sm min-w-0"
        />
      ) : (
        <button
          className="flex-1 text-left text-sm text-neutral-200 truncate hover:text-white"
          onClick={() => { setDraft(value); setEditing(true); }}
        >
          {value || <span className="text-neutral-500">{placeholder}</span>}
        </button>
      )}
      <button
        className="flex-shrink-0 text-lg leading-none"
        title={isPreferred ? 'Clear preferred channel' : 'Set as preferred channel'}
        onClick={onTogglePreferred}
      >
        {isPreferred ? '★' : '☆'}
      </button>
      {onRemove && (
        <button className="flex-shrink-0 text-neutral-500 text-xs hover:text-red-400" onClick={onRemove} title="Remove">✕</button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add-field row
// ---------------------------------------------------------------------------
const ALL_CHANNELS: PreferredChannel[] = ['email', 'phone', 'telegram', 'x', 'linkedin', 'website'];
const CHANNEL_LABELS: Record<PreferredChannel, string> = {
  email: 'Email',
  phone: 'Phone',
  telegram: 'Telegram',
  x: 'X',
  linkedin: 'LinkedIn',
  website: 'Website',
};

type AddFieldProps = {
  existing: PreferredChannel[];
  onAdd: (channel: PreferredChannel, value: string) => Promise<void>;
};

function AddField({ existing, onAdd }: AddFieldProps) {
  const available = ALL_CHANNELS.filter(c => {
    if (c === 'email' || c === 'phone') return true; // can have many
    return !existing.includes(c);
  });
  const [selectedChannel, setSelectedChannel] = useState<PreferredChannel | ''>('');
  const [value, setValue] = useState('');

  if (available.length === 0) return null;

  async function handleAdd() {
    if (!selectedChannel || !value.trim()) return;
    await onAdd(selectedChannel, value.trim());
    setSelectedChannel('');
    setValue('');
  }

  return (
    <div className="flex items-center gap-2 pt-2 border-t border-neutral-800">
      <span className="w-6 text-center flex-shrink-0 text-neutral-500">+</span>
      <select
        value={selectedChannel}
        onChange={(e) => setSelectedChannel(e.target.value as PreferredChannel | '')}
        className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm text-neutral-300 flex-shrink-0"
      >
        <option value="">Add field…</option>
        {available.map(c => <option key={c} value={c}>{CHANNEL_LABELS[c]}</option>)}
      </select>
      {selectedChannel && (
        <>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
            placeholder={selectedChannel === 'telegram' ? 'handle (no @)' : selectedChannel === 'email' ? 'email@example.com' : selectedChannel === 'phone' ? '+1 555 1234' : ''}
            className="flex-1 px-2 py-1 rounded bg-neutral-900 border border-neutral-700 text-white text-sm min-w-0"
            autoFocus
          />
          <button onClick={handleAdd} className="flex-shrink-0 text-sm px-3 py-1 rounded bg-white text-neutral-950 font-semibold">Add</button>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function CardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<CardData>({ status: 'processing' });
  const [shareFile, setShareFile] = useState<File | null>(null);

  async function refresh() {
    const res = await fetch(`/api/cards/${id}`, { cache: 'no-store' });
    if (res.ok) setData(await res.json());
  }

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

  async function putField(body: object) {
    if (!data.contact) return;
    await fetch(`/api/contacts/${data.contact.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    await refresh();
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

  const contact = data.contact;

  // Determine which single-value channels are already present (for AddField)
  const existingSingleChannels: PreferredChannel[] = [];
  if (contact?.telegram) existingSingleChannels.push('telegram');
  if (contact?.x) existingSingleChannels.push('x');
  if (contact?.linkedin) existingSingleChannels.push('linkedin');
  if (contact?.website) existingSingleChannels.push('website');

  return (
    <div className="p-6 max-w-md mx-auto space-y-4">
      {data.cardUrl && (
        <div className="flex justify-center pt-2">
          <img src={data.cardUrl} alt="card" className="w-40 h-40 rounded-full object-cover bg-white" />
        </div>
      )}
      <div className="space-y-1">
        <p className="text-lg font-semibold">For {contact?.name}</p>
        <p className="italic text-neutral-300">&quot;{data.interaction?.recap}&quot;</p>
      </div>

      {/* Inline-editable contact fields */}
      {contact && (
        <div className="rounded-lg bg-neutral-950 border border-neutral-800 px-4 py-3 space-y-1">
          {/* Emails */}
          {contact.emails.map((email, i) => (
            <EditableField
              key={`email-${i}`}
              icon="✉️"
              value={email}
              placeholder="email@example.com"
              isPreferred={contact.preferredChannel === 'email'}
              onSave={(v) => putField({ kind: 'email', index: i, value: v })}
              onTogglePreferred={() => putField({ kind: 'preferred', value: contact.preferredChannel === 'email' ? null : 'email' })}
              onRemove={() => putField({ kind: 'email-remove', index: i })}
            />
          ))}

          {/* Phones */}
          {contact.phones.map((phone, i) => (
            <EditableField
              key={`phone-${i}`}
              icon="📞"
              value={phone}
              placeholder="+1 555 1234"
              isPreferred={contact.preferredChannel === 'phone'}
              onSave={(v) => putField({ kind: 'phone', index: i, value: v })}
              onTogglePreferred={() => putField({ kind: 'preferred', value: contact.preferredChannel === 'phone' ? null : 'phone' })}
              onRemove={() => putField({ kind: 'phone-remove', index: i })}
            />
          ))}

          {/* Telegram */}
          {contact.telegram && (
            <EditableField
              icon="📱"
              value={contact.telegram}
              placeholder="telegram handle"
              isPreferred={contact.preferredChannel === 'telegram'}
              onSave={(v) => putField({ kind: 'telegram', value: v.replace(/^@/, '') })}
              onTogglePreferred={() => putField({ kind: 'preferred', value: contact.preferredChannel === 'telegram' ? null : 'telegram' })}
            />
          )}

          {/* X */}
          {contact.x && (
            <EditableField
              icon="🐦"
              value={contact.x}
              placeholder="x handle"
              isPreferred={contact.preferredChannel === 'x'}
              onSave={(v) => putField({ kind: 'x', value: v.replace(/^@/, '') })}
              onTogglePreferred={() => putField({ kind: 'preferred', value: contact.preferredChannel === 'x' ? null : 'x' })}
            />
          )}

          {/* LinkedIn */}
          {contact.linkedin && (
            <EditableField
              icon="💼"
              value={contact.linkedin}
              placeholder="linkedin handle"
              isPreferred={contact.preferredChannel === 'linkedin'}
              onSave={(v) => putField({ kind: 'linkedin', value: v })}
              onTogglePreferred={() => putField({ kind: 'preferred', value: contact.preferredChannel === 'linkedin' ? null : 'linkedin' })}
            />
          )}

          {/* Website */}
          {contact.website && (
            <EditableField
              icon="🌐"
              value={contact.website}
              placeholder="website.com"
              isPreferred={contact.preferredChannel === 'website'}
              onSave={(v) => putField({ kind: 'website', value: v })}
              onTogglePreferred={() => putField({ kind: 'preferred', value: contact.preferredChannel === 'website' ? null : 'website' })}
            />
          )}

          {/* Add field */}
          <AddField
            existing={existingSingleChannels}
            onAdd={(channel, value) => {
              if (channel === 'email') return putField({ kind: 'email-add', value });
              if (channel === 'phone') return putField({ kind: 'phone-add', value });
              return putField({ kind: channel, value });
            }}
          />
        </div>
      )}

      {/* Smart share routing */}
      {(() => {
        if (!contact) return null;
        const pref = contact.preferredChannel;
        const buttons: Array<{ label: string; href: string }> = [];

        if (contact.emails[0]) {
          const body = `${data.caption ?? ''}\n\n${data.shareUrl ?? ''}`;
          buttons.push({
            label: `✉️ Email ${contact.emails[0]}`,
            href: `mailto:${contact.emails[0]}?subject=${encodeURIComponent('Following up')}&body=${encodeURIComponent(body)}`,
          });
        }
        if (contact.phones[0]) {
          const body = `${data.caption ?? ''}\n\n${data.shareUrl ?? ''}`;
          buttons.push({
            label: `💬 Text ${contact.phones[0]}`,
            href: `sms:${contact.phones[0].replace(/[^+0-9]/g, '')}?body=${encodeURIComponent(body)}`,
          });
        }
        if (contact.telegram) {
          buttons.push({ label: `📱 Telegram @${socialUrl.telegramHandle(contact.telegram)}`, href: socialUrl.telegram(contact.telegram) });
        }
        if (contact.x) {
          buttons.push({ label: `🐦 X @${socialUrl.xHandle(contact.x)}`, href: socialUrl.x(contact.x) });
        }
        if (contact.linkedin) {
          buttons.push({ label: `💼 LinkedIn`, href: socialUrl.linkedin(contact.linkedin) });
        }
        if (contact.website) {
          buttons.push({ label: `🌐 Website`, href: contact.website.startsWith('http') ? contact.website : `https://${contact.website}` });
        }

        if (buttons.length === 0) return null;

        const channelToButtonKey = (label: string) => {
          if (label.startsWith('✉️')) return 'email';
          if (label.startsWith('💬')) return 'phone';
          if (label.startsWith('📱')) return 'telegram';
          if (label.startsWith('🐦')) return 'x';
          if (label.startsWith('💼')) return 'linkedin';
          if (label.startsWith('🌐')) return 'website';
          return '';
        };
        const sorted = [...buttons].sort((a, b) => {
          if (pref && channelToButtonKey(a.label) === pref) return -1;
          if (pref && channelToButtonKey(b.label) === pref) return 1;
          return 0;
        });

        return (
          <div className="space-y-2 pt-2">
            <p className="text-xs uppercase tracking-wide text-neutral-500">
              Send to {contact.name.split(' ')[0]}
              {pref && <span className="ml-2 text-neutral-400">— prefers {pref}</span>}
            </p>
            {sorted.map((btn, i) => (
              <a
                key={btn.label}
                href={btn.href}
                target="_blank"
                rel="noopener noreferrer"
                className={`block w-full text-center px-4 py-3 rounded-lg ${i === 0 ? 'bg-white text-neutral-950 font-semibold' : 'bg-neutral-900 border border-neutral-800 text-white'}`}
              >
                {btn.label}
              </a>
            ))}
          </div>
        );
      })()}

      {/* OS share sheet — fallback */}
      <button onClick={share} className="w-full px-4 py-3 rounded-lg bg-white text-neutral-950 font-semibold">📤 Share (pick app)</button>

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
