"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type ChallengeResponse = {
  challenge?: string;
  botUrl?: string;
  expiresIn?: number;
  error?: string;
};

export function LoginApproval({ botUsername }: { botUsername: string }) {
  const searchParams = useSearchParams();
  const requestedNext = searchParams.get("next") ?? "";
  const [attempt, setAttempt] = useState(0);
  const [botUrl, setBotUrl] = useState("");
  const [message, setMessage] = useState("Menyiapkan permintaan login…");
  const [error, setError] = useState("");

  useEffect(() => {
    let stopped = false;
    let polling = false;
    let timer: number | undefined;

    async function start() {
      setError("");
      setBotUrl("");
      setMessage("Menyiapkan permintaan login…");
      try {
        const response = await fetch("/api/auth/challenge", {
          method: "POST",
          cache: "no-store",
        });
        const result = (await response.json()) as ChallengeResponse;
        if (!response.ok || !result.challenge || !result.botUrl) {
          throw new Error(
            result.error === "bot_not_configured"
              ? "Login bot belum dikonfigurasi oleh administrator."
              : result.error === "rate_limited"
                ? "Terlalu banyak permintaan login. Tunggu satu menit lalu coba lagi."
              : "Permintaan login gagal dibuat. Silakan coba lagi.",
          );
        }
        if (stopped) return;
        setBotUrl(result.botUrl);
        setMessage("Buka bot, lalu setujui permintaan login ini.");

        const expiresAt = Date.now() + (result.expiresIn ?? 300) * 1000;
        const poll = async (): Promise<boolean> => {
          if (stopped) return false;
          if (polling) return true;
          if (Date.now() >= expiresAt) {
            setError("Permintaan login kedaluwarsa. Buat permintaan baru.");
            if (timer !== undefined) window.clearInterval(timer);
            return false;
          }

          polling = true;
          try {
            const statusResponse = await fetch("/api/auth/challenge/status", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ challenge: result.challenge }),
              cache: "no-store",
            });
            const status = (await statusResponse.json()) as {
              status?: string;
              uid?: number;
            };
            if (statusResponse.status === 410 || status.status === "expired") {
              setError("Permintaan login kedaluwarsa. Buat permintaan baru.");
              if (timer !== undefined) window.clearInterval(timer);
              return false;
            }
            if (status.status === "denied") {
              setError("Permintaan login ditolak lewat bot Telegram.");
              if (timer !== undefined) window.clearInterval(timer);
              return false;
            }
            if (!statusResponse.ok) {
              throw new Error("Status login tidak dapat diperiksa.");
            }
            if (
              status.status === "approved" &&
              typeof status.uid === "number" &&
              Number.isSafeInteger(status.uid)
            ) {
              if (timer !== undefined) window.clearInterval(timer);
              const uid = status.uid;
              const requestedUrl = new URL(requestedNext, window.location.origin);
              const isAccountPath =
                requestedNext.startsWith(`/${uid}/`) ||
                requestedNext === `/${uid}`;
              const isBlockPath =
                requestedUrl.origin === window.location.origin &&
                requestedUrl.pathname === "/security/block" &&
                requestedUrl.searchParams.get("uid") === String(uid) &&
                /^\d{10}$/.test(requestedUrl.searchParams.get("did") ?? "");
              const destination = isAccountPath || isBlockPath
                ? requestedUrl.pathname + requestedUrl.search
                : `/${uid}`;
              window.location.assign(destination);
              return false;
            }
            return true;
          } catch (cause) {
            if (!stopped) {
              setError(
                cause instanceof Error
                  ? cause.message
                  : "Status login tidak dapat diperiksa.",
              );
              if (timer !== undefined) window.clearInterval(timer);
            }
            return false;
          } finally {
            polling = false;
          }
        };

        if (await poll() && !stopped) {
          timer = window.setInterval(() => void poll(), 2000);
        }
      } catch (cause) {
        if (!stopped) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Login gagal disiapkan. Silakan coba lagi.",
          );
        }
      }
    }

    void start();
    return () => {
      stopped = true;
      if (timer !== undefined) window.clearInterval(timer);
    };
  }, [attempt, requestedNext]);

  return (
    <div className="w-full">
      {botUrl ? (
        <a
          href={botUrl}
          target="_blank"
          rel="noreferrer"
          className="flex min-h-11 w-full items-center justify-center rounded-xl bg-[#229ED9] px-4 text-[14px] font-semibold text-white transition hover:bg-[#168ac2]"
        >
          Buka bot @{botUsername}
        </a>
      ) : (
        <div className="min-h-11 text-[13px] text-ink-mute">{message}</div>
      )}
      {!error && (
        <p aria-live="polite" className="mt-3 text-center text-[13px] text-ink-soft">
          {message}
        </p>
      )}
      {error && (
        <div className="mt-3">
          <p role="alert" className="text-center text-[13px] text-danger">
            {error}
          </p>
          <button
            type="button"
            onClick={() => setAttempt((value) => value + 1)}
            className="mt-3 w-full rounded-xl border border-line px-4 py-2.5 text-[13px] font-semibold text-ink"
          >
            Coba lagi
          </button>
        </div>
      )}
    </div>
  );
}
