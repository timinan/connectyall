export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8 bg-neutral-950 text-white">
      <div className="max-w-xl text-center space-y-6">
        <h1 className="text-5xl font-bold tracking-tight">Connectyall</h1>
        <p className="text-xl text-neutral-300">
          Voice memo after meeting someone. Forward them a designed card with the recap. Your network builds itself.
        </p>
        <a
          href="/app"
          className="inline-block px-6 py-3 bg-white text-neutral-950 font-semibold rounded-lg hover:bg-neutral-200 transition"
        >
          Open the app →
        </a>
        <p className="text-sm text-neutral-500 pt-8">
          A portfolio project by Tim Nan.
        </p>
      </div>
    </main>
  );
}
