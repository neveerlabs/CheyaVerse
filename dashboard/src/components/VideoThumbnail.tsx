"use client";

import { useEffect, useRef, useState } from "react";
import { Image as ImageIcon } from "lucide-react";

const thumbCache = new Map<string, string>();
const pendingCache = new Map<string, Promise<string | null>>();

function remember(src: string, value: string) {
  if (thumbCache.size >= 200) {
    const first = thumbCache.keys().next().value;
    if (first) thumbCache.delete(first);
  }
  thumbCache.set(src, value);
}

function generateThumb(src: string): Promise<string | null> {
  const cached = thumbCache.get(src);
  if (cached) return Promise.resolve(cached);
  const pending = pendingCache.get(src);
  if (pending) return pending;

  const promise = new Promise<string | null>((resolve) => {
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";

    let done = false;
    const finish = (result: string | null) => {
      if (done) return;
      done = true;
      try {
        video.removeAttribute("src");
        video.load();
      } catch {}
      if (result) remember(src, result);
      pendingCache.delete(src);
      resolve(result);
    };

    const timeout = setTimeout(() => finish(null), 15000);

    const cleanup = () => {
      clearTimeout(timeout);
      video.removeEventListener("loadedmetadata", onMeta);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
    };

    const onMeta = () => {
      try {
        const dur = video.duration || 3;
        video.currentTime = Math.min(1.5, dur / 2);
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
        const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
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

  pendingCache.set(src, promise);
  return promise;
}

export function VideoThumbnail({
  src,
  iconSize = 24,
}: {
  src: string;
  iconSize?: number;
}) {
  const [thumb, setThumb] = useState<string | null>(
    () => thumbCache.get(src) ?? null,
  );
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (thumb) return;
    const el = containerRef.current;
    if (!el) return;

    let cancelled = false;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            observer.disconnect();
            generateThumb(src).then((res) => {
              if (!cancelled && res) setThumb(res);
            });
          }
        }
      },
      { rootMargin: "200px" },
    );

    observer.observe(el);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [src, thumb]);

  if (thumb) {
    return (
      <img
        src={thumb}
        alt=""
        loading="lazy"
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
