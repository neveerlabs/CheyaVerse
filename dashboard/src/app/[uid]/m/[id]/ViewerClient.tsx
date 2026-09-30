"use client";

import { useCallback, useEffect, useRef, useState, forwardRef } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ReCAPTCHA from "react-google-recaptcha";
import {
  Image as ImageIcon, Download, Maximize2, Minimize2, Copy,
  Play, Pause, Home, AlertCircle, Trash2, Rewind, FastForward, Check, QrCode,
} from "lucide-react";
import { config } from "@/lib/config";
import { MediaQrModal } from "@/components/MediaQrModal";

type Props = {
  uid?: string;
  mediaId: string;
  signedUrl: string;
  filename: string;
  contentType: string;
  ownerId?: number;
  fileSize?: number;
  expiresAt?: string;
};

type LockableScreenOrientation = ScreenOrientation & {
  lock?: (orientation: "landscape" | "portrait") => Promise<void>;
  unlock?: () => void;
};

const VID_EXT = ["mp4", "webm", "mov", "mkv", "avi", "m4v"];
const IMG_EXT = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"];
const DEVICE_ID_KEY = "cheya_device_id";
const COPY_FLASH_MS = 1000;

const EXPIRY_OPTIONS: { value: string; label: string }[] = [
  { value: "12h", label: "12 hours" },
  { value: "24h", label: "24 hours" },
  { value: "1w", label: "1 week" },
  { value: "1m", label: "1 month" },
  { value: "1y", label: "1 year" },
  { value: "never", label: "Never" },
];

function readDeviceId(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(DEVICE_ID_KEY) ?? "";
  } catch {
    return "";
  }
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  const rounded = i === 0 ? Math.round(n) : Math.round(n * 10) / 10;
  return `${rounded} ${units[i]}`;
}

function formatExpires(iso: string): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return iso;
    if (d.getUTCFullYear() >= 9000) return "Never";
    const s = d.toLocaleString("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Jakarta",
    });
    return `${s} WIB`;
  } catch {
    return iso;
  }
}

function detectKind(filename: string, contentType: string): "video" | "image" | "other" {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (VID_EXT.includes(ext)) return "video";
  if (IMG_EXT.includes(ext)) return "image";
  if (contentType.startsWith("video/")) return "video";
  if (contentType.startsWith("image/")) return "image";
  return "other";
}

