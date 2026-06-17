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
// Inline-editable heading (contact name)
// ---------------------------------------------------------------------------
type EditableHeadingProps = {
  value: string;
  onSave: (v: string) => Promise<void>;
};

function EditableHeading({ value, onSave }: EditableHeadingProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setDraft(value); }, [value]);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  async function commit() {
    setEditing(false);
    if (draft.trim() && draft !== value) await onSave(draft.trim());
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') { setDraft(value); setEditing(false); }
        }}
        className="text-xl font-bold w-full px-2 py-1 rounded bg-neutral-900 border border-neutral-700 text-white"
      />
    );
  }

  return (
    <button
      className="text-xl font-bold text-left hover:text-neutral-300 transition-colors"
      onClick={() => { setDraft(value); setEditing(true); }}
      title="Tap to edit name"
    >
      {value}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Inline-editable recap line
// ---------------------------------------------------------------------------
type EditableRecapProps = {
  value: string;
  onSave: (v: string) => Promise<void>;
};

function EditableRecap({ value, onSave }: EditableRecapProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { setDraft(value); }, [value]);
  useEffect(() => { if (editing) textareaRef.current?.focus(); }, [editing]);

  async function commit() {
    setEditing(false);
    if (draft.trim() && draft !== value) await onSave(draft.trim());
  }

  if (editing) {
    return (
      <textarea
        ref={textareaRef}
        value={draft}
        rows={3}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { setDraft(value); setEditing(false); }
        }}
        className="w-full px-2 py-1 rounded bg-neutral-900 border border-neutral-700 text-neutral-300 italic text-sm resize-none"
      />
    );
  }

  return (
    <button
      className="italic text-neutral-300 text-sm text-left hover:text-neutral-200 transition-colors w-full"
      onClick={() => { setDraft(value); setEditing(true); }}
      title="Tap to edit recap"
    >
      &quot;{value}&quot;
    </button>
  );
}

// ---------------------------------------------------------------------------
// Inline-editable field row — with send + star + delete icons
// ---------------------------------------------------------------------------
type EditableFieldProps = {
  icon: string;
  value: string;
  placeholder?: string;
  isPreferred: boolean;
  sendHref?: string;
  onSave: (v: string) => Promise<void>;
  onTogglePreferred: () => Promise<void>;
  onRemove?: () => Promise<void>;
};

