import Link from "next/link";
import { Home } from "lucide-react";

export default function TelegramAccountNotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-[600px] items-center justify-center px-5">
      <section className="w-full max-w-[440px] rounded-3xl border border-line bg-white px-8 py-8 text-center">
        <div className="mb-3 inline-flex items-center rounded-full border border-line bg-[#fafafa] px-3 py-1 text-[11px] font-bold uppercase tracking-[.08em] text-ink">
          Error 404
        </div>
        <h1 className="mb-2 text-[22px] font-bold tracking-[-.02em] text-ink">
          ID Telegram tidak ditemukan
        </h1>
        <p className="mb-6 text-[13.5px] leading-relaxed text-ink-soft">
          Akun Telegram ini belum terdaftar atau tidak dapat diverifikasi.
          Silakan login kembali dengan Telegram.
        </p>
        <Link
          href="/login"
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-ink px-5 py-3 text-[13.5px] font-semibold text-white"
        >
          <Home size={15} /> Login / Register
        </Link>
      </section>
    </main>
  );
}
