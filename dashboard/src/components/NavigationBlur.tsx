"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export function NavigationBlur() {
  const pathname = usePathname();
  const [active, setActive] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setActive(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setActive(false), 420);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [pathname]);

  useEffect(() => {
    const root = document.documentElement;
    if (active) root.classList.add("nav-loading");
    else root.classList.remove("nav-loading");
    return () => root.classList.remove("nav-loading");
  }, [active]);

  useEffect(() => {
    function isEditable(el: HTMLElement | null): boolean {
      if (!el) return false;
      const tag = el.tagName;
      return (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        el.isContentEditable
      );
    }

    function onContextMenu(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (isEditable(target)) return;
      e.preventDefault();
    }

    function onDragStart(e: DragEvent) {
      const target = e.target as HTMLElement | null;
      if (isEditable(target)) return;
      e.preventDefault();
    }

    function onSelectStart(e: Event) {
      const target = e.target as HTMLElement | null;
      if (isEditable(target)) return;
      const inCopyable = target?.closest?.("[data-copyable]");
      if (inCopyable) return;
      e.preventDefault();
    }

    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("dragstart", onDragStart);
    document.addEventListener("selectstart", onSelectStart);
    return () => {
      document.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("dragstart", onDragStart);
      document.removeEventListener("selectstart", onSelectStart);
    };
  }, []);

  useEffect(() => {
    function onWheel(e: WheelEvent) {
      if (e.ctrlKey) e.preventDefault();
    }
    function onKey(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (
        e.key === "+" ||
        e.key === "-" ||
        e.key === "=" ||
        e.key === "0" ||
        e.key === "_"
      ) {
        e.preventDefault();
      }
    }
    function onGesture(e: Event) {
      e.preventDefault();
    }
    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKey);
    document.addEventListener("gesturestart", onGesture);
    document.addEventListener("gesturechange", onGesture);
    document.addEventListener("gestureend", onGesture);
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("gesturestart", onGesture);
      document.removeEventListener("gesturechange", onGesture);
      document.removeEventListener("gestureend", onGesture);
    };
  }, []);

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
    <div
      aria-hidden
      className={`fixed top-0 left-0 right-0 h-[2px] z-[301] pointer-events-none origin-left bg-ink transition-transform duration-300 ease-out ${
        active ? "scale-x-100" : "scale-x-0"
      }`}
    />
  );
}