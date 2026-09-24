"use client";

import { useState } from "react";
import { ShieldCheck, ShieldAlert, Loader2 } from "lucide-react";

export function BlockClient({ uid, fp }: { uid: string; fp: string }) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");

  async function onBlock() {
    if (state === "loading" || state === "done") return;
    setState("loading");
    try {
      const res = await fetch("/api/session/blacklist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid, fp }),
      });
      if (res.ok) setState("done");
      else setState("error");
    } catch {
      setState("error");
    }
  }

  const valid = Boolean(uid && fp);

  return (
    <main className="mx-auto max-w-[600px] px-5 min-h-screen flex flex-col items-center justify-center py-10">
      <div className="w-20 h-20 rounded-full bg-[#fff0f0] flex items-center justify-center mb-5">
        {state === "done" ? (
          <ShieldCheck size={32} className="text-success" strokeWidth={2} />
        ) : (
          <ShieldAlert size={32} className="text-danger" strokeWidth={2} />
        )}
      </div>

      <h1 className="text-[22px] font-bold tracking-[-.02em] text-ink mb-2 text-center">
        Blokir Sesi Perangkat
      </h1>

      {!valid && (
        <p className="text-[13.5px] text-ink-soft text-center max-w-[360px] leading-relaxed mb-6">
          Tautan tidak valid atau sudah tidak berlaku.
        </p>
      )}

      {valid && state === "idle" && (
        <>
          <p className="text-[13.5px] text-ink-soft text-center max-w-[380px] leading-relaxed mb-6">
            Perangkat dengan identitas ini akan diblokir dari akun Anda.
            Tindakan ini akan menolak setiap percobaan masuk dari perangkat
            tersebut di masa mendatang.
          </p>
          <div className="w-full max-w-[360px] rounded-2xl bg-white border border-line p-4 mb-6">
            <div className="text-[12px] text-ink-mute mb-1">Fingerprint</div>
            <div className="font-mono text-[12px] text-ink break-all">{fp}</div>
          </div>
          <button
            type="button"
            onClick={onBlock}
            className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-danger text-white text-[14px] font-semibold hover:bg-[#b91c1c] transition-all active:scale-[.97]"
          >
            Blokir IP
          </button>
        </>
      )}

      {state === "loading" && (
        <div className="inline-flex items-center gap-2 text-[13.5px] text-ink-soft">
          <Loader2 size={16} className="animate-spin" /> Memproses…
        </div>
      )}

      {state === "done" && (
        <p className="text-[13.5px] text-ink-soft text-center max-w-[360px] leading-relaxed">
          Perangkat berhasil diblokir. Setiap percobaan masuk dari perangkat ini
          akan ditolak secara otomatis.
        </p>
      )}

      {state === "error" && (
        <p className="text-[13.5px] text-danger text-center max-w-[360px] leading-relaxed">
          Gagal memblokir perangkat. Silakan coba lagi nanti.
        </p>
      )}
    </main>
  );
}
