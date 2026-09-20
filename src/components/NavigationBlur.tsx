"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export function NavigationBlur() {
  const pathname = usePathname();
  const [active, setActive] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setActive(false);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, [pathname]);

  useEffect(() => {
    if (!active) return;
    timerRef.current = setTimeout(() => setActive(false), 8000);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [active]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      const target = e.target as HTMLElement | null;
      if (!target) return;
      const link = target.closest("a");
      if (!link) return;

      const href = link.getAttribute("href");
      if (!href) return;
      if (link.getAttribute("target") === "_blank") return;
      if (link.hasAttribute("download")) return;
      if (href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      if (href.startsWith("http://") || href.startsWith("https://")) {
        try {
          const u = new URL(href);
          if (u.origin !== window.location.origin) return;
        } catch {
          return;
        }
      }

      const next = href.split("?")[0].split("#")[0];
      if (next === pathname) return;

      setActive(true);
    }

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [pathname]);

  return (
    <>
      <div
        aria-hidden
        className={`fixed inset-0 z-[300] pointer-events-none transition-all duration-300 ease-out ${
          active ? "opacity-100 backdrop-blur-[3px] bg-white/40" : "opacity-0 backdrop-blur-0 bg-white/0"
        }`}
      />
      <div
        aria-hidden
        className={`fixed top-0 left-0 right-0 h-[2px] z-[301] pointer-events-none origin-left bg-ink transition-transform duration-300 ease-out ${
          active ? "scale-x-100" : "scale-x-0"
        }`}
      />
    </>
  );
}