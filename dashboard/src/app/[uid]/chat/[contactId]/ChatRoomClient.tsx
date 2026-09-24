"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronLeft, Info, MoreVertical, Image as ImageIcon, Mic,
} from "lucide-react";

type Notification = {
  id: string;
  uid: number;
  title: string;
  message: string;
  ip: string | null;
  location: string | null;
  device: string | null;
  read: number;
  created_at: string;
};

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const now = new Date();
    const sameDay =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    if (sameDay) return `${hh}:${mm}`;
    const dd = String(d.getDate()).padStart(2, "0");
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const yy = String(d.getFullYear()).slice(2);
    return `${dd}/${mo}/${yy} ${hh}:${mm}`;
  } catch {
    return "";
  }
}

export function ChatRoomClient({
  uid,
  items,
}: {
  uid: string;
  items: Notification[];
}) {
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    setMounted(true);
    const t = window.setTimeout(() => setRevealed(true), 30);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const markRead = async () => {
      try {
        const res = await fetch(`/api/notifications/${encodeURIComponent(uid)}`, {
          method: "POST",
        });
        if (!res.ok) return;
        if (!cancelled) router.refresh();
      } catch {}
    };
    void markRead();
    return () => {
      cancelled = true;
    };
  }, [uid, router]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const vv = window.visualViewport;
    const root = document.documentElement;

    let rafId = 0;

    const apply = () => {
      rafId = 0;
      const layoutH =
        window.innerHeight ||
        document.documentElement.clientHeight ||
        0;

      let vvTop = 0;
      let vvH = layoutH;

      if (vv) {
        vvTop = vv.offsetTop || 0;
        vvH = vv.height || layoutH;
      }

      const kbInset = Math.max(0, layoutH - vvH - vvTop);
      root.style.setProperty("--vv-top", `${Math.max(0, vvTop)}px`);
      root.style.setProperty("--vv-bottom", `${kbInset}px`);
    };

    const schedule = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(apply);
    };

    apply();

    if (vv) {
      vv.addEventListener("resize", schedule);
      vv.addEventListener("scroll", schedule);
    }
    window.addEventListener("resize", schedule);
    window.addEventListener("orientationchange", schedule);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      if (vv) {
        vv.removeEventListener("resize", schedule);
        vv.removeEventListener("scroll", schedule);
      }
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
      root.style.removeProperty("--vv-top");
      root.style.removeProperty("--vv-bottom");
    };
  }, []);

  function autoGrow(e: React.FormEvent<HTMLTextAreaElement>) {
    const t = e.currentTarget;
    t.style.height = "auto";
    const next = Math.min(t.scrollHeight, 120);
    t.style.height = next + "px";
  }

  const safeItems = Array.isArray(items) ? items : [];

  const fadeCls = `transition-opacity duration-500 ease-out ${
    revealed ? "opacity-100" : "opacity-0"
  }`;

  const header = (
    <header
      className={`fixed left-0 right-0 z-40 pt-[calc(12px+env(safe-area-inset-top))] pb-3 ${fadeCls}`}
      style={{
        top: "var(--vv-top, 0px)",
        willChange: "top, opacity",
      }}
    >
      <div className="mx-auto max-w-[600px] px-5">
        <div className="flex items-center gap-2 -mx-3">
          <Link
            href={`/${uid}/chat`}
            aria-label="Kembali"
            className="w-10 h-10 rounded-full border border-line bg-white flex items-center justify-center text-ink-soft hover:text-ink hover:bg-[#fafafa] active:scale-90 transition-all flex-shrink-0 shadow-[0_1px_2px_rgba(0,0,0,.03)]"
          >
            <ChevronLeft size={20} strokeWidth={2.2} />
          </Link>

          <div className="flex-1 min-w-0 flex items-center gap-2.5 h-10 pl-1.5 pr-3 rounded-full border border-line bg-white shadow-[0_1px_2px_rgba(0,0,0,.03)]">
            <div className="w-8 h-8 rounded-full overflow-hidden bg-[#f0f0f0] border border-line flex-shrink-0">
              <img
                src="/icon.png"
                alt=""
                draggable={false}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="min-w-0 flex-1 flex flex-col justify-center">
              <div className="flex items-center gap-0.5">
                <span className="text-[13.5px] font-semibold text-ink truncate leading-tight">
                  CheyaVerse
                </span>
                <img
                  src="/assets/centang.png"
                  alt=""
                  draggable={false}
                  className="w-[22px] h-[22px] object-contain flex-shrink-0 -my-1"
                />
              </div>
              <div className="text-[10px] text-ink-mute truncate leading-tight mt-0.5">
                service notifications
              </div>
            </div>
          </div>

          <button
            type="button"
            aria-label="Menu"
            className="w-10 h-10 rounded-full border border-line bg-white flex items-center justify-center text-ink-soft hover:text-ink hover:bg-[#fafafa] active:scale-90 transition-all flex-shrink-0 shadow-[0_1px_2px_rgba(0,0,0,.03)]"
          >
            <MoreVertical size={18} strokeWidth={2.2} />
          </button>
        </div>
      </div>
    </header>
  );

  const footer = (
    <footer
      className={`chat-footer fixed left-0 right-0 z-30 pointer-events-none ${fadeCls}`}
      style={{
        bottom: "var(--vv-bottom, 0px)",
        willChange: "bottom, opacity",
      }}
    >
      <div
        className="absolute inset-x-0 top-0 bottom-0 pointer-events-none"
        style={{
          background:
            "linear-gradient(to top, #ffffff 0%, #ffffff 60%, rgba(255,255,255,0) 100%)",
        }}
      />
      <div className="relative mx-auto max-w-[600px] px-2 flex items-end gap-1.5 pointer-events-auto pt-4 pb-[calc(8px+env(safe-area-inset-bottom))]">
        <div className="flex-1 min-w-0 flex items-center gap-1 rounded-[22px] bg-[#f5f5f5] border border-line pl-3.5 pr-1 py-[6px] min-h-[40px] transition-colors focus-within:bg-[#efefef]">
          <textarea
            ref={taRef}
            rows={1}
            placeholder="Pesan"
            enterKeyHint="send"
            onInput={autoGrow}
            className="flex-1 min-w-0 bg-transparent text-ink text-[14px] leading-[22px] outline-none resize-none overflow-y-auto max-h-[120px] placeholder:text-ink-mute font-[inherit] tracking-[-.005em] p-0 m-0"
          />
          <button
            type="button"
            aria-label="Lampirkan gambar"
            className="w-7 h-7 rounded-full flex items-center justify-center text-ink-soft hover:text-ink hover:bg-[#e5e5e5] active:scale-90 transition-all flex-shrink-0"
          >
            <ImageIcon size={16} strokeWidth={2} />
          </button>
        </div>
        <button
          type="button"
          aria-label="Rekam suara"
          className="w-10 h-10 rounded-full border border-line bg-white flex items-center justify-center text-ink-soft hover:text-ink hover:bg-[#fafafa] active:scale-90 transition-all flex-shrink-0 shadow-[0_1px_2px_rgba(0,0,0,.03)]"
        >
          <Mic size={18} strokeWidth={2.2} />
        </button>
      </div>
    </footer>
  );

  return (
    <>
      <section
        className={`pt-[calc(80px+env(safe-area-inset-top))] pb-[calc(96px+env(safe-area-inset-bottom))] ${fadeCls}`}
      >
        {safeItems.length === 0 ? (
          <div className="py-20 text-center">
            <div className="w-14 h-14 rounded-full bg-[#f5f5f5] mx-auto mb-4 flex items-center justify-center">
              <Info size={22} className="text-ink-mute" strokeWidth={1.8} />
            </div>
            <p className="text-[14.5px] font-medium text-ink mb-1.5">
              Belum ada notifikasi
            </p>
            <p className="text-[12.5px] text-ink-mute leading-relaxed px-8">
              Notifikasi dari sistem akan muncul di sini
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {safeItems
              .slice()
              .reverse()
              .map((n) => (
                <div key={n.id} className="flex gap-2.5 pr-1 -ml-3">
                  <div className="w-8 h-8 rounded-full overflow-hidden bg-[#f0f0f0] border border-line flex-shrink-0 mt-0.5">
                    <img
                      src="/icon.png"
                      alt=""
                      draggable={false}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="inline-block max-w-full bg-[#f5f5f5] rounded-2xl rounded-tl-md px-3.5 py-2.5">
                      <div className="text-[12.5px] font-semibold text-ink mb-0.5">
                        {n.title}
                      </div>
                      <div
                        className="text-[13px] text-ink-soft leading-[1.55] whitespace-pre-wrap break-words [&_b]:font-semibold [&_b]:text-ink [&_i]:italic [&_a]:text-ink [&_a]:underline"
                        dangerouslySetInnerHTML={{ __html: n.message }}
                      />
                      <div className="flex justify-end mt-1.5">
                        <span className="text-[10px] text-ink-mute tabular-nums leading-none">
                          {formatTime(n.created_at)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        )}
      </section>

      {mounted && createPortal(header, document.body)}
      {mounted && createPortal(footer, document.body)}
    </>
  );
}