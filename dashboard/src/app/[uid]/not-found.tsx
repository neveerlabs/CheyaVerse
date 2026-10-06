import Link from "next/link";
import { ArrowRight, CircleUserRound, Home, RefreshCw } from "lucide-react";

export default function TelegramAccountNotFound() {
  return (
    <main className="relative mx-auto flex min-h-screen max-w-[600px] items-center justify-center overflow-hidden px-5">
      <div aria-hidden className="pointer-events-none absolute -top-24 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-violet-200/40 blur-3xl" />
      <section className="relative w-full max-w-[440px] rounded-[28px] border border-white/80 bg-white/90 px-7 py-8 text-center shadow-[0_24px_80px_-38px_rgba(54,44,85,.28)] backdrop-blur-xl">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-[22px] border border-violet-100 bg-gradient-to-br from-violet-50 to-indigo-50 text-violet-600 shadow-[inset_0_1px_0_white]">
          <CircleUserRound size={29} strokeWidth={1.7} />
        </div>
        <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-violet-100 bg-violet-50/80 px-3 py-1 text-[10px] font-bold uppercase tracking-[.12em] text-violet-700">
          Account unavailable · 404
        </div>
        <h1 className="mb-2 text-[22px] font-bold tracking-[-.03em] text-ink">
          Akun tidak ditemukan
        </h1>
        <p className="mb-6 text-[13px] leading-relaxed text-ink-soft">
          ID akun ini belum terdaftar atau alamat akun tidak cocok. Jika sesi
          sebelumnya masih aktif, coba pulihkan sesi sebelum masuk kembali.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <Link
            href="/login"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-ink px-4 text-[12.5px] font-semibold text-white transition hover:bg-black active:scale-[.98]"
          >
            <RefreshCw size={14} /> Pulihkan / masuk
          </Link>
          <Link
            href="/"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line bg-white px-4 text-[12.5px] font-semibold text-ink-soft transition hover:bg-[#fafafa] active:scale-[.98]"
          >
            <Home size={14} /> Beranda <ArrowRight size={13} />
          </Link>
        </div>
      </section>
    </main>
  );
}
