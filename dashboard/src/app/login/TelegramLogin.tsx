"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

type TelegramAuthData = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
};

declare global {
  interface Window {
    onTelegramAuth?: (user: TelegramAuthData) => void;
  }
}

export function TelegramLogin({ botUsername }: { botUsername: string }) {
  const searchParams = useSearchParams();
  const requestedNext = searchParams.get("next") ?? "";
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  useEffect(() => {
    if (!botUsername) return;
    window.onTelegramAuth = async (user) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      setError("");
      try {
        const response = await fetch("/api/auth/telegram", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(user),
          cache: "no-store",
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || result?.ok !== true) {
          throw new Error("Verifikasi Telegram gagal. Silakan coba lagi.");
        }

        const requestedUrl = new URL(requestedNext, window.location.origin);
        const isAccountPath =
          requestedNext.startsWith(`/${result.uid}/`) ||
          requestedNext === `/${result.uid}`;
        const isBlockPath =
          requestedUrl.origin === window.location.origin &&
          requestedUrl.pathname === "/security/block" &&
          requestedUrl.searchParams.get("uid") === String(result.uid) &&
          /^\d{10}$/.test(requestedUrl.searchParams.get("did") ?? "");
        const safeNext = isAccountPath
          ? requestedUrl.pathname + requestedUrl.search
          : isBlockPath
            ? requestedUrl.pathname + requestedUrl.search
            : `/${result.uid}`;
        window.location.assign(safeNext);
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Login gagal. Silakan coba lagi.",
        );
        busyRef.current = false;
        setBusy(false);
      }
    };

    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.dataset.telegramLogin = botUsername.replace(/^@/, "");
    script.dataset.size = "large";
    script.dataset.radius = "12";
    script.dataset.requestAccess = "write";
    script.dataset.onauth = `onTelegramAuth(user)`;
    script.dataset.userpic = "false";
    const container = document.getElementById("telegram-login-widget");
    container?.appendChild(script);

    return () => {
      script.remove();
      delete window.onTelegramAuth;
    };
  }, [botUsername, requestedNext]);

  return (
    <div className="w-full">
      <div className="flex justify-center min-h-11" id="telegram-login-widget" />
      {busy && (
        <p className="mt-3 text-center text-[13px] text-ink-soft">
          Memverifikasi akun Telegram…
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-center text-[13px] text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