function EditableField({
  icon, value, placeholder, isPreferred, sendHref, onSave, onTogglePreferred, onRemove,
}: EditableFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  async function commit() {
    setEditing(false);
    if (draft !== value) await onSave(draft);
  }

  return (
    <div className="flex items-center gap-1 py-1">
      <span className="w-6 text-center flex-shrink-0 text-base">{icon}</span>
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') { setDraft(value); setEditing(false); }
          }}
          className="flex-1 px-2 py-1 rounded bg-neutral-800 border border-neutral-700 text-white text-sm min-w-0"
        />
      ) : (
        <button
          className="flex-1 text-left text-sm text-neutral-200 truncate hover:text-white min-w-0"
          onClick={() => { setDraft(value); setEditing(true); }}
        >
          {value || <span className="text-neutral-500">{placeholder}</span>}
        </button>
      )}

      {/* Star: preferred channel toggle */}
      <button
        className="flex-shrink-0 w-8 h-8 flex items-center justify-center text-base hover:opacity-80"
        title={isPreferred ? 'Clear preferred channel' : 'Set as preferred channel'}
        onClick={onTogglePreferred}
      >
        {isPreferred ? '★' : '☆'}
      </button>

      {/* Send: channel-specific deep link */}
      {sendHref && (
        <a
          href={sendHref}
          target={sendHref.startsWith('mailto:') || sendHref.startsWith('sms:') ? undefined : '_blank'}
          rel="noopener noreferrer"
          className="flex-shrink-0 w-8 h-8 flex items-center justify-center text-base hover:opacity-80"
          title="Send via this channel"
        >
          ✈️
        </a>
      )}

      {/* Delete */}
      {onRemove && (
        <button
          className="flex-shrink-0 w-8 h-8 flex items-center justify-center text-neutral-500 hover:text-red-400 text-sm"
          onClick={onRemove}
          title="Remove"
        >
          ✕
        </button>
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
    if (c === 'email' || c === 'phone') return true;
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
            placeholder={
              selectedChannel === 'telegram' ? 'handle (no @)'
              : selectedChannel === 'email' ? 'email@example.com'
              : selectedChannel === 'phone' ? '+1 555 1234'
              : ''
            }
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

  // Local optimistic state for name and recap
  const [localName, setLocalName] = useState<string | null>(null);
  const [localRecap, setLocalRecap] = useState<string | null>(null);

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

  // Pre-fetch the card PNG once the card is ready so navigator.share can be called
  // synchronously inside the click handler (iOS Safari requires the user gesture to
  // still be active when share() is called).
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

  async function putContactField(body: object) {
    if (!data.contact) return;
    await fetch(`/api/contacts/${data.contact.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    await refresh();
  }

  async function saveName(name: string) {
    if (!data.contact) return;
    setLocalName(name);
    await fetch(`/api/contacts/${data.contact.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'name', value: name }),
    });
  }

  async function saveRecap(recap: string) {
    if (!data.interaction) return;
    setLocalRecap(recap);
    await fetch(`/api/interactions/${data.interaction.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recap }),
    });
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
  const contactName = localName ?? contact?.name ?? '';
  const recapText = localRecap ?? data.interaction?.recap ?? '';

  // Determine which single-value channels are already present (for AddField)
  const existingSingleChannels: PreferredChannel[] = [];
  if (contact?.telegram) existingSingleChannels.push('telegram');
  if (contact?.x) existingSingleChannels.push('x');
  if (contact?.linkedin) existingSingleChannels.push('linkedin');
  if (contact?.website) existingSingleChannels.push('website');

  // Build send href for each channel
  function emailSendHref(email: string) {
    const body = `${data.caption ?? ''}\n\n${data.shareUrl ?? ''}`;
    return `mailto:${email}?subject=${encodeURIComponent('Following up')}&body=${encodeURIComponent(body)}`;
  }

  function phoneSendHref(phone: string) {
    const body = `${data.caption ?? ''}\n\n${data.shareUrl ?? ''}`;
    return `sms:${phone.replace(/[^+0-9]/g, '')}?body=${encodeURIComponent(body)}`;
  }

  return (
    <div className="p-6 max-w-md mx-auto space-y-4">
      {/* Editable heading: contact name + recap */}
      <div className="space-y-1">
        <EditableHeading value={contactName} onSave={saveName} />
        {recapText && <EditableRecap value={recapText} onSave={saveRecap} />}
      </div>

      {/* Inline-editable contact fields with per-row actions */}
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
              sendHref={emailSendHref(email)}
              onSave={(v) => putContactField({ kind: 'email', index: i, value: v })}
              onTogglePreferred={() => putContactField({ kind: 'preferred', value: contact.preferredChannel === 'email' ? null : 'email' })}
              onRemove={() => putContactField({ kind: 'email-remove', index: i })}
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
              sendHref={phoneSendHref(phone)}
              onSave={(v) => putContactField({ kind: 'phone', index: i, value: v })}
              onTogglePreferred={() => putContactField({ kind: 'preferred', value: contact.preferredChannel === 'phone' ? null : 'phone' })}
              onRemove={() => putContactField({ kind: 'phone-remove', index: i })}
            />
          ))}

          {/* Telegram */}
          {contact.telegram && (
            <EditableField
              icon="📱"
              value={contact.telegram}
              placeholder="telegram handle"
              isPreferred={contact.preferredChannel === 'telegram'}
              sendHref={socialUrl.telegram(contact.telegram)}
              onSave={(v) => putContactField({ kind: 'telegram', value: v.replace(/^@/, '') })}
              onTogglePreferred={() => putContactField({ kind: 'preferred', value: contact.preferredChannel === 'telegram' ? null : 'telegram' })}
              onRemove={() => putContactField({ kind: 'telegram-clear' })}
            />
          )}

          {/* X */}
          {contact.x && (
            <EditableField
              icon="🐦"
              value={contact.x}
              placeholder="x handle"
              isPreferred={contact.preferredChannel === 'x'}
              sendHref={socialUrl.x(contact.x)}
              onSave={(v) => putContactField({ kind: 'x', value: v.replace(/^@/, '') })}
              onTogglePreferred={() => putContactField({ kind: 'preferred', value: contact.preferredChannel === 'x' ? null : 'x' })}
              onRemove={() => putContactField({ kind: 'x-clear' })}
            />
          )}

          {/* LinkedIn */}
          {contact.linkedin && (
            <EditableField
              icon="💼"
              value={contact.linkedin}
              placeholder="linkedin handle"
              isPreferred={contact.preferredChannel === 'linkedin'}
              sendHref={socialUrl.linkedin(contact.linkedin)}
              onSave={(v) => putContactField({ kind: 'linkedin', value: v })}
              onTogglePreferred={() => putContactField({ kind: 'preferred', value: contact.preferredChannel === 'linkedin' ? null : 'linkedin' })}
              onRemove={() => putContactField({ kind: 'linkedin-clear' })}
            />
          )}

          {/* Website */}
          {contact.website && (
            <EditableField
              icon="🌐"
              value={contact.website}
              placeholder="website.com"
              isPreferred={contact.preferredChannel === 'website'}
              sendHref={contact.website.startsWith('http') ? contact.website : `https://${contact.website}`}
              onSave={(v) => putContactField({ kind: 'website', value: v })}
              onTogglePreferred={() => putContactField({ kind: 'preferred', value: contact.preferredChannel === 'website' ? null : 'website' })}
              onRemove={() => putContactField({ kind: 'website-clear' })}
            />
          )}

          {/* Add field */}
          <AddField
            existing={existingSingleChannels}
            onAdd={(channel, value) => {
              if (channel === 'email') return putContactField({ kind: 'email-add', value });
              if (channel === 'phone') return putContactField({ kind: 'phone-add', value });
              return putContactField({ kind: channel, value });
            }}
          />
        </div>
      )}

      {/* Primary OS share sheet */}
      <button onClick={share} className="w-full px-4 py-3 rounded-lg bg-white text-neutral-950 font-semibold">
        📤 Share (pick app)
      </button>

      {/* Save contact to address book */}
      {contact && (
        <a
          href={`/api/contacts/${contact.id}/vcard`}
          download
          className="block w-full text-center px-4 py-3 rounded-lg bg-neutral-900 border border-neutral-800 text-white"
        >
          💾 Save {contactName} to my Contacts
        </a>
      )}
    </div>
  );
}
