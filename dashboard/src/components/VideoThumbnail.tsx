"use client";

import { useEffect, useRef, useState } from "react";
import { Image as ImageIcon } from "lucide-react";

const CACHE_LIMIT = 3000;
const THUMB_MAX_WIDTH = 480;
const THUMB_QUALITY = 0.72;
const MIN_BRIGHTNESS = 24;
const MIN_PEAK = 64;
const SAMPLE_SIZE = 24;
const GENERATE_TIMEOUT_MS = 6000;
const MAX_CONCURRENT = 3;
const DB_NAME = "cheya-vthumbs-v2";
const STORE = "v1";

type Format = "image/webp" | "image/jpeg";

let detectedFormat: Format | null = null;

function getFormat(): Format {
  if (detectedFormat) return detectedFormat;
  if (typeof document === "undefined") {
    detectedFormat = "image/jpeg";
    return detectedFormat;
  }
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const dataUrl = canvas.toDataURL("image/webp", 0.8);
    detectedFormat = dataUrl.startsWith("data:image/webp")
      ? "image/webp"
      : "image/jpeg";
  } catch {
    detectedFormat = "image/jpeg";
  }
  return detectedFormat;
}

const memory = new Map<string, string>();
const pending = new Map<string, Promise<string | null>>();

let runningCount = 0;
const waitQueue: Array<() => void> = [];

async function acquireSlot(): Promise<void> {
  if (runningCount < MAX_CONCURRENT) {
    runningCount++;
    return;
  }
  await new Promise<void>((resolve) => waitQueue.push(resolve));
  runningCount++;
}

function releaseSlot() {
  runningCount = Math.max(0, runningCount - 1);
  const next = waitQueue.shift();
  if (next) next();
}

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
  if (memory.has(src)) memory.delete(src);
  if (memory.size >= CACHE_LIMIT) {
    const first = memory.keys().next().value;
    if (first) memory.delete(first);
  }
  memory.set(src, value);
}

function getFromMemory(src: string): string | null {
  const hit = memory.get(src);
  if (!hit) return null;
  memory.delete(src);
  memory.set(src, hit);
  return hit;
}

function isFrameUsable(video: HTMLVideoElement): boolean {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return false;
  const canvas = document.createElement("canvas");
  canvas.width = SAMPLE_SIZE;
  canvas.height = SAMPLE_SIZE;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return false;
  try {
    ctx.drawImage(video, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
  } catch {
    return false;
  }
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data;
  } catch {
    return false;
  }
  let sum = 0;
  let maxR = 0;
  let maxG = 0;
  let maxB = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    sum += (r + g + b) / 3;
    if (r > maxR) maxR = r;
    if (g > maxG) maxG = g;
    if (b > maxB) maxB = b;
  }
  const avg = sum / (data.length / 4);
  const peak = Math.max(maxR, maxG, maxB);
  return avg >= MIN_BRIGHTNESS || peak >= MIN_PEAK;
}

function drawThumbnail(video: HTMLVideoElement): string | null {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return null;
  const ratio = Math.min(1, THUMB_MAX_WIDTH / w);
  const cw = Math.max(1, Math.round(w * ratio));
  const ch = Math.max(1, Math.round(h * ratio));
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, cw, ch);
  try {
    return canvas.toDataURL(getFormat(), THUMB_QUALITY);
  } catch {
    try {
      return canvas.toDataURL("image/jpeg", THUMB_QUALITY);
    } catch {
      return null;
    }
  }
}

function computeCandidates(duration: number): number[] {
  const out: number[] = [];
  const add = (t: number) => {
    if (!Number.isFinite(t)) return;
    if (t < 0) return;
    if (Number.isFinite(duration) && duration > 0 && t >= duration - 0.05) return;
    if (!out.includes(t)) out.push(t);
  };
  if (Number.isFinite(duration) && duration > 1.5) {
    add(Math.min(2, Math.max(0.5, duration * 0.05)));
    add(duration * 0.25);
    add(duration * 0.5);
    add(Math.min(duration - 0.5, 3));
  }
  add(0.5);
  add(0.1);
  return out;
}

