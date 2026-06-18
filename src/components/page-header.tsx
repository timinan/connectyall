import type { ReactNode } from 'react';

export function PageHeader({ status }: { status?: ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <div className="inline-flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-brand text-white flex items-center justify-center font-extrabold text-sm">
          c
        </div>
        <span className="text-base font-bold">Connectyall</span>
      </div>
      {status && (
        <div className="font-mono text-[11px] tracking-[0.2em] text-muted font-semibold uppercase">
          {status}
        </div>
      )}
    </div>
  );
}
