"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, Send, RotateCcw, Loader2, Check, ZoomIn, Move } from "lucide-react";
import {
  COVER_ICONS,
  COVER_ICON_NAMES,
  CoverIcon,
} from "@/lib/cover-icons";
import type { CoverConfig } from "@/lib/storage";

type Swatch = { id: string; c1: string; c2: string };

const PALETTE: Swatch[] = [
  { id: "s-blue", c1: "#3b82f6", c2: "#3b82f6" },
  { id: "s-green", c1: "#22c55e", c2: "#22c55e" },
  { id: "s-orange", c1: "#f97316", c2: "#f97316" },
  { id: "s-red", c1: "#ef4444", c2: "#ef4444" },
  { id: "s-purple", c1: "#a855f7", c2: "#a855f7" },
  { id: "s-teal", c1: "#06b6d4", c2: "#06b6d4" },
  { id: "s-pink", c1: "#ec4899", c2: "#ec4899" },
  { id: "s-gray", c1: "#64748b", c2: "#64748b" },
  { id: "g-blue", c1: "#3b82f6", c2: "#93c5fd" },
  { id: "g-green", c1: "#22c55e", c2: "#86efac" },
  { id: "g-orange", c1: "#f97316", c2: "#fbbf24" },
  { id: "g-red", c1: "#ef4444", c2: "#f97316" },
  { id: "g-purple", c1: "#a855f7", c2: "#ec4899" },
  { id: "g-teal", c1: "#06b6d4", c2: "#6ee7b7" },
  { id: "g-pink", c1: "#ec4899", c2: "#f43f5e" },
  { id: "g-gray", c1: "#64748b", c2: "#94a3b8" },
];

type Props = {
  uid: string;
  initialCover: CoverConfig | null;
};

