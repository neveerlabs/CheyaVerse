"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useRealtime } from "@/lib/use-realtime";

const DEVICE_ID_KEY = "cheya_device_id";
const BLOCKED_PATH = "/blocked";
const CHECK_INTERVAL_MS = 3000;

function readDeviceId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(DEVICE_ID_KEY);
  } catch {
    return null;
  }
}

function redirectToBlocked() {
  if (typeof window === "undefined") return;
  if (window.location.pathname === BLOCKED_PATH) return;
  window.location.replace(BLOCKED_PATH);
}

export function SessionInit({ uid }: { uid: string }) {
  const router = useRouter();
  const sent = useRef(false);
  const blockedRef = useRef(false);
  const checkRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sent.current) return;
    sent.current = true;

    const nav = navigator as Navigator & {
      hardwareConcurrency?: number;
      deviceMemory?: number;
    };

    const payload = {
      uid: Number(uid),
      deviceId: readDeviceId(),
      ua: navigator.userAgent ?? "",
      cpuCores:
        typeof nav.hardwareConcurrency === "number"
          ? nav.hardwareConcurrency
          : null,
      ramGb:
        typeof nav.deviceMemory === "number" ? nav.deviceMemory : null,
    };

    fetch("/api/session/init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    })
      .then(async (res) => {
        if (res.status === 403) {
          blockedRef.current = true;
          redirectToBlocked();
          return;
        }
        const j = await res.json().catch(() => ({}));
        if (j?.ok && typeof j?.deviceId === "string") {
          try {
            window.localStorage.setItem(DEVICE_ID_KEY, j.deviceId);
          } catch {}
        }
      })
      .catch(() => {});
  }, [uid]);

  useRealtime(uid, (event) => {
    if (blockedRef.current) return;
    if (event.type !== "session:blocked") return;
    const myId = readDeviceId();
    const blockedId = typeof event.deviceId === "string" ? event.deviceId : "";
    if (!myId || !blockedId) return;
    if (myId !== blockedId) return;
    blockedRef.current = true;
    redirectToBlocked();
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    let cancelled = false;

    const checkNow = async () => {
      if (blockedRef.current) return;
      if (window.location.pathname === BLOCKED_PATH) return;
      if (document.visibilityState === "hidden") return;

      const deviceId = readDeviceId();
      if (!deviceId) return;

      try {
        const res = await fetch("/api/session/check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uid: Number(uid), deviceId }),
          cache: "no-store",
        });
        if (cancelled) return;
        const j = await res.json().catch(() => ({}));
        if (j?.blocked === true) {
          blockedRef.current = true;
          redirectToBlocked();
        }
      } catch {}
    };

    checkRef.current = () => {
      void checkNow();
    };

    void checkNow();

    const iv = window.setInterval(checkNow, CHECK_INTERVAL_MS);

    const onVisible = () => {
      if (document.visibilityState === "visible") void checkNow();
    };
    const onFocus = () => void checkNow();
    const onPopState = () => void checkNow();

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    window.addEventListener("popstate", onPopState);

    return () => {
      cancelled = true;
      checkRef.current = null;
      window.clearInterval(iv);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("popstate", onPopState);
    };
  }, [uid]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const onPageShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      if (blockedRef.current) return;
      checkRef.current?.();
      router.refresh();
    };

    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [router]);

  return null;
}
