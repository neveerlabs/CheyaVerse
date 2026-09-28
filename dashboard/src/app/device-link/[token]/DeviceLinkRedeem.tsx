"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Link2, LoaderCircle, ShieldAlert } from "lucide-react";

export function DeviceLinkRedeem({ token }: { token: string }) {
  const router = useRouter();
  const started = useRef(false);
  const [message, setMessage] = useState("Memverifikasi undangan perangkat…");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      try {
        const response = await fetch("/api/device-links/redeem", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
          cache: "no-store",
        });
        const result = (await response.json()) as {
          ok?: boolean;
          uid?: number;
        };
        if (
          !response.ok ||
          !result.ok ||
          !Number.isSafeInteger(result.uid) ||
          (result.uid ?? 0) <= 0
        ) {
          setFailed(true);
          setMessage(
            response.status === 410
              ? "Undangan sudah kedaluwarsa atau pernah digunakan. Buat undangan baru dari perangkat yang sudah login."
              : "Undangan tidak dapat diverifikasi. Coba buat undangan baru.",
          );
          return;
        }
        window.location.replace(`/${result.uid}`);
      } catch (cause) {
        console.error("[device-link] redemption failed:", cause);
        setFailed(true);
        setMessage("Koneksi gagal. Periksa jaringan lalu coba lagi.");
      }
    })();
  }, [router, token]);

  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-10">
      <section className="w-full max-w-[390px] rounded-[28px] border border-line bg-white p-7 text-center shadow-[0_18px_56px_-36px_rgba(15,23,42,.28)]">
        <div className={`mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl ${failed ? "bg-red-50 text-danger" : "bg-[#f3f4f6] text-ink"}`}>
          {failed ? <ShieldAlert size={25} /> : <Link2 size={25} />}
        </div>
        <h1 className="text-[20px] font-bold text-ink">
          {failed ? "Device link unavailable" : "Linking this device"}
        </h1>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">{message}</p>
        {!failed && (
          <LoaderCircle size={18} className="mx-auto mt-5 animate-spin text-ink-mute" />
        )}
        {failed && (
          <button
            type="button"
            onClick={() => router.replace("/login")}
            className="mt-6 w-full rounded-xl bg-ink px-4 py-3 text-[13px] font-semibold text-white"
          >
            Go to login
          </button>
        )}
      </section>
    </main>
  );
}