export function CoverClient({ uid, initialCover }: Props) {
  const router = useRouter();
  const [cover, setCover] = useState<CoverConfig | null>(initialCover);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [version, setVersion] = useState(() => Date.now());
  const [bgSize, setBgSize] = useState<number>(initialCover?.bg_size ?? 100);
  const [bgX, setBgX] = useState<number>(initialCover?.bg_x ?? 50);
  const [bgY, setBgY] = useState<number>(initialCover?.bg_y ?? 50);
  const [cropDirty, setCropDirty] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [imgAspect, setImgAspect] = useState<number | null>(null);

  const fileRef = useRef<HTMLInputElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef({ active: false, x: 0, y: 0, bx: 0, by: 0, size: 100 });
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setBgSize(cover?.bg_size ?? 100);
    setBgX(cover?.bg_x ?? 50);
    setBgY(cover?.bg_y ?? 50);
    setCropDirty(false);
  }, [cover?.bg_size, cover?.bg_x, cover?.bg_y, cover?.type, cover?.updated_at]);

  useEffect(() => {
    setImgAspect(null);
    if (!cover) return;
    if (cover.type !== "upload" && cover.type !== "telegram") return;
    const img = new window.Image();
    img.onload = () => {
      if (img.naturalWidth && img.naturalHeight) {
        setImgAspect(img.naturalWidth / img.naturalHeight);
      }
    };
    img.src = `/api/cover/${uid}/image?v=${version}`;
  }, [cover, version, uid]);

  function showToast(msg: string) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1800);
  }

  function refreshAll(next: CoverConfig | null) {
    setCover(next);
    setVersion(Date.now());
    router.refresh();
  }

  async function saveColor(c1: string, c2: string, icon: string | null) {
    setBusy(true);
    try {
      const res = await fetch(`/api/cover/${uid}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "color", color1: c1, color2: c2, icon }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j?.cover) refreshAll(j.cover);
      else showToast("Gagal menyimpan");
    } catch {
      showToast("Network error");
    } finally {
      setBusy(false);
    }
  }

  async function pickColor(sw: Swatch) {
    const icon = cover?.icon ?? null;
    refreshAll({
      uid: Number(uid),
      type: "color",
      color1: sw.c1,
      color2: sw.c2,
      icon,
      storage_path: null,
      storage_message_id: null,
      content_type: null,
      media_id: null,
      bg_size: cover?.bg_size ?? null,
      bg_x: cover?.bg_x ?? null,
      bg_y: cover?.bg_y ?? null,
      updated_at: new Date().toISOString(),
    });
    await saveColor(sw.c1, sw.c2, icon);
  }

  async function pickIcon(name: string) {
    const c1 = cover?.color1 ?? "#3b82f6";
    const c2 = cover?.color2 ?? "#93c5fd";
    const nextIcon = cover?.icon === name ? null : name;
    refreshAll({
      uid: Number(uid),
      type: "color",
      color1: c1,
      color2: c2,
      icon: nextIcon,
      storage_path: null,
      storage_message_id: null,
      content_type: null,
      media_id: null,
      bg_size: cover?.bg_size ?? null,
      bg_x: cover?.bg_x ?? null,
      bg_y: cover?.bg_y ?? null,
      updated_at: new Date().toISOString(),
    });
    await saveColor(c1, c2, nextIcon);
  }

  function openUpload() {
    fileRef.current?.click();
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showToast("Hanya foto");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast("Maks 5 MB");
      return;
    }

    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file, file.name);
      form.append("filename", file.name);
      const res = await fetch(`/api/cover/${uid}/upload`, {
        method: "POST",
        body: form,
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j?.cover) {
        refreshAll(j.cover);
        showToast("Sampul diperbarui");
      } else {
        showToast("Gagal upload");
      }
    } catch {
      showToast("Network error");
    } finally {
      setBusy(false);
    }
  }

  async function useTelegram() {
    setBusy(true);
    try {
      const res = await fetch(`/api/cover/${uid}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "telegram" }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j?.cover) {
        refreshAll(j.cover);
        showToast("Sampul dari Telegram");
      } else if (j?.error === "no_telegram_photo") {
        showToast("Foto Telegram tidak ditemukan");
      } else {
        showToast("Gagal mengambil foto");
      }
    } catch {
      showToast("Network error");
    } finally {
      setBusy(false);
    }
  }

  async function resetCover() {
    setBusy(true);
    try {
      const res = await fetch(`/api/cover/${uid}`, { method: "DELETE" });
      if (res.ok) {
        refreshAll(null);
        showToast("Sampul dihapus");
      } else {
        showToast("Gagal reset");
      }
    } catch {
      showToast("Network error");
    } finally {
      setBusy(false);
    }
  }

  async function saveCrop() {
    setBusy(true);
    try {
      const res = await fetch(`/api/cover/${uid}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "crop",
          bg_size: bgSize,
          bg_x: bgX,
          bg_y: bgY,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j?.cover) {
        refreshAll(j.cover);
        showToast("Crop disimpan");
        setCropDirty(false);
      } else {
        showToast("Gagal simpan crop");
      }
    } catch {
      showToast("Network error");
    } finally {
      setBusy(false);
    }
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!showCrop) return;
    const el = previewRef.current;
    if (!el) return;
    dragRef.current = {
      active: true,
      x: e.clientX,
      y: e.clientY,
      bx: bgX,
      by: bgY,
      size: bgSize,
    };
    try { el.setPointerCapture(e.pointerId); } catch {}
    setDragging(true);
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d.active) return;
    const el = previewRef.current;
    if (!el || !imgAspect) return;
    const rect = el.getBoundingClientRect();
    const imgW = rect.width * d.size / 100;
    const imgH = imgW / imgAspect;
    const maxMoveX = Math.max(1, imgW - rect.width);
    const maxMoveY = Math.max(1, imgH - rect.height);
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    let nx = d.bx - (dx * 100) / maxMoveX;
    let ny = d.by - (dy * 100) / maxMoveY;
    nx = Math.max(0, Math.min(100, nx));
    ny = Math.max(0, Math.min(100, ny));
    setBgX(nx);
    setBgY(ny);
    setCropDirty(true);
  }

  function onPointerUp(e: React.PointerEvent) {
    dragRef.current.active = false;
    setDragging(false);
    const el = previewRef.current;
    if (el) {
      try { el.releasePointerCapture(e.pointerId); } catch {}
    }
  }

  function onZoomChange(v: number) {
    setBgSize(v);
    setCropDirty(true);
  }

  const isImage = cover?.type === "upload" || cover?.type === "telegram";
  const showCrop = cover?.type === "upload";
  const c1 = cover?.color1 ?? "#3b82f6";
  const c2 = cover?.color2 ?? "#93c5fd";

  return (
    <>
      <div className="animate-fade-up">
        <div
          ref={previewRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          style={{
            touchAction: showCrop ? "none" : "auto",
            cursor: showCrop ? (dragging ? "grabbing" : "grab") : "default",
          }}
          className="relative w-full rounded-2xl overflow-hidden border border-line bg-[#f5f5f5] select-none"
          role={showCrop ? "button" : undefined}
          aria-label={showCrop ? "Drag untuk atur posisi" : undefined}
        >
          <div className="relative w-full" style={{ aspectRatio: "2 / 1" }}>
            {isImage ? (
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  backgroundImage: `url(/api/cover/${uid}/image?v=${version})`,
                  backgroundSize: `${bgSize}% auto`,
                  backgroundPosition: `${bgX}% ${bgY}%`,
                  backgroundRepeat: "no-repeat",
                  backgroundColor: "#f5f5f5",
                }}
              />
            ) : (
              <div
                className="absolute inset-0 flex items-center justify-center pointer-events-none"
                style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}
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
                {cover?.icon && (
                  <CoverIcon
                    name={cover.icon}
                    size={140}
                    className="relative text-white drop-shadow-[0_8px_24px_rgba(0,0,0,.4)]"
                  />
                )}
              </div>
            )}
          </div>

          {showCrop && (
            <div className="absolute top-2 right-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/55 backdrop-blur-md text-white text-[10.5px] font-semibold pointer-events-none">
              <Move size={11} strokeWidth={2.4} />
              Drag untuk atur posisi
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2 mt-3">
          <button
            type="button"
            onClick={openUpload}
            disabled={busy}
            className="inline-flex items-center justify-center gap-2 px-3 py-3 rounded-xl bg-ink text-white text-[12.5px] font-semibold active:scale-[.97] transition-transform disabled:opacity-60"
          >
            <Upload size={15} strokeWidth={2.2} />
            Upload
          </button>
          <button
            type="button"
            onClick={useTelegram}
            disabled={busy}
            className="inline-flex items-center justify-center gap-2 px-3 py-3 rounded-xl bg-[#fafafa] border border-line text-ink text-[12.5px] font-semibold active:scale-[.97] transition-transform disabled:opacity-60"
          >
            <Send size={15} strokeWidth={2.2} />
            Telegram
          </button>
          <button
            type="button"
            onClick={resetCover}
            disabled={busy || !cover}
            className="inline-flex items-center justify-center gap-2 px-3 py-3 rounded-xl bg-[#fafafa] border border-line text-danger text-[12.5px] font-semibold active:scale-[.97] transition-transform disabled:opacity-60"
          >
            <RotateCcw size={15} strokeWidth={2.2} />
            Reset
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onFileChange}
        />
      </div>

      {showCrop && (
        <section className="mt-6 animate-fade-up">
          <h2 className="text-[11.5px] font-semibold tracking-[.08em] uppercase text-ink-mute px-3 mb-2 inline-flex items-center gap-1.5">
            <ZoomIn size={13} strokeWidth={2.2} />
            Atur Tampilan
          </h2>
          <div className="rounded-2xl bg-white border border-line p-4">
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[12.5px] text-ink-soft font-medium">Zoom</span>
                <span className="text-[11.5px] text-ink-mute tabular-nums font-mono">
                  {Math.round(bgSize)}%
                </span>
              </div>
              <input
                type="range"
                min={100}
                max={400}
                value={bgSize}
                disabled={busy}
                onChange={(e) => onZoomChange(Number(e.target.value))}
                className="w-full h-1 rounded-full bg-[#e5e5e5] appearance-none cursor-pointer disabled:opacity-60
                           [&::-webkit-slider-thumb]:appearance-none
                           [&::-webkit-slider-thumb]:w-4
                           [&::-webkit-slider-thumb]:h-4
                           [&::-webkit-slider-thumb]:rounded-full
                           [&::-webkit-slider-thumb]:bg-ink
                           [&::-webkit-slider-thumb]:cursor-grab
                           [&::-webkit-slider-thumb]:active:cursor-grabbing
                           [&::-moz-range-thumb]:w-4
                           [&::-moz-range-thumb]:h-4
                           [&::-moz-range-thumb]:rounded-full
                           [&::-moz-range-thumb]:bg-ink
                           [&::-moz-range-thumb]:border-0"
              />
            </div>
            <p className="text-[11.5px] text-ink-mute leading-relaxed mb-3">
              Geser langsung di preview untuk memindahkan posisi foto.
            </p>
            <button
              type="button"
              onClick={saveCrop}
              disabled={busy || !cropDirty}
              className={`w-full px-4 py-3 rounded-xl text-[13px] font-semibold active:scale-[.97] transition-all disabled:opacity-60 ${
                cropDirty
                  ? "bg-ink text-white"
                  : "bg-[#fafafa] border border-line text-ink-mute"
              }`}
            >
              {cropDirty ? "Simpan Crop" : "Tersimpan"}
            </button>
          </div>
        </section>
      )}

      <section className="mt-6 animate-fade-up">
        <h2 className="text-[11.5px] font-semibold tracking-[.08em] uppercase text-ink-mute px-3 mb-2">
          Warna
        </h2>
        <div className="rounded-2xl bg-white border border-line p-3">
          <div className="grid grid-cols-8 gap-2">
            {PALETTE.map((sw) => {
              const active =
                cover?.type === "color" &&
                cover.color1?.toLowerCase() === sw.c1.toLowerCase() &&
                cover.color2?.toLowerCase() === sw.c2.toLowerCase();
              return (
                <button
                  key={sw.id}
                  type="button"
                  onClick={() => pickColor(sw)}
                  disabled={busy}
                  aria-label={sw.id}
                  className={`relative aspect-square rounded-full transition-transform active:scale-90 disabled:opacity-60 ${
                    active ? "ring-2 ring-offset-2 ring-ink" : ""
                  }`}
                  style={{
                    background: `linear-gradient(135deg, ${sw.c1}, ${sw.c2})`,
                  }}
                >
                  {active && (
                    <Check
                      size={14}
                      strokeWidth={3}
                      className="absolute inset-0 m-auto text-white drop-shadow-[0_1px_2px_rgba(0,0,0,.5)]"
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mt-6 animate-fade-up">
        <h2 className="text-[11.5px] font-semibold tracking-[.08em] uppercase text-ink-mute px-3 mb-2">
          Ikon
        </h2>
        <div className="rounded-2xl bg-white border border-line p-3">
          <div className="grid grid-cols-6 sm:grid-cols-8 gap-1.5">
            {COVER_ICON_NAMES.map((name) => {
              const Icon = COVER_ICONS[name];
              const active = cover?.icon === name;
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => pickIcon(name)}
                  disabled={busy}
                  aria-label={name}
                  className={`relative aspect-square flex items-center justify-center rounded-xl overflow-hidden transition-all active:scale-90 disabled:opacity-60 ${
                    active
                      ? "text-white ring-2 ring-ink shadow-[0_4px_14px_-4px_rgba(0,0,0,.35)]"
                      : "text-ink-soft hover:text-ink"
                  }`}
                  style={
                    active
                      ? {
                          background:
                            "linear-gradient(135deg, #3b82f6, #93c5fd)",
                        }
                      : {
                          background:
                            "linear-gradient(135deg, #fafafa, #f0f0f0)",
                        }
                  }
                >
                  {active && (
                    <span
                      aria-hidden
                      className="absolute inset-0"
                      style={{
                        background:
                          "radial-gradient(ellipse at center, rgba(255,255,255,.35) 0%, rgba(255,255,255,0) 65%)",
                      }}
                    />
                  )}
                  <Icon size={20} strokeWidth={1.8} className="relative" />
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <p className="text-center text-[11px] text-ink-mute py-6 font-normal">
        Sampul tampil di header profil
      </p>

      {busy && (
        <div className="fixed left-1/2 top-4 -translate-x-1/2 z-[200] px-3 py-2 rounded-xl bg-ink/95 text-white text-[12px] font-semibold shadow-2xl inline-flex items-center gap-2 animate-fade-up">
          <Loader2 size={13} className="animate-spin" /> Menyimpan…
        </div>
      )}

      {toast && !busy && (
        <div className="fixed left-1/2 bottom-[calc(20px+env(safe-area-inset-bottom))] -translate-x-1/2 z-[200] px-4 py-2.5 rounded-xl bg-ink/95 text-white text-[12.5px] font-semibold shadow-2xl animate-fade-up">
          {toast}
        </div>
      )}
    </>
  );
}