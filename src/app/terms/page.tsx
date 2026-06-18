import Link from 'next/link';
import { Logo } from '@/components/logo';

export const metadata = { title: 'Terms · Connectyall' };

export default function TermsPage() {
  return (
    <main className="min-h-[calc(100dvh-3rem)] text-neutral-950 px-6 py-8 flex flex-col">
      <header className="flex items-center justify-between">
        <Link href="/"><Logo /></Link>
      </header>
      <article className="max-w-2xl mx-auto py-8 space-y-5 text-neutral-700 text-base leading-relaxed">
        <h1 className="text-3xl font-bold text-neutral-950">Terms</h1>
        <h2 className="text-lg font-semibold text-neutral-950 pt-2">Connectyall is a beta.</h2>
        <p>One person built it as a portfolio project. Use it because you like the idea — please don&apos;t expect enterprise-grade uptime.</p>
        <h2 className="text-lg font-semibold text-neutral-950 pt-2">Your data is yours.</h2>
        <p>We don&apos;t sell it. We don&apos;t share it. We don&apos;t use it to train models. You can export it (email us) and delete it (button on profile).</p>
        <h2 className="text-lg font-semibold text-neutral-950 pt-2">Be cool about other people.</h2>
        <p>The whole point of Connectyall is that you record info about people you meet. <strong>Please get their okay before you do.</strong> Recording voice memos about someone without their knowledge isn&apos;t illegal in most places but it&apos;s not great form. Connectyall is for &ldquo;Sarah and I just exchanged numbers, here&apos;s a voice note while it&apos;s fresh&rdquo; — not for covertly profiling strangers.</p>
        <h2 className="text-lg font-semibold text-neutral-950 pt-2">No warranty.</h2>
        <p>The app might break. Recordings might fail. Extractions might mis-spell a name. We&apos;ll fix bugs as we find them, but we don&apos;t guarantee anything.</p>
        <h2 className="text-lg font-semibold text-neutral-950 pt-2">We can change these terms.</h2>
        <p>If something material changes (data uses, who we share with, etc.) we&apos;ll send you a sign-in email about it.</p>
        <h2 className="text-lg font-semibold text-neutral-950 pt-2">Questions</h2>
        <p>Email <a href="mailto:tim.nan.91@gmail.com" className="text-brand underline">tim.nan.91@gmail.com</a>.</p>
        <p className="text-sm text-neutral-500 pt-6">Last updated: June 18, 2026.</p>
      </article>
    </main>
  );
}
