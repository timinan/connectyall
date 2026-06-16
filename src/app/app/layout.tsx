import type { ReactNode } from 'react';

export const metadata = {
  title: 'Connectyall',
};

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-neutral-950 text-white flex flex-col">
      <main className="flex-1 flex flex-col">{children}</main>
    </div>
  );
}
