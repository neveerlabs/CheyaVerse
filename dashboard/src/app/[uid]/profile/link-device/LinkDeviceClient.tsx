"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import Image from "next/image";
import { ArrowLeft, Check, Copy, Link2, QrCode, ShieldCheck } from "lucide-react";
import styles from "./LinkDeviceClient.module.css";

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
            ? "Sesi berakhir. Silakan masuk kembali."
            : "Undangan perangkat tidak dapat dibuat. Silakan coba kembali.",
        );
      }
      setInvite({ token: result.token, expiresAt: result.expiresAt });
      setRemaining(Math.max(0, Math.ceil((result.expiresAt - Date.now()) / 1000)));
      setCopied(false);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Undangan perangkat tidak dapat dibuat. Silakan coba kembali.",
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
    } catch {
      setError("Tautan tidak dapat disalin. Periksa izin akses papan klip.");
    }
  }

  return (
    <section className={`${styles.screen} animate-fade-up`}>
      <div className={styles.page}>
        <header className={styles.topbar}>
          <Link href={`/${uid}/profile`} className={styles.back}>
            <ArrowLeft size={18} strokeWidth={2} />
            <span>Back</span>
          </Link>
          <span className={styles.secure}>
            <ShieldCheck size={15} />
            Proxy connection
          </span>
        </header>

        <main className={styles.layout}>
          <section className={styles.intro}>
            <p className={styles.eyebrow}>NEW DEVICE</p>
            <h1>Connect a device</h1>
            <p className={styles.description}>
              Tambahkan perangkat dengan memindai kode QR atau membuka tautan
              undangan sekali pakai.
            </p>

            <div className={styles.methods} aria-label="Choose a connection method">
              <button
                type="button"
                onClick={() => setMethod("qr")}
                aria-pressed={method === "qr"}
                className={`${styles.method} ${method === "qr" ? styles.methodActive : ""}`}
              >
                <span className={styles.methodIcon}><QrCode size={20} /></span>
                <span className={styles.methodCopy}>
                  <span className={styles.methodTitle}>Scan QR code</span>
                  <span className={styles.methodDescription}>Gunakan kamera pada perangkat baru.</span>
                </span>
                <span className={styles.methodAction} aria-hidden>›</span>
              </button>
              <button
                type="button"
                onClick={() => setMethod("link")}
                aria-pressed={method === "link"}
                className={`${styles.method} ${method === "link" ? styles.methodActive : ""}`}
              >
                <span className={styles.methodIcon}><Link2 size={20} /></span>
                <span className={styles.methodCopy}>
                  <span className={styles.methodTitle}>Copy invite link</span>
                  <span className={styles.methodDescription}>Buka tautan pada perangkat baru.</span>
                </span>
                <span className={styles.methodAction} aria-hidden>›</span>
              </button>
            </div>

            <div className={styles.securityNote}>
              <ShieldCheck size={17} />
              <span>Jangan bagikan tautan undangan kepada siapa pun.</span>
            </div>
          </section>

          <section className={styles.connection} aria-live="polite">
            {error && <div role="alert" className={styles.error}>{error}</div>}

            {!method && (
              <div className={styles.emptyState}>
                <span className={styles.emptyIcon}><QrCode size={28} strokeWidth={1.6} /></span>
                <h2>Choose a method to continue</h2>
                <p>Tautan undangan akan ditampilkan di sini.</p>
              </div>
            )}

            {method && (
              <>
                {invite ? (
                  <>
                    <div className={styles.inviteStatus}>
                      <div>
                        <p className={styles.statusLabel}>Invite active</p>
                        <p className={styles.statusTime}>{remaining} seconds left</p>
                      </div>
                      <span
                        className={styles.progress}
                        role="progressbar"
                        aria-label="Invite time remaining"
                        aria-valuemin={0}
                        aria-valuemax={60}
                        aria-valuenow={remaining}
                      >
                        <span style={{ width: `${(remaining / 60) * 100}%` }} />
                      </span>
                    </div>

                    {method === "qr" ? (
                      <div className={styles.qrStage}>
                        {qr && (
                          <svg
                            viewBox={`0 0 ${qr.modules.size + 8} ${qr.modules.size + 8}`}
                            role="img"
                            aria-label="QR code to link a device"
                            className={styles.qr}
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
                                  r={qr.modules.size * 0.09}
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
                                    (qr.modules.size * 0.1) ** 2;
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
                            <image
                              href="/assets/cheyaverse.png"
                              x={(qr.modules.size + 8) / 2 - qr.modules.size * 0.09}
                              y={(qr.modules.size + 8) / 2 - qr.modules.size * 0.09}
                              width={qr.modules.size * 0.18}
                              height={qr.modules.size * 0.18}
                              preserveAspectRatio="xMidYMid slice"
                              clipPath="url(#cheyaQrLogoClip)"
                            />
                          </svg>
                        )}
                        <p className={styles.qrHint}>
                          Buka kamera pada perangkat yang akan ditautkan, lalu scan QR code ini.
                        </p>
                      </div>
                    ) : (
                      <div className={styles.linkPanel}>
                        <label htmlFor="device-invite-link">Invite link</label>
                        <input
                          id="device-invite-link"
                          readOnly
                          value={inviteUrl}
                          className={styles.inviteInput}
                        />
                        <button
                          type="button"
                          onClick={() => void copyInvite()}
                          className={styles.copyButton}
                        >
                          {copied ? <Check size={18} /> : <Copy size={18} />}
                          {copied ? "Copied" : "Copy link"}
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <div className={styles.loading}>
                    {error ? "Tautan undangan belum tersedia." : "Creating invite link…"}
                  </div>
                )}

                {error && (
                  <button
                    type="button"
                    onClick={() => void refreshInvite()}
                    className={styles.retryButton}
                  >
                    Try again
                  </button>
                )}
              </>
            )}

            {method && (
              <p className={styles.expiryNote}>
                Tautan undangan hanya dapat digunakan satu kali dan diperbarui setiap 60 detik.
              </p>
            )}
          </section>
        </main>
      </div>
    </section>
  );
}
