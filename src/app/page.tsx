import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSession } from '@/lib/auth/session';
import { getById } from '@/services/UserProfileService';
import { PageHeader } from '@/components/page-header';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const session = await getServerSession();
  if (session) {
    const profile = await getById(session.user.id);
    if (profile?.onboardedAt) redirect('/app/record');
  }

  return (
    <main className="relative min-h-[100dvh] text-neutral-950 px-6 py-6 flex flex-col overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-32 top-32 w-[420px] h-[420px] rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(124, 92, 255, 0.16) 0%, rgba(124, 92, 255, 0.05) 60%, rgba(124, 92, 255, 0) 80%)' }}
      >
        <div className="absolute inset-[60px] rounded-full" style={{ background: 'rgba(124, 92, 255, 0.06)' }} />
        <div className="absolute inset-[120px] rounded-full" style={{ background: 'rgba(124, 92, 255, 0.10)' }} />
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 bottom-24 w-[280px] h-[280px] rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(124, 92, 255, 0.14) 0%, rgba(124, 92, 255, 0.04) 60%, rgba(124, 92, 255, 0) 80%)' }}
      >
        <div className="absolute inset-[40px] rounded-full" style={{ background: 'rgba(124, 92, 255, 0.06)' }} />
        <div className="absolute inset-[80px] rounded-full" style={{ background: 'rgba(124, 92, 255, 0.12)' }} />
      </div>
      <div className="relative z-10 flex flex-col flex-1">
        <PageHeader status={<><span className="text-brand">●</span> VOICE TO CONNECTION</>} />
        <div className="flex-1 flex flex-col justify-center max-w-2xl">
          <div className="bg-surface border-l-4 border-brand rounded-r-xl px-4 py-3 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
            <h1 className="text-4xl font-black tracking-tight leading-[1.02]">
              Voice notes<br />
              that <span className="text-brand">connects</span><br />
              y&apos;all.
            </h1>
          </div>
          <p className="mt-6 text-[15px] text-neutral-700 leading-relaxed max-w-[400px]">
            Connectyall turns a voice memo you record after meeting someone into a connection built in an instant. Talk it out, we handle the rest.
          </p>
          <Link
            href="/app"
            className="mt-8 inline-flex w-fit items-center gap-2 px-6 py-4 rounded-full bg-brand text-white font-bold hover:opacity-90 transition shadow-[0_12px_28px_rgba(124,92,255,0.35)]"
          >
            Open the app →
          </Link>
        </div>
        <footer className="mt-12 mb-2 font-mono text-[10px] tracking-[0.2em] uppercase text-muted text-center">
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
