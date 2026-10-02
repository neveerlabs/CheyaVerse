"use client";

import { useEffect } from "react";

export function ChatPresence() {
  useEffect(() => {
    let active = false;
    let pending = false;
    let timer = 0;

    const heartbeat = async () => {
      if (document.visibilityState !== "visible" || pending) return;
      pending = true;
      let lastError: Error | null = null;
      try {
        for (let attempt = 0; attempt < 2; attempt += 1) {
          try {
            const response = await fetch("/api/presence", {
              method: "POST",
              cache: "no-store",
            });
            if (response.ok) return;
            lastError = new Error(`Presence heartbeat failed (HTTP ${response.status}).`);
            if (response.status < 500 || attempt > 0) break;
          } catch (cause) {
            lastError =
              cause instanceof Error ? cause : new Error("Presence heartbeat failed.");
            if (attempt > 0) break;
          }
          await new Promise((resolve) => window.setTimeout(resolve, 700));
        }
        console.error("[chat-presence] heartbeat could not reach the server:", lastError);
      } finally {
        pending = false;
      }
    };

    const sync = () => {
      const isVisible = document.visibilityState === "visible";
      if (isVisible && !active) void heartbeat();
      active = isVisible;
    };

    if (document.visibilityState === "visible") void heartbeat();
    timer = window.setInterval(() => void heartbeat(), 20_000);
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("focus", sync);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("focus", sync);
    };
  }, []);
  return null;
}
