"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ReCAPTCHA from "react-google-recaptcha";
import {
  MoreVertical,
  X,
  User as UserIcon,
  Camera,
  Image as ImageIcon,
  Settings,
  Shield,
  FileText,
  LifeBuoy,
  ExternalLink,
  Trash2,
  Copy,
  Download,
  Smartphone,
} from "lucide-react";
import { VideoThumbnail } from "@/components/VideoThumbnail";
import { TelegramAvatar } from "@/components/TelegramAvatar";
import { config } from "@/lib/config";
import { CoverIcon } from "@/lib/cover-icons";
import type { CoverConfig } from "@/lib/storage";
import { VerifiedName } from "@/components/VerifiedName";

type Info = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
} | null;

type Stats = { total: number; active: number; expired: number };

type MediaItem = {
  id: string;
  filename: string;
  content_type: string;
  expires_at: string;
  thumbnailUrl: string | null;
};

type MenuEntry = {
  href: string;
  label: string;
  icon: React.ReactNode;
};

const LONG_PRESS_MS = 480;
const EAGER_LIMIT = 6;
const DEVICE_ID_KEY = "cheya_device_id";

function isImage(type: string): boolean {
  return type.startsWith("image/");
}

function isVideo(type: string): boolean {
  return type.startsWith("video/");
}

