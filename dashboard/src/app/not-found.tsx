import Link from "next/link";
import { Home } from "lucide-react";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-[600px] px-5 min-h-screen flex items-center justify-center">
      <div className="rounded-3xl bg-white border border-line max-w-[440px] w-full px-8 pt-8 pb-8 text-center animate-fade-up">
        <div className="w-40 h-40 mx-auto mb-2 flex items-center justify-center">
          <img
            src="/assets/model.gif"
            alt="CheyaVerse"
            draggable={false}
            className="protect w-full h-full object-contain"
          />
        </div>
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#fafafa] border border-line text-ink text-[11px] font-bold tracking-[.08em] uppercase mb-3">
          Error 404
        </div>
        <h1 className="text-[22px] font-bold text-ink tracking-[-.02em] mb-2">
          Halaman nggak ketemu
        </h1>
        <p className="text-[13.5px] text-ink-soft leading-relaxed mb-6 font-medium">
          URL mungkin salah ketik, atau file-nya udah expired &amp; terhapus.
        </p>
        <Link
          href="/"
          className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-ink hover:bg-accent-hover text-white text-[13.5px] font-semibold transition-all active:scale-[.97] w-full"
        >
          <Home size={15} strokeWidth={2.4} />
          Beranda
        </Link>
      </div>
    </main>
  );
}