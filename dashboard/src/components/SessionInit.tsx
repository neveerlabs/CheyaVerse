"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useRealtime } from "@/lib/use-realtime";

const DEVICE_ID_KEY = "cheya_device_id";
const BLOCKED_PATH = "/blocked";

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
  const pathname = usePathname();
  const [initError, setInitError] = useState("");
  const [initAttempt, setInitAttempt] = useState(0);
  const blockedRef = useRef(false);
  const checkRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    let retryTimer: number | null = null;

    const nav = navigator as Navigator & {
      hardwareConcurrency?: number;
      deviceMemory?: number;
      userAgentData?: {
        getHighEntropyValues?: (
          hints: string[],
        ) => Promise<{
          architecture?: string;
          bitness?: string;
          model?: string;
          platformVersion?: string;
          uaFullVersion?: string;
        }>;
      };
      connection?: { effectiveType?: string };
    };

    const initialize = async () => {
      const webgl = getWebGLInfo();
      let hints: {
        architecture?: string;
        bitness?: string;
        model?: string;
        platformVersion?: string;
        uaFullVersion?: string;
      } = {};
      try {
        hints =
          (await nav.userAgentData?.getHighEntropyValues?.([
            "architecture",
            "bitness",
            "model",
            "platformVersion",
            "uaFullVersion",
          ])) ?? {};
      } catch {
        // Client hints are optional and may be unavailable in privacy-focused browsers.
      }
      let colorGamut = "srgb";
      try {
        if (window.matchMedia("(color-gamut: p3)").matches) {
          colorGamut = "p3";
        }
      } catch {
        colorGamut = "unknown";
      }
      const orientation =
        window.screen?.orientation?.type ??
        (window.matchMedia("(orientation: portrait)").matches
          ? "portrait"
          : "landscape");
      const payload = {
        uid: Number(uid),
        deviceId: readDeviceId(),
        ua: navigator.userAgent ?? "",
        cpuCores:
          typeof nav.hardwareConcurrency === "number"
            ? nav.hardwareConcurrency
            : null,
        ramGb: typeof nav.deviceMemory === "number" ? nav.deviceMemory : null,
        language: navigator.language ?? null,
        timezone: readTimezone(),
        screenW: window.screen?.width ?? null,
        screenH: window.screen?.height ?? null,
        screenAvailW: window.screen?.availWidth ?? null,
        screenAvailH: window.screen?.availHeight ?? null,
        viewportW: window.innerWidth,
        viewportH: window.innerHeight,
        pixelRatio: window.devicePixelRatio || 1,
        orientation,
        colorGamut,
        networkType: nav.connection?.effectiveType ?? null,
        browserVersion: hints.uaFullVersion ?? null,
        uaArchitecture: hints.architecture ?? null,
        uaPlatformVersion: hints.platformVersion ?? null,
        uaBitness: hints.bitness ?? null,
        uaModel: hints.model ?? null,
        colorDepth: window.screen?.colorDepth ?? null,
        platform: navigator.platform ?? null,
        maxTouch:
          typeof navigator.maxTouchPoints === "number"
            ? navigator.maxTouchPoints
            : null,
        webglVendor: webgl.vendor,
        webglRenderer: webgl.renderer,
      };

      let lastError: Error | null = null;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        if (cancelled) return;
        try {
          const res = await fetch("/api/session/init", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            cache: "no-store",
          });
          if (cancelled) return;
          if (res.status === 403) {
            blockedRef.current = true;
            redirectToBlocked();
            return;
          }
          if (res.status === 401) {
            try {
              window.localStorage.removeItem(DEVICE_ID_KEY);
            } catch {}
            window.location.replace("/login");
            return;
          }
          const j = await res.json().catch(() => null);
          if (!res.ok && res.status < 500 && res.status !== 429) {
            const error = new Error(
              j?.error || `Device initialization failed (${res.status}).`,
            );
            console.error("[session-init] device registration was rejected:", error);
            setInitError(
              "Perangkat tidak dapat didaftarkan. Periksa sesi akun lalu coba lagi.",
            );
            return;
          }
          if (!res.ok || !j?.ok || typeof j?.deviceId !== "string") {
            throw new Error(`Device initialization failed (${res.status}).`);
          }
          if (cancelled) return;
          setInitError("");
          try {
            window.localStorage.setItem(DEVICE_ID_KEY, j.deviceId);
          } catch {}
          if (j.state === "welcome") router.refresh();
          return;
        } catch (cause) {
          lastError =
            cause instanceof Error
              ? cause
              : new Error("Device initialization failed.");
          if (attempt < 1) {
            await new Promise<void>((resolve) => {
              retryTimer = window.setTimeout(resolve, 800);
            });
          }
        }
      }
      if (!cancelled) {
        console.error("[session-init] device registration failed:", lastError);
        setInitError(
          "Perangkat belum terhubung ke server. Periksa koneksi lalu coba lagi.",
        );
      }
    };

    void initialize();
    return () => {
      cancelled = true;
      if (retryTimer !== null) window.clearTimeout(retryTimer);
    };
  }, [initAttempt, router, uid]);

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
    let checkInFlight = false;

    const checkNow = async () => {
      if (checkInFlight) return;
      if (blockedRef.current) return;
      if (window.location.pathname === BLOCKED_PATH) return;
      if (document.visibilityState === "hidden") return;

      checkInFlight = true;
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
        if (!res.ok) return;
        const j = await res.json().catch(() => ({}));
        if (j?.blocked === true) {
          blockedRef.current = true;
          redirectToBlocked();
        }
      } catch {
        return;
      } finally {
        checkInFlight = false;
      }
    };

    checkRef.current = () => {
      void checkNow();
    };

    void checkNow();

    const onVisible = () => {
      if (document.visibilityState === "visible") void checkNow();
    };
    const onFocus = () => void checkNow();

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      checkRef.current = null;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
    };
  }, [pathname, uid]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const onPageShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      if (blockedRef.current) return;
      checkRef.current?.();
    };

    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  if (!initError) return null;
  return (
    <div
      role="alert"
      className="fixed left-4 right-4 top-[calc(12px+env(safe-area-inset-top))] z-[100] mx-auto max-w-[560px] rounded-xl border border-danger/20 bg-white px-4 py-3 text-center text-[13px] text-danger shadow-lg"
    >
      {initError}{" "}
      <button
        type="button"
        onClick={() => {
          setInitError("");
          setInitAttempt((attempt) => attempt + 1);
        }}
        className="font-semibold underline"
      >
        Coba lagi
      </button>
    </div>
  );
}
