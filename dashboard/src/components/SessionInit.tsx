"use client";

import { useEffect, useRef } from "react";

const BLOCK_KEY = "cheya_blocked";
const BLOCKED_PATH = "/blocked";

function markBlocked() {
  try {
    window.localStorage.setItem(BLOCK_KEY, "1");
  } catch {}
  if (window.location.pathname !== BLOCKED_PATH) {
    window.location.replace(BLOCKED_PATH);
  }
}

export function SessionInit({ uid }: { uid: string }) {
  const sent = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (window.localStorage.getItem(BLOCK_KEY) === "1") {
      if (window.location.pathname !== BLOCKED_PATH) {
        window.location.replace(BLOCKED_PATH);
      }
      return;
    }

    if (sent.current) return;
    sent.current = true;

    const nav = navigator as Navigator & {
      hardwareConcurrency?: number;
      deviceMemory?: number;
    };

    const payload = {
      uid: Number(uid),
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
          markBlocked();
          return;
        }
        const j = await res.json().catch(() => ({}));
        if (j?.error === "blocked") {
          markBlocked();
        }
      })
      .catch(() => {});
  }, [uid]);

  return null;
}
