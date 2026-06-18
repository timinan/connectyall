import Link from 'next/link';
import { Logo } from '@/components/logo';

export default function Home() {
  return (
    <main className="min-h-[calc(100dvh-3rem)] bg-neutral-50 text-neutral-950 px-6 py-8 flex flex-col">
      <header>
        <Logo />
      </header>
      <div className="flex-1 flex flex-col justify-center max-w-2xl">
        <p className="inline-flex w-fit items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-semibold mb-6">
          ✨ Voice-to-Connection
        </p>
        <h1 className="text-5xl sm:text-6xl font-bold tracking-tight leading-[1.05]">
          Voice notes that <span className="text-brand">connect</span> y&apos;all.
        </h1>
        <p className="mt-6 text-lg text-neutral-700 leading-relaxed">
          Connectyall turns the voice memo you record after meeting someone into a connection you can pass along the same day. Talk it out, we handle the rest. They get your details, you remember theirs.
        </p>
        <Link
          href="/app"
          className="mt-8 inline-flex w-fit items-center px-6 py-3 rounded-full bg-neutral-950 text-white font-semibold hover:bg-neutral-800 transition"
        >
          Open the app →
        </Link>
      </div>
    </main>
  );
}
