"use client";

import { useEffect, useRef, useState } from "react";
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

function readTimezone(): string | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz || null;
  } catch {
    return null;
  }
}

function getWebGLInfo(): { vendor: string | null; renderer: string | null } {
  try {
    if (typeof document === "undefined") {
      return { vendor: null, renderer: null };
    }
    const canvas = document.createElement("canvas");
    const gl =
      (canvas.getContext("webgl") as WebGLRenderingContext | null) ||
      (canvas.getContext("experimental-webgl") as WebGLRenderingContext | null);
    if (!gl) return { vendor: null, renderer: null };

    type DebugInfoExt = {
      UNMASKED_VENDOR_WEBGL: number;
      UNMASKED_RENDERER_WEBGL: number;
    };

    const dbg = gl.getExtension("WEBGL_debug_renderer_info") as
      | DebugInfoExt
      | null;

    if (dbg) {
      const v = gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL);
      const r = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL);
      return {
        vendor: v ? String(v).slice(0, 128) : null,
        renderer: r ? String(r).slice(0, 128) : null,
      };
    }

    const v = gl.getParameter(gl.VENDOR);
    const r = gl.getParameter(gl.RENDERER);
    return {
      vendor: v ? String(v).slice(0, 128) : null,
      renderer: r ? String(r).slice(0, 128) : null,
    };
  } catch {
    return { vendor: null, renderer: null };
  }
}

function redirectToBlocked() {
  if (typeof window === "undefined") return;
  if (window.location.pathname === BLOCKED_PATH) return;
  window.location.replace(BLOCKED_PATH);
}

export function SessionInit({ uid }: { uid: string }) {
  const router = useRouter();
  const [initError, setInitError] = useState("");
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

    const webgl = getWebGLInfo();

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
      language: navigator.language ?? null,
      timezone: readTimezone(),
      screenW: window.screen?.width ?? null,
      screenH: window.screen?.height ?? null,
      colorDepth: window.screen?.colorDepth ?? null,
      platform: navigator.platform ?? null,
      maxTouch:
        typeof navigator.maxTouchPoints === "number"
          ? navigator.maxTouchPoints
          : null,
      webglVendor: webgl.vendor,
      webglRenderer: webgl.renderer,
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
        const j = await res.json();
        if (!res.ok || !j?.ok || typeof j?.deviceId !== "string") {
          throw new Error(`Device initialization failed (${res.status}).`);
        }
        setInitError("");
        try {
          window.localStorage.setItem(DEVICE_ID_KEY, j.deviceId);
        } catch (error) {
          console.warn("[session] could not persist the device identifier:", error);
        }
        if (j.state === "welcome") {
          router.refresh();
        }
      })
      .catch((error) => {
        console.error("[session] device initialization failed:", error);
        setInitError("Device gagal didaftarkan. Muat ulang halaman untuk mencoba lagi.");
      });
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

      try {
        const res = await fetch("/api/session/check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uid: Number(uid) }),
          cache: "no-store",
        });
        if (cancelled) return;
        if (res.status === 401) {
          window.location.replace("/login");
          return;
        }
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

  if (!initError) return null;
  return (
    <div
      role="alert"
      className="fixed left-4 right-4 top-[calc(12px+env(safe-area-inset-top))] z-[100] mx-auto max-w-[560px] rounded-xl border border-danger/20 bg-white px-4 py-3 text-center text-[13px] text-danger shadow-lg"
    >
      {initError}{" "}
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="font-semibold underline"
      >
        Coba lagi
      </button>
    </div>
  );
}
