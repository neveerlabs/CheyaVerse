"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import Image from "next/image";
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
  const finderOrigins = useMemo(() => {
    if (!qr) return [];
    const end = qr.modules.size - 7;
    return [
      { x: 0, y: 0 },
      { x: end, y: 0 },
      { x: 0, y: end },
    ];
  }, [qr]);

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
        className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/80 px-4 py-2.5 text-[13px] font-semibold text-ink-soft shadow-sm backdrop-blur-xl transition-colors hover:bg-white"
      >
        <ArrowLeft size={16} />
        Kembali
      </Link>
      <div className="overflow-hidden rounded-[32px] border border-white/80 bg-white/90 shadow-[0_24px_80px_-42px_rgba(15,23,42,.32)] backdrop-blur-xl">
        <div className="relative overflow-hidden bg-gradient-to-br from-[#171a31] via-[#343660] to-[#6775a9] px-6 pb-8 pt-7 text-white sm:px-8 sm:pb-9">
          <div aria-hidden className="absolute -right-12 -top-20 h-56 w-56 rounded-full bg-[#a9b7ff]/20 blur-3xl" />
          <div aria-hidden className="absolute -bottom-24 right-20 h-48 w-48 rounded-full bg-[#e1bbff]/20 blur-3xl" />
          <div className="relative mb-5 flex h-12 w-12 items-center justify-center rounded-[18px] bg-white/15 shadow-inner shadow-white/10 backdrop-blur">
            <ShieldCheck size={23} strokeWidth={1.8} />
          </div>
          <h1 className="relative text-[24px] font-bold tracking-[-.035em]">Link a device</h1>
          <p className="relative mt-2 max-w-sm text-[13px] leading-relaxed text-white/75">
            Hubungkan perangkat baru dengan aman lewat QR atau link satu kali.
          </p>
        </div>

        <div className="p-4 sm:p-7">
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
            <button
              type="button"
              onClick={() => setMethod("qr")}
              aria-pressed={method === "qr"}
              className={`rounded-[22px] border p-3.5 text-left transition-all sm:p-4 ${
                method === "qr"
                  ? "border-[#8a91c5] bg-[#f5f5ff] shadow-[0_6px_20px_-14px_rgba(61,67,130,.55)]"
                  : "border-[#e9eaf0] bg-white hover:border-[#d5d7e4] hover:bg-[#fafaff]"
              }`}
            >
              <span className={`mb-3 flex h-10 w-10 items-center justify-center rounded-[14px] ${method === "qr" ? "bg-[#e6e7ff] text-[#515a9d]" : "bg-[#f2f3f7] text-ink-soft"}`}>
                <QrCode size={20} />
              </span>
              <span className="block text-[13px] font-semibold text-ink">Scan QR code</span>
              <span className="mt-1 block text-[10.5px] leading-snug text-ink-mute sm:text-[11px]">Gunakan kamera perangkat</span>
            </button>
            <button
              type="button"
              onClick={() => setMethod("link")}
              aria-pressed={method === "link"}
              className={`rounded-[22px] border p-3.5 text-left transition-all sm:p-4 ${
                method === "link"
                  ? "border-[#8a91c5] bg-[#f5f5ff] shadow-[0_6px_20px_-14px_rgba(61,67,130,.55)]"
                  : "border-[#e9eaf0] bg-white hover:border-[#d5d7e4] hover:bg-[#fafaff]"
              }`}
            >
              <span className={`mb-3 flex h-10 w-10 items-center justify-center rounded-[14px] ${method === "link" ? "bg-[#e6e7ff] text-[#515a9d]" : "bg-[#f2f3f7] text-ink-soft"}`}>
                <Link2 size={20} />
              </span>
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
            <div className="mt-4 rounded-[26px] border border-[#ebecf2] bg-gradient-to-b from-[#f8f8fc] to-[#f5f6fa] p-3.5 sm:mt-5 sm:p-5">
              {invite ? (
                <>
                  <div className="mb-4 flex items-center justify-between gap-3 px-1 pt-1">
                    <p className="text-[12px] font-medium text-ink-soft">
                      Link aktif{" "}
                      <span className="font-bold tabular-nums text-[#535c9b]">{remaining} detik</span>
                    </p>
                    <span className="h-1.5 w-20 overflow-hidden rounded-full bg-[#e4e5ed] sm:w-24">
                      <span
                        className="block h-full rounded-full bg-gradient-to-r from-[#727ec4] to-[#b289c9] transition-[width]"
                        style={{ width: `${(remaining / 60) * 100}%` }}
                      />
                    </span>
                  </div>
                  {method === "qr" ? (
                    <div className="flex min-h-[300px] flex-col items-center justify-center rounded-[22px] bg-white px-3 py-5 shadow-[0_8px_28px_-22px_rgba(36,41,75,.35)] sm:p-5">
                      {qr && (
                        <svg
                          viewBox={`0 0 ${qr.modules.size + 8} ${qr.modules.size + 8}`}
                          role="img"
                          aria-label="QR code untuk menautkan perangkat"
                          className="h-auto w-full max-w-[280px] overflow-visible drop-shadow-[0_8px_16px_rgba(78,81,139,.12)]"
                        >
                          <defs>
                            <linearGradient id="cheyaQrGradient" x1="0" y1="0" x2="1" y2="1">
                              <stop offset="0%" stopColor="#535d9f" />
                              <stop offset="55%" stopColor="#7273ad" />
                              <stop offset="100%" stopColor="#a46d9b" />
                            </linearGradient>
                            <clipPath id="cheyaQrLogoClip">
                              <circle
                                cx={(qr.modules.size + 8) / 2}
                                cy={(qr.modules.size + 8) / 2}
                                r={qr.modules.size * 0.075}
                              />
                            </clipPath>
                          </defs>
                          <rect
                            width={qr.modules.size + 8}
                            height={qr.modules.size + 8}
                            rx="5"
                            fill="#fff"
                          />
                          {Array.from({ length: qr.modules.size }, (_, row) =>
                            Array.from({ length: qr.modules.size }, (_, column) =>
                              (() => {
                                const inFinder = finderOrigins.some(
                                  ({ x, y }) =>
                                    column >= x - 1 &&
                                    column <= x + 7 &&
                                    row >= y - 1 &&
                                    row <= y + 7,
                                );
                                const center = (qr.modules.size - 1) / 2;
                                const inLogoQuietZone =
                                  (column - center) ** 2 + (row - center) ** 2 <
                                  (qr.modules.size * 0.085) ** 2;
                                return qr.modules.get(row, column) === 1 &&
                                  !inFinder &&
                                  !inLogoQuietZone ? (
                                  <circle
                                    key={`${row}-${column}`}
                                    cx={column + 4.5}
                                    cy={row + 4.5}
                                    r=".36"
                                    fill="url(#cheyaQrGradient)"
                                  />
                                ) : null;
                              })(),
                            ),
                          )}
                          {finderOrigins.map(({ x, y }) => (
                            <g
                              key={`finder-${x}-${y}`}
                              transform={`translate(${x + 4} ${y + 4})`}
                            >
                              <rect width="7" height="7" rx="1.8" fill="url(#cheyaQrGradient)" />
                              <rect x="1" y="1" width="5" height="5" rx="1.25" fill="white" />
                              <rect x="2" y="2" width="3" height="3" rx=".9" fill="url(#cheyaQrGradient)" />
                            </g>
                          ))}
                          <circle
                            cx={(qr.modules.size + 8) / 2}
                            cy={(qr.modules.size + 8) / 2}
                            r={qr.modules.size * 0.088}
                            fill="white"
                          />
                          <image
                            href="/assets/cheyaverse.jpg"
                            x={(qr.modules.size + 8) / 2 - qr.modules.size * 0.075}
                            y={(qr.modules.size + 8) / 2 - qr.modules.size * 0.075}
                            width={qr.modules.size * 0.15}
                            height={qr.modules.size * 0.15}
                            preserveAspectRatio="xMidYMid slice"
                            clipPath="url(#cheyaQrLogoClip)"
                          />
                        </svg>
                      )}
                      <p className="mt-3 text-center text-[11px] text-ink-mute">
                        Scan dengan kamera perangkat yang ingin ditautkan.
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-[22px] bg-white p-4 shadow-[0_8px_28px_-22px_rgba(36,41,75,.35)] sm:p-5">
                      <label htmlFor="device-invite-link" className="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-ink-mute">
                        Invitation link
                      </label>
                      <input
                        id="device-invite-link"
                        readOnly
                        value={inviteUrl}
                        className="w-full rounded-2xl border border-[#e6e7ed] bg-[#fafafd] px-3.5 py-3.5 text-[12px] text-ink outline-none focus:border-[#989dc9]"
                      />
                      <button
                        type="button"
                        onClick={() => void copyInvite()}
                        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#535d9f] to-[#786b9f] px-4 py-3.5 text-[13px] font-semibold text-white shadow-[0_8px_18px_-12px_rgba(72,78,143,.7)] transition-all hover:brightness-105 active:scale-[.99]"
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
          Undangan hanya bisa dipakai satu kali dan diperbarui setiap 60 detik.
          Pastikan QR atau link hanya dilihat perangkat yang ingin Anda tautkan.
          </p>
        </div>
      </div>
    </section>
  );
}
