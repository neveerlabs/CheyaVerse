"use client";

import { useCallback, useEffect, useState } from "react";
import { Suspense } from "react";
import { LoginApproval } from "./LoginApproval";

const DEVICE_ID_KEY = "cheya_device_id";

export function LoginPageClient({
  botUsername,
}: {
  botUsername: string | null;
}) {
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");

  const restoreSession = useCallback(async () => {
    setChecking(true);
    setError("");
    try {
      let deviceId: string | null = null;
      try {
        deviceId = window.localStorage.getItem(DEVICE_ID_KEY);
      } catch (cause) {
        throw new Error("Penyimpanan perangkat tidak dapat dibaca.");
      }

      const response = await fetch("/api/session/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId }),
        cache: "no-store",
      });
      const result = (await response.json()) as {
        ok?: boolean;
        authenticated?: boolean;
        uid?: number;
        deviceId?: string;
        localDeviceIdMatched?: boolean;
        error?: string;
      };
      if (!response.ok || !result.ok) {
        throw new Error(
          result.error === "session_verification_unavailable"
            ? "Database sedang tidak dapat dijangkau. Sesi perangkat tidak dihapus; periksa koneksi lalu coba lagi."
            : "Sesi perangkat tidak dapat diperiksa. Silakan coba kembali.",
        );
      }
      if (
        typeof result.deviceId === "string" &&
        /^\d{10}$/.test(result.deviceId) &&
        result.localDeviceIdMatched !== true
      ) {
        window.localStorage.setItem(DEVICE_ID_KEY, result.deviceId);
      }
      if (
        result.authenticated &&
        Number.isSafeInteger(result.uid) &&
        (result.uid ?? 0) > 0
      ) {
        window.location.replace(`/${result.uid}`);
        return;
      }
      setReady(true);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Sesi perangkat tidak dapat diperiksa. Silakan coba kembali.",
      );
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void restoreSession();
  }, [restoreSession]);

  return (
    <main className="mx-auto flex min-h-screen max-w-[600px] items-center justify-center px-5 py-10">
      <section className="w-full max-w-[400px] rounded-3xl border border-line bg-white p-7 text-center shadow-[0_16px_60px_-36px_rgba(0,0,0,.25)]">
        <h1 className="mb-2 text-[22px] font-bold tracking-[-.02em] text-ink">
          Sign in
        </h1>
        <p className="mb-7 text-[13.5px] leading-relaxed text-ink-soft">
          Masuk menggunakan akun Telegram untuk membuka dashboard CheyaVerse.
          Akun Telegram menjadi identitas akun web Anda.
        </p>
        {checking ? (
          <div role="status" className="min-h-11 text-[13px] text-ink-mute">
            Checking device session…
          </div>
        ) : ready ? (
          botUsername ? (
            <Suspense
              fallback={
                <div className="min-h-11 text-[13px] text-ink-mute">
                  Loading Telegram sign-in…
                </div>
              }
            >
              <LoginApproval botUsername={botUsername} />
            </Suspense>
          ) : (
            <p role="alert" className="text-[13px] text-danger">
              BOT_USERNAME belum dikonfigurasi.
            </p>
          )
        ) : error ? (
          <div className="space-y-3" role="alert">
            <p className="text-[13px] text-danger">{error}</p>
            <button
              type="button"
              onClick={() => void restoreSession()}
              className="w-full rounded-xl bg-ink px-4 py-3 text-[13px] font-semibold text-white"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => setReady(true)}
              className="text-[12px] font-medium text-ink-soft underline"
            >
              Continue with Telegram
            </button>
          </div>
        ) : null}
        <p className="mt-6 text-[11.5px] leading-relaxed text-ink-mute">
          Persetujuan dilakukan langsung lewat bot CheyaVerse. Jangan bagikan
          link permintaan login ini kepada siapa pun.
        </p>
      </section>
    </main>
  );
}
