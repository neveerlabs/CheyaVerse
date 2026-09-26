"use client";

import { useEffect, useState } from "react";
import { ShieldAlert, Copy, Check } from "lucide-react";

const DEVICE_ID_KEY = "cheya_device_id";

export default function BlockedPage() {
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const v = window.localStorage.getItem(DEVICE_ID_KEY);
      if (v) setDeviceId(v);
    } catch {}
  }, []);

  async function copyId() {
    if (!deviceId) return;
    try {
      if (navigator.clipboard?.writeText && window.isSecureContext) {
        await navigator.clipboard.writeText(deviceId);
      } else {
        const ta = document.createElement("textarea");
        ta.value = deviceId;
        ta.style.position = "fixed";
        ta.style.top = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }

  return (
    <main className="mx-auto max-w-[600px] px-5 min-h-screen flex flex-col items-center justify-center py-10">
      <div className="w-20 h-20 rounded-full bg-[#fff0f0] flex items-center justify-center mb-5">
        <ShieldAlert size={32} className="text-danger" strokeWidth={2} />
      </div>
      <h1 className="text-[22px] font-bold tracking-[-.02em] text-ink mb-2 text-center">
        Perangkat Diblokir
      </h1>
      <p className="text-[13.5px] text-ink-soft text-center max-w-[380px] leading-relaxed">
        Perangkat ini telah diblokir dari layanan CheyaVerse. Akses ke seluruh
        halaman dashboard akan ditolak secara otomatis dari perangkat ini.
      </p>

      {deviceId && (
        <button
          type="button"
          onClick={copyId}
          className="mt-6 w-full max-w-[320px] rounded-2xl bg-[#f5f5f5] sm:hover:bg-[#ededed] active:scale-[.99] px-4 py-3.5 text-center transition-all"
        >
          <p className="text-[13px] text-ink-soft leading-none break-all">
            <span className="font-medium">DeviceID: </span>
            <span className="font-semibold text-ink tabular-nums tracking-[-.005em]">
              {deviceId}
            </span>
          </p>
          <p className="text-[10.5px] text-ink-mute mt-2 leading-none inline-flex items-center gap-1">
            {copied ? (
              <>
                <Check size={11} strokeWidth={2.6} /> Tersalin
              </>
            ) : (
              <>
                <Copy size={11} strokeWidth={2.2} /> Tap untuk menyalin
              </>
            )}
          </p>
        </button>
      )}

      <p className="text-[12px] text-ink-mute text-center max-w-[340px] leading-relaxed mt-6">
        Jika Anda merasa ini sebuah kesalahan, hubungi pemilik akun Telegram
        terkait untuk membuka blokir.
      </p>
    </main>
  );
}
