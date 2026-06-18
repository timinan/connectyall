import type { ReactNode } from 'react';

export const metadata = {
  title: 'Connectyall',
};

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-[calc(100dvh-3rem)] text-neutral-950 flex flex-col">
      <main className="flex-1 flex flex-col">{children}</main>
    </div>
  );
}