function waitForFrame(
  video: HTMLVideoElement,
  timeoutMs: number,
): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    let rvfcHandle: number | null = null;
    const onSeeked = () => finish(true);

    const cleanup = () => {
      video.removeEventListener("seeked", onSeeked);
      if (rvfcHandle !== null) {
        const cancel = (
          video as HTMLVideoElement & {
            cancelVideoFrameCallback?: (handle: number) => void;
          }
        ).cancelVideoFrameCallback;
        if (typeof cancel === "function") {
          try {
            cancel.call(video, rvfcHandle);
          } catch {}
        }
      }
      window.clearTimeout(timer);
    };

    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      cleanup();
      resolve(ok);
    };

    const timer = window.setTimeout(() => finish(false), timeoutMs);

    const rvfc = (
      video as HTMLVideoElement & {
        requestVideoFrameCallback?: (cb: () => void) => number;
      }
    ).requestVideoFrameCallback;

    if (typeof rvfc === "function") {
      try {
        rvfcHandle = rvfc.call(video, () => finish(true));
      } catch {
        rvfcHandle = null;
      }
    }

    video.addEventListener("seeked", onSeeked);
  });
}

async function generateInner(src: string): Promise<string | null> {
  const fromIdb = await idbGet(src);
  if (fromIdb) {
    remember(src, fromIdb);
    return fromIdb;
  }

  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.disablePictureInPicture = true;
  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");

  const cleanup = () => {
    try {
      video.removeAttribute("src");
      video.load();
    } catch {}
  };

  try {
    const metaReady = await new Promise<boolean>((resolve) => {
      let done = false;
      const finish = (ok: boolean) => {
        if (done) return;
        done = true;
        window.clearTimeout(timer);
        video.removeEventListener("loadedmetadata", onMeta);
        video.removeEventListener("error", onError);
        resolve(ok);
      };
      const onMeta = () => finish(true);
      const onError = () => finish(false);
      const timer = window.setTimeout(() => finish(false), GENERATE_TIMEOUT_MS);
      video.addEventListener("loadedmetadata", onMeta);
      video.addEventListener("error", onError);
      video.src = src;
    });

    if (!metaReady) {
      cleanup();
      return null;
    }

    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const candidates = computeCandidates(duration);

    let best: string | null = null;

    for (const t of candidates) {
      try {
        video.currentTime = t;
      } catch {
        continue;
      }
      const ok = await waitForFrame(video, GENERATE_TIMEOUT_MS);
      if (!ok) continue;
      if (!isFrameUsable(video)) continue;
      const dataUrl = drawThumbnail(video);
      if (dataUrl) {
        best = dataUrl;
        break;
      }
    }

    if (!best) {
      try {
        video.currentTime = 0;
      } catch {}
      const ok = await waitForFrame(video, 2000);
      if (ok) {
        best = drawThumbnail(video);
      }
    }

    cleanup();

    if (best) {
      remember(src, best);
      idbSet(src, best).catch(() => {});
    }
    return best;
  } catch {
    cleanup();
    return null;
  }
}

function generate(src: string): Promise<string | null> {
  const hit = getFromMemory(src);
  if (hit) return Promise.resolve(hit);
  const inflight = pending.get(src);
  if (inflight) return inflight;

  const promise = (async () => {
    await acquireSlot();
    try {
      return await generateInner(src);
    } finally {
      releaseSlot();
    }
  })();

  pending.set(src, promise);
  promise.finally(() => pending.delete(src));
  return promise;
}

export function preloadVideoThumbnail(src: string): void {
  if (memory.has(src)) return;
  if (pending.has(src)) return;
  void generate(src);
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
  const [thumb, setThumb] = useState<string | null>(() => getFromMemory(src));
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const cached = getFromMemory(src);
    if (cached) {
      setThumb(cached);
      return;
    }
    setThumb(null);
    let cancelled = false;
    idbGet(src).then((value) => {
      if (cancelled || !value) return;
      remember(src, value);
      setThumb(value);
    });
    return () => {
      cancelled = true;
    };
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
      { rootMargin: "3000px" },
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