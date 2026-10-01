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
      try {
        await fetch("/api/presence", {
          method: "POST",
          cache: "no-store",
        });
      } catch {
        return;
      } finally {
        pending = false;
      }
    };

    const sync = () => {
      const isVisible = document.visibilityState === "visible";
      if (isVisible && !active) void heartbeat();
      active = isVisible;
    };

    void heartbeat();
    timer = window.setInterval(() => void heartbeat(), 30_000);
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
