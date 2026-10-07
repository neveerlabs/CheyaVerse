import Link from "next/link";
import { Send, LogIn } from "lucide-react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { config } from "@/lib/config";
import {
  getAccountSessionVersion,
  getTelegramUser,
  isDeviceBlacklisted,
} from "@/lib/storage";
import { readSessionToken, SESSION_COOKIE_NAME } from "@/lib/session-token";

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const session = readSessionToken(
    cookies().get(SESSION_COOKIE_NAME)?.value,
  );
  if (session) {
    let sessionVersion: number;
    let account: Awaited<ReturnType<typeof getTelegramUser>>;
    let blocked: boolean;
    try {
      [sessionVersion, account, blocked] = await Promise.all([
        getAccountSessionVersion(session.uid),
        getTelegramUser(session.uid),
        session.deviceId
          ? isDeviceBlacklisted(session.deviceId, session.uid)
          : Promise.resolve(false),
      ]);
    } catch (error) {
      console.error("[landing] session verification is unavailable:", error);
      return <SessionVerificationUnavailable />;
    }
    if (session.sessionVersion !== sessionVersion) redirect("/login");
    if (blocked) redirect("/blocked");
    if (account && account.role !== "deleted") redirect(`/${session.uid}`);
  }

  const bot = config.botUsername;
  const botUrl = bot ? `https://t.me/${bot}` : "#";

  return (
    <main className="mx-auto max-w-[600px] px-5 min-h-screen flex flex-col items-center justify-center py-10">
      <div className="mb-5 h-20 w-20 overflow-hidden rounded-full shadow-[0_8px_24px_-8px_rgba(0,0,0,.3)]">
        <img
          src="/push-icon.png?v=20261008"
          alt="CheyaVerse"
          draggable={false}
          className="w-full h-full object-cover"
        />
      </div>
      <h1 className="text-[26px] font-bold tracking-[-.02em] text-ink mb-2 text-center">
        CheyaVerse
      </h1>
      <p className="text-[14px] text-ink-soft text-center mb-8 max-w-[340px] leading-relaxed">
        Bot personal untuk mengakses dashboard CheyaVerse melalui Telegram.
      </p>
      <div className="flex w-full max-w-[320px] flex-col gap-3">
        <Link
          href="/login"
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-ink px-6 py-3.5 text-[14px] font-semibold text-white transition-all hover:bg-accent-hover active:scale-[.97]"
        >
          <LogIn size={16} /> Sign in
        </Link>
        <Link
          href={botUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-line bg-white px-6 py-3.5 text-[14px] font-semibold text-ink transition-all hover:bg-[#fafafa] active:scale-[.97]"
        >
          <Send size={16} /> {bot ? `Open @${bot}` : "Open bot"}
        </Link>
      </div>
      <p className="text-[12px] text-ink-mute mt-6 text-center max-w-[320px] leading-relaxed">
        Kirim{" "}
        <code className="font-mono bg-[#fafafa] border border-line px-1.5 py-0.5 rounded text-ink">
          /web
        </code>{" "}
        ke bot untuk mendapatkan tautan dashboard personal Anda.
      </p>
    </main>
  );
}

function SessionVerificationUnavailable() {
  return (
    <main className="mx-auto flex min-h-screen max-w-[600px] items-center justify-center px-5">
      <section
        role="alert"
        className="w-full max-w-[440px] rounded-3xl border border-amber-200 bg-white p-7 text-center shadow-sm"
      >
        <h1 className="text-[18px] font-bold text-ink">
          Sesi belum dapat diverifikasi
        </h1>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">
          Database sedang tidak terjangkau. Sesi tidak dihapus; coba muat ulang
          halaman setelah koneksi pulih.
        </p>
        <a
          href="/"
          className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-ink px-4 text-[13px] font-semibold text-white"
        >
          Coba lagi
        </a>
      </section>
    </main>
  );
}