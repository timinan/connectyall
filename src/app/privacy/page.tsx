import Link from 'next/link';
import { Logo } from '@/components/logo';

export const metadata = { title: 'Privacy · Connectyall' };

export default function PrivacyPage() {
  return (
    <main className="min-h-[calc(100dvh-3rem)] text-neutral-950 px-6 py-8 flex flex-col">
      <header className="flex items-center justify-between">
        <Link href="/"><Logo /></Link>
      </header>
      <article className="max-w-2xl mx-auto py-8 space-y-5 text-neutral-700 text-base leading-relaxed">
        <h1 className="text-3xl font-bold text-neutral-950">Privacy</h1>
        <p>Connectyall keeps it simple. You record voice memos about people you meet. We turn those into structured contact info you can pass along and look up later. Here&apos;s exactly what happens with your data.</p>
        <h2 className="text-lg font-semibold text-neutral-950 pt-2">What we collect</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>Your sign-in email and a profile (display name, tagline, optional photo, optional social handles).</li>
          <li>Voice recordings you make in the app.</li>
          <li>The extracted structured info from those recordings (names, companies, channels, recap notes).</li>
          <li>Basic sign-in metadata (IP address and user-agent, kept by the auth system for session security).</li>
        </ul>
        <h2 className="text-lg font-semibold text-neutral-950 pt-2">What we do with it</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>Send the audio to Cloudflare Workers AI (Whisper) for transcription.</li>
          <li>Send the transcript to Google Gemini for structured extraction.</li>
          <li>Store the structured info in our database (Neon Postgres) so you can browse it.</li>
          <li>Send sign-in codes to your inbox via Resend.</li>
        </ul>
        <p>Audio is processed and stored. We don&apos;t share it with anyone. We don&apos;t use it to train any model.</p>
        <h2 className="text-lg font-semibold text-neutral-950 pt-2">What you can do</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>View and edit everything from your profile and connection pages.</li>
          <li>Delete your entire account (profile + connections + recordings) from the profile page — instant and permanent.</li>
          <li>Sign out from any device — your session ends, your data stays.</li>
        </ul>
        <h2 className="text-lg font-semibold text-neutral-950 pt-2">Where the data sits</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Cloudflare R2</strong> — audio + card images, private to your account.</li>
          <li><strong>Neon Postgres</strong> — your profile, contacts, and meeting recaps.</li>
          <li><strong>Vercel</strong> — hosting, function execution.</li>
          <li><strong>Resend</strong> — sign-in email delivery.</li>
          <li><strong>Cloudflare Workers AI</strong> — transcription only; not used for training.</li>
          <li><strong>Google Gemini</strong> — extraction only; not used for training.</li>
        </ul>
        <h2 className="text-lg font-semibold text-neutral-950 pt-2">Retention</h2>
        <p>Your data stays until you delete your account. Then it&apos;s gone — from our database immediately, from R2 within an hour.</p>
        <h2 className="text-lg font-semibold text-neutral-950 pt-2">Questions</h2>
        <p>Email <a href="mailto:tim.nan.91@gmail.com" className="text-brand underline">tim.nan.91@gmail.com</a>.</p>
        <p className="text-sm text-neutral-500 pt-6">Last updated: June 18, 2026.</p>
      </article>
    </main>
  );
}
