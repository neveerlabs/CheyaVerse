"use client";

import { useCallback, useEffect, useRef, useState, forwardRef } from "react";
import Link from "next/link";
import ReCAPTCHA from "react-google-recaptcha";
import {
  Image as ImageIcon, Download, Maximize2, Minimize2, Copy,
  Play, Pause, Home, AlertCircle, Trash2,
} from "lucide-react";
import { config } from "@/lib/config";

type Props = {
  uid?: string;
  mediaId: string;
  signedUrl: string;
  filename: string;
  contentType: string;
};

const VID_EXT = ["mp4", "webm", "mov", "mkv", "avi", "m4v"];
const IMG_EXT = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"];

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
};

const VideoPlayer = forwardRef<HTMLVideoElement, VideoProps>(
  function VideoPlayer({ src, onReady, onError }, externalRef) {
    const localRef = useRef<HTMLVideoElement | null>(null);
    const readySent = useRef(false);
    const [playing, setPlaying] = useState(false);
    const [ct, setCt] = useState(0);
    const [dur, setDur] = useState(0);

    function markReady() {
      if (readySent.current) return;
      readySent.current = true;
      onReady();
    }

    useEffect(() => {
      if (typeof externalRef === "function") externalRef(localRef.current);
      else if (externalRef) {
        (externalRef as React.MutableRefObject<HTMLVideoElement | null>).current =
          localRef.current;
      }
    }, [externalRef]);

    function toggle() {
      const v = localRef.current;
      if (!v) return;
      if (v.paused) v.play().catch(() => {});
      else v.pause();
    }

    return (
      <>
        <video
          ref={localRef}
          src={src}
          playsInline
          preload="auto"
          controls={false}
          controlsList="nodownload noplaybackrate noremoteplayback"
          disablePictureInPicture
          draggable={false}
          onClick={toggle}
          onLoadedMetadata={(e) => {
            const v = e.currentTarget;
            if (isFinite(v.duration)) setDur(v.duration);
            markReady();
          }}
          onLoadedData={markReady}
          onCanPlay={markReady}
          onTimeUpdate={(e) => setCt(e.currentTarget.currentTime)}
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
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 w-[68px] h-[68px] rounded-full bg-black/55 backdrop-blur-xl border-2 border-white/25 text-white flex items-center justify-center active:scale-95 transition-transform"
          >
            <Play size={26} className="fill-white ml-0.5" />
          </button>
        )}

        <div className="absolute left-0 right-0 bottom-0 z-[6] flex items-center gap-2.5 px-3 pt-6 pb-2.5 bg-gradient-to-t from-black/85 via-black/55 to-transparent">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); toggle(); }}
            aria-label={playing ? "Pause" : "Play"}
            className="w-8 h-8 rounded-full bg-white/15 backdrop-blur-md text-white flex items-center justify-center flex-shrink-0 active:scale-90 transition-transform"
          >
            {playing ? <Pause size={13} className="fill-white" /> : <Play size={13} className="fill-white ml-0.5" />}
          </button>
          <input
            type="range"
            className="progress flex-1"
            min={0}
            max={1000}
            step={1}
            value={dur ? Math.floor((ct / dur) * 1000) : 0}
            style={{ ["--p" as never]: `${dur ? (ct / dur) * 100 : 0}%` } as React.CSSProperties}
            onChange={(e) => {
              const v = localRef.current;
              if (!v || !dur) return;
              v.currentTime = (Number(e.target.value) / 1000) * dur;
            }}
          />
          <span className="text-[11.5px] font-semibold text-white tabular-nums whitespace-nowrap flex-shrink-0">
            {fmt(ct)} / {fmt(dur)}
          </span>
        </div>
      </>
    );
  },
);

