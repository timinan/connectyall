'use client';

import Link from 'next/link';
import { use, useEffect, useRef, useState } from 'react';
import { LuSend, LuStar, LuPencil, LuX as LuXIcon } from 'react-icons/lu';
import {
  linkedinUrl, linkedinHandle, xUrl, xHandle, telegramUrl, telegramHandle,
  whatsappUrl, wechatUrl, lineUrl,
} from '@/lib/social-urls';
import { ChannelIcon, type ChannelKind } from './channel-icons';
import { LogoSpinner } from '@/components/logo';
import { APP_CONTAINER } from '../../_layout-constants';

const socialUrl = {
  linkedin: linkedinUrl,
  linkedinHandle,
  x: xUrl,
  xHandle,
  telegram: telegramUrl,
  telegramHandle,
  whatsapp: whatsappUrl,
  wechat: wechatUrl,
  line: lineUrl,
};

type PreferredChannel = 'telegram' | 'email' | 'phone' | 'x' | 'linkedin' | 'website' | 'whatsapp' | 'wechat' | 'line';

type CardData = {
  status: 'processing' | 'ready' | 'failed';
  interaction?: { id: string; recap: string };
  contact?: {
    id: string;
    name: string;
    notes: string | null;
    telegram: string | null;
    x: string | null;
    linkedin: string | null;
    website: string | null;
    whatsapp: string | null;
    wechat: string | null;
    line: string | null;
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
        className="text-xl font-bold w-full px-2 py-1 rounded bg-white border border-neutral-200 text-neutral-950"
      />
    );
  }

  return (
    <button
      className="text-xl font-bold text-left text-neutral-950 hover:text-neutral-700 transition-colors flex items-center gap-1.5"
      onClick={() => { setDraft(value); setEditing(true); }}
      title="Tap to edit name"
    >
      {value}
      <LuPencil size={14} className="text-neutral-500" />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Inline-editable textarea field (notes + recap)
// ---------------------------------------------------------------------------
type EditableTextAreaProps = {
  value: string | null;
  placeholder: string;
  onSave: (v: string | null) => Promise<void>;
};

function EditableTextArea({ value, placeholder, onSave }: EditableTextAreaProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { setDraft(value ?? ''); }, [value]);
  useEffect(() => { if (editing) textareaRef.current?.focus(); }, [editing]);

  async function commit() {
    setEditing(false);
    const trimmed = draft.trim();
    const next = trimmed || null;
    if (next !== value) await onSave(next);
  }

  const displayValue = value?.trim();

  if (editing) {
    return (
      <textarea
        ref={textareaRef}
        value={draft}
        rows={3}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { setDraft(value ?? ''); setEditing(false); }
        }}
        className="w-full px-2 py-1 rounded bg-white border border-neutral-200 text-neutral-700 text-sm resize-none"
      />
    );
  }

  return (
    <button
      className="text-sm text-left w-full flex items-start gap-1.5 hover:text-neutral-950 transition-colors"
      onClick={() => { setDraft(value ?? ''); setEditing(true); }}
      title="Tap to edit"
    >
      {displayValue ? (
        <span className="text-neutral-700 flex-1">{displayValue}</span>
      ) : (
        <span className="text-neutral-600 flex-1 italic">{placeholder}</span>
      )}
      <LuPencil size={12} className="text-neutral-500 flex-shrink-0 mt-0.5" />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Inline-editable field row — star left, send button, delete
// ---------------------------------------------------------------------------
type EditableFieldProps = {
  kind: ChannelKind;
  value: string;
  placeholder?: string;
  isPreferred: boolean;
  sendHref?: string;
  onSave: (v: string) => Promise<void>;
  onTogglePreferred: () => Promise<void>;
  onRemove?: () => Promise<void>;
};

function EditableField({
  kind, value, placeholder, isPreferred, sendHref, onSave, onTogglePreferred, onRemove,
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
      {/* Star: preferred channel toggle — far left */}
      <button
        className="flex-shrink-0 w-7 h-7 flex items-center justify-center hover:opacity-80"
        title={isPreferred ? 'Clear preferred channel' : 'Set as preferred channel'}
        onClick={onTogglePreferred}
      >
        <LuStar
          size={16}
          fill={isPreferred ? '#FACC15' : 'none'}
          color={isPreferred ? '#FACC15' : '#737373'}
        />
      </button>

      <span className="w-6 flex items-center justify-center flex-shrink-0">
        <ChannelIcon kind={kind} size={18} />
      </span>
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
          className="flex-1 px-2 py-1 rounded bg-white border border-neutral-200 text-neutral-950 text-sm min-w-0"
        />
      ) : (
        <button
          className="flex-1 text-left text-sm text-neutral-950 truncate hover:text-neutral-700 min-w-0 flex items-center gap-1"
          onClick={() => { setDraft(value); setEditing(true); }}
        >
          {value || <span className="text-neutral-500">{placeholder}</span>}
          <LuPencil size={12} className="text-neutral-500 flex-shrink-0" />
        </button>
      )}

      {/* Send: labeled button */}
      {sendHref && (
        <a
          href={sendHref}
          target={sendHref.startsWith('mailto:') || sendHref.startsWith('sms:') ? undefined : '_blank'}
          rel="noopener noreferrer"
          className="flex-shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-neutral-950 text-white text-xs font-medium hover:bg-neutral-800 transition-colors"
          title="Send via this channel"
        >
          <LuSend size={14} />
          <span>Send</span>
        </a>
      )}

      {/* Delete */}
      {onRemove && (
        <button
          className="flex-shrink-0 w-7 h-7 flex items-center justify-center text-neutral-500 hover:text-red-400"
          onClick={onRemove}
          title="Remove"
        >
          <LuXIcon size={14} />
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add-field row
// ---------------------------------------------------------------------------
const ALL_CHANNELS: PreferredChannel[] = ['email', 'phone', 'telegram', 'x', 'linkedin', 'website', 'whatsapp', 'wechat', 'line'];
const CHANNEL_LABELS: Record<PreferredChannel, string> = {
  email: 'Email',
  phone: 'Phone',
  telegram: 'Telegram',
  x: 'X',
  linkedin: 'LinkedIn',
  website: 'Website',
  whatsapp: 'WhatsApp',
  wechat: 'WeChat',
  line: 'Line',
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
  const [expanded, setExpanded] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<PreferredChannel | ''>('');
  const [value, setValue] = useState('');

  if (available.length === 0) return null;

  async function handleAdd() {
    if (!selectedChannel || !value.trim()) return;
    await onAdd(selectedChannel, value.trim());
    setSelectedChannel('');
    setValue('');
    setExpanded(false);
  }

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full border border-neutral-200 bg-white text-neutral-950 text-xs whitespace-nowrap"
      >
        + Add field
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-wrap w-full">
      <select
        value={selectedChannel}
        onChange={(e) => setSelectedChannel(e.target.value as PreferredChannel | '')}
        className="bg-white border border-neutral-200 rounded px-2 py-1 text-sm text-neutral-700 flex-shrink-0"
        autoFocus
      >
        <option value="">Pick field…</option>
        {available.map(c => <option key={c} value={c}>{CHANNEL_LABELS[c]}</option>)}
      </select>
      {selectedChannel && (
        <>
          <span className="flex items-center justify-center flex-shrink-0">
            <ChannelIcon kind={selectedChannel as ChannelKind} size={18} />
          </span>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
            placeholder={
              selectedChannel === 'telegram' ? 'handle (no @)'
              : selectedChannel === 'email' ? 'email@example.com'
              : selectedChannel === 'phone' ? '+1 555 1234'
              : selectedChannel === 'whatsapp' ? 'phone digits (e.g. 14155551234)'
              : selectedChannel === 'wechat' ? 'WeChat ID'
              : selectedChannel === 'line' ? 'Line ID (no @)'
              : ''
            }
            className="flex-1 px-2 py-1 rounded bg-white border border-neutral-200 text-neutral-950 text-sm min-w-0"
          />
          <button onClick={handleAdd} className="flex-shrink-0 text-sm px-3 py-1 rounded bg-neutral-950 text-white font-semibold hover:bg-neutral-800 transition">Add</button>
        </>
      )}
      <button
        onClick={() => { setExpanded(false); setSelectedChannel(''); setValue(''); }}
        className="flex-shrink-0 text-neutral-500 hover:text-neutral-700"
        title="Cancel"
      >
        <LuXIcon size={14} />
      </button>
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

  // Local optimistic state for name, notes, and recap
  const [localName, setLocalName] = useState<string | null>(null);
  const [localNotes, setLocalNotes] = useState<string | null | undefined>(undefined);
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
      alert('This browser does not support the Web Share API. Long-press the image to share it.');
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

  async function saveNotes(notes: string | null) {
    if (!data.contact) return;
    setLocalNotes(notes);
    await fetch(`/api/contacts/${data.contact.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'notes', value: notes }),
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
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="rounded-3xl bg-gradient-to-br from-purple-100 via-purple-50 to-amber-50 border border-purple-200/60 shadow-sm px-8 py-10 flex flex-col items-center gap-5 max-w-xl w-full">
          <LogoSpinner size={64} />
          <p className="text-neutral-800 font-medium text-lg">Connecting y&apos;all…</p>
          <p className="text-neutral-600 text-sm text-center">Hang tight while we turn your voice memo into a connection.</p>
        </div>
      </div>
    );
  }

  if (data.status === 'failed') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <p className="text-red-400 mb-4">Something went wrong with this capture.</p>
        <a href="/app/record" className="px-4 py-2 rounded-lg bg-neutral-950 text-white font-semibold hover:bg-neutral-800 transition">Try again</a>
      </div>
    );
  }

  const contact = data.contact;
  const contactName = localName ?? contact?.name ?? '';
  const notesValue = localNotes !== undefined ? localNotes : (contact?.notes ?? null);
  const recapText = localRecap ?? data.interaction?.recap ?? '';

  // Determine which single-value channels are already present (for AddField)
  const existingSingleChannels: PreferredChannel[] = [];
  if (contact?.telegram) existingSingleChannels.push('telegram');
  if (contact?.x) existingSingleChannels.push('x');
  if (contact?.linkedin) existingSingleChannels.push('linkedin');
  if (contact?.website) existingSingleChannels.push('website');
  if (contact?.whatsapp) existingSingleChannels.push('whatsapp');
  if (contact?.wechat) existingSingleChannels.push('wechat');
  if (contact?.line) existingSingleChannels.push('line');

  // Build send href for each channel
  const captionText = data.caption ?? '';

  function emailSendHref(email: string) {
    const body = `${captionText}\n\n${data.shareUrl ?? ''}`;
    return `mailto:${email}?subject=${encodeURIComponent('Following up')}&body=${encodeURIComponent(body)}`;
  }

  function phoneSendHref(phone: string) {
    const body = `${captionText}\n\n${data.shareUrl ?? ''}`;
    return `sms:${phone.replace(/[^+0-9]/g, '')}?body=${encodeURIComponent(body)}`;
  }

  function whatsappSendHref(value: string) {
    const base = socialUrl.whatsapp(value);
    return captionText ? `${base}?text=${encodeURIComponent(captionText)}` : base;
  }

  return (
    <div className={APP_CONTAINER}>
      {/* Editable heading: contact name */}
      <div className="rounded-3xl bg-gradient-to-br from-purple-100 via-purple-50 to-amber-50 border border-purple-200/60 shadow-sm px-5 py-5">
        <EditableHeading value={contactName} onSave={saveName} />
      </div>

      {/* Notes + Recap sections */}
      <div className="rounded-3xl bg-gradient-to-br from-purple-100 via-purple-50 to-amber-50 border border-purple-200/60 shadow-sm px-5 py-4 space-y-3">
        {/* Private note (notes) */}
        <div className="space-y-1">
          <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide">🔒 Private note</p>
          <EditableTextArea
            value={notesValue}
            placeholder="Tap to add a private note about who they are…"
            onSave={saveNotes}
          />
        </div>

        <div className="border-t border-neutral-200" />

        {/* What we talked about (recap) */}
        <div className="space-y-1">
          <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide">What we talked about</p>
          <EditableTextArea
            value={recapText || null}
            placeholder="Tap to edit the recap…"
            onSave={(v) => saveRecap(v ?? '')}
          />
        </div>
      </div>

      {/* Inline-editable contact fields with per-row actions */}
      {contact && (
        <div className="rounded-3xl bg-gradient-to-br from-purple-100 via-purple-50 to-amber-50 border border-purple-200/60 shadow-sm px-5 py-4 space-y-1">
          {/* Emails */}
          {contact.emails.map((email, i) => (
            <EditableField
              key={`email-${i}`}
              kind="email"
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
              kind="phone"
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
              kind="telegram"
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
              kind="x"
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
              kind="linkedin"
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
              kind="website"
              value={contact.website}
              placeholder="website.com"
              isPreferred={contact.preferredChannel === 'website'}
              sendHref={contact.website.startsWith('http') ? contact.website : `https://${contact.website}`}
              onSave={(v) => putContactField({ kind: 'website', value: v })}
              onTogglePreferred={() => putContactField({ kind: 'preferred', value: contact.preferredChannel === 'website' ? null : 'website' })}
              onRemove={() => putContactField({ kind: 'website-clear' })}
            />
          )}

          {/* WhatsApp */}
          {contact.whatsapp && (
            <EditableField
              kind="whatsapp"
              value={contact.whatsapp}
              placeholder="phone digits"
              isPreferred={contact.preferredChannel === 'whatsapp'}
              sendHref={whatsappSendHref(contact.whatsapp)}
              onSave={(v) => putContactField({ kind: 'whatsapp', value: v.replace(/\D/g, '') })}
              onTogglePreferred={() => putContactField({ kind: 'preferred', value: contact.preferredChannel === 'whatsapp' ? null : 'whatsapp' })}
              onRemove={() => putContactField({ kind: 'whatsapp-clear' })}
            />
          )}

          {/* WeChat */}
          {contact.wechat && (
            <EditableField
              kind="wechat"
              value={contact.wechat}
              placeholder="WeChat ID"
              isPreferred={contact.preferredChannel === 'wechat'}
              sendHref={socialUrl.wechat(contact.wechat)}
              onSave={(v) => putContactField({ kind: 'wechat', value: v })}
              onTogglePreferred={() => putContactField({ kind: 'preferred', value: contact.preferredChannel === 'wechat' ? null : 'wechat' })}
              onRemove={() => putContactField({ kind: 'wechat-clear' })}
            />
          )}

          {/* Line */}
          {contact.line && (
            <EditableField
              kind="line"
              value={contact.line}
              placeholder="Line ID"
              isPreferred={contact.preferredChannel === 'line'}
              sendHref={socialUrl.line(contact.line)}
              onSave={(v) => putContactField({ kind: 'line', value: v.replace(/^[~@]/, '') })}
              onTogglePreferred={() => putContactField({ kind: 'preferred', value: contact.preferredChannel === 'line' ? null : 'line' })}
              onRemove={() => putContactField({ kind: 'line-clear' })}
            />
          )}

          {/* Action chip row: Add field · Save to contacts */}
          <div className="flex flex-wrap gap-2 pt-3 border-t border-neutral-200">
            <AddField
              existing={existingSingleChannels}
              onAdd={(channel, value) => {
                if (channel === 'email') return putContactField({ kind: 'email-add', value });
                if (channel === 'phone') return putContactField({ kind: 'phone-add', value });
                if (channel === 'whatsapp') return putContactField({ kind: 'whatsapp', value: value.replace(/\D/g, '') });
                if (channel === 'line') return putContactField({ kind: 'line', value: value.replace(/^[~@]/, '') });
                return putContactField({ kind: channel, value });
              }}
            />
            <a
              href={`/api/contacts/${contact.id}/vcard`}
              download
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full border border-neutral-200 bg-white text-neutral-950 text-xs whitespace-nowrap"
            >
              {(() => { const first = contactName.trim().split(/\s+/)[0]; return first ? `💾 Save ${first} to contacts` : '💾 Save to contacts'; })()}
            </a>
          </div>
        </div>
      )}
      <Link
        href="/app/record"
        className="block w-full px-4 py-3 rounded-full bg-neutral-950 text-white font-semibold text-center hover:bg-neutral-800 transition"
      >
        ✓ Done
      </Link>
    </div>
  );
}
