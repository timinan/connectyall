import { PageHeader } from '@/components/page-header';

export const metadata = { title: 'Terms · Connectyall' };

export default function TermsPage() {
  return (
    <main className="min-h-[100dvh] text-neutral-950 px-6 py-6 flex flex-col">
      <PageHeader />
      <article className="max-w-2xl mx-auto py-8 space-y-5 text-neutral-700 text-base leading-relaxed">
        <h1 className="text-4xl font-extrabold tracking-tight text-neutral-950">Terms</h1>
        <h2 className="font-mono text-[11px] tracking-[0.2em] uppercase text-muted font-semibold pt-2">CONNECTYALL IS A BETA</h2>
        <p>One person built it as a portfolio project. Use it because you like the idea — please don&apos;t expect enterprise-grade uptime.</p>
        <h2 className="font-mono text-[11px] tracking-[0.2em] uppercase text-muted font-semibold pt-2">YOUR DATA IS YOURS</h2>
        <p>We don&apos;t sell it. We don&apos;t share it. We don&apos;t use it to train models. You can export it (email us) and delete it (button on profile).</p>
        <h2 className="font-mono text-[11px] tracking-[0.2em] uppercase text-muted font-semibold pt-2">BE COOL ABOUT OTHER PEOPLE</h2>
        <p>The whole point of Connectyall is that you record info about people you meet. <strong>Please get their okay before you do.</strong> Recording voice memos about someone without their knowledge isn&apos;t illegal in most places but it&apos;s not great form. Connectyall is for &ldquo;Sarah and I just exchanged numbers, here&apos;s a voice note while it&apos;s fresh&rdquo; — not for covertly profiling strangers.</p>
        <h2 className="font-mono text-[11px] tracking-[0.2em] uppercase text-muted font-semibold pt-2">NO WARRANTY</h2>
        <p>The app might break. Recordings might fail. Extractions might mis-spell a name. We&apos;ll fix bugs as we find them, but we don&apos;t guarantee anything.</p>
        <h2 className="font-mono text-[11px] tracking-[0.2em] uppercase text-muted font-semibold pt-2">WE CAN CHANGE THESE TERMS</h2>
        <p>If something material changes (data uses, who we share with, etc.) we&apos;ll send you a sign-in email about it.</p>
        <h2 className="font-mono text-[11px] tracking-[0.2em] uppercase text-muted font-semibold pt-2">QUESTIONS</h2>
        <p>Email <a href="mailto:tim.nan.91@gmail.com" className="text-brand underline">tim.nan.91@gmail.com</a>.</p>
        <p className="text-sm text-neutral-500 pt-6">Last updated: June 18, 2026.</p>
      </article>
    </main>
  );
}
