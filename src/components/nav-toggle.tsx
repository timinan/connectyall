'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LuArrowLeft, LuArrowRight } from 'react-icons/lu';

export function NavToggle() {
  const pathname = usePathname();
  const onConnections = pathname.startsWith('/app/connections');
  const target = onConnections ? '/app/record' : '/app/connections';
  const label = onConnections ? 'Record' : 'Connections';
  const Icon = onConnections ? LuArrowLeft : LuArrowRight;

  return (
    <Link
      href={target}
      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-neutral-950 text-white text-sm font-semibold hover:bg-neutral-800 transition"
    >
      {onConnections && <Icon size={14} />}
      {label}
      {!onConnections && <Icon size={14} />}
    </Link>
  );
}
