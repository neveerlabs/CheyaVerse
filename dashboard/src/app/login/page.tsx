import { Suspense } from "react";
import { Bot } from "lucide-react";
import { config } from "@/lib/config";
import { TelegramLogin } from "./TelegramLogin";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <main className="mx-auto max-w-[600px] px-5 min-h-screen flex items-center justify-center py-10">
      <section className="w-full max-w-[400px] rounded-3xl border border-line bg-white p-7 text-center shadow-[0_16px_60px_-36px_rgba(0,0,0,.25)]">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#f5f5f5]">
          <Bot size={30} className="text-ink" />
        </div>
        <h1 className="mb-2 text-[22px] font-bold tracking-[-.02em] text-ink">
          Login / Register
        </h1>
        <p className="mb-7 text-[13.5px] leading-relaxed text-ink-soft">
          Masuk dengan akun Telegram untuk membuka dashboard CheyaVerse.
          Akun Telegram menjadi identitas akun web Anda.
        </p>
        {config.botUsername ? (
          <Suspense
            fallback={
              <div className="min-h-11 text-[13px] text-ink-mute">
                Memuat login Telegram…
              </div>
            }
          >
            <TelegramLogin botUsername={config.botUsername} />
          </Suspense>
        ) : (
          <p role="alert" className="text-[13px] text-danger">
            BOT_USERNAME belum dikonfigurasi.
          </p>
        )}
        <p className="mt-6 text-[11.5px] leading-relaxed text-ink-mute">
          Telegram akan memverifikasi identitas akun. CheyaVerse tidak meminta
          kata sandi Telegram Anda.
        </p>
      </section>
    </main>
  );
}
