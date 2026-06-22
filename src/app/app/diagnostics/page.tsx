import { redirect } from 'next/navigation';
import { getServerSession } from '@/lib/auth/session';
import { getDiagnosticsSummary, getFlaggedCaptures } from '@/services/DiagnosticsService';
import { APP_CONTAINER } from '../_layout-constants';
import { PageHeader } from '@/components/page-header';
import { BottomNav } from '@/components/bottom-nav';

const ADMIN_EMAILS = new Set(['tim.nan.91@gmail.com', 'timmy.nan@gmail.com']);

export const dynamic = 'force-dynamic';

function fmtMs(ms: number): string {
  if (!ms) return '—';
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms}ms`;
}

function fmtTime(d: Date): string {
  return new Date(d).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

export default async function DiagnosticsPage() {
  const session = await getServerSession();
  if (!session) redirect('/app/sign-in');
  if (!session.user.email || !ADMIN_EMAILS.has(session.user.email)) redirect('/app');

  const [summary, flagged] = await Promise.all([
    getDiagnosticsSummary(7),
    getFlaggedCaptures(30),
  ]);

  return (
    <div className={APP_CONTAINER}>
      <PageHeader status="DIAGNOSTICS" />
      <div className="bg-surface border-l-4 border-brand rounded-r-xl px-4 py-3 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
        <h1 className="text-4xl font-black leading-[1.02] tracking-tight">Last <span className="text-brand">7 days</span></h1>
      </div>

      {/* Headline numbers */}
      <div className="rounded-3xl bg-surface border border-line shadow-[0_2px_8px_rgba(0,0,0,0.04)] px-4 py-3.5">
        <div className="font-mono text-[10.5px] tracking-[0.2em] uppercase text-muted font-bold mb-3">OVERVIEW</div>
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Captures" value={summary.totalCaptures.toString()} />
          <Stat label="Success rate" value={`${summary.successPct}%`} sub={`${summary.ready} ready · ${summary.failed} failed`} />
          <Stat label="Avg total time" value={fmtMs(summary.avgTotalMs)} />
          <Stat label="P95 total time" value={fmtMs(summary.p95TotalMs)} />
          <Stat label="Follow-up drift" value={`${summary.drift.pct}%`} sub={`${summary.drift.drifted} of ${summary.drift.ready} ready`} />
        </div>
      </div>

      {/* Per-stage averages */}
      <div className="rounded-3xl bg-surface border border-line shadow-[0_2px_8px_rgba(0,0,0,0.04)] px-4 py-3.5">
        <div className="font-mono text-[10.5px] tracking-[0.2em] uppercase text-muted font-bold mb-3">PER-STAGE AVERAGES</div>
        <StageRow label="Download" ms={summary.stages.audioDownloadMs} />
        <StageRow label="Transcribe" ms={summary.stages.transcribeMs} />
        <StageRow label="Extract (LLM)" ms={summary.stages.extractMs} />
        <StageRow label="Persist contact" ms={summary.stages.contactPersistMs} />
        <StageRow label="Render card" ms={summary.stages.renderMs} />
        <StageRow label="Upload card" ms={summary.stages.cardUploadMs} />
      </div>

      {/* Recent failures */}
      <div className="rounded-3xl bg-surface border border-line shadow-[0_2px_8px_rgba(0,0,0,0.04)] px-4 py-3.5">
        <div className="font-mono text-[10.5px] tracking-[0.2em] uppercase text-muted font-bold mb-3">RECENT FAILURES</div>
        {summary.recentFailures.length === 0 && <div className="text-[13.5px] text-muted">None in the last 7 days. ✨</div>}
        {summary.recentFailures.map((f, i) => (
          <div key={i} className="border-t border-line/60 py-2 first:border-0">
            <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted">{fmtTime(f.recordedAt)} · {f.errorStage ?? 'unknown'}</div>
            <div className="text-[13px] text-neutral-950 mt-0.5">{f.errorMessage ?? '(no message)'}</div>
          </div>
        ))}
      </div>

      {/* Slowest captures */}
      <div className="rounded-3xl bg-surface border border-line shadow-[0_2px_8px_rgba(0,0,0,0.04)] px-4 py-3.5">
        <div className="font-mono text-[10.5px] tracking-[0.2em] uppercase text-muted font-bold mb-3">10 SLOWEST CAPTURES</div>
        {summary.slowest.length === 0 && <div className="text-[13.5px] text-muted">No captures yet.</div>}
        {summary.slowest.map((s, i) => (
          <div key={i} className="border-t border-line/60 py-2 first:border-0">
            <div className="flex items-center justify-between">
              <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted">{fmtTime(s.recordedAt)}</div>
              <div className="font-mono text-[12px] font-bold text-neutral-950">{fmtMs(s.totalMs ?? 0)}</div>
            </div>
            <div className="text-[12.5px] text-muted mt-0.5">
              {s.contactName ? `${s.contactName} · ` : ''}transcribe {fmtMs(s.transcribeMs ?? 0)} · extract {fmtMs(s.extractMs ?? 0)}
            </div>
          </div>
        ))}
      </div>

      {/* User-flagged captures */}
      <div className="rounded-3xl bg-surface border border-line shadow-[0_2px_8px_rgba(0,0,0,0.04)] px-4 py-3.5">
        <div className="font-mono text-[10.5px] tracking-[0.2em] uppercase text-muted font-bold mb-3">USER-FLAGGED CAPTURES · LAST 30 DAYS</div>
        {flagged.length === 0 && <div className="text-[13.5px] text-muted">No flagged recordings yet. ✨</div>}
        {flagged.map((f) => (
          <div key={f.interactionId} className="border-t border-line/60 py-3 first:border-0 space-y-2">
            <div className="flex items-center justify-between">
              <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted">
                {fmtTime(f.submittedAt)}{f.contactName ? ` · ${f.contactName}` : ''}
              </div>
            </div>
            {f.comment && (
              <div className="text-[13px] text-neutral-950 italic leading-snug">&ldquo;{f.comment}&rdquo;</div>
            )}
            {!f.comment && (
              <div className="text-[12.5px] text-muted italic">(no comment)</div>
            )}
            <audio
              controls
              preload="none"
              className="w-full h-9"
              src={`/api/admin/recording-audio/${f.interactionId}`}
            />
            <details className="text-[12px] text-muted">
              <summary className="font-mono text-[10px] tracking-[0.14em] uppercase font-bold cursor-pointer">SHOW EXTRACTED DATA</summary>
              <pre className="mt-2 p-2 rounded bg-cream text-[11px] text-neutral-700 overflow-x-auto whitespace-pre-wrap break-words">{JSON.stringify(f.structuredData, null, 2)}</pre>
            </details>
          </div>
        ))}
      </div>

      <BottomNav />
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div className="font-mono text-[9.5px] tracking-[0.18em] uppercase text-muted font-bold mb-0.5">{label}</div>
      <div className="text-[22px] font-extrabold text-neutral-950 leading-tight">{value}</div>
      {sub && <div className="text-[11.5px] text-muted">{sub}</div>}
    </div>
  );
}

function StageRow({ label, ms }: { label: string; ms: number }) {
  return (
    <div className="flex items-center justify-between border-t border-line/60 py-2 first:border-0">
      <div className="text-[13.5px] text-neutral-700">{label}</div>
      <div className="font-mono text-[12px] font-bold text-neutral-950">{fmtMs(ms)}</div>
    </div>
  );
}
