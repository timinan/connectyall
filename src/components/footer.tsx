import Link from 'next/link';
import { LogoMark } from './logo';

export function Footer() {
  return (
    <footer className="bg-slate-900 text-white py-8 px-6 mt-auto">
      <div className="max-w-3xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
        <Link href="/" className="inline-flex items-center gap-2 hover:opacity-80 transition">
          <LogoMark size={28} />
          <span className="text-lg font-bold tracking-tight">connectyall</span>
        </Link>
        <p className="text-sm text-slate-300">Voice notes that connect y&apos;all.</p>
        <p className="text-xs text-slate-400">A portfolio project by Tim Nan</p>
      </div>
    </footer>
  );
}
