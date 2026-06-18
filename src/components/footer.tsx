import Link from 'next/link';
import { LogoMark } from './logo';

export function Footer() {
  return (
    <footer className="fixed bottom-0 left-0 right-0 z-40 bg-slate-900 text-white py-2.5 px-4">
      <div className="max-w-3xl mx-auto flex items-center justify-center gap-3">
        <Link href="/" className="inline-flex items-center gap-2 hover:opacity-80 transition">
          <LogoMark size={20} />
          <span className="text-sm font-bold tracking-tight">connectyall</span>
        </Link>
        <span className="text-slate-500">·</span>
        <p className="text-xs text-slate-300">Voice notes that connect y&apos;all.</p>
      </div>
    </footer>
  );
}