export default function ViewerClient({
  uid, mediaId, signedUrl, filename, contentType,
}: Props) {
  const kind = detectKind(filename, contentType);
  const siteKey = config.recaptchaSiteKey;
  const homeHref = uid ? `/${uid}` : "/";
  const canDelete = Boolean(uid);

  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [isFs, setIsFs] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const mediaRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const recaptchaRef = useRef<ReCAPTCHA>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1800);
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
      setIsFs(!!(document.fullscreenElement || doc.webkitFullscreenElement));
    }
    document.addEventListener("fullscreenchange", onFs);
    document.addEventListener("webkitfullscreenchange", onFs);
    return () => {
      document.removeEventListener("fullscreenchange", onFs);
      document.removeEventListener("webkitfullscreenchange", onFs);
    };
  }, []);

  function toggleFs() {
    const el = mediaRef.current;
    if (!el) return;
    type FsEl = HTMLElement & { webkitRequestFullscreen?: () => void };
    type FsDoc = Document & {
      webkitExitFullscreen?: () => void;
      webkitFullscreenElement?: Element;
    };
    if (isFs) {
      const doc = document as FsDoc;
      (document.exitFullscreen || doc.webkitExitFullscreen)?.call(document);
    } else {
      const anyEl = el as FsEl;
      (el.requestFullscreen || anyEl.webkitRequestFullscreen)?.call(el);
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;

      if (e.key === "Escape") {
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
        if (v.paused) v.play().catch(() => {});
        else v.pause();
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        v.currentTime = Math.max(0, v.currentTime - 5);
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        if (isFinite(v.duration) && v.duration > 0) {
          v.currentTime = Math.min(v.duration, v.currentTime + 5);
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
  }, [modalOpen, isFs, confirmDelete]);

  function triggerDownload(recaptchaToken: string) {
    window.location.href = `/download/${encodeURIComponent(mediaId)}?token=${encodeURIComponent(recaptchaToken)}`;
  }

  function startDownload() {
    if (!token) {
      setModalOpen(true);
      return;
    }
    triggerDownload(token);
  }

  function onCaptchaSuccess(value: string | null) {
    if (!value) return;
    setToken(value);
    setModalOpen(false);
    showToast("Verifikasi berhasil");
    triggerDownload(value);
  }

  function onCaptchaExpired() {
    setToken(null);
    showToast("Verifikasi expired, coba lagi");
  }

  function copyLink() {
    const url = `${window.location.origin}/m/${encodeURIComponent(mediaId)}`;
    if (navigator.clipboard?.writeText && window.isSecureContext) {
      navigator.clipboard.writeText(url).then(
        () => showToast("Link disalin"),
        () => showToast("Gagal menyalin"),
      );
    } else {
      const ta = document.createElement("textarea");
      ta.value = url;
      ta.style.position = "fixed";
      ta.style.top = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); showToast("Link disalin"); }
      catch { showToast("Gagal menyalin"); }
      document.body.removeChild(ta);
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
        showToast("Media dihapus");
        setTimeout(() => { window.location.href = `/${uid}/media`; }, 500);
      } else {
        showToast("Gagal menghapus media");
        setDeleting(false);
        setConfirmDelete(false);
      }
    } catch {
      showToast("Gagal menghapus media");
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  if (failed) {
    return (
      <>
        <div className="flex items-center gap-3 px-1 pt-8 pb-5">
          <div className="w-11 h-11 rounded-xl bg-ink flex items-center justify-center flex-shrink-0">
            <AlertCircle size={22} className="text-white" />
          </div>
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
          <h2 className="text-[15px] font-semibold mb-1.5 text-ink">File tidak ditemukan</h2>
          <p className="text-[12.5px] text-ink-soft mb-5">
            Kemungkinan link salah, file sudah expired, atau telah dihapus.
          </p>
          <Link href={homeHref}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-ink text-white text-[13px] font-semibold">
            <Home size={15} /> Beranda
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="flex items-center gap-3 px-1 pt-8 pb-5">
        <div className="w-11 h-11 rounded-xl bg-ink flex items-center justify-center flex-shrink-0">
          <ImageIcon size={22} className="text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-[15px] font-semibold truncate text-ink">{filename}</h1>
          <p className="text-[12px] text-ink-soft truncate">{mediaId} · available for 30 days</p>
        </div>
      </div>

      <div
        ref={mediaRef}
        className="protect-zone relative rounded-2xl overflow-hidden bg-black w-full mb-4 animate-fade-up"
        style={{ aspectRatio: "4 / 3", maxHeight: "70vh" }}
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
              Memuat
            </span>
          </div>
        )}

        {kind === "video" && (
          <VideoPlayer
            ref={videoRef}
            src={signedUrl}
            onReady={() => setReady(true)}
            onError={() => setFailed(true)}
          />
        )}

        {kind === "image" && (
          <img
            src={signedUrl}
            alt={filename}
            draggable={false}
            onLoad={() => setReady(true)}
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
              Preview tidak tersedia untuk tipe file ini
            </p>
          </div>
        )}

        {kind !== "other" && ready && (
          <button
            type="button"
            onClick={toggleFs}
            aria-label="Fullscreen"
            className="absolute top-2.5 right-2.5 z-30 w-9 h-9 rounded-full bg-black/50 backdrop-blur-md border border-white/15 text-white flex items-center justify-center active:scale-90 transition-transform"
          >
            {isFs ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
          </button>
        )}
      </div>

      {(ready || kind === "other") && (
        <div className="flex gap-2 mb-3 animate-fade-up">
          <button
            type="button"
            onClick={startDownload}
            className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-3.5 rounded-xl bg-ink hover:bg-accent-hover text-white text-[13px] font-semibold transition-all active:scale-[.97]"
          >
            <Download size={15} strokeWidth={2.4} /> Download
          </button>
          <button
            type="button"
            onClick={toggleFs}
            className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-3.5 rounded-xl bg-[#fafafa] hover:bg-[#f0f0f0] border border-line text-ink text-[13px] font-semibold transition-all active:scale-[.97]"
          >
            {isFs ? <Minimize2 size={15} strokeWidth={2.4} /> : <Maximize2 size={15} strokeWidth={2.4} />}
            {isFs ? "Exit" : "Raw"}
          </button>
          <button
            type="button"
            onClick={copyLink}
            aria-label="Copy Link"
            className="w-11 inline-flex items-center justify-center rounded-xl bg-[#fafafa] hover:bg-[#f0f0f0] border border-line text-ink transition-all active:scale-[.97] flex-shrink-0"
          >
            <Copy size={17} strokeWidth={2.2} />
          </button>
          {canDelete && (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              aria-label="Hapus"
              className="w-11 inline-flex items-center justify-center rounded-xl bg-[#fafafa] hover:bg-[#fff0f0] border border-line text-danger transition-all active:scale-[.97] flex-shrink-0"
            >
              <Trash2 size={17} strokeWidth={2.2} />
            </button>
          )}
        </div>
      )}

      {modalOpen && siteKey && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setModalOpen(false); }}
          className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-md flex items-center justify-center p-5"
        >
          <div className="w-full max-w-[380px] rounded-2xl bg-white border border-line p-6 animate-fade-up">
            <h2 className="text-[16px] font-semibold text-center mb-1 text-ink">
              Verifikasi Diperlukan
            </h2>
            <p className="text-[12.5px] text-ink-soft text-center mb-5">
              Selesaikan verifikasi untuk mengunduh file.
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
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="w-full px-4 py-3 rounded-xl bg-[#fafafa] border border-line text-ink text-[13px] font-semibold active:scale-[.97] transition-transform"
            >
              Batal
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
              Hapus media ini?
            </h2>
            <p className="text-[12.5px] text-ink-soft text-center mb-5 leading-relaxed">
              File akan dihapus permanen dari server. Tindakan ini tidak bisa dibatalkan.
            </p>
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
                className="flex-1 px-4 py-3 rounded-xl bg-[#fafafa] border border-line text-ink text-[13px] font-semibold active:scale-[.97] transition-transform disabled:opacity-60"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={performDelete}
                disabled={deleting}
                className="flex-1 px-4 py-3 rounded-xl bg-danger hover:bg-[#b91c1c] text-white text-[13px] font-semibold active:scale-[.97] transition-all disabled:opacity-60"
              >
                {deleting ? "Menghapus…" : "Hapus"}
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