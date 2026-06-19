import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSession } from '@/lib/auth/session';
import { getById } from '@/services/UserProfileService';
import { PageHeader } from '@/components/page-header';
import { LANDING_CONTAINER_FLEX } from './app/_layout-constants';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const session = await getServerSession();
  if (session) {
    const profile = await getById(session.user.id);
    if (profile?.onboardedAt) redirect('/app/record');
  }

  return (
    <main className={`relative text-neutral-950 overflow-hidden ${LANDING_CONTAINER_FLEX}`}>
      {/* Glow rings fill the empty space below the banner */}
      <div
        aria-hidden
        className="glow-breathe pointer-events-none absolute -right-32 top-[320px] w-[440px] h-[440px] rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(124, 92, 255, 0.18) 0%, rgba(124, 92, 255, 0.05) 60%, rgba(124, 92, 255, 0) 80%)' }}
      >
        <div className="glow-breathe-d1 absolute inset-[60px] rounded-full" style={{ background: 'rgba(124, 92, 255, 0.06)' }} />
        <div className="glow-breathe-d2 absolute inset-[120px] rounded-full" style={{ background: 'rgba(124, 92, 255, 0.10)' }} />
      </div>
      <div
        aria-hidden
        className="glow-breathe-d1 pointer-events-none absolute -left-28 bottom-20 w-[320px] h-[320px] rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(124, 92, 255, 0.16) 0%, rgba(124, 92, 255, 0.05) 60%, rgba(124, 92, 255, 0) 80%)' }}
      >
        <div className="glow-breathe-d2 absolute inset-[44px] rounded-full" style={{ background: 'rgba(124, 92, 255, 0.07)' }} />
        <div className="glow-breathe absolute inset-[88px] rounded-full" style={{ background: 'rgba(124, 92, 255, 0.13)' }} />
      </div>

      <div className="relative z-10 flex flex-col flex-1">
        <PageHeader status="HOME" />
        <div className="pt-3">
          <div className="bg-surface border-l-4 border-brand rounded-r-xl px-4 py-3 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
            <h1 className="text-4xl font-black tracking-tight leading-[1.02]">
              Voice notes<br />
              that <span className="text-brand">connects</span><br />
              y&apos;all.
            </h1>
          </div>
          <div className="mt-4 pl-5 font-mono text-[13px] tracking-[0.2em] font-semibold uppercase text-muted">
            ● VOICE TO CONNECTION
          </div>
          <p className="mt-2 pl-5 text-[15px] text-neutral-700 leading-relaxed max-w-[280px]">
            Connectyall turns a voice memo you record after meeting someone into a connection built in an instant. Talk it out, we handle the rest.
          </p>
          <Link
            href="/app"
            className="mt-6 ml-5 inline-flex w-fit items-center gap-2 px-6 py-4 rounded-full bg-brand text-white font-bold hover:opacity-90 transition shadow-[0_12px_28px_rgba(124,92,255,0.35)]"
          >
            Open the app →
          </Link>
        </div>
        <footer className="mt-auto pt-12 font-mono text-[10px] tracking-[0.2em] uppercase text-muted text-center">
          <Link href="/privacy" className="hover:text-neutral-950 transition">PRIVACY</Link>
          <span className="mx-2 text-neutral-300">·</span>
          <Link href="/terms" className="hover:text-neutral-950 transition">TERMS</Link>
          <span className="mx-2 text-neutral-300">·</span>
          A PORTFOLIO PROJECT BY TIM NAN
        </footer>
      </div>
    </main>
  );
}
