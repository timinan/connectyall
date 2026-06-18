'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LuMic, LuUser, LuUsers } from 'react-icons/lu';

const TABS = [
  { href: '/app/profile', icon: LuUser, label: 'Profile', match: '/app/profile' },
  { href: '/app/record', icon: LuMic, label: 'Record', match: '/app/record' },
  { href: '/app/connections', icon: LuUsers, label: 'Network', match: '/app/connections' },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 bg-[#0F0F12] text-white rounded-full p-1.5 flex gap-1 items-center shadow-[0_6px_20px_rgba(0,0,0,0.25)]">
      {TABS.map(({ href, icon: Icon, label, match }) => {
        const active = pathname.startsWith(match);
        return active ? (
          <Link
            key={href}
            href={href}
            className="inline-flex items-center gap-1.5 px-4 h-10 rounded-full bg-brand text-white text-sm font-semibold"
          >
            <Icon size={16} />
            <span>{label}</span>
          </Link>
        ) : (
          <Link
            key={href}
            href={href}
            aria-label={label}
            className="w-10 h-10 rounded-full flex items-center justify-center text-zinc-400 hover:text-white transition"
          >
            <Icon size={16} />
          </Link>
        );
      })}
    </nav>
  );
}
