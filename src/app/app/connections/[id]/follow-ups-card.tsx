'use client';
import { useState } from 'react';
import type { FollowUp } from '@/lib/db/schema';
import { FollowUpModal } from './follow-up-modal';
import { LuX } from 'react-icons/lu';

type Props = {
  contactId: string;
  contactName: string;
  initial: FollowUp[];
};

function statusMeta(fu: FollowUp): { tone: 'due-soon' | 'overdue' | 'no-date' | 'done'; label: string } {
  if (fu.status === 'done') {
    const doneDate = fu.doneAt ? new Date(fu.doneAt) : null;
    const label = doneDate
      ? `DONE · ${doneDate.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()}`
      : 'DONE';
    return { tone: 'done', label };
  }
  if (!fu.dueAt) return { tone: 'no-date', label: 'NO DATE' };
  const due = new Date(fu.dueAt);
  const now = new Date();
  const days = Math.round((due.getTime() - now.getTime()) / 86_400_000);
  if (days < 0) return { tone: 'overdue', label: `${Math.abs(days)}D OVERDUE` };
  if (days === 0) return { tone: 'due-soon', label: 'TODAY' };
  if (days === 1) return { tone: 'due-soon', label: 'TOMORROW' };
  if (days < 7) return { tone: 'due-soon', label: `IN ${days} DAYS` };
  return { tone: 'due-soon', label: due.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase() };
}

function FollowUpRow({
  fu,
  onEdit,
  onDelete,
}: {
  fu: FollowUp;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const meta = statusMeta(fu);
  const isDone = fu.status === 'done';

  const toneClass =
    meta.tone === 'overdue' ? 'text-red-700' :
    meta.tone === 'due-soon' ? 'text-amber-700' :
    'text-muted';
  const dotClass =
    meta.tone === 'overdue' ? 'text-red-600' :
    meta.tone === 'due-soon' ? 'text-amber-500' :
    'text-neutral-400';

  return (
    <div className="flex items-start gap-2.5 py-2.5">
      <div className={`font-mono text-[9.5px] tracking-[0.14em] uppercase font-bold min-w-[86px] flex items-center gap-1 pt-1 ${toneClass}`}>
        <span className={dotClass}>●</span>
        {meta.label}
      </div>
      <button
        type="button"
        onClick={onEdit}
        className={`flex-1 min-w-0 text-left text-[13.5px] leading-snug line-clamp-2 ${isDone ? 'line-through text-muted' : 'text-neutral-950'}`}
      >
        {fu.topic}
      </button>
      <button
        type="button"
        onClick={onEdit}
        className="flex-shrink-0 inline-flex items-center px-3 py-1.5 rounded-full bg-brand text-white font-mono text-[10px] tracking-[0.14em] font-bold uppercase hover:opacity-90 transition-opacity"
      >
        EDIT
      </button>
      <button
        type="button"
        onClick={onDelete}
        aria-label="Delete follow-up"
        className="flex-shrink-0 text-neutral-500 hover:text-neutral-950 p-2"
      >
        <LuX size={16} />
      </button>
    </div>
  );
}

export function FollowUpsCard({ contactId, contactName, initial }: Props) {
  const [rows, setRows] = useState<FollowUp[]>(initial);
  const [editing, setEditing] = useState<FollowUp | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<FollowUp | null>(null);

  async function save(input: { topic: string; dueAt: Date | null }) {
    if (editing) {
      const res = await fetch(`/api/follow-ups/${editing.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: input.topic, dueAt: input.dueAt?.toISOString() ?? null }),
      });
      if (!res.ok) return;
      const { followUp } = await res.json();
      setRows((rs) => rs.map(r => r.id === editing.id ? followUp : r));
    } else {
      const res = await fetch(`/api/follow-ups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId, topic: input.topic, dueAt: input.dueAt?.toISOString() ?? null }),
      });
      if (!res.ok) return;
      const { followUp } = await res.json();
      setRows((rs) => [...rs, followUp]);
    }
  }

  async function markDone() {
    if (!editing) return;
    const res = await fetch(`/api/follow-ups/${editing.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'done' }),
    });
    if (!res.ok) return;
    const { followUp } = await res.json();
    setRows((rs) => rs.map(r => r.id === editing.id ? followUp : r));
  }

  async function remove(fu: FollowUp) {
    const res = await fetch(`/api/follow-ups/${fu.id}`, { method: 'DELETE' });
    if (!res.ok) return;
    setRows((rs) => rs.filter(r => r.id !== fu.id));
    setConfirmDelete(null);
  }

  const pending = rows.filter(r => r.status === 'pending');
  const done = rows.filter(r => r.status === 'done');

  return (
    <div className="rounded-3xl bg-surface border border-line shadow-[0_2px_8px_rgba(0,0,0,0.04)] px-4 py-3.5">
      <div className="font-mono text-[10.5px] tracking-[0.2em] uppercase text-muted font-bold">
        FOLLOW-UPS
      </div>

      {rows.length === 0 && (
        <div className="text-center py-4">
          <div className="text-[14px] text-neutral-700 mb-1">Nothing on your list for {contactName}.</div>
          <div className="text-[12.5px] text-muted leading-snug mb-3">No commitments came up in your conversation.</div>
        </div>
      )}

      <div className="mt-1 divide-y divide-line/60">
        {pending.map(fu => (
          <FollowUpRow
            key={fu.id}
            fu={fu}
            onEdit={() => setEditing(fu)}
            onDelete={() => setConfirmDelete(fu)}
          />
        ))}
        {done.length > 0 && pending.length > 0 && <div className="h-1" />}
        {done.map(fu => (
          <div key={fu.id} style={{ opacity: 0.55 }}>
            <FollowUpRow
              fu={fu}
              onEdit={() => setEditing(fu)}
              onDelete={() => setConfirmDelete(fu)}
            />
          </div>
        ))}
      </div>

      <div className="mt-3 pt-3 border-t border-line">
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex items-center px-3.5 py-1.5 rounded-full bg-[#E9DDFF] text-brand font-mono text-[10.5px] tracking-[0.14em] font-bold uppercase"
        >
          + ADD FOLLOW-UP
        </button>
      </div>

      {(editing || adding) && (
        <FollowUpModal
          mode={editing ? 'edit' : 'add'}
          contactName={contactName}
          initial={editing ?? undefined}
          onClose={() => { setEditing(null); setAdding(false); }}
          onSave={save}
          onMarkDone={editing ? markDone : undefined}
        />
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/40">
          <div className="rounded-3xl bg-white shadow-xl max-w-sm w-full px-6 py-6 space-y-4">
            <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-muted font-bold">CONFIRM</div>
            <p className="text-lg font-extrabold">Delete this follow-up?</p>
            <p className="text-[14px] text-neutral-700"><em>&ldquo;{confirmDelete.topic}&rdquo;</em></p>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="flex-1 px-4 py-3 rounded-full bg-white border-[1.5px] border-neutral-950 text-neutral-950 font-mono text-[11px] tracking-[0.18em] font-bold uppercase"
              >
                CANCEL
              </button>
              <button
                type="button"
                onClick={() => remove(confirmDelete)}
                className="flex-1 px-4 py-3 rounded-full bg-red-500 text-white font-mono text-[11px] tracking-[0.18em] font-bold uppercase"
              >
                DELETE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
