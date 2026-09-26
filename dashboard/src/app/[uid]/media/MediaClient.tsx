"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ReCAPTCHA from "react-google-recaptcha";
import {
  Image as ImageIcon,
  LayoutList,
  LayoutGrid,
  MoreVertical,
  ExternalLink,
  Trash2,
  Copy,
  Download,
  X,
} from "lucide-react";
import { config } from "@/lib/config";
import { setViewPreferenceClient, type MediaView } from "@/lib/view-preference-client";
import { VideoThumbnail } from "@/components/VideoThumbnail";

type Item = {
  id: string;
  filename: string;
  content_type: string;
  expires_at: string;
  thumbnailUrl: string | null;
};

const LONG_PRESS_MS = 480;
const EAGER_LIMIT = 6;

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    const diff = d.getTime() - Date.now();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    if (days <= 0) return "expired";
    if (days === 1) return "1 hari lagi";
    return `${days} hari lagi`;
  } catch {
    return "—";
  }
}

function isImage(type: string): boolean {
  return type.startsWith("image/");
}

function isVideo(type: string): boolean {
  return type.startsWith("video/");
}

export function MediaClient({
  uid,
  items,
  initialView,
}: {
  uid: string;
  items: Item[];
  initialView: MediaView;
}) {
  const router = useRouter();
  const [view, setView] = useState<MediaView>(initialView);
  const [localItems, setLocalItems] = useState<Item[]>(items);
  const [menuItem, setMenuItem] = useState<Item | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<{ x: number; y: number } | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [deleteItem, setDeleteItem] = useState<Item | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [captchaItem, setCaptchaItem] = useState<Item | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lpTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lpTriggered = useRef(false);
  const recaptchaRef = useRef<ReCAPTCHA>(null);

  useEffect(() => {
    setLocalItems(items);
  }, [items]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("cheya-media-view");
      if ((saved === "grid" || saved === "list") && saved !== initialView) {
        setView(saved);
        setViewPreferenceClient(saved);
      }
    } catch {}
  }, [initialView]);

  useEffect(() => {
    if (!menuItem) return;
    function onAnyClick(e: MouseEvent) {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      if (t.closest("[data-media-menu]") || t.closest("[data-media-menu-trigger]")) return;
      setMenuItem(null);
      setMenuAnchor(null);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setMenuItem(null);
        setMenuAnchor(null);
      }
    }
    document.addEventListener("mousedown", onAnyClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onAnyClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [menuItem]);

  function setViewMode(v: MediaView) {
    setView(v);
    setViewPreferenceClient(v);
    try {
      localStorage.setItem("cheya-media-view", v);
    } catch {}
  }

  function showToast(msg: string) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1800);
  }

  function openMenu(item: Item, anchorEl?: HTMLElement | null) {
    if (isMobile) {
      setMenuAnchor(null);
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
      setMenuAnchor({ x: left, y: top });
    } else {
      setMenuAnchor(null);
    }
    setMenuItem(item);
  }

  function closeMenu() {
    setMenuItem(null);
    setMenuAnchor(null);
  }

  function startLongPress(item: Item) {
    lpTriggered.current = false;
    if (lpTimer.current) clearTimeout(lpTimer.current);
    lpTimer.current = setTimeout(() => {
      lpTriggered.current = true;
      setMenuAnchor(null);
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

  function handleClickCapture(e: React.MouseEvent) {
    if (lpTriggered.current) {
      e.preventDefault();
      e.stopPropagation();
      lpTriggered.current = false;
    }
  }

  async function doDelete(item: Item) {
    setBusy(true);
    try {
      const res = await fetch(`/api/media/${item.id}?uid=${encodeURIComponent(uid)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setLocalItems((prev) => prev.filter((x) => x.id !== item.id));
        showToast("Media dihapus");
        setDeleteItem(null);
        closeMenu();
        router.refresh();
        return;
      }
      const j = await res.json().catch(() => ({}));
      const reason = (j as { error?: string })?.error;
      if (res.status === 404 || reason === "not_found") {
        showToast("Media udah nggak ada");
        setLocalItems((prev) => prev.filter((x) => x.id !== item.id));
      } else if (res.status === 403 || reason === "forbidden") {
        showToast("Bukan media lo");
      } else if (reason === "db_error") {
        showToast("Gagal hapus (cek policy DELETE)");
      } else {
        showToast(`Gagal menghapus (${res.status})`);
      }
      setDeleteItem(null);
      closeMenu();
    } catch {
      showToast("Network error");
    } finally {
      setBusy(false);
    }
  }

  function doCopy(item: Item) {
    const url = `${window.location.origin}/m/${item.id}`;
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
      try {
        document.execCommand("copy");
        showToast("Link disalin");
      } catch {
        showToast("Gagal menyalin");
      }
      document.body.removeChild(ta);
    }
    closeMenu();
  }

  function startDownloadFlow(item: Item) {
    setCaptchaItem(item);
    closeMenu();
  }

  function onCaptchaSuccess(value: string | null) {
    if (!value) return;
    const id = captchaItem?.id;
    setCaptchaItem(null);
    if (!id) return;
    window.location.href = `/download/${encodeURIComponent(id)}?token=${encodeURIComponent(value)}`;
  }

  function onCaptchaExpired() {
    showToast("Verifikasi expired, coba lagi");
  }

  function openDelete(item: Item) {
    setDeleteItem(item);
    closeMenu();
  }

  if (localItems.length === 0) {
    return (
      <div className="px-1 py-20 text-center animate-fade-up">
        <div className="w-14 h-14 rounded-full bg-[#f5f5f5] mx-auto mb-4 flex items-center justify-center">
          <ImageIcon size={22} className="text-ink-mute" strokeWidth={1.8} />
        </div>
        <p className="text-[14.5px] font-medium text-ink mb-1.5">Belum ada media</p>
        <p className="text-[12.5px] text-ink-mute font-normal leading-relaxed">
          Upload foto/video ke bot dengan caption /qr
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-end gap-1 px-1 pb-2 animate-fade-up">
        <button
          type="button"
          onClick={() => setViewMode("list")}
          aria-label="List view"
          className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
            view === "list" ? "bg-[#f0f0f0] text-ink" : "text-ink-mute hover:bg-[#f5f5f5]"
          }`}
        >
          <LayoutList size={17} strokeWidth={2} />
        </button>
        <button
          type="button"
          onClick={() => setViewMode("grid")}
          aria-label="Grid view"
          className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
            view === "grid" ? "bg-[#f0f0f0] text-ink" : "text-ink-mute hover:bg-[#f5f5f5]"
          }`}
        >
          <LayoutGrid size={17} strokeWidth={2} />
        </button>
      </div>

      {view === "list" ? (
        <div className="flex flex-col px-1 animate-fade-up">
          {localItems.map((m, idx) => (
            <div
              key={m.id}
              className="group flex items-center gap-4 py-[15px] relative
                         before:absolute before:bottom-0 before:left-14 before:right-0
                         before:h-px before:bg-divider last:before:hidden"
              onTouchStart={() => startLongPress(m)}
              onTouchEnd={cancelLongPress}
              onTouchMove={cancelLongPress}
              onTouchCancel={cancelLongPress}
              onContextMenu={(e) => {
                e.preventDefault();
                openMenu(m);
              }}
            >
              <Link
                href={`/${uid}/m/${m.id}`}
                onClick={handleClickCapture}
                className="flex-1 min-w-0 flex items-center gap-4 transition-opacity
                           hover:opacity-60 active:opacity-40"
              >
                <span className="w-10 h-10 sm:w-11 sm:h-11 flex items-center justify-center flex-shrink-0 overflow-hidden rounded-lg bg-[#f5f5f5]">
                  {isImage(m.content_type) && m.thumbnailUrl ? (
                    <img
                      src={m.thumbnailUrl}
                      alt=""
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : isVideo(m.content_type) && m.thumbnailUrl ? (
                    <VideoThumbnail
                      src={m.thumbnailUrl}
                      iconSize={20}
                      priority={idx < EAGER_LIMIT}
                    />
                  ) : (
                    <ImageIcon size={20} className="text-ink-soft" strokeWidth={1.8} />
                  )}
                </span>
                <span className="flex-1 min-w-0 flex flex-col gap-1">
                  <span className="text-[15px] font-normal text-ink truncate tracking-[-.005em]">
                    {m.filename}
                  </span>
                  <span className="text-[12px] text-ink-mute font-normal">
                    {m.id} · {formatDate(m.expires_at)}
                  </span>
                </span>
              </Link>
              <button
                type="button"
                data-media-menu-trigger
                onClick={(e) => {
                  e.stopPropagation();
                  if (menuItem?.id === m.id) {
                    closeMenu();
                  } else {
                    openMenu(m, e.currentTarget);
                  }
                }}
                aria-label="Menu"
                className={`w-9 h-9 -mr-1 flex items-center justify-center flex-shrink-0
                            transition-colors rounded-full
                            ${menuItem?.id === m.id ? "text-ink" : "text-ink-mute hover:text-ink"}`}
              >
                <MoreVertical size={18} strokeWidth={2} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 sm:gap-2 px-1 animate-fade-up">
          {localItems.map((m, idx) => (
            <div
              key={m.id}
              className="relative aspect-square rounded-xl overflow-hidden bg-[#f5f5f5] border border-line"
              onTouchStart={() => startLongPress(m)}
              onTouchEnd={cancelLongPress}
              onTouchMove={cancelLongPress}
              onTouchCancel={cancelLongPress}
              onContextMenu={(e) => {
                e.preventDefault();
                openMenu(m);
              }}
            >
              <Link
                href={`/${uid}/m/${m.id}`}
                onClick={handleClickCapture}
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
                    iconSize={28}
                    priority={idx < EAGER_LIMIT}
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-ink-mute">
                    <ImageIcon size={28} strokeWidth={1.6} />
                  </div>
                )}
              </Link>
              <button
                type="button"
                data-media-menu-trigger
                onClick={(e) => {
                  e.stopPropagation();
                  if (menuItem?.id === m.id) {
                    closeMenu();
                  } else {
                    openMenu(m, e.currentTarget);
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
              <div className="absolute bottom-0 left-0 right-0 px-2 pt-6 pb-2
                              bg-gradient-to-t from-black/80 via-black/40 to-transparent">
                <p className="text-white text-[11px] font-medium truncate leading-tight">
                  {m.filename}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {menuItem && isMobile && (
        <div
          data-media-menu
          onClick={(e) => {
            if (e.target === e.currentTarget) closeMenu();
          }}
          className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-end justify-center"
        >
          <div className="w-full bg-white border-t border-line
                          rounded-t-3xl p-2 pt-3 animate-fade-up pb-[calc(12px+env(safe-area-inset-bottom))]">
            <div className="w-10 h-1 rounded-full bg-[#e0e0e0] mx-auto mb-3" />
            <div className="px-3 pb-2 mb-1 border-b border-divider">
              <p className="text-[13px] font-semibold text-ink truncate">{menuItem.filename}</p>
              <p className="text-[11px] text-ink-mute font-mono mt-0.5">{menuItem.id}</p>
            </div>
            <MenuItem
              icon={<ExternalLink size={18} strokeWidth={1.9} />}
              label="Buka"
              onClick={() => {
                window.location.href = `/${uid}/m/${menuItem.id}`;
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
              label="Hapus"
              danger
              onClick={() => openDelete(menuItem)}
            />
            <button
              type="button"
              onClick={closeMenu}
              className="w-full mt-1 px-4 py-3 rounded-xl bg-[#fafafa] border border-line
                         text-ink text-[13px] font-semibold active:scale-[.97] transition-transform"
            >
              Batal
            </button>
          </div>
        </div>
      )}

      {menuItem && !isMobile && menuAnchor && (
        <div
          data-media-menu
          style={{ top: menuAnchor.y, left: menuAnchor.x, width: 240 }}
          className="fixed z-[100] bg-white border border-line rounded-2xl shadow-[0_10px_40px_-8px_rgba(0,0,0,.18),0_2px_8px_-2px_rgba(0,0,0,.08)] overflow-hidden animate-fade-up"
        >
          <div className="px-3.5 py-2.5 border-b border-divider">
            <p className="text-[12.5px] font-semibold text-ink truncate">{menuItem.filename}</p>
            <p className="text-[10.5px] text-ink-mute font-mono mt-0.5">{menuItem.id}</p>
          </div>
          <div className="p-1">
            <DropdownItem
              icon={<ExternalLink size={16} strokeWidth={1.9} />}
              label="Buka"
              onClick={() => {
                window.location.href = `/${uid}/m/${menuItem.id}`;
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
              label="Hapus"
              danger
              onClick={() => openDelete(menuItem)}
            />
          </div>
        </div>
      )}

      {deleteItem && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget && !busy) setDeleteItem(null);
          }}
          className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-md flex items-center justify-center p-5"
        >
          <div className="w-full max-w-[360px] rounded-2xl bg-white border border-line p-6 animate-fade-up">
            <div className="w-12 h-12 rounded-full bg-[#fff0f0] mx-auto mb-4 flex items-center justify-center">
              <Trash2 size={22} className="text-danger" strokeWidth={2} />
            </div>
            <h2 className="text-[16px] font-semibold text-center mb-1.5 text-ink">Hapus media ini?</h2>
            <p className="text-[12.5px] text-ink-soft text-center mb-1.5 leading-relaxed">
              <span className="font-semibold text-ink break-all">{deleteItem.filename}</span>
            </p>
            <p className="text-[12px] text-ink-mute text-center mb-5 leading-relaxed">
              File akan dihapus permanen dari server. Tindakan ini tidak bisa dibatalkan.
            </p>
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => setDeleteItem(null)}
                disabled={busy}
                className="flex-1 px-4 py-3 rounded-xl bg-[#fafafa] border border-line text-ink
                           text-[13px] font-semibold active:scale-[.97] transition-transform disabled:opacity-60"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => doDelete(deleteItem)}
                disabled={busy}
                className="flex-1 px-4 py-3 rounded-xl bg-danger hover:bg-[#b91c1c] text-white
                           text-[13px] font-semibold active:scale-[.97] transition-all disabled:opacity-60"
              >
                {busy ? "Menghapus…" : "Hapus"}
              </button>
            </div>
          </div>
        </div>
      )}

      {captchaItem && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setCaptchaItem(null);
          }}
          className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-md flex items-center justify-center p-5"
        >
          <div className="w-full max-w-[380px] rounded-2xl bg-white border border-line p-6 animate-fade-up">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-[16px] font-semibold text-ink">
                {config.recaptchaSiteKey ? "Verifikasi Diperlukan" : "Verifikasi Tidak Tersedia"}
              </h2>
              <button
                type="button"
                onClick={() => setCaptchaItem(null)}
                aria-label="Tutup"
                className="w-7 h-7 rounded-full flex items-center justify-center text-ink-mute hover:text-ink hover:bg-[#f5f5f5] transition-colors"
              >
                <X size={16} strokeWidth={2.2} />
              </button>
            </div>
            {config.recaptchaSiteKey ? (
              <>
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
              </>
            ) : (
              <p className="text-[12.5px] text-ink-soft mb-5 leading-relaxed">
                Fitur verifikasi sedang dalam masalah, silakan hubungi admin.
              </p>
            )}
            <button
              type="button"
              onClick={() => setCaptchaItem(null)}
              className="w-full px-4 py-3 rounded-xl bg-[#fafafa] border border-line text-ink text-[13px] font-semibold active:scale-[.97] transition-transform"
            >
              Batal
            </button>
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
