import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export default function ChatAccountNotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-[600px] flex-col items-center justify-center px-5 text-center">
      <h1 className="mb-2 text-[21px] font-bold text-ink">
        Akun Telegram tidak ditemukan
      </h1>
      <p className="mb-6 text-[13.5px] text-ink-soft">
        Akun ini belum terdaftar di CheyaVerse.
      </p>
      <Link
        href="./.."
        className="inline-flex items-center gap-2 rounded-xl bg-ink px-5 py-3 text-[13.5px] font-semibold text-white"
      >
        <ChevronLeft size={16} /> Kembali ke chat
      </Link>
    </main>
  );
}
