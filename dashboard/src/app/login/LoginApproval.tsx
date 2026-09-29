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
  const [message, setMessage] = useState("Preparing sign-in request…");
  const [error, setError] = useState("");

  useEffect(() => {
    let stopped = false;
    let polling = false;
    let timer: number | undefined;

    async function start() {
      setError("");
      setBotUrl("");
      setMessage("Preparing sign-in request…");
      try {
        const response = await fetch("/api/auth/challenge", {
          method: "POST",
          cache: "no-store",
        });
        const result = (await response.json()) as ChallengeResponse;
        if (!response.ok || !result.challenge || !result.botUrl) {
          throw new Error(
            result.error === "bot_not_configured"
              ? "Bot Telegram belum dikonfigurasi oleh administrator."
              : result.error === "rate_limited"
                ? "Terlalu banyak permintaan masuk. Silakan tunggu satu menit, lalu coba kembali."
              : "Permintaan masuk tidak dapat dibuat. Silakan coba kembali.",
          );
        }
        if (stopped) return;
        setBotUrl(result.botUrl);
        setMessage("Buka bot Telegram dan setujui permintaan masuk.");

        const expiresAt = Date.now() + (result.expiresIn ?? 300) * 1000;
        const poll = async (): Promise<boolean> => {
          if (stopped) return false;
          if (polling) return true;
          if (Date.now() >= expiresAt) {
            setError("Permintaan masuk kedaluwarsa. Buat permintaan baru.");
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
              setError("Permintaan masuk kedaluwarsa. Buat permintaan baru.");
              if (timer !== undefined) window.clearInterval(timer);
              return false;
            }
            if (status.status === "denied") {
              setError("Permintaan masuk ditolak melalui bot Telegram.");
              if (timer !== undefined) window.clearInterval(timer);
              return false;
            }
            if (!statusResponse.ok) {
              throw new Error("Status masuk tidak dapat diperiksa.");
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
                  : "Status masuk tidak dapat diperiksa.",
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
              : "Proses masuk tidak dapat disiapkan. Silakan coba kembali.",
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
          Open bot @{botUsername}
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
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