export function ProfileClient({
  uid,
  isAdmin,
  info,
  displayName,
  stats,
  media,
  cover,
}: {
  uid: string;
  isAdmin: boolean;
  info: Info;
  displayName: string | null;
  stats: Stats;
  media: MediaItem[];
  cover: CoverConfig | null;
}) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<{ x: number; y: number } | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [avatarUsingProxy, setAvatarUsingProxy] = useState(!info?.photo_url);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [logoutDialog, setLogoutDialog] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const [mounted, setMounted] = useState(false);
  const [headerVisible, setHeaderVisible] = useState(false);

  const [localMedia, setLocalMedia] = useState<MediaItem[]>(media);
  const [menuItem, setMenuItem] = useState<MediaItem | null>(null);
  const [menuItemAnchor, setMenuItemAnchor] = useState<{ x: number; y: number } | null>(null);
  const [deleteItem, setDeleteItem] = useState<MediaItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [captchaItem, setCaptchaItem] = useState<MediaItem | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const pillTriggerRef = useRef<HTMLButtonElement | null>(null);
  const coverRef = useRef<HTMLDivElement | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const scaleRef = useRef(1);
  const txRef = useRef(0);
  const tyRef = useRef(0);
  const lpTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lpTriggered = useRef(false);
  const recaptchaRef = useRef<ReCAPTCHA>(null);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    const el = coverRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        const past =
          entry.boundingClientRect.bottom < 40 ||
          !entry.isIntersecting;
        setHeaderVisible(past);
      },
      { threshold: 0, rootMargin: "-40px 0px 0px 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    setLocalMedia(media);
  }, [media]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;

    const read = (): boolean => {
      try {
        const v = window.localStorage.getItem(DEVICE_ID_KEY);
        if (v && !cancelled) {
          setDeviceId(v);
          return true;
        }
      } catch {}
      return false;
    };

    if (read()) return () => { cancelled = true; };

    const iv = window.setInterval(() => {
      if (read()) window.clearInterval(iv);
    }, 500);

    const stop = window.setTimeout(() => window.clearInterval(iv), 10000);

    return () => {
      cancelled = true;
      window.clearInterval(iv);
      window.clearTimeout(stop);
    };
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    setIsMobile(mq.matches);
    const h = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") closeMenu();
    }
    function onScroll() {
      closeMenu();
    }
    document.addEventListener("keydown", onEsc);
    document.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("keydown", onEsc);
      document.removeEventListener("scroll", onScroll, true);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!menuItem) return;
    function onAny(e: MouseEvent) {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      if (t.closest("[data-media-menu]") || t.closest("[data-media-menu-trigger]")) return;
      setMenuItem(null);
      setMenuItemAnchor(null);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setMenuItem(null);
        setMenuItemAnchor(null);
      }
    }
    document.addEventListener("mousedown", onAny);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onAny);
      document.removeEventListener("keydown", onEsc);
    };
  }, [menuItem]);

  useEffect(() => {
    const inner = innerRef.current;

    if (!avatarOpen) {
      scaleRef.current = 1;
      txRef.current = 0;
      tyRef.current = 0;
      if (inner) {
        inner.style.transition = "";
        inner.style.transform = "translate3d(0px, 0px, 0) scale(1)";
      }
      return;
    }

    const modal = modalRef.current;
    if (!modal || !inner) return;

    const circleEl = inner.parentElement as HTMLElement | null;
    if (!circleEl) return;

    let startDist = 0;
    let startScale = 1;
    let startM0x = 0;
    let startM0y = 0;
    let startTx = 0;
    let startTy = 0;
    let circleCx = 0;
    let circleCy = 0;
    let circleR = 0;
    let pinching = false;
    let panning = false;
    let panStartX = 0;
    let panStartY = 0;
    let panStartTx = 0;
    let panStartTy = 0;

    const MAX_SCALE = 4;

    function readCircle() {
      const r = circleEl!.getBoundingClientRect();
      circleCx = r.left + r.width / 2;
      circleCy = r.top + r.height / 2;
      circleR = r.width / 2;
    }

    function clampT(tx: number, ty: number, s: number): [number, number] {
      const m = circleR * Math.max(0, s - 1);
      const cx = tx < -m ? -m : tx > m ? m : tx;
      const cy = ty < -m ? -m : ty > m ? m : ty;
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

    function onTS(e: TouchEvent) {
      readCircle();
      if (e.touches.length >= 2) {
        e.preventDefault();
        startDist = dist(e.touches);
        startScale = scaleRef.current;
        startM0x = (e.touches[0].clientX + e.touches[1].clientX) / 2 - circleCx;
        startM0y = (e.touches[0].clientY + e.touches[1].clientY) / 2 - circleCy;
        startTx = txRef.current;
        startTy = tyRef.current;
        pinching = true;
        panning = false;
        inner!.style.transition = "";
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
        const m1x = (e.touches[0].clientX + e.touches[1].clientX) / 2 - circleCx;
        const m1y = (e.touches[0].clientY + e.touches[1].clientY) / 2 - circleCy;
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
        panning = false;
        resetZoom();
      } else if (e.touches.length === 1 && scaleRef.current > 1.005) {
        panning = true;
        panStartX = e.touches[0].clientX;
        panStartY = e.touches[0].clientY;
        panStartTx = txRef.current;
        panStartTy = tyRef.current;
      }
    }

    modal.addEventListener("touchstart", onTS, { passive: false });
    modal.addEventListener("touchmove", onTM, { passive: false });
    modal.addEventListener("touchend", onTE);
    modal.addEventListener("touchcancel", onTE);
    return () => {
      modal.removeEventListener("touchstart", onTS);
      modal.removeEventListener("touchmove", onTM);
      modal.removeEventListener("touchend", onTE);
      modal.removeEventListener("touchcancel", onTE);
    };
  }, [avatarOpen]);

  const greetingName =
    displayName ||
    info?.username ||
    info?.first_name ||
    (info ? [info.first_name, info.last_name].filter(Boolean).join(" ") : "") ||
    "there";

  const avatarSrc = avatarUsingProxy
    ? `/api/avatar/${uid}`
    : info?.photo_url;

  useEffect(() => {
    setAvatarUsingProxy(!info?.photo_url);
    setAvatarFailed(false);
  }, [info?.photo_url, uid]);

  function handleAvatarError() {
    if (!avatarUsingProxy) {
      setAvatarUsingProxy(true);
      return;
    }
    setAvatarFailed(true);
  }

  function openMenu() {
    const anchorEl = headerVisible ? pillTriggerRef.current : triggerRef.current;
    if (anchorEl) {
      const rect = anchorEl.getBoundingClientRect();
      const menuWidth = 240;
      const menuHeight = 360;
      let left = rect.right - menuWidth;
      if (left < 12) left = 12;
      let top = rect.bottom + 8;
      if (top + menuHeight > window.innerHeight - 12) {
        top = rect.top - menuHeight - 8;
        if (top < 12) top = Math.max(12, window.innerHeight - menuHeight - 12);
      }
      setMenuAnchor({ x: left, y: top });
    }
    setMenuOpen(true);
  }

  function closeMenu() {
    setMenuOpen(false);
    setMenuAnchor(null);
  }

  function showToast(msg: string) {
    setToast(msg.replace(/[.!?…]+$/, ""));
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1600);
  }

  async function copyId() {
    if (!deviceId) {
      showToast("ID perangkat belum tersedia.");
      return;
    }

    try {
      if (navigator.clipboard?.writeText && window.isSecureContext) {
        await navigator.clipboard.writeText(deviceId);
        showToast("DeviceID copied");
      } else {
        const ta = document.createElement("textarea");
        ta.value = deviceId;
        ta.style.position = "fixed";
        ta.style.top = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        showToast("DeviceID copied");
      }
    } catch {
      showToast("DeviceID cannot be copied");
    }
  }

  async function logOut() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      const response = await fetch("/api/session/logout", {
        method: "POST",
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(`Sesi tidak dapat diakhiri (${response.status}).`);
      }
      try {
        window.localStorage.removeItem(DEVICE_ID_KEY);
      } catch {}
      window.location.replace("/login");
    } catch (cause) {
      setLogoutError(
        cause instanceof Error ? cause.message : "Sesi tidak dapat diakhiri.",
      );
      setLoggingOut(false);
    }
  }

  function openMediaMenu(item: MediaItem, anchorEl?: HTMLElement | null) {
    if (isMobile) {
      setMenuItemAnchor(null);
    } else if (anchorEl) {
      const rect = anchorEl.getBoundingClientRect();
      const menuWidth = 240;
      const menuHeight = 280;
      let left = rect.right - menuWidth;
      if (left < 12) left = 12;
      let top = rect.bottom + 6;
      if (top + menuHeight > window.innerHeight - 12) {
        top = rect.top - menuHeight - 6;
        if (top < 12) top = Math.max(12, window.innerHeight - menuHeight - 12);
      }
      setMenuItemAnchor({ x: left, y: top });
    } else {
      setMenuItemAnchor(null);
    }
    setMenuItem(item);
  }

  function closeMediaMenu() {
    setMenuItem(null);
    setMenuItemAnchor(null);
  }

  function startLongPress(item: MediaItem) {
    lpTriggered.current = false;
    if (lpTimer.current) clearTimeout(lpTimer.current);
    lpTimer.current = setTimeout(() => {
      lpTriggered.current = true;
      setMenuItemAnchor(null);
      setMenuItem(item);
      if (navigator.vibrate) navigator.vibrate(15);
    }, LONG_PRESS_MS);
  }

  function cancelLongPress() {
    if (lpTimer.current) {
      clearTimeout(lpTimer.current);
      lpTimer.current = null;
    }
  }

  function handleMediaClickCapture(e: React.MouseEvent) {
    if (lpTriggered.current) {
      e.preventDefault();
      e.stopPropagation();
      lpTriggered.current = false;
    }
  }

  async function doDelete(item: MediaItem) {
    setBusy(true);
    try {
      const res = await fetch(`/api/media/${item.id}?uid=${encodeURIComponent(uid)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setLocalMedia((prev) => prev.filter((x) => x.id !== item.id));
        showToast("Media berhasil dihapus.");
        setDeleteItem(null);
        closeMediaMenu();
        router.refresh();
        return;
      }
      const j = await res.json().catch(() => ({}));
      const reason = (j as { error?: string })?.error;
      if (res.status === 404 || reason === "not_found") {
        showToast("Media sudah tidak tersedia.");
        setLocalMedia((prev) => prev.filter((x) => x.id !== item.id));
      } else if (res.status === 403 || reason === "forbidden") {
        showToast("Media ini bukan milik Anda.");
      } else if (reason === "db_error") {
        showToast("Media tidak dapat dihapus.");
      } else {
        showToast(`Media tidak dapat dihapus (${res.status}).`);
      }
      setDeleteItem(null);
      closeMediaMenu();
    } catch {
      showToast("Koneksi bermasalah. Silakan coba kembali.");
    } finally {
      setBusy(false);
    }
  }

  function doCopy(item: MediaItem) {
    const url = `${window.location.origin}/m/${item.id}`;
    if (navigator.clipboard?.writeText && window.isSecureContext) {
      navigator.clipboard.writeText(url).then(
        () => showToast("Tautan berhasil disalin."),
        () => showToast("Tautan tidak dapat disalin."),
      );
    } else {
      const ta = document.createElement("textarea");
      ta.value = url;
      ta.style.position = "fixed";
      ta.style.top = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        showToast("Tautan berhasil disalin.");
      } catch {
        showToast("Tautan tidak dapat disalin.");
      }
      document.body.removeChild(ta);
    }
    closeMediaMenu();
  }

  function startDownloadFlow(item: MediaItem) {
    setCaptchaItem(item);
    setCaptchaToken(null);
    closeMediaMenu();
  }

  function onCaptchaSuccess(value: string | null) {
    if (!value) return;
    setCaptchaToken(value);
    const id = captchaItem?.id;
    setCaptchaItem(null);
    if (!id) return;
    window.location.href = `/download/${encodeURIComponent(id)}?token=${encodeURIComponent(value)}`;
  }

  function onCaptchaExpired() {
    setCaptchaToken(null);
    showToast("Verifikasi kedaluwarsa. Silakan coba kembali.");
  }

  function openDelete(item: MediaItem) {
    setDeleteItem(item);
    closeMediaMenu();
  }

  const MENU: MenuEntry[] = [
    {
      href: `/${uid}/profile/settings`,
      label: "Settings",
      icon: <Settings size={18} strokeWidth={1.8} />,
    },
    {
      href: `/${uid}/profile/privacy`,
      label: "Privacy Policy",
      icon: <Shield size={18} strokeWidth={1.8} />,
    },
    {
      href: `/${uid}/profile/agreement`,
      label: "User Agreement",
      icon: <FileText size={18} strokeWidth={1.8} />,
    },
    {
      href: `/${uid}/profile/support`,
      label: "Help Center",
      icon: <LifeBuoy size={18} strokeWidth={1.8} />,
    },
    {
      href: `/${uid}/profile/link-device`,
      label: "Link a device",
      icon: <Smartphone size={18} strokeWidth={1.8} />,
    },
  ];

  const pillHeader = (
    <header
      aria-hidden={!headerVisible}
      className={`fixed left-0 right-0 top-0 z-[60] pointer-events-none transition-all duration-300 ease-out ${
        headerVisible
          ? "opacity-100 translate-y-0"
          : "opacity-0 -translate-y-full"
      }`}
    >
      <div className="mx-auto max-w-[600px] px-5 pt-[calc(12px+env(safe-area-inset-top))]">
        <div
          className={`flex items-center gap-2.5 rounded-full border border-white/10 bg-black/60 backdrop-blur-xl pl-1.5 pr-1.5 py-1.5 shadow-[0_8px_24px_-8px_rgba(0,0,0,.5)] ${
            headerVisible ? "pointer-events-auto" : ""
          }`}
        >
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/15 bg-[#1a1a1a]">
            {!avatarFailed && avatarSrc ? (
              <img
                src={avatarSrc}
                alt=""
                draggable={false}
                onError={handleAvatarError}
                className="h-full w-full object-cover"
              />
            ) : (
              <TelegramAvatar
                src={null}
                className="h-full w-full text-white/60"
              />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13.5px] font-semibold text-white leading-tight">
              Hi, {greetingName}
            </span>
          </span>
          <button
            ref={pillTriggerRef}
            type="button"
            data-profile-menu-trigger
            onClick={(e) => {
              e.stopPropagation();
              if (menuOpen) closeMenu();
              else openMenu();
            }}
            aria-label="Menu"
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-white/85 transition-all active:scale-90 hover:text-white sm:hover:bg-white/10"
          >
            <MoreVertical size={18} strokeWidth={2} />
          </button>
        </div>
      </div>
    </header>
  );

  return (
    <>
      {mounted && createPortal(pillHeader, document.body)}

      <section className="-mx-5 animate-fade-up">
        <div ref={coverRef} className="relative h-[180px] overflow-hidden">
          {cover && (cover.type === "upload" || cover.type === "telegram") ? (
            <div
              className="absolute inset-0"
              style={{
                backgroundImage: `url(/api/cover/${uid}/image?v=${cover.updated_at ?? ""})`,
                backgroundSize: `${cover.bg_size ?? 100}% auto`,
                backgroundPosition: `${cover.bg_x ?? 50}% ${cover.bg_y ?? 50}%`,
                backgroundRepeat: "no-repeat",
                backgroundColor: "#f5f5f5",
              }}
            />
          ) : cover && cover.type === "color" ? (
            <div
              className="absolute inset-0 flex items-center justify-center"
              style={{
                background: `linear-gradient(135deg, ${cover.color1 ?? "#3b82f6"}, ${cover.color2 ?? "#93c5fd"})`,
              }}
            >
              <div
                aria-hidden
                className="absolute inset-0"
                style={{
                  background:
                    "radial-gradient(ellipse at center, rgba(255,255,255,.3) 0%, rgba(255,255,255,0) 60%)",
                }}
              />
              <div
                aria-hidden
                className="absolute inset-0 opacity-30 mix-blend-overlay"
                style={{
                  background:
                    "linear-gradient(180deg, rgba(255,255,255,.2) 0%, rgba(0,0,0,.3) 100%)",
                }}
              />
              {cover.icon && (
                <CoverIcon
                  name={cover.icon}
                  size={140}
                  className="relative text-white drop-shadow-[0_8px_24px_rgba(0,0,0,.4)]"
                />
              )}
            </div>
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-[#e5e5e7] via-[#f0f0f2] to-[#e0e0e2]">
              <span
                aria-hidden
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[11px] text-ink-mute/50 tracking-[.14em] select-none pointer-events-none"
              >
                1080 × 360
              </span>
            </div>
          )}

          <button
            ref={triggerRef}
            type="button"
            data-profile-menu-trigger
            onClick={(e) => {
              e.stopPropagation();
              if (menuOpen) closeMenu();
              else openMenu();
            }}
            aria-label="Menu"
            className={`absolute top-3 right-2 z-20 w-9 h-9 rounded-full flex items-center justify-center sm:hover:bg-black/5 active:scale-90 transition-all ${
              cover ? "text-white drop-shadow-[0_1px_3px_rgba(0,0,0,.55)]" : "text-ink"
            }`}
          >
            <MoreVertical size={20} strokeWidth={2} />
          </button>

          <Link
            href={`/${uid}/profile/cover`}
            aria-label="Edit cover"
            className={`absolute bottom-1.5 right-2 z-20 w-9 h-9 rounded-full flex items-center justify-center sm:hover:bg-black/5 active:scale-90 transition-all ${
              cover ? "text-white drop-shadow-[0_1px_3px_rgba(0,0,0,.55)]" : "text-ink-soft/60"
            }`}
          >
            <Camera size={18} strokeWidth={1.8} />
          </Link>
        </div>

        <div className="px-5 flex items-end -mt-14 relative z-10">
          <div
            onClick={() => setAvatarOpen(true)}
            className={`w-[104px] h-[104px] flex-shrink-0 rounded-full border-4 border-white bg-[#f4f4f5] overflow-hidden shadow-[0_4px_16px_-6px_rgba(0,0,0,.18)] flex items-center justify-center cursor-pointer active:scale-95 transition-all duration-300 ease-out ${
              headerVisible
                ? "opacity-0 scale-75 pointer-events-none"
                : "opacity-100 scale-100"
            }`}
          >
            {!avatarFailed && avatarSrc ? (
              <img
                src={avatarSrc}
                alt=""
                draggable={false}
                onError={handleAvatarError}
                className="w-full h-full object-cover"
              />
            ) : (
              <TelegramAvatar
                src={null}
                className="h-full w-full text-ink-mute"
              />
            )}
          </div>
          <div className="pl-3 pb-1 min-w-0 flex-1 translate-y-2">
            <h1 className="flex items-center gap-1 text-[22px] font-bold tracking-[-.03em] text-ink leading-tight truncate">
              {isAdmin ? (
                <>
                  <span className="shrink-0">Hi,</span>
                  <VerifiedName
                    name={greetingName}
                    size="sm"
                    nameClassName="text-[22px] leading-tight"
                  />
                </>
              ) : (
                `Hi, ${greetingName}`
              )}
            </h1>
            <p className="text-[13px] text-ink-mute font-normal mt-0.5 truncate">
              Your device profile
            </p>
          </div>
        </div>
      </section>

      <section className="mt-5 animate-fade-up">
        <button
          type="button"
          onClick={copyId}
          disabled={!deviceId}
          className="w-full rounded-2xl bg-[#f5f5f5] sm:hover:bg-[#ededed] active:scale-[.99] px-4 py-3.5 text-center transition-all disabled:opacity-60"
        >
          <p className="text-[13.5px] text-ink-soft leading-none">
            <span className="font-medium">DeviceID: </span>
            <span className="font-semibold text-ink tabular-nums tracking-[-.005em]">
              {deviceId ?? "Loading…"}
            </span>
          </p>
          <p className="text-[10.5px] text-ink-mute mt-1.5 leading-none">
            Tap to copy
          </p>
        </button>
        <div className="mt-3 flex items-center justify-center gap-3 text-[12px] text-ink-mute">
          <span>
            <span className="font-semibold text-ink-soft tabular-nums">{stats.total}</span>{" "}
            total
          </span>
          <span className="w-px h-3 bg-divider" />
          <span>
            <span className="font-semibold text-ink-soft tabular-nums">{stats.active}</span>{" "}
            active
          </span>
          <span className="w-px h-3 bg-divider" />
          <span>
            <span className="font-semibold text-ink-soft tabular-nums">{stats.expired}</span>{" "}
            expired
          </span>
        </div>
      </section>

      <section className="mt-6 animate-fade-up">
        {localMedia.length === 0 ? (
          <div className="px-1 py-20 text-center animate-fade-up">
            <div className="w-14 h-14 rounded-full bg-[#f5f5f5] mx-auto mb-4 flex items-center justify-center">
              <ImageIcon size={22} className="text-ink-mute" strokeWidth={1.8} />
            </div>
            <p className="text-[14.5px] font-medium text-ink mb-1.5">No media yet</p>
            <p className="text-[12.5px] text-ink-mute font-normal leading-relaxed">
              Belum ada media yang diunggah
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 sm:gap-2 px-1">
            {localMedia.map((m, idx) => (
              <div
                key={m.id}
                className="relative aspect-square rounded-xl overflow-hidden bg-[#f5f5f5] border border-line"
                onTouchStart={() => startLongPress(m)}
                onTouchEnd={cancelLongPress}
                onTouchMove={cancelLongPress}
                onTouchCancel={cancelLongPress}
                onContextMenu={(e) => {
                  e.preventDefault();
                  openMediaMenu(m);
                }}
              >
                <Link
                  href={`/${uid}/m/${m.id}`}
                  onClick={handleMediaClickCapture}
                  className="block w-full h-full"
                >
                  {isImage(m.content_type) && m.thumbnailUrl ? (
                    <img
                      src={m.thumbnailUrl}
                      alt={m.filename}
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                  ) : isVideo(m.content_type) && m.thumbnailUrl ? (
                    <VideoThumbnail
                      src={m.thumbnailUrl}
                      iconSize={24}
                      priority={idx < EAGER_LIMIT}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-ink-mute">
                      <ImageIcon size={22} strokeWidth={1.6} />
                    </div>
                  )}
                </Link>
                <button
                  type="button"
                  data-media-menu-trigger
                  onClick={(e) => {
                    e.stopPropagation();
                    if (menuItem?.id === m.id) {
                      closeMediaMenu();
                    } else {
                      openMediaMenu(m, e.currentTarget);
                    }
                  }}
                  aria-label="Menu"
                  className={`absolute top-1.5 right-1.5 w-8 h-8 flex items-center justify-center
                              active:scale-90 transition-transform
                              ${menuItem?.id === m.id ? "text-white" : "text-white/85 hover:text-white"}`}
                  style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,.5))" }}
                >
                  <MoreVertical size={18} strokeWidth={2.4} />
                </button>
                <div className="absolute bottom-0 left-0 right-0 px-2 pt-6 pb-2 pointer-events-none
                                bg-gradient-to-t from-black/80 via-black/40 to-transparent">
                  <p className="text-white text-[11px] font-medium truncate leading-tight">
                    {m.filename}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {toast && (
        <div className="fixed left-1/2 bottom-[calc(80px+env(safe-area-inset-bottom))] -translate-x-1/2 z-[200] px-4 py-2.5 rounded-xl bg-ink/95 text-white text-[12.5px] font-semibold shadow-2xl animate-fade-up">
          {toast}
        </div>
      )}

      {menuItem && isMobile && (
        <div
          data-media-menu
          data-hide-bot-launcher="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeMediaMenu();
          }}
          className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-end justify-center"
        >
          <div data-report-anchor="sheet" className="w-full bg-white border-t border-line
                          rounded-t-3xl p-2 pt-3 animate-fade-up pb-[calc(12px+env(safe-area-inset-bottom))]">
            <div className="w-10 h-1 rounded-full bg-[#e0e0e0] mx-auto mb-3" />
            <div className="px-3 pb-2 mb-1 border-b border-divider">
              <p className="text-[13px] font-semibold text-ink truncate">{menuItem.filename}</p>
              <p className="text-[11px] text-ink-mute font-mono mt-0.5">{menuItem.id}</p>
            </div>
            <MenuItem
              icon={<ExternalLink size={18} strokeWidth={1.9} />}
              label="Open"
              onClick={() => {
                router.push(`/${uid}/m/${menuItem.id}`);
              }}
            />
            <MenuItem
              icon={<Copy size={18} strokeWidth={1.9} />}
              label="Copy link"
              onClick={() => doCopy(menuItem)}
            />
            <MenuItem
              icon={<Download size={18} strokeWidth={1.9} />}
              label="Download"
              onClick={() => startDownloadFlow(menuItem)}
            />
            <MenuItem
              icon={<Trash2 size={18} strokeWidth={1.9} />}
              label="Delete"
              danger
              onClick={() => openDelete(menuItem)}
            />
            <button
              type="button"
              onClick={closeMediaMenu}
              className="w-full mt-1 px-4 py-3 rounded-xl bg-[#fafafa] border border-line
                         text-ink text-[13px] font-semibold active:scale-[.97] transition-transform"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {menuItem && !isMobile && menuItemAnchor && (
        <div
          data-media-menu
          style={{ top: menuItemAnchor.y, left: menuItemAnchor.x, width: 240 }}
          className="fixed z-[100] bg-white border border-line rounded-2xl shadow-[0_10px_40px_-8px_rgba(0,0,0,.18),0_2px_8px_-2px_rgba(0,0,0,.08)] overflow-hidden animate-fade-up"
        >
          <div className="px-3.5 py-2.5 border-b border-divider">
            <p className="text-[12.5px] font-semibold text-ink truncate">{menuItem.filename}</p>
            <p className="text-[10.5px] text-ink-mute font-mono mt-0.5">{menuItem.id}</p>
          </div>
          <div className="p-1">
            <DropdownItem
              icon={<ExternalLink size={16} strokeWidth={1.9} />}
              label="Open"
              onClick={() => {
                router.push(`/${uid}/m/${menuItem.id}`);
              }}
            />
            <DropdownItem
              icon={<Copy size={16} strokeWidth={1.9} />}
              label="Copy link"
              onClick={() => doCopy(menuItem)}
            />
            <DropdownItem
              icon={<Download size={16} strokeWidth={1.9} />}
              label="Download"
              onClick={() => startDownloadFlow(menuItem)}
            />
            <DropdownItem
              icon={<Trash2 size={16} strokeWidth={1.9} />}
              label="Delete"
              danger
              onClick={() => openDelete(menuItem)}
            />
          </div>
        </div>
      )}

      {deleteItem && (
        <div
          data-hide-bot-launcher="true"
          onClick={(e) => {
            if (e.target === e.currentTarget && !busy) setDeleteItem(null);
          }}
          className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-md flex items-center justify-center p-5"
        >
          <div data-report-anchor="left" data-report-gap="4" data-report-shift-right="2" data-report-resume-align="true" data-report-resume-shift-left="2" className="w-full max-w-[360px] rounded-2xl bg-white border border-line p-6 animate-fade-up">
            <h2 className="text-[16px] font-semibold text-center mb-1.5 text-ink">Delete this media?</h2>
            <p className="text-[12.5px] text-ink-soft text-center mb-1.5 leading-relaxed">
              <span className="font-semibold text-ink break-all">{deleteItem.filename}</span>
            </p>
            <p className="text-[12px] text-ink-mute text-center mb-5 leading-relaxed">
              File akan dihapus secara permanen dari server. Tindakan ini tidak dapat dibatalkan.
            </p>
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => setDeleteItem(null)}
                disabled={busy}
                className="flex-1 px-4 py-3 rounded-xl bg-[#fafafa] border border-line text-ink
                           text-[13px] font-semibold active:scale-[.97] transition-transform disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => doDelete(deleteItem)}
                disabled={busy}
                className="flex-1 px-4 py-3 rounded-xl bg-danger hover:bg-[#b91c1c] text-white
                           text-[13px] font-semibold active:scale-[.97] transition-all disabled:opacity-60"
              >
                {busy ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {captchaItem && config.recaptchaSiteKey && (
        <div
          data-hide-bot-launcher="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setCaptchaItem(null);
          }}
          className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-md flex items-center justify-center p-5"
        >
          <div data-report-anchor="left" data-report-shift-right="2" data-report-resume-align="true" data-report-resume-shift-left="2" className="w-full max-w-[380px] rounded-2xl bg-white border border-line p-6 animate-fade-up">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-[16px] font-semibold text-ink">
                Verification required
              </h2>
              <button
                type="button"
                onClick={() => setCaptchaItem(null)}
                aria-label="Close"
                className="w-7 h-7 rounded-full flex items-center justify-center text-ink-mute hover:text-ink hover:bg-[#f5f5f5] transition-colors"
              >
                <X size={16} strokeWidth={2.2} />
              </button>
            </div>
            <p className="text-[12.5px] text-ink-soft mb-5 leading-relaxed">
              Selesaikan verifikasi untuk mengunduh file.
            </p>
            <div className="flex justify-center mb-4">
              <ReCAPTCHA
                ref={recaptchaRef}
                sitekey={config.recaptchaSiteKey}
                onChange={onCaptchaSuccess}
                onExpired={onCaptchaExpired}
                theme="light"
              />
            </div>
            <button
              type="button"
              onClick={() => setCaptchaItem(null)}
              className="w-full px-4 py-3 rounded-xl bg-[#fafafa] border border-line text-ink text-[13px] font-semibold active:scale-[.97] transition-transform"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {avatarOpen && (
        <div
          ref={modalRef}
          onClick={() => setAvatarOpen(false)}
          style={{ touchAction: "none" }}
          className="fixed inset-0 z-[300] bg-black/20 backdrop-blur-md flex items-center justify-center p-4 cursor-pointer animate-fade-up"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ touchAction: "none" }}
            className="relative w-[90vw] h-[90vw] max-w-[500px] max-h-[500px] rounded-full overflow-hidden bg-[#1a1a1a] flex items-center justify-center cursor-default"
          >
            <div
              ref={innerRef}
              style={{ transformOrigin: "center center", touchAction: "none" }}
              className="w-full h-full flex items-center justify-center will-change-transform"
            >
              {!avatarFailed && avatarSrc ? (
                <img
                  src={avatarSrc}
                  alt=""
                  draggable={false}
                  className="w-full h-full object-cover"
                  onError={handleAvatarError}
                />
              ) : (
                <TelegramAvatar
                  src={null}
                  className="h-full w-full text-ink-mute"
                />
              )}
            </div>
          </div>
        </div>
      )}

      {menuOpen && (
        <div
          aria-hidden
          onClick={closeMenu}
          className="fixed inset-0 z-[99]"
        />
      )}

      {menuOpen && menuAnchor && (
        <div
          data-profile-menu
          style={{ top: menuAnchor.y, left: menuAnchor.x, width: 240 }}
          className="fixed z-[100] bg-white border border-line rounded-2xl shadow-[0_12px_48px_-8px_rgba(0,0,0,.2),0_2px_8px_-2px_rgba(0,0,0,.08)] overflow-hidden animate-fade-up p-1.5"
        >
          {MENU.map(({ href, label, icon }) => (
            <Link
              key={href}
              href={href}
              onClick={closeMenu}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-[13.5px] font-medium text-ink hover:bg-[#f5f5f5] transition-colors"
            >
              <span className="w-4 h-4 flex items-center justify-center text-ink-soft flex-shrink-0">
                {icon}
              </span>
              {label}
            </Link>
          ))}
          <div className="my-1.5 border-t border-line" />
          <button
            type="button"
            onClick={() => {
              closeMenu();
              setLogoutError("");
              setLogoutDialog(true);
            }}
            disabled={loggingOut}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-[13.5px] font-medium text-danger hover:bg-red-50 disabled:opacity-60"
          >
            {loggingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      )}

      {logoutDialog && (
        <div
          className="fixed inset-0 z-[130] flex items-end justify-center bg-black/45 p-3 backdrop-blur-[3px] sm:items-center sm:p-5"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !loggingOut) {
              setLogoutDialog(false);
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="logout-dialog-title"
            className="w-full max-w-[380px] animate-fade-up rounded-[28px] border border-white/70 bg-white p-5 shadow-[0_24px_80px_-24px_rgba(0,0,0,.35)] sm:p-6"
          >
            <h2 id="logout-dialog-title" className="text-[18px] font-bold tracking-tight text-ink">
              Sign out from this device?
            </h2>
            <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">
              Sesi pada perangkat ini akan diakhiri. Anda perlu masuk kembali untuk mengakses akun.
            </p>
            {logoutError && (
              <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2.5 text-[11px] text-danger">
                {logoutError}
              </p>
            )}
            <div className="mt-6 grid grid-cols-2 gap-2.5">
              <button
                type="button"
                disabled={loggingOut}
                onClick={() => setLogoutDialog(false)}
                className="rounded-2xl border border-line bg-white px-4 py-3 text-[13px] font-semibold text-ink-soft transition-colors hover:bg-[#f8f8f8] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={loggingOut}
                onClick={() => void logOut()}
                className="rounded-2xl bg-danger px-4 py-3 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {loggingOut ? "Signing out…" : "Sign out"}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-colors
                  text-left text-[14px] font-medium active:scale-[.99]
                  ${danger ? "text-danger sm:hover:bg-[#fff0f0]" : "text-ink sm:hover:bg-[#f5f5f5]"}`}
    >
      <span
        className={`w-6 h-6 flex items-center justify-center flex-shrink-0 ${
          danger ? "text-danger" : "text-ink-soft"
        }`}
      >
        {icon}
      </span>
      {label}
    </button>
  );
}

function DropdownItem({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors
                  text-left text-[13px] font-medium
                  ${danger ? "text-danger hover:bg-[#fff0f0]" : "text-ink hover:bg-[#f5f5f5]"}`}
    >
      <span
        className={`w-4 h-4 flex items-center justify-center flex-shrink-0 ${
          danger ? "text-danger" : "text-ink-soft"
        }`}
      >
        {icon}
      </span>
      {label}
    </button>
  );
}