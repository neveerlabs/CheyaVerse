"use client";

import { useEffect, useRef, useState } from "react";
import { Image as ImageIcon } from "lucide-react";

const memory = new Map<string, string>();
const pending = new Map<string, Promise<string | null>>();

const DB_NAME = "cheya-vthumbs";
const STORE = "v1";
let dbp: Promise<IDBDatabase | null> | null = null;

function db(): Promise<IDBDatabase | null> {
  if (dbp) return dbp;
  if (typeof window === "undefined" || !("indexedDB" in window)) {
    dbp = Promise.resolve(null);
    return dbp;
  }
  dbp = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        try {
          const d = req.result;
          if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE);
        } catch {}
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbp;
}

async function idbGet(key: string): Promise<string | null> {
  const d = await db();
  if (!d) return null;
  return new Promise((resolve) => {
    try {
      const tx = d.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => {
        resolve(typeof req.result === "string" ? req.result : null);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbSet(key: string, value: string): Promise<void> {
  const d = await db();
  if (!d) return;
  return new Promise((resolve) => {
    try {
      const tx = d.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

function remember(src: string, value: string) {
  if (memory.size >= 400) {
    const first = memory.keys().next().value;
    if (first) memory.delete(first);
  }
  memory.set(src, value);
}

function generate(src: string): Promise<string | null> {
  const hit = memory.get(src);
  if (hit) return Promise.resolve(hit);
  const inflight = pending.get(src);
  if (inflight) return inflight;

  const promise = (async (): Promise<string | null> => {
    const fromIdb = await idbGet(src);
    if (fromIdb) {
      remember(src, fromIdb);
      return fromIdb;
    }

    const result = await new Promise<string | null>((resolve) => {
      const video = document.createElement("video");
      video.crossOrigin = "anonymous";
      video.muted = true;
      video.playsInline = true;
      video.preload = "metadata";

      let done = false;
      const finish = (r: string | null) => {
        if (done) return;
        done = true;
        try {
          video.removeAttribute("src");
          video.load();
        } catch {}
        resolve(r);
      };

      const timeout = setTimeout(() => finish(null), 8000);

      const cleanup = () => {
        clearTimeout(timeout);
        video.removeEventListener("loadedmetadata", onMeta);
        video.removeEventListener("seeked", onSeeked);
        video.removeEventListener("error", onError);
      };

      const onMeta = () => {
        try {
          const dur = video.duration || 3;
          video.currentTime = Math.min(0.5, dur / 2);
        } catch {
          cleanup();
          finish(null);
        }
      };

      const onSeeked = () => {
        try {
          const w = video.videoWidth;
          const h = video.videoHeight;
          if (!w || !h) {
            cleanup();
            return finish(null);
          }
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            cleanup();
            return finish(null);
          }
          ctx.drawImage(video, 0, 0, w, h);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.6);
          cleanup();
          finish(dataUrl);
        } catch {
          cleanup();
          finish(null);
        }
      };

      const onError = () => {
        cleanup();
        finish(null);
      };

      video.addEventListener("loadedmetadata", onMeta);
      video.addEventListener("seeked", onSeeked);
      video.addEventListener("error", onError);

      video.src = src;
    });

    if (result) {
      remember(src, result);
      idbSet(src, result).catch(() => {});
    }
    return result;
  })();

  pending.set(src, promise);
  promise.finally(() => pending.delete(src));
  return promise;
}

export function VideoThumbnail({
  src,
  iconSize = 24,
  priority = false,
}: {
  src: string;
  iconSize?: number;
  priority?: boolean;
}) {
  const [thumb, setThumb] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const cached = memory.get(src);
    if (cached) setThumb(cached);
  }, [src]);

  useEffect(() => {
    if (thumb) return;
    const el = containerRef.current;
    if (!el) return;

    let cancelled = false;
    const start = () => {
      generate(src).then((res) => {
        if (!cancelled && res) setThumb(res);
      });
    };

    if (priority) {
      start();
      return () => {
        cancelled = true;
      };
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            observer.disconnect();
            start();
          }
        }
      },
      { rootMargin: "600px" },
    );

    observer.observe(el);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [src, thumb, priority]);

  if (thumb) {
    return (
      <img
        src={thumb}
        alt=""
        loading="lazy"
        decoding="async"
        className="w-full h-full object-cover"
      />
    );
  }

  return (
    <div
      ref={containerRef}
      className="w-full h-full flex items-center justify-center bg-[#f5f5f5] text-ink-soft"
    >
      <ImageIcon size={iconSize} strokeWidth={1.6} />
    </div>
  );
}