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
    <main className="min-h-[100dvh] text-neutral-950 px-6 py-6 flex flex-col">
      <PageHeader />
      <div className="flex-1 flex flex-col justify-center max-w-2xl">
        <p className="inline-flex w-fit items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-800 font-mono text-[10px] tracking-[0.2em] font-bold uppercase mb-6">
          <span className="text-brand">●</span> VOICE TO CONNECTION
        </p>
        <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight leading-[1.02]">
          Voice notes<br />
          that <span className="text-brand">connect</span><br />
          y&apos;all.
        </h1>
        <p className="mt-6 text-[15px] text-neutral-700 leading-relaxed max-w-[400px]">
          Connectyall turns the voice memo you record after meeting someone into a connection you can pass along the same day. Talk it out, we handle the rest.
        </p>
        <Link
          href="/app"
          className="mt-8 inline-flex w-fit items-center gap-2 px-6 py-4 rounded-full bg-neutral-950 text-white font-bold hover:bg-neutral-800 transition"
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
    </main>
  );
}
