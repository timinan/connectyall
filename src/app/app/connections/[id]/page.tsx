'use client';

import Link from 'next/link';
import { use, useEffect, useRef, useState } from 'react';
import { LuSend, LuStar, LuPencil, LuX as LuXIcon } from 'react-icons/lu';
import {
  linkedinUrl, linkedinHandle, xUrl, xHandle, telegramUrl, telegramHandle,
  whatsappUrl, wechatUrl, lineUrl,
} from '@/lib/social-urls';
import { ChannelIcon, type ChannelKind } from '../../cards/[id]/channel-icons';
import { APP_CONTAINER } from '../../_layout-constants';
import { NavToggle } from '@/components/nav-toggle';

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

type Data = {
  contact: {
    id: string;
    name: string;
    role: string | null;
    company: string | null;
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
  latestInteractionId: string | null;
  latestRecap: string | null;
  previousMeetings: Array<{ interactionId: string; occurredAt: string; recap: string | null }>;
  shareUrl: string | null;
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
// Past meeting (expandable row)
// ---------------------------------------------------------------------------
function PastMeeting({ occurredAt, recap }: { occurredAt: string; recap: string | null }) {
  const [expanded, setExpanded] = useState(false);
  const date = new Date(occurredAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const preview = recap ? (recap.length > 80 ? recap.slice(0, 80) + '…' : recap) : '(no recap)';
  return (
    <li>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="text-left w-full p-2 rounded-lg hover:bg-white/50 transition"
      >
        <p className="text-xs text-neutral-700 font-medium">{date}</p>
        <p className="text-sm text-neutral-700">{expanded ? (recap ?? '(no recap)') : preview}</p>
      </button>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function ConnectionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<Data | null>(null);
  const [notFound, setNotFound] = useState(false);

  // Local optimistic state for name, notes, and recap
  const [localName, setLocalName] = useState<string | null>(null);
  const [localNotes, setLocalNotes] = useState<string | null | undefined>(undefined);
  const [localRecap, setLocalRecap] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch(`/api/connections/${id}`, { cache: 'no-store' });
    if (res.status === 404) {
      setNotFound(true);
      return;
    }
    if (res.ok) setData((await res.json()) as Data);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/connections/${id}`, { cache: 'no-store' });
      if (cancelled) return;
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      if (!res.ok) return;
      const j = (await res.json()) as Data;
      if (cancelled) return;
      setData(j);
    })();
    return () => { cancelled = true; };
  }, [id]);

  async function putContactField(body: object) {
    if (!data?.contact) return;
    await fetch(`/api/contacts/${data.contact.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    await refresh();
  }

  async function saveName(name: string) {
    if (!data?.contact) return;
    setLocalName(name);
    await fetch(`/api/contacts/${data.contact.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'name', value: name }),
    });
  }

  async function saveNotes(notes: string | null) {
    if (!data?.contact) return;
    setLocalNotes(notes);
    await fetch(`/api/contacts/${data.contact.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'notes', value: notes }),
    });
  }

  async function saveRecap(recap: string) {
    if (!data?.latestInteractionId) return;
    setLocalRecap(recap);
    await fetch(`/api/interactions/${data.latestInteractionId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recap }),
    });
  }

  if (notFound || (data && !data.contact)) {
    return (
      <div className={APP_CONTAINER}>
        <div className="flex justify-end"><NavToggle /></div>
        <div className="rounded-3xl bg-gradient-to-br from-purple-100 via-purple-50 to-amber-50 border border-purple-200/60 shadow-sm px-5 py-8 text-center space-y-3">
          <p className="text-neutral-700">Connection not found.</p>
          <Link href="/app/connections" className="inline-block px-4 py-2 rounded-full bg-neutral-950 text-white text-sm font-semibold hover:bg-neutral-800 transition">
            Back to connections
          </Link>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className={APP_CONTAINER}>
        <div className="flex justify-end"><NavToggle /></div>
      </div>
    );
  }

  const contact = data.contact;
  const contactName = localName ?? contact?.name ?? '';
  const notesValue = localNotes !== undefined ? localNotes : (contact?.notes ?? null);
  const recapText = localRecap ?? data.latestRecap ?? '';

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
  const captionText = '';

  function emailSendHref(email: string) {
    const body = `${captionText}\n\n${data?.shareUrl ?? ''}`;
    return `mailto:${email}?subject=${encodeURIComponent('Following up')}&body=${encodeURIComponent(body)}`;
  }

  function phoneSendHref(phone: string) {
    const body = `${captionText}\n\n${data?.shareUrl ?? ''}`;
    return `sms:${phone.replace(/[^+0-9]/g, '')}?body=${encodeURIComponent(body)}`;
  }

  function whatsappSendHref(value: string) {
    const base = socialUrl.whatsapp(value);
    return captionText ? `${base}?text=${encodeURIComponent(captionText)}` : base;
  }

  return (
    <div className={APP_CONTAINER}>
      <div className="flex justify-end">
        <NavToggle />
      </div>

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
        {data.latestInteractionId && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide">What we talked about</p>
            <EditableTextArea
              value={recapText || null}
              placeholder="Tap to edit the recap…"
              onSave={(v) => saveRecap(v ?? '')}
            />
          </div>
        )}
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
      {data.previousMeetings.length > 0 && (
        <div className="rounded-3xl bg-gradient-to-br from-purple-100 via-purple-50 to-amber-50 border border-purple-200/60 shadow-sm px-5 py-4 space-y-3">
          <p className="text-sm text-neutral-700 font-medium">Previous meetings ({data.previousMeetings.length})</p>
          <ul className="space-y-2">
            {data.previousMeetings.map((m) => (
              <PastMeeting key={m.interactionId} occurredAt={m.occurredAt} recap={m.recap} />
            ))}
          </ul>
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
