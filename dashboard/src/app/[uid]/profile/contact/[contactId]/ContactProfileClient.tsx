"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  Copy,
  MessageCircle,
  MoreVertical,
  Share2,
} from "lucide-react";
import { TelegramAvatar } from "@/components/TelegramAvatar";
import { CoverIcon } from "@/lib/cover-icons";
import type { CoverConfig } from "@/lib/storage";

type Contact = {
  uid: number;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  photo_url: string | null;
};

export function ContactProfileClient({
  viewerUid,
  contact,
  cover,
}: {
  viewerUid: string;
  contact: Contact;
  cover: CoverConfig | null;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);
  const toastTimerRef = useRef<number | null>(null);
  const name =
    [contact.first_name, contact.last_name].filter(Boolean).join(" ").trim() ||
    `Telegram ${contact.uid}`;
  const chatHref = `/${viewerUid}/chat/${contact.uid}`;

  useEffect(() => {
    if (!menuOpen) return;
    const closeMenu = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeMenu);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeMenu);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);

  useEffect(
    () => () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
    },
    [],
  );

  function showNotice(message: string) {
    setNotice(message);
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => setNotice(""), 1800);
  }

  async function copyValue(value: string, success: string) {
    try {
      await navigator.clipboard.writeText(value);
      showNotice(success);
      setMenuOpen(false);
    } catch (error) {
      console.error("[contact-profile] clipboard copy failed:", error);
      showNotice("Gagal menyalin. Coba lagi.");
    }
  }

  async function shareContact() {
    const profileUrl = new URL(
      `/${viewerUid}/profile/contact/${contact.uid}`,
      window.location.origin,
    ).toString();
    const url = contact.username
      ? `https://t.me/${encodeURIComponent(contact.username)}`
      : profileUrl;
    if (navigator.share) {
      try {
        await navigator.share({ title: name, text: name, url });
        setMenuOpen(false);
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        console.error("[contact-profile] native share failed:", error);
      }
    }
    await copyValue(url, "Tautan kontak disalin");
  }

  return (
    <section className="-mx-5 animate-fade-up">
      <div className="relative h-[180px] overflow-hidden">
        {cover && (cover.type === "upload" || cover.type === "telegram") ? (
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `url(/api/cover/${contact.uid}/image?v=${cover.updated_at ?? ""})`,
              backgroundSize: `${cover.bg_size ?? 100}% auto`,
              backgroundPosition: `${cover.bg_x ?? 50}% ${cover.bg_y ?? 50}%`,
              backgroundRepeat: "no-repeat",
              backgroundColor: "#f5f5f5",
            }}
          />
        ) : cover?.type === "color" ? (
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
          <div className="absolute inset-0 bg-gradient-to-br from-[#e5e5e7] via-[#f0f0f2] to-[#e0e0e2]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />

        <Link
          href={chatHref}
          aria-label="Kembali ke percakapan"
          className="absolute left-2 top-3 z-20 flex h-9 w-9 items-center justify-center rounded-full transition-all active:scale-90 sm:hover:bg-black/5"
          style={{
            color: cover ? "white" : undefined,
            filter: cover ? "drop-shadow(0 1px 3px rgba(0,0,0,.55))" : undefined,
          }}
        >
          <ArrowLeft size={20} strokeWidth={2} />
        </Link>

        <div ref={menuRef} className="absolute right-2 top-3 z-30">
          <button
            type="button"
            aria-label="Menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((value) => !value)}
            className={`flex h-9 w-9 items-center justify-center rounded-full transition-all active:scale-90 sm:hover:bg-black/5 ${
              cover
                ? "text-white drop-shadow-[0_1px_3px_rgba(0,0,0,.55)]"
                : "text-ink"
            }`}
          >
            <MoreVertical size={20} strokeWidth={2} />
          </button>
          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-10 w-56 overflow-hidden rounded-2xl border border-line bg-white p-1.5 text-ink shadow-[0_12px_48px_-8px_rgba(0,0,0,.2)]"
            >
              <Link
                role="menuitem"
                href={chatHref}
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13px] font-medium hover:bg-[#f5f5f5]"
              >
                <MessageCircle size={16} className="text-ink-soft" />
                Kirim pesan
              </Link>
              <button
                type="button"
                role="menuitem"
                onClick={() => void shareContact()}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13px] font-medium hover:bg-[#f5f5f5]"
              >
                <Share2 size={16} className="text-ink-soft" />
                Bagikan kontak
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() =>
                  void copyValue(String(contact.uid), "ID Telegram disalin")
                }
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13px] font-medium hover:bg-[#f5f5f5]"
              >
                <Copy size={16} className="text-ink-soft" />
                Salin ID Telegram
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="px-5 pb-8">
        <div className="relative z-10 -mt-14 flex items-end">
          <div className="flex h-[104px] w-[104px] shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-[#f4f4f5] shadow-[0_4px_16px_-6px_rgba(0,0,0,.18)]">
            <TelegramAvatar
              src={contact.photo_url}
              alt={name}
              className="h-full w-full object-cover"
            />
          </div>
          <div className="min-w-0 flex-1 translate-y-2 pb-1 pl-3">
            <h1 className="truncate text-[22px] font-bold leading-tight tracking-[-.03em] text-ink">
              Hi, {name}
            </h1>
            <p className="mt-0.5 truncate text-[13px] font-normal text-ink-mute">
              Profil kontak
            </p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2.5">
          <Link
            href={chatHref}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-ink px-4 py-3 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
          >
            <MessageCircle size={17} />
            Kirim pesan
          </Link>
          <button
            type="button"
            onClick={() => void shareContact()}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-line bg-white px-4 py-3 text-[13px] font-semibold text-ink transition-colors hover:bg-[#f7f7f7]"
          >
            <Share2 size={17} />
            Bagikan
          </button>
        </div>
      </div>

      {notice && (
        <div
          role="status"
          className="fixed bottom-[calc(80px+env(safe-area-inset-bottom))] left-1/2 z-[200] -translate-x-1/2 rounded-xl bg-ink/95 px-4 py-2.5 text-center text-[12.5px] font-semibold text-white shadow-2xl animate-fade-up"
        >
          <span className="inline-flex items-center gap-2">
            <Check size={14} />
            {notice}
          </span>
        </div>
      )}
    </section>
  );
}