function fmt(s: number): string {
  if (!isFinite(s) || s < 0) return "0:00";
  const mm = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${mm}:${ss < 10 ? "0" : ""}${ss}`;
}

type VideoProps = {
  src: string;
  onReady: () => void;
  onError: () => void;
  onDimensions: (width: number, height: number) => void;
  controlsHidden: boolean;
  onSeek: (clientX: number) => void;
};

const DOUBLE_TAP_MS = 280;
const EDGE_GUARD_SEC = 0.08;

const VideoPlayer = forwardRef<HTMLVideoElement, VideoProps>(
  function VideoPlayer({ src, onReady, onError, onDimensions, controlsHidden, onSeek }, externalRef) {
    const localRef = useRef<HTMLVideoElement | null>(null);
    const readySent = useRef(false);
    const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastClickAt = useRef(0);
    const lastTouchEnd = useRef(0);
    const suppressClickUntil = useRef(0);
    const barRef = useRef<HTMLDivElement | null>(null);
    const scrubbingRef = useRef(false);
    const wasPlayingRef = useRef(false);
    const [playing, setPlaying] = useState(false);
    const [ct, setCt] = useState(0);
    const [dur, setDur] = useState(0);

    const markReady = useCallback(() => {
      if (readySent.current) return;
      readySent.current = true;
      onReady();
    }, [onReady]);

    useEffect(() => {
      if (typeof externalRef === "function") externalRef(localRef.current);
      else if (externalRef) {
        (externalRef as React.MutableRefObject<HTMLVideoElement | null>).current =
          localRef.current;
      }
    }, [externalRef]);

    useEffect(() => {
      const v = localRef.current;
      if (!v) return;
      const trySync = () => {
        if (v.readyState >= 1 && isFinite(v.duration) && v.duration > 0) {
          setDur(v.duration);
          if (isFinite(v.currentTime)) setCt(v.currentTime);
          onDimensions(v.videoWidth, v.videoHeight);
          markReady();
          return true;
        }
        return false;
      };
      if (trySync()) return;
      const iv = window.setInterval(() => {
        if (trySync()) window.clearInterval(iv);
      }, 250);
      return () => window.clearInterval(iv);
    }, [markReady, onDimensions]);

    useEffect(() => {
      return () => {
        if (clickTimer.current) clearTimeout(clickTimer.current);
      };
    }, []);

    function toggle() {
      const v = localRef.current;
      if (!v) return;
      if (v.paused) {
        if (
          isFinite(v.duration) &&
          v.duration > 0 &&
          v.currentTime >= v.duration - EDGE_GUARD_SEC
        ) {
          try {
            v.currentTime = 0;
          } catch {}
        }
        v.play().catch(() => {});
      } else {
        v.pause();
      }
    }

    function cancelPendingToggle() {
      if (clickTimer.current) {
        clearTimeout(clickTimer.current);
        clickTimer.current = null;
      }
    }

    function handleVideoClick(e: React.MouseEvent<HTMLVideoElement>) {
      if (Date.now() < suppressClickUntil.current) {
        e.preventDefault();
        return;
      }
      const now = Date.now();
      if (now - lastClickAt.current < DOUBLE_TAP_MS) {
        cancelPendingToggle();
        lastClickAt.current = 0;
        onSeek(e.clientX);
        return;
      }
      lastClickAt.current = now;
      cancelPendingToggle();
      clickTimer.current = setTimeout(() => {
        clickTimer.current = null;
        toggle();
      }, DOUBLE_TAP_MS);
    }

    function handleVideoTouchEnd(e: React.TouchEvent<HTMLVideoElement>) {
      if (e.touches.length > 0) return;
      const touch = e.changedTouches[0];
      if (!touch) return;
      const now = Date.now();
      if (now - lastTouchEnd.current < DOUBLE_TAP_MS) {
        lastTouchEnd.current = 0;
        cancelPendingToggle();
        suppressClickUntil.current = now + 600;
        onSeek(touch.clientX);
      } else {
        lastTouchEnd.current = now;
      }
    }

    function ratioFromClientX(clientX: number): number {
      const el = barRef.current;
      if (!el) return 0;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0) return 0;
      let r = (clientX - rect.left) / rect.width;
      if (r < 0) r = 0;
      if (r > 1) r = 1;
      return r;
    }

    function applyScrub(clientX: number) {
      const v = localRef.current;
      if (!v) return;
      const total = isFinite(v.duration) && v.duration > 0 ? v.duration : dur;
      if (!total || total <= 0) return;
      const r = ratioFromClientX(clientX);
      let t = r * total;
      if (!isFinite(t) || t < 0) t = 0;
      if (t > total - EDGE_GUARD_SEC) t = Math.max(0, total - EDGE_GUARD_SEC);
      try {
        v.currentTime = t;
      } catch {
        return;
      }
      setCt(t);
      if (dur !== total) setDur(total);
    }

    function onBarPointerDown(e: React.PointerEvent<HTMLDivElement>) {
      const v = localRef.current;
      if (!v) return;
      e.stopPropagation();
      scrubbingRef.current = true;
      wasPlayingRef.current = !v.paused;
      applyScrub(e.clientX);
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {}
    }

    function onBarPointerMove(e: React.PointerEvent<HTMLDivElement>) {
      if (!scrubbingRef.current) return;
      e.stopPropagation();
      applyScrub(e.clientX);
    }

    function onBarPointerUp(e: React.PointerEvent<HTMLDivElement>) {
      if (!scrubbingRef.current) return;
      e.stopPropagation();
      scrubbingRef.current = false;
      const v = localRef.current;
      if (v && wasPlayingRef.current && v.paused) {
        v.play().catch(() => {});
      }
      wasPlayingRef.current = false;
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
    }

    const pct = dur > 0 ? Math.max(0, Math.min(1, ct / dur)) * 100 : 0;

    return (
      <>
        <video
          ref={localRef}
          src={src}
          playsInline
          preload="metadata"
          controls={false}
          controlsList="nodownload noplaybackrate noremoteplayback"
          disablePictureInPicture
          draggable={false}
          onClick={handleVideoClick}
          onTouchEnd={handleVideoTouchEnd}
          onLoadedMetadata={(e) => {
            const v = e.currentTarget;
            if (isFinite(v.duration)) setDur(v.duration);
            onDimensions(v.videoWidth, v.videoHeight);
            markReady();
          }}
          onLoadedData={markReady}
          onCanPlay={markReady}
          onTimeUpdate={(e) => {
            if (scrubbingRef.current) return;
            setCt(e.currentTarget.currentTime);
          }}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onError={onError}
          className="absolute inset-0 w-full h-full object-contain cursor-pointer"
          style={{ transform: "translateZ(0)", willChange: "transform" }}
        />

        {!playing && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); toggle(); }}
            aria-label="Play"
            className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 w-[68px] h-[68px] rounded-full bg-black/55 backdrop-blur-xl border-2 border-white/25 text-white flex items-center justify-center transition-all duration-300 ease-out ${
              controlsHidden
                ? "opacity-0 pointer-events-none scale-90"
                : "opacity-100 scale-100 active:scale-95"
            }`}
          >
            <Play size={26} className="fill-white ml-0.5" />
          </button>
        )}

        <div
          className={`absolute left-0 right-0 bottom-0 z-[6] flex items-center gap-2.5 px-3 pt-6 pb-2.5 bg-gradient-to-t from-black/85 via-black/55 to-transparent transition-opacity duration-300 ease-out ${
            controlsHidden ? "opacity-0 pointer-events-none" : "opacity-100"
          }`}
        >
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); toggle(); }}
            aria-label={playing ? "Pause" : "Play"}
            className="w-8 h-8 rounded-full bg-white/15 backdrop-blur-md text-white flex items-center justify-center flex-shrink-0 active:scale-90 transition-transform"
          >
            {playing ? <Pause size={13} className="fill-white" /> : <Play size={13} className="fill-white ml-0.5" />}
          </button>

          <div
            ref={barRef}
            role="slider"
            data-control
            aria-label="Seek"
            aria-valuemin={0}
            aria-valuemax={Math.round(dur)}
            aria-valuenow={Math.round(ct)}
            onPointerDown={onBarPointerDown}
            onPointerMove={onBarPointerMove}
            onPointerUp={onBarPointerUp}
            onPointerCancel={onBarPointerUp}
            className="relative flex-1 h-7 flex items-center cursor-pointer select-none"
            style={{ touchAction: "none" }}
          >
            <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[4px] rounded-full bg-white/30 overflow-hidden pointer-events-none">
              <div
                className="h-full rounded-full bg-white"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-white shadow-[0_0_0_3px_rgba(255,255,255,.2)] pointer-events-none"
              style={{ left: `${pct}%` }}
            />
          </div>

          <span className="text-[11.5px] font-semibold text-white tabular-nums whitespace-nowrap flex-shrink-0">
            {fmt(ct)} / {fmt(dur)}
          </span>
        </div>
      </>
    );
  },
);

