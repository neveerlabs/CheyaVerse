"use client";

import { useEffect } from "react";

const BLOCK_KEY = "cheya_blocked";
const BLOCKED_PATH = "/blocked";

export function BlockGuard() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const check = () => {
      if (window.localStorage.getItem(BLOCK_KEY) !== "1") return;
      if (window.location.pathname === BLOCKED_PATH) return;
      window.location.replace(BLOCKED_PATH);
    };

    check();

    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    const onFocus = () => check();
    const onPopState = () => check();

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    window.addEventListener("popstate", onPopState);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

  return null;
}
