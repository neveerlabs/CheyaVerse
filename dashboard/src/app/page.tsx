import Link from "next/link";
import { Send, Bot } from "lucide-react";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

export default function LandingPage() {
  const bot = config.botUsername;
  const botUrl = bot ? `https://t.me/${bot}` : "#";

  return (
    <main className="mx-auto max-w-[600px] px-5 min-h-screen flex flex-col items-center justify-center py-10">
      <div className="w-20 h-20 rounded-2xl overflow-hidden mb-5 shadow-[0_8px_24px_-8px_rgba(0,0,0,.3)]">
        <img
          src="icon.png"
          alt="CheyaVerse"
          draggable={false}
          className="w-full h-full object-cover"
        />
      </div>
      <h1 className="text-[26px] font-bold tracking-[-.02em] text-ink mb-2 text-center">
        CheyaVerse
      </h1>
      <p className="text-[14px] text-ink-soft text-center mb-8 max-w-[340px] leading-relaxed">
        Personal webapp bot. Buka bot di Telegram untuk mengakses dashboard personalmu.
      </p>
      <Link
        href={botUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-ink text-white text-[14px] font-semibold hover:bg-accent-hover transition-all active:scale-[.97]"
      >
        <Send size={16} /> {bot ? `@${bot}` : "Buka Bot"}
      </Link>
      <p className="text-[12px] text-ink-mute mt-6 text-center max-w-[320px] leading-relaxed">
        Kirim{" "}
        <code className="font-mono bg-[#fafafa] border border-line px-1.5 py-0.5 rounded text-ink">
          /web
        </code>{" "}
        ke bot untuk mendapatkan URL dashboard personalmu.
      </p>
    </main>
  );
}