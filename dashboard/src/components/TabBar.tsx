"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Home, Image as ImageIcon, User, Send, ShoppingCart,
} from "lucide-react";
import { useRealtime } from "@/lib/use-realtime";

const MIN_LOAD_INTERVAL_MS = 1500;

export function TabBar({ uid }: { uid: string }) {
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);
  const lastLoadAtRef = useRef(0);
  const inflightRef = useRef(false);

  const load = useCallback(async () => {
    if (!uid || uid === "undefined") return;
    if (inflightRef.current) return;
    inflightRef.current = true;
    try {
      const res = await fetch(`/api/notifications/${encodeURIComponent(uid)}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const j = await res.json();
      setUnread(Number(j?.unread ?? 0));
    } catch {
    } finally {
      inflightRef.current = false;
    }
  }, [uid]);

  const throttledLoad = useCallback(() => {
    const now = Date.now();
    if (now - lastLoadAtRef.current < MIN_LOAD_INTERVAL_MS) return;
    lastLoadAtRef.current = now;
    void load();
  }, [load]);

  useEffect(() => {
    void load();
  }, [load, pathname]);

  useEffect(() => {
    if (!uid || uid === "undefined") return;
    const iv = setInterval(() => {
      void load();
    }, 5000);
    return () => clearInterval(iv);
  }, [uid, load]);

  useRealtime(uid, (event) => {
    if (event.type === "notification:new") {
      throttledLoad();
    }
    if (event.type === "notification:read") {
      throttledLoad();
    }
  });

  const chatRoomMatch = pathname.match(/^\/[^/]+\/chat\/[^/]+$/);
  if (chatRoomMatch) return null;

  const base = `/${uid}`;
  const mediaHref = `${base}/media`;
  const profileHref = `${base}/profile`;
  const chatHref = `${base}/chat`;
  const cartHref = `${base}/keranjang`;

  const homeActive = pathname === base;
  const mediaActive = pathname.startsWith(mediaHref);
  const profileActive = pathname.startsWith(profileHref);
  const chatActive = pathname.startsWith(chatHref);
  const cartActive = pathname.startsWith(cartHref);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 pb-[env(safe-area-inset-bottom)] bg-white/95 backdrop-blur-xl border-t border-divider">
      <div className="relative flex h-[56px] max-w-[600px] mx-auto">
        <Link
          href={base}
          className="flex-1 flex flex-col items-center justify-center gap-[3px] transition-opacity active:opacity-60"
        >
          <Home
            size={19}
            strokeWidth={homeActive ? 2.3 : 1.7}
            className={homeActive ? "text-ink" : "text-ink-mute"}
          />
          <span
            className={`text-[10px] tracking-[-.005em] leading-none ${
              homeActive ? "font-semibold text-ink" : "text-ink-mute"
            }`}
          >
            Beranda
          </span>
        </Link>

        <Link
          href={chatHref}
          className="flex-1 flex flex-col items-center justify-center gap-[3px] transition-opacity active:opacity-60 relative"
        >
          <div className="relative">
            <Send
              size={19}
              strokeWidth={chatActive ? 2.3 : 1.7}
              className={chatActive ? "text-ink" : "text-ink-mute"}
            />
            {unread > 0 && (
              <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-[16px] px-1 rounded-full bg-danger text-white text-[9.5px] font-bold flex items-center justify-center tabular-nums shadow-[0_0_0_2px_#fff]">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </div>
          <span
            className={`text-[10px] tracking-[-.005em] leading-none ${
              chatActive ? "font-semibold text-ink" : "text-ink-mute"
            }`}
          >
            Chat
          </span>
        </Link>

        <div className="relative w-[78px] flex-shrink-0">
          <div
            aria-hidden
            className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 w-[64px] h-[64px] pointer-events-none"
          >
            <span
              className="absolute inset-0 rounded-full blur-[9px] opacity-75 animate-[spin_7s_linear_infinite]"
              style={{
                background:
                  "conic-gradient(from 0deg, #22d3ee, #3b82f6, #8b5cf6, #ec4899, #f59e0b, #22d3ee)",
              }}
            />
            <span
              className="absolute inset-[6px] rounded-full animate-[spin_4s_linear_infinite]"
              style={{
                background:
                  "conic-gradient(from 0deg, #22d3ee, #3b82f6, #8b5cf6, #ec4899, #f59e0b, #22d3ee)",
              }}
            />
          </div>
          <Link
            href={mediaHref}
            aria-label="Media"
            className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 w-[50px] h-[50px] rounded-full bg-ink text-white flex items-center justify-center shadow-[0_8px_22px_-6px_rgba(0,0,0,.4)] active:scale-95 transition-transform"
          >
            <ImageIcon size={20} strokeWidth={2.2} />
          </Link>
          <span
            className={`absolute bottom-[7px] left-1/2 -translate-x-1/2 text-[10px] tracking-[-.005em] leading-none ${
              mediaActive ? "font-semibold text-ink" : "text-ink-mute"
            }`}
          >
            Media
          </span>
        </div>

        <Link
          href={cartHref}
          className="flex-1 flex flex-col items-center justify-center gap-[3px] transition-opacity active:opacity-60"
        >
          <ShoppingCart
            size={19}
            strokeWidth={cartActive ? 2.3 : 1.7}
            className={cartActive ? "text-ink" : "text-ink-mute"}
          />
          <span
            className={`text-[10px] tracking-[-.005em] leading-none ${
              cartActive ? "font-semibold text-ink" : "text-ink-mute"
            }`}
          >
            Keranjang
          </span>
        </Link>

        <Link
          href={profileHref}
          className="flex-1 flex flex-col items-center justify-center gap-[3px] transition-opacity active:opacity-60"
        >
          <User
            size={19}
            strokeWidth={profileActive ? 2.3 : 1.7}
            className={profileActive ? "text-ink" : "text-ink-mute"}
          />
          <span
            className={`text-[10px] tracking-[-.005em] leading-none ${
              profileActive ? "font-semibold text-ink" : "text-ink-mute"
            }`}
          >
            Profil
          </span>
        </Link>
      </div>
    </nav>
  );
}
