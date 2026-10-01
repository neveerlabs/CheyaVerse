"use client";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center px-5 py-10 text-center">
      <section className="w-full max-w-[420px] rounded-3xl border border-line bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold text-ink">Halaman mengalami gangguan</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          Data tidak dihapus. Muat ulang halaman ini untuk mencoba lagi.
        </p>
        {error.digest && (
          <p className="mt-3 break-all text-xs text-ink-mute">
            Kode: {error.digest}
          </p>
        )}
        <button
          type="button"
          onClick={reset}
          className="mt-5 min-h-11 w-full rounded-xl bg-ink px-4 py-3 text-sm font-medium text-white"
        >
          Coba lagi
        </button>
      </section>
    </main>
  );
}