function MetaRow({
  label, value, onCopy, mono, action, copied,
}: {
  label: string;
  value: string;
  onCopy?: () => void;
  mono?: boolean;
  action?: ReactNode;
  copied?: boolean;
}) {
  return (
    <div className="grid grid-cols-[82px_minmax(0,1fr)] items-center gap-3 border-b border-black/[.055] py-3 last:border-b-0">
      <div className="min-w-0">
        <span className="text-[11px] font-medium text-ink-mute">
          {label}
        </span>
      </div>
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={`min-w-0 flex-1 break-words text-[13px] text-ink ${
            mono ? "font-mono tracking-[-.005em]" : ""
          }`}
        >
          {value}
        </span>
        {onCopy && (
          <button
            type="button"
            onClick={onCopy}
            aria-label={`Copy ${label}`}
            className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-lg text-ink-soft sm:hover:text-ink sm:hover:bg-[#f5f5f5] active:opacity-60 transition-colors"
          >
            {copied ? (
              <span className="animate-copy-pop inline-flex text-ink">
                <Check size={13} strokeWidth={2.6} />
              </span>
            ) : (
              <Copy size={13} strokeWidth={2.2} />
            )}
          </button>
        )}
        {action}
      </div>
    </div>
  );
}

export default function ViewerClient({
  uid, mediaId, signedUrl, filename, contentType,
  ownerId, fileSize, expiresAt,
}: Props) {
  const router = useRouter();
  const kind = detectKind(filename, contentType);
  const siteKey = config.recaptchaSiteKey;
  const homeHref = uid ? `/${uid}` : "/";
  const canDelete = Boolean(uid);

  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [isFs, setIsFs] = useState(false);
  const [isCssFullscreen, setIsCssFullscreen] = useState(false);
  const [mediaOrientation, setMediaOrientation] = useState<"landscape" | "portrait" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [controlsHidden, setControlsHidden] = useState(false);
  const [zoomPop, setZoomPop] = useState(false);
  const [seekFx, setSeekFx] = useState<{ side: "left" | "right"; key: number } | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [qrOpen, setQrOpen] = useState(false);

  const [currentExpiresAt, setCurrentExpiresAt] = useState<string>(expiresAt ?? "");
  const [editExpiresOpen, setEditExpiresOpen] = useState(false);
  const [savingExpires, setSavingExpires] = useState(false);

  const mediaRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const recaptchaRef = useRef<ReCAPTCHA>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSeekAtRef = useRef(0);
  const scaleRef = useRef(1);
  const txRef = useRef(0);
  const tyRef = useRef(0);
  const suppressClickRef = useRef(false);
  const isFsRef = useRef(false);
  const mediaOrientationRef = useRef<"landscape" | "portrait" | null>(null);
  const kindRef = useRef(kind);

  useEffect(() => {
    kindRef.current = kind;
  }, [kind]);

  useEffect(() => {
    isFsRef.current = isFs;
  }, [isFs]);

  const setOrientationFromDimensions = useCallback(
    (width: number, height: number) => {
      if (width <= 0 || height <= 0) return;
      const orientation = width > height ? "landscape" : "portrait";
      mediaOrientationRef.current = orientation;
      setMediaOrientation(orientation);
      const orientationApi = screen.orientation as LockableScreenOrientation;
      if (isFsRef.current && typeof orientationApi.lock === "function") {
        orientationApi.lock(orientation).catch((error) => {
          console.warn("[media-viewer] orientation lock unavailable:", error);
        });
      }
    },
    [],
  );
  const handleVideoReady = useCallback(() => setReady(true), []);

  useEffect(() => {
    setCurrentExpiresAt(expiresAt ?? "");
  }, [expiresAt]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1800);
  }, []);

  const flashCopied = useCallback((key: string) => {
    setCopiedKey(key);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopiedKey(null), COPY_FLASH_MS);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setReady(true), 4000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    function block(e: Event) {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      if (t.tagName === "IMG" || t.tagName === "VIDEO" || t.closest?.(".protect-zone")) {
        e.preventDefault();
        e.stopPropagation();
      }
    }
    document.addEventListener("contextmenu", block, true);
    document.addEventListener("dragstart", block, true);
    return () => {
      document.removeEventListener("contextmenu", block, true);
      document.removeEventListener("dragstart", block, true);
    };
  }, []);

  useEffect(() => {
    function onFs() {
      const doc = document as Document & { webkitFullscreenElement?: Element };
      const fullscreen = !!(document.fullscreenElement || doc.webkitFullscreenElement);
      if (isCssFullscreen) return;
      setIsFs(fullscreen);
      const orientationApi = screen.orientation as LockableScreenOrientation;
      if (fullscreen && mediaOrientationRef.current && typeof orientationApi.lock === "function") {
        orientationApi.lock(mediaOrientationRef.current).catch((error) => {
          console.warn("[media-viewer] orientation lock unavailable:", error);
        });
      } else if (!fullscreen && typeof orientationApi.unlock === "function") {
        orientationApi.unlock();
      }
    }
    document.addEventListener("fullscreenchange", onFs);
    document.addEventListener("webkitfullscreenchange", onFs);
    return () => {
      document.removeEventListener("fullscreenchange", onFs);
      document.removeEventListener("webkitfullscreenchange", onFs);
    };
  }, [isCssFullscreen]);

  useEffect(() => {
    if (!isCssFullscreen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setIsCssFullscreen(false);
      setIsFs(false);
    };
    window.addEventListener("keydown", onEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onEscape);
    };
  }, [isCssFullscreen]);

  useEffect(() => {
    if (!seekFx) return;
    const t = setTimeout(() => setSeekFx(null), 720);
    return () => clearTimeout(t);
  }, [seekFx]);

  useEffect(() => {
    return () => {
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const handleSeek = useCallback((clientX: number) => {
    if (kindRef.current !== "video") return;
    const v = videoRef.current;
    const c = mediaRef.current;
    if (!v || !c) return;

    const now = Date.now();
    if (now - lastSeekAtRef.current < 250) return;
    lastSeekAtRef.current = now;

    const rect = c.getBoundingClientRect();
    const x = clientX - rect.left;
    const isLeft = x < rect.width / 2;
    const d = isFinite(v.duration) && v.duration > 0 ? v.duration : 0;
    let nt = v.currentTime + (isLeft ? -5 : 5);
    if (nt < 0) nt = 0;
    if (d > 0 && nt > d - 0.1) nt = Math.max(0, d - 0.5);

    try {
      v.currentTime = nt;
    } catch {
      return;
    }

    if (v.paused) {
      v.play().catch(() => {});
    }

    setSeekFx({ side: isLeft ? "left" : "right", key: Date.now() });
  }, []);

  useEffect(() => {
    const container = mediaRef.current;
    const inner = innerRef.current;
    if (!container || !inner) return;

    let rectW = container.clientWidth;
    let rectH = container.clientHeight;
    let startDist = 0;
    let startScale = 1;
    let startM0x = 0;
    let startM0y = 0;
    let startTx = 0;
    let startTy = 0;
    let centerX = 0;
    let centerY = 0;
    let pinching = false;
    let panning = false;
    let wasPinching = false;
    let panStartX = 0;
    let panStartY = 0;
    let panStartTx = 0;
    let panStartTy = 0;
    const MAX_SCALE = 4;

    function readRect() {
      const r = container!.getBoundingClientRect();
      rectW = r.width;
      rectH = r.height;
      centerX = r.left + r.width / 2;
      centerY = r.top + r.height / 2;
    }

    function clampT(tx: number, ty: number, s: number): [number, number] {
      const mX = (rectW / 2) * Math.max(0, s - 1);
      const mY = (rectH / 2) * Math.max(0, s - 1);
      const cx = tx < -mX ? -mX : tx > mX ? mX : tx;
      const cy = ty < -mY ? -mY : ty > mY ? mY : ty;
      return [cx, cy];
    }

    function writeTransform(tx: number, ty: number, s: number) {
      const [cx, cy] = clampT(tx, ty, s);
      txRef.current = cx;
      tyRef.current = cy;
      scaleRef.current = s;
      inner!.style.transform = `translate3d(${cx}px, ${cy}px, 0) scale(${s})`;
    }

    function dist(t: TouchList) {
      const dx = t[0].clientX - t[1].clientX;
      const dy = t[0].clientY - t[1].clientY;
      return Math.hypot(dx, dy);
    }

    function resetZoom() {
      if (
        scaleRef.current <= 1.005 &&
        Math.abs(txRef.current) < 0.5 &&
        Math.abs(tyRef.current) < 0.5
      ) {
        return;
      }
      inner!.style.transition = "transform 200ms ease-out";
      scaleRef.current = 1;
      txRef.current = 0;
      tyRef.current = 0;
      inner!.style.transform = "translate3d(0px, 0px, 0) scale(1)";
      window.setTimeout(() => {
        if (inner) inner.style.transition = "";
      }, 220);
    }

    function isControl(target: EventTarget | null): boolean {
      const t = target as HTMLElement | null;
      if (!t) return false;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA") return true;
      if (
        t.closest &&
        t.closest("button, input, [role='button'], [role='slider'], [data-control]")
      )
        return true;
      return false;
    }

    function hideControlsNow() {
      if (controlsTimerRef.current) {
        clearTimeout(controlsTimerRef.current);
        controlsTimerRef.current = null;
      }
      setControlsHidden(true);
    }

    function scheduleShowControls() {
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
      controlsTimerRef.current = setTimeout(() => setControlsHidden(false), 600);
    }

    function onTS(e: TouchEvent) {
      if (isControl(e.target)) return;
      readRect();
      if (e.touches.length >= 2) {
        e.preventDefault();
        startDist = dist(e.touches);
        startScale = scaleRef.current;
        startM0x = (e.touches[0].clientX + e.touches[1].clientX) / 2 - centerX;
        startM0y = (e.touches[0].clientY + e.touches[1].clientY) / 2 - centerY;
        startTx = txRef.current;
        startTy = tyRef.current;
        pinching = true;
        panning = false;
        inner!.style.transition = "";
        if (kindRef.current === "video") hideControlsNow();
        if (!isFsRef.current) setZoomPop(true);
        wasPinching = true;
      } else if (e.touches.length === 1) {
        pinching = false;
        if (scaleRef.current > 1.005) {
          panning = true;
          panStartX = e.touches[0].clientX;
          panStartY = e.touches[0].clientY;
          panStartTx = txRef.current;
          panStartTy = tyRef.current;
          inner!.style.transition = "";
        } else {
          panning = false;
        }
      }
    }

    function onTM(e: TouchEvent) {
      if (pinching && e.touches.length === 2) {
        e.preventDefault();
        const d = dist(e.touches);
        if (startDist <= 0) return;
        const ratio = d / startDist;
        let ns = startScale * ratio;
        ns = ns < 1 ? 1 : ns > MAX_SCALE ? MAX_SCALE : ns;
        const k = ns / startScale;
        const m1x = (e.touches[0].clientX + e.touches[1].clientX) / 2 - centerX;
        const m1y = (e.touches[0].clientY + e.touches[1].clientY) / 2 - centerY;
        const tx = m1x - k * (startM0x - startTx);
        const ty = m1y - k * (startM0y - startTy);
        writeTransform(tx, ty, ns);
      } else if (panning && e.touches.length === 1) {
        e.preventDefault();
        const dx = e.touches[0].clientX - panStartX;
        const dy = e.touches[0].clientY - panStartY;
        writeTransform(panStartTx + dx, panStartTy + dy, scaleRef.current);
      }
    }

    function onTE(e: TouchEvent) {
      if (e.touches.length < 2) pinching = false;
      if (e.touches.length === 0) {
        const wasZoomed =
          scaleRef.current > 1.005 ||
          Math.abs(txRef.current) > 0.5 ||
          Math.abs(tyRef.current) > 0.5;
        panning = false;
        if (wasZoomed) {
          suppressClickRef.current = true;
          window.setTimeout(() => {
            suppressClickRef.current = false;
          }, 350);
        }
        resetZoom();
        if (wasPinching) {
          if (kindRef.current === "video") scheduleShowControls();
          if (!isFsRef.current) setZoomPop(false);
          wasPinching = false;
        }
      } else if (e.touches.length === 1 && scaleRef.current > 1.005) {
        panning = true;
        panStartX = e.touches[0].clientX;
        panStartY = e.touches[0].clientY;
        panStartTx = txRef.current;
        panStartTy = tyRef.current;
      }
    }

    container.addEventListener("touchstart", onTS, { passive: false });
    container.addEventListener("touchmove", onTM, { passive: false });
    container.addEventListener("touchend", onTE);
    container.addEventListener("touchcancel", onTE);
    return () => {
      container.removeEventListener("touchstart", onTS);
      container.removeEventListener("touchmove", onTM);
      container.removeEventListener("touchend", onTE);
      container.removeEventListener("touchcancel", onTE);
    };
  }, []);

  const toggleFs = useCallback(() => {
    const el = mediaRef.current;
    if (!el) return;
    type FsEl = HTMLElement & { webkitRequestFullscreen?: () => void };
    type FsDoc = Document & {
      webkitExitFullscreen?: () => void;
      webkitFullscreenElement?: Element;
    };
    if (isFs) {
      if (isCssFullscreen) {
        setIsCssFullscreen(false);
        setIsFs(false);
        return;
      }
      const doc = document as FsDoc;
      try {
        (document.exitFullscreen || doc.webkitExitFullscreen)?.call(document);
      } catch (error) {
        console.error("[media-viewer] could not exit fullscreen:", error);
      }
      return;
    }
    const lockOrientation = () => {
      const orientationApi = screen.orientation as LockableScreenOrientation;
      if (!mediaOrientationRef.current || typeof orientationApi.lock !== "function") return;
      orientationApi.lock(mediaOrientationRef.current).catch((error) => {
        console.warn("[media-viewer] orientation lock unavailable:", error);
      });
    };
    try {
      if (typeof el.requestFullscreen === "function") {
        el.requestFullscreen({ navigationUI: "hide" }).then(lockOrientation).catch((error) => {
          try {
            const anyEl = el as FsEl;
            if (anyEl.webkitRequestFullscreen) {
              anyEl.webkitRequestFullscreen();
              lockOrientation();
            } else {
              console.warn("[media-viewer] native fullscreen unavailable; using page fullscreen:", error);
              setIsCssFullscreen(true);
              setIsFs(true);
            }
          } catch (fallbackError) {
            console.warn("[media-viewer] native fullscreen unavailable; using page fullscreen:", fallbackError);
            setIsCssFullscreen(true);
            setIsFs(true);
          }
        });
      } else {
        const anyEl = el as FsEl;
        if (anyEl.webkitRequestFullscreen) {
          anyEl.webkitRequestFullscreen();
          lockOrientation();
        } else {
          setIsCssFullscreen(true);
          setIsFs(true);
        }
      }
    } catch (error) {
      console.error("[media-viewer] fullscreen request failed:", error);
      showToast("Fullscreen is unavailable on this device.");
    }
  }, [isCssFullscreen, isFs, showToast]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;

      if (e.key === "Escape") {
        if (editExpiresOpen) {
          setEditExpiresOpen(false);
          e.preventDefault();
          return;
        }
        if (confirmDelete) {
          setConfirmDelete(false);
          e.preventDefault();
          return;
        }
        if (modalOpen) {
          setModalOpen(false);
          e.preventDefault();
          return;
        }
      }

      if (e.key === "f" || e.key === "F") {
        if (mediaRef.current) {
          toggleFs();
          e.preventDefault();
        }
        return;
      }

      const v = videoRef.current;
      if (!v) return;

      if (e.code === "Space") {
        e.preventDefault();
        if (v.paused) {
          if (
            isFinite(v.duration) &&
            v.duration > 0 &&
            v.currentTime >= v.duration - EDGE_GUARD_SEC
          ) {
            try {
              v.currentTime = 0;
            } catch {}
          }
          v.play().catch(() => {});
        } else {
          v.pause();
        }
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        v.currentTime = Math.max(0, v.currentTime - 5);
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        if (isFinite(v.duration) && v.duration > 0) {
          const target = Math.min(v.duration - EDGE_GUARD_SEC, v.currentTime + 5);
          v.currentTime = Math.max(0, target);
        }
      } else if (e.code === "ArrowUp") {
        e.preventDefault();
        v.volume = Math.min(1, v.volume + 0.1);
      } else if (e.code === "ArrowDown") {
        e.preventDefault();
        v.volume = Math.max(0, v.volume - 0.1);
      } else if (e.key === "m" || e.key === "M") {
        e.preventDefault();
        v.muted = !v.muted;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modalOpen, isFs, confirmDelete, editExpiresOpen, toggleFs]);

  function triggerDownload(recaptchaToken: string) {
    window.location.href = `/download/${encodeURIComponent(mediaId)}?token=${encodeURIComponent(recaptchaToken)}`;
  }

  function startDownload() {
    setModalOpen(true);
  }

  function onCaptchaSuccess(value: string | null) {
    if (!value) return;
    setModalOpen(false);
    showToast("Verification successful");
    triggerDownload(value);
  }

  function onCaptchaExpired() {
    showToast("Verification expired. Please try again");
  }

  async function copyText(text: string, label: string, key: string) {
    try {
      if (navigator.clipboard?.writeText && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.top = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      flashCopied(key);
      showToast(`${label} copied`);
    } catch {
      showToast("Unable to copy");
    }
  }

  async function copyLink() {
    const url = `${window.location.origin}/m/${encodeURIComponent(mediaId)}`;
    try {
      if (navigator.clipboard?.writeText && window.isSecureContext) {
        await navigator.clipboard.writeText(url);
      } else {
        const ta = document.createElement("textarea");
        ta.value = url;
        ta.style.position = "fixed";
        ta.style.top = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      flashCopied("url");
      showToast("URL copied");
    } catch {
      showToast("Unable to copy URL");
    }
  }

  async function performDelete() {
    if (!uid || deleting) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/media/${encodeURIComponent(mediaId)}?uid=${encodeURIComponent(uid)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        showToast("Media deleted");
        setTimeout(() => router.replace(`/${uid}/media`), 500);
      } else {
        showToast("Unable to delete media");
        setDeleting(false);
        setConfirmDelete(false);
      }
    } catch {
      showToast("Unable to delete media");
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  async function saveExpires(duration: string) {
    if (!uid || savingExpires) return;
    const deviceId = readDeviceId();
    if (!deviceId) {
      showToast("Device ID not found");
      return;
    }
    setSavingExpires(true);
    try {
      const res = await fetch(`/api/media/${encodeURIComponent(mediaId)}/expires`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: Number(uid), deviceId, duration }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j?.ok && typeof j.expiresAt === "string") {
        setCurrentExpiresAt(j.expiresAt);
        setEditExpiresOpen(false);
        showToast("Expiry updated");
      } else {
        showToast("Unable to update expiry");
      }
    } catch {
      showToast("Unable to update expiry");
    } finally {
      setSavingExpires(false);
    }
  }

  function renderHeaderIcon(fallback: ReactNode) {
    return (
      <div className="relative w-11 h-11 rounded-xl bg-ink flex items-center justify-center flex-shrink-0 overflow-hidden">
        <span className="absolute inset-0 flex items-center justify-center text-white">
          {fallback}
        </span>
        {ownerId != null && (
          <img
            src={`/api/user/${ownerId}/avatar`}
            alt=""
            draggable={false}
            className="absolute inset-0 w-full h-full object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        )}
      </div>
    );
  }

  if (failed) {
    return (
      <>
        <div className="flex items-center gap-3 px-1 pt-8 pb-5">
          {renderHeaderIcon(<AlertCircle size={22} />)}
          <div className="min-w-0 flex-1">
            <h1 className="text-[15px] font-semibold truncate text-ink">CheyaVerse Media</h1>
            <p className="text-[12px] text-ink-soft truncate">Not available</p>
          </div>
        </div>
        <div className="rounded-2xl bg-white border border-line p-8 text-center">
          <div className="w-32 h-32 mx-auto mb-3">
            <img src="/assets/model.gif" alt="Lost" draggable={false}
                 className="protect w-full h-full object-contain" />
          </div>
          <h2 className="text-[15px] font-semibold mb-1.5 text-ink">File not found</h2>
          <p className="text-[12.5px] text-ink-soft mb-5">
            URL mungkin tidak valid, atau berkas telah kedaluwarsa dan dihapus.
          </p>
          <Link href={homeHref}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-ink text-white text-[13px] font-semibold">
            <Home size={15} /> Home
          </Link>
        </div>
      </>
    );
  }

  const ownerDisplay = ownerId != null ? String(ownerId) : "—";
  const contentDisplay = contentType || "—";
  const sizeDisplay = formatBytes(fileSize ?? 0);
  const expiresDisplay = formatExpires(currentExpiresAt);
  const bodyReady = ready || kind === "other";

  return (
    <>
      <div className="flex items-center gap-3 px-1 pt-8 pb-5">
        {renderHeaderIcon(<ImageIcon size={22} />)}
        <div className="min-w-0 flex-1">
          <h1 className="text-[15px] font-semibold truncate text-ink">{filename}</h1>
          <p className="text-[12px] text-ink-soft truncate">
            {mediaId} · {contentDisplay}
          </p>
        </div>
      </div>

      <div
        ref={mediaRef}
        onClickCapture={(e) => {
          if (suppressClickRef.current) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
        className={`protect-zone relative rounded-2xl overflow-hidden bg-black w-full mb-4 transition-[transform,box-shadow] duration-[380ms] ease-[cubic-bezier(.22,1,.36,1)] will-change-transform ${
          zoomPop
            ? "-translate-y-1 scale-[1.05] shadow-[0_30px_80px_-14px_rgba(0,0,0,.55),0_12px_32px_-8px_rgba(0,0,0,.35)]"
            : "translate-y-0 scale-100 shadow-[0_0_0_0_rgba(0,0,0,0)]"
        }`}
        data-media-orientation={mediaOrientation ?? undefined}
        data-css-fullscreen={isCssFullscreen ? "true" : undefined}
        style={{
          aspectRatio: "4 / 3",
          maxHeight: "70vh",
          ...(isCssFullscreen
            ? {
                position: "fixed",
                inset: 0,
                zIndex: 1000,
                width: "100vw",
                height: "100dvh",
                maxHeight: "none",
                aspectRatio: "auto",
                margin: 0,
                borderRadius: 0,
              }
            : {}),
        }}
      >
        {!ready && kind !== "other" && (
          <div className="absolute inset-0 z-[5] pointer-events-none overflow-hidden bg-[#0a0a0a]">
            <div className="absolute inset-0 bg-[linear-gradient(105deg,transparent_38%,rgba(255,255,255,.06)_48%,rgba(255,255,255,.11)_50%,rgba(255,255,255,.06)_52%,transparent_62%)] bg-[length:220%_100%] animate-shimmer" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center">
              <span className="absolute w-24 h-24 rounded-full bg-white/[.04] animate-ping" />
              <span className="absolute w-16 h-16 rounded-full bg-white/[.05] animate-ping" style={{ animationDelay: "0.25s" }} />
              <span className="relative w-11 h-11 rounded-full border-2 border-white/15 border-t-white/90 animate-spin" />
            </div>
            <span className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white/40 text-[10.5px] font-semibold tracking-[.2em] uppercase">
              Loading
            </span>
          </div>
        )}

        <div
          ref={innerRef}
          style={{ transformOrigin: "center center", touchAction: "none" }}
          className="absolute inset-0 will-change-transform"
        >
          {kind === "video" && (
            <VideoPlayer
              ref={videoRef}
              src={signedUrl}
              onReady={handleVideoReady}
              onError={() => setFailed(true)}
              onDimensions={setOrientationFromDimensions}
              controlsHidden={controlsHidden}
              onSeek={handleSeek}
            />
          )}

          {kind === "image" && (
            <img
              src={signedUrl}
              alt={filename}
              draggable={false}
              onLoad={(event) => {
                setOrientationFromDimensions(
                  event.currentTarget.naturalWidth,
                  event.currentTarget.naturalHeight,
                );
                setReady(true);
              }}
              onError={() => setFailed(true)}
              className={`protect absolute inset-0 w-full h-full object-contain transition-opacity duration-500 ${
                ready ? "opacity-100" : "opacity-0"
              }`}
            />
          )}

          {kind === "other" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center px-6 py-14 text-center">
              <ImageIcon size={32} className="text-white/40 mb-2" />
              <p className="text-[13px] text-white/70">
                Pratinjau tidak tersedia untuk jenis berkas ini.
              </p>
            </div>
          )}
        </div>

        {kind === "video" && seekFx && (
          <div
            key={seekFx.key}
            className="absolute inset-0 z-[15] pointer-events-none overflow-hidden"
          >
            <div
              className={`absolute inset-y-0 w-1/2 ${
                seekFx.side === "left" ? "left-0" : "right-0"
              }`}
              style={{
                background:
                  seekFx.side === "left"
                    ? "linear-gradient(90deg, rgba(255,255,255,.16), transparent 72%)"
                    : "linear-gradient(-90deg, rgba(255,255,255,.16), transparent 72%)",
                animation: "seek-glow 700ms ease-out forwards",
              }}
            />
            <div
              className={`absolute inset-y-0 w-1/2 flex items-center justify-center ${
                seekFx.side === "left" ? "left-0" : "right-0"
              }`}
            >
              <span
                className="relative text-white flex items-center justify-center"
                style={{
                  filter: "drop-shadow(0 2px 10px rgba(0,0,0,.6))",
                  animation: `seek-hint-${seekFx.side} 700ms cubic-bezier(.22,1,.36,1) forwards`,
                }}
              >
                {seekFx.side === "left" ? (
                  <Rewind size={26} strokeWidth={2.2} />
                ) : (
                  <FastForward size={26} strokeWidth={2.2} />
                )}
              </span>
            </div>
          </div>
        )}

        {kind !== "other" && ready && (
          <button
            type="button"
            onClick={toggleFs}
            aria-label="Fullscreen"
            className={`absolute top-2.5 right-2.5 z-30 w-9 h-9 rounded-full bg-black/50 backdrop-blur-md border border-white/15 text-white flex items-center justify-center transition-all duration-300 ease-out ${
              controlsHidden
                ? "opacity-0 pointer-events-none"
                : "opacity-100 active:scale-90"
            }`}
          >
            {isFs ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
          </button>
        )}
      </div>

      {bodyReady && (
        <div className={`mb-3 grid gap-2 animate-fade-up ${canDelete ? "grid-cols-5" : "grid-cols-4"}`}>
          <button
            type="button"
            onClick={startDownload}
            className="inline-flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl bg-ink px-1 py-2.5 text-[10px] font-semibold text-white transition-all active:scale-[.97] sm:hover:bg-accent-hover"
          >
            <Download size={16} strokeWidth={2.4} />
            <span>Download</span>
          </button>
          <button
            type="button"
            onClick={toggleFs}
            className="inline-flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl border border-line bg-[#fafafa] px-1 py-2.5 text-[10px] font-semibold text-ink transition-all active:scale-[.97] sm:hover:bg-[#f0f0f0]"
          >
            {isFs ? <Minimize2 size={16} strokeWidth={2.4} /> : <Maximize2 size={16} strokeWidth={2.4} />}
            <span>{isFs ? "Exit" : "Raw"}</span>
          </button>
          <button
            type="button"
            onClick={() => setQrOpen(true)}
            aria-label="Show QR code"
            title="QR code"
            className="inline-flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl border border-line bg-[#fafafa] px-1 py-2.5 text-[10px] font-semibold text-ink transition-all active:scale-[.97] sm:hover:bg-[#f0f0f0]"
          >
            <QrCode size={18} strokeWidth={2} />
            <span>QR</span>
          </button>
          <button
            type="button"
            onClick={copyLink}
            aria-label="Copy Link"
            className="inline-flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl border border-line bg-[#fafafa] px-1 py-2.5 text-[10px] font-semibold text-ink transition-all active:scale-[.97] sm:hover:bg-[#f0f0f0]"
          >
            {copiedKey === "url" ? (
              <span className="animate-copy-pop inline-flex">
                <Check size={17} strokeWidth={2.6} />
              </span>
            ) : (
              <Copy size={17} strokeWidth={2.2} />
            )}
            <span>Copy</span>
          </button>
          {canDelete && (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              aria-label="Delete"
              className="inline-flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl border border-line bg-[#fafafa] px-1 py-2.5 text-[10px] font-semibold text-danger transition-all active:scale-[.97] sm:hover:bg-[#fff0f0]"
            >
              <Trash2 size={17} strokeWidth={2.2} />
              <span>Delete</span>
            </button>
          )}
        </div>
      )}

      {uid && bodyReady && (
        <div className="mt-5 mb-4 animate-fade-up overflow-hidden rounded-[22px] border border-black/[.06] bg-white px-4 shadow-[0_8px_24px_-22px_rgba(0,0,0,.3)]">
          <div className="border-b border-black/[.06] py-3">
            <h2 className="text-[14px] font-semibold text-ink">Media metadata</h2>
            <p className="mt-0.5 text-[11.5px] text-ink-mute">
              Informasi file dan masa penyimpanannya.
            </p>
          </div>
          <div className="py-1">
            <MetaRow
              label="ID"
              value={mediaId}
              mono
              copied={copiedKey === "id"}
              onCopy={() => copyText(mediaId, "ID", "id")}
            />
            <MetaRow label="Owner" value={ownerDisplay} mono />
            <MetaRow
              label="Filename"
              value={filename}
              copied={copiedKey === "filename"}
              onCopy={() => copyText(filename, "Filename", "filename")}
            />
            <MetaRow label="Content" value={contentDisplay} />
            <MetaRow label="Size" value={sizeDisplay} />
            <MetaRow
              label="Expires"
              value={expiresDisplay}
              action={
                <button
                  type="button"
                  onClick={() => setEditExpiresOpen(true)}
                  className="flex-shrink-0 rounded-lg px-3 py-1.5 text-[11px] font-semibold text-ink-soft transition-colors sm:hover:bg-[#f5f5f5] sm:hover:text-ink active:opacity-60"
                >
                  Edit
                </button>
              }
            />
          </div>
        </div>
      )}

      {qrOpen && (
        <MediaQrModal
          mediaId={mediaId}
          onClose={() => setQrOpen(false)}
          onToast={showToast}
        />
      )}

      {modalOpen && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setModalOpen(false); }}
          className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-md flex items-center justify-center p-5"
        >
          <div className="w-full max-w-[380px] rounded-2xl bg-white border border-line p-6 animate-fade-up">
            {siteKey ? (
              <>
                <h2 className="text-[16px] font-semibold text-center mb-1 text-ink">
                  Verification Required
                </h2>
                <p className="text-[12.5px] text-ink-soft text-center mb-5">
                  Selesaikan verifikasi untuk mengunduh berkas.
                </p>
                <div className="flex justify-center mb-4">
                  <ReCAPTCHA
                    ref={recaptchaRef}
                    sitekey={siteKey}
                    onChange={onCaptchaSuccess}
                    onExpired={onCaptchaExpired}
                    theme="light"
                  />
                </div>
              </>
            ) : (
              <>
                <h2 className="text-[16px] font-semibold text-center mb-1 text-ink">
                  Verification Unavailable
                </h2>
                <p className="text-[12.5px] text-ink-soft text-center mb-5 leading-relaxed">
                  Fitur verifikasi sedang bermasalah. Silakan hubungi administrator.
                </p>
              </>
            )}
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="w-full px-4 py-3 rounded-xl bg-[#fafafa] border border-line text-ink text-[13px] font-semibold active:scale-[.97] transition-transform"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {editExpiresOpen && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget && !savingExpires) setEditExpiresOpen(false);
          }}
          className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-md flex items-center justify-center p-5"
        >
          <div className="w-full max-w-[380px] rounded-2xl bg-white border border-line p-5 animate-fade-up">
            <h2 className="text-[16px] font-semibold text-center mb-1 text-ink">
              Set expiry
            </h2>
            <p className="text-[12.5px] text-ink-soft text-center mb-4">
              Pilih masa berlaku media ini.
            </p>
            <div className="flex flex-col gap-1.5 mb-4">
              {EXPIRY_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => saveExpires(o.value)}
                  disabled={savingExpires}
                  className="w-full px-4 py-3 rounded-xl bg-[#fafafa] border border-line text-ink text-[13px] font-semibold active:scale-[.98] transition-transform disabled:opacity-60 text-left"
                >
                  {o.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setEditExpiresOpen(false)}
              disabled={savingExpires}
              className="w-full px-4 py-3 rounded-xl bg-white border border-line text-ink text-[13px] font-semibold active:scale-[.97] transition-transform disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget && !deleting) setConfirmDelete(false); }}
          className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-md flex items-center justify-center p-5"
        >
          <div className="w-full max-w-[360px] rounded-2xl bg-white border border-line p-6 animate-fade-up">
            <div className="w-12 h-12 rounded-full bg-[#fff0f0] mx-auto mb-4 flex items-center justify-center">
              <Trash2 size={22} className="text-danger" strokeWidth={2} />
            </div>
            <h2 className="text-[16px] font-semibold text-center mb-1.5 text-ink">
              Delete this media?
            </h2>
            <p className="text-[12.5px] text-ink-soft text-center mb-5 leading-relaxed">
              File ini akan dihapus secara permanen dari server. Tindakan ini tidak dapat dibatalkan.
            </p>
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
                className="flex-1 px-4 py-3 rounded-xl bg-[#fafafa] border border-line text-ink text-[13px] font-semibold active:scale-[.97] transition-transform disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={performDelete}
                disabled={deleting}
                className="flex-1 px-4 py-3 rounded-xl bg-danger sm:hover:bg-[#b91c1c] text-white text-[13px] font-semibold active:scale-[.97] transition-all disabled:opacity-60"
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed left-1/2 bottom-[calc(90px+env(safe-area-inset-bottom))] -translate-x-1/2 z-[200] px-4 py-2.5 rounded-xl bg-ink/95 text-white text-[12.5px] font-semibold shadow-2xl animate-fade-up">
          {toast}
        </div>
      )}
    </>
  );
}
