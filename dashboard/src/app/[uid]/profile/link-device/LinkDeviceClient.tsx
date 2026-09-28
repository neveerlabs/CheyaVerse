"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import { ArrowLeft, Check, Copy, Link2, QrCode, ShieldCheck } from "lucide-react";

type Invite = { token: string; expiresAt: number };
type Method = "qr" | "link";

export function LinkDeviceClient({ uid }: { uid: string }) {
  const [invite, setInvite] = useState<Invite | null>(null);
  const [method, setMethod] = useState<Method | null>(null);
  const [remaining, setRemaining] = useState(60);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const refreshing = useRef(false);

  const refreshInvite = useCallback(async () => {
    if (refreshing.current) return;
    refreshing.current = true;
    setError("");
    try {
      const response = await fetch("/api/device-links", {
        method: "POST",
        cache: "no-store",
      });
      const result = (await response.json()) as {
        ok?: boolean;
        token?: string;
        expiresAt?: number;
      };
      if (!response.ok || !result.ok || !result.token || !result.expiresAt) {
        throw new Error(
          response.status === 401
            ? "Sesi berakhir. Silakan login kembali."
            : "Undangan perangkat gagal dibuat. Coba lagi.",
        );
      }
      setInvite({ token: result.token, expiresAt: result.expiresAt });
      setRemaining(Math.max(0, Math.ceil((result.expiresAt - Date.now()) / 1000)));
      setCopied(false);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Undangan perangkat gagal dibuat. Coba lagi.",
      );
    } finally {
      refreshing.current = false;
    }
  }, []);

  useEffect(() => {
    void refreshInvite();
  }, [refreshInvite]);

  useEffect(() => {
    if (!invite) return;
    const timer = window.setInterval(() => {
      const seconds = Math.max(0, Math.ceil((invite.expiresAt - Date.now()) / 1000));
      setRemaining(seconds);
      if (seconds === 0) {
        setInvite(null);
        void refreshInvite();
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [invite, refreshInvite]);

  const inviteUrl = invite
    ? `${window.location.origin}/device-link/${encodeURIComponent(invite.token)}`
    : "";

  const qr = useMemo(
    () =>
      invite && method === "qr"
        ? QRCode.create(inviteUrl, { errorCorrectionLevel: "H" })
        : null,
    [invite, inviteUrl, method],
  );

  async function copyInvite() {
    if (!inviteUrl) return;
    try {
      if (navigator.clipboard?.writeText && window.isSecureContext) {
        await navigator.clipboard.writeText(inviteUrl);
      } else {
        const input = document.createElement("textarea");
        input.value = inviteUrl;
        input.style.position = "fixed";
        input.style.top = "-9999px";
        document.body.appendChild(input);
        input.select();
        const copied = document.execCommand("copy");
        document.body.removeChild(input);
        if (!copied) throw new Error("Clipboard copy command failed.");
      }
      setCopied(true);
    } catch (cause) {
      console.error("[device-link] could not copy invite URL:", cause);
      setError("Link tidak dapat disalin. Coba izinkan akses clipboard.");
    }
  }

  return (
    <section className="animate-fade-up py-5">
      <Link
        href={`/${uid}/profile`}
        className="mb-6 inline-flex items-center gap-2 rounded-full border border-line bg-white px-3.5 py-2 text-[13px] font-medium text-ink-soft transition-colors hover:bg-[#f7f7f7]"
      >
        <ArrowLeft size={16} />
        Kembali
      </Link>
      <div className="overflow-hidden rounded-[28px] border border-line bg-white shadow-[0_18px_56px_-36px_rgba(15,23,42,.28)]">
        <div className="bg-gradient-to-br from-[#111827] to-[#374151] px-6 py-7 text-white sm:px-8">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
            <ShieldCheck size={24} />
          </div>
          <h1 className="text-[22px] font-bold tracking-tight">Link a device</h1>
          <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-white/70">
            Masuk ke akun ini dari perangkat lain dengan QR code atau link
            undangan sekali pakai.
          </p>
        </div>

        <div className="p-5 sm:p-7">
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setMethod("qr")}
              aria-pressed={method === "qr"}
              className={`rounded-2xl border p-4 text-left transition-colors ${
                method === "qr"
                  ? "border-ink bg-[#f7f7f7]"
                  : "border-line hover:bg-[#fafafa]"
              }`}
            >
              <QrCode size={21} className="mb-3 text-ink" />
              <span className="block text-[13px] font-semibold text-ink">Scan QR code</span>
              <span className="mt-1 block text-[11px] text-ink-mute">Gunakan kamera perangkat</span>
            </button>
            <button
              type="button"
              onClick={() => setMethod("link")}
              aria-pressed={method === "link"}
              className={`rounded-2xl border p-4 text-left transition-colors ${
                method === "link"
                  ? "border-ink bg-[#f7f7f7]"
                  : "border-line hover:bg-[#fafafa]"
              }`}
            >
              <Link2 size={21} className="mb-3 text-ink" />
              <span className="block text-[13px] font-semibold text-ink">Copy invite link</span>
              <span className="mt-1 block text-[11px] text-ink-mute">Buka langsung di perangkat</span>
            </button>
          </div>

          {error && (
            <div role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-[12px] text-danger">
              {error}
            </div>
          )}

          {method && (
            <div className="mt-5 rounded-2xl border border-line bg-[#fbfbfc] p-4 sm:p-5">
              {invite ? (
                <>
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <p className="text-[12px] font-medium text-ink-soft">
                      Berlaku selama{" "}
                      <span className="font-bold tabular-nums text-ink">{remaining}s</span>
                    </p>
                    <span className="h-1.5 w-24 overflow-hidden rounded-full bg-black/5">
                      <span
                        className="block h-full rounded-full bg-ink transition-[width]"
                        style={{ width: `${(remaining / 60) * 100}%` }}
                      />
                    </span>
                  </div>
                  {method === "qr" ? (
                    <div className="flex min-h-[300px] flex-col items-center justify-center rounded-2xl bg-white p-4">
                      {qr && (
                        <svg
                          viewBox={`0 0 ${qr.modules.size + 8} ${qr.modules.size + 8}`}
                          role="img"
                          aria-label="QR code untuk menautkan perangkat"
                          className="h-auto w-full max-w-[280px] rounded-2xl"
                        >
                          <rect width="100%" height="100%" fill="#fff" />
                          {Array.from({ length: qr.modules.size }, (_, row) =>
                            Array.from({ length: qr.modules.size }, (_, column) =>
                              qr.modules.get(row, column) === 1 ? (
                                <rect
                                  key={`${row}-${column}`}
                                  x={column + 4}
                                  y={row + 4}
                                  width="1"
                                  height="1"
                                  rx=".28"
                                  fill="#111827"
                                />
                              ) : null,
                            ),
                          )}
                        </svg>
                      )}
                      <p className="mt-3 text-center text-[11px] text-ink-mute">
                        Scan dengan kamera perangkat yang ingin ditautkan.
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-2xl bg-white p-4">
                      <label htmlFor="device-invite-link" className="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-ink-mute">
                        Invitation link
                      </label>
                      <input
                        id="device-invite-link"
                        readOnly
                        value={inviteUrl}
                        className="w-full rounded-xl border border-line bg-[#fafafa] px-3 py-3 text-[12px] text-ink outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => void copyInvite()}
                        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-ink px-4 py-3 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
                      >
                        {copied ? <Check size={17} /> : <Copy size={17} />}
                        {copied ? "Copied" : "Copy invite link"}
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex min-h-32 items-center justify-center text-[13px] text-ink-mute">
                  {error ? "Undangan belum tersedia." : "Membuat undangan aman…"}
                </div>
              )}
              {error && (
                <button
                  type="button"
                  onClick={() => void refreshInvite()}
                  className="mt-4 w-full rounded-xl border border-line bg-white px-4 py-3 text-[13px] font-semibold text-ink"
                >
                  Coba lagi
                </button>
              )}
            </div>
          )}
          <p className="mt-5 text-center text-[11px] leading-relaxed text-ink-mute">
            Setiap undangan hanya dapat digunakan satu kali dan otomatis
            diperbarui setiap 60 detik. Jangan bagikan QR atau link kepada orang lain.
          </p>
        </div>
      </div>
    </section>
  );
}
