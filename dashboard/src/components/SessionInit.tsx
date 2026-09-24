"use client";

import { useEffect, useRef } from "react";

export function SessionInit({ uid }: { uid: string }) {
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;

    const nav = navigator as Navigator & {
      hardwareConcurrency?: number;
      deviceMemory?: number;
    };

    const payload = {
      uid: Number(uid),
      ua: typeof navigator !== "undefined" ? navigator.userAgent ?? "" : "",
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
    }).catch(() => {});
  }, [uid]);

  return null;
}
