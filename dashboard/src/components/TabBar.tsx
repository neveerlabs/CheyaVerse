"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Home, Image as ImageIcon, User, Send, Github,
} from "lucide-react";
import { useRealtime } from "@/lib/use-realtime";

export function TabBar({ uid }: { uid: string }) {
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);
  const inflightRef = useRef(false);
  const refreshRequestedRef = useRef(false);
  const refreshTimerRef = useRef<number | null>(null);
  const loadRef = useRef<() => Promise<void>>(async () => {});

  const load = useCallback(async () => {
    if (!uid || uid === "undefined") return;
    if (inflightRef.current) {
      refreshRequestedRef.current = true;
      return;
    }
    inflightRef.current = true;
    try {
      const [notificationResponse, chatResponse] = await Promise.all([
        fetch(`/api/notifications/${encodeURIComponent(uid)}`, {
          cache: "no-store",
        }),
        fetch("/api/chats/unread", { cache: "no-store" }),
      ]);
      if (!notificationResponse.ok || !chatResponse.ok) {
        return;
      }
      const [notifications, chats] = await Promise.all([
        notificationResponse.json(),
        chatResponse.json(),
      ]);
      setUnread(Number(notifications?.unread ?? 0) + Number(chats?.unread ?? 0));
    } catch {
      return;
    } finally {
      inflightRef.current = false;
      if (refreshRequestedRef.current) {
        refreshRequestedRef.current = false;
        if (refreshTimerRef.current !== null) {
          window.clearTimeout(refreshTimerRef.current);
        }
        refreshTimerRef.current = window.setTimeout(() => {
          refreshTimerRef.current = null;
          void loadRef.current();
        }, 0);
      }
    }
  }, [uid]);
  loadRef.current = load;

  const scheduleLoad = useCallback(() => {
    if (refreshTimerRef.current !== null) {
      window.clearTimeout(refreshTimerRef.current);
    }
    refreshTimerRef.current = window.setTimeout(() => {
      refreshTimerRef.current = null;
      void loadRef.current();
    }, 200);
  }, []);

  useEffect(() => {
    void load();
  }, [load, pathname]);

  useEffect(
    () => () => {
      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    const refreshWhenConnected = () => {
      if (document.visibilityState === "visible") scheduleLoad();
    };
    window.addEventListener("focus", refreshWhenConnected);
    window.addEventListener("online", refreshWhenConnected);
    document.addEventListener("visibilitychange", refreshWhenConnected);
    return () => {
      window.removeEventListener("focus", refreshWhenConnected);
      window.removeEventListener("online", refreshWhenConnected);
      document.removeEventListener("visibilitychange", refreshWhenConnected);
    };
  }, [scheduleLoad]);

  useRealtime(uid, (event) => {
    if (event.type === "notification:new") {
      scheduleLoad();
    }
    if (event.type === "notification:read") {
      scheduleLoad();
    }
    if (
      event.type === "direct-message:new" ||
      event.type === "direct-message:read" ||
      event.type === "direct-message:deleted" ||
      event.type === "direct-message:cleared" ||
      event.type === "direct-message:hidden" ||
      event.type === "direct-message:cleared-for-me"
    ) {
      scheduleLoad();
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
          prefetch={false}
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
            Home
          </span>
        </Link>

        <Link
          prefetch={false}
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
            prefetch={false}
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
          prefetch={false}
          href={cartHref}
          className="flex-1 flex flex-col items-center justify-center gap-[3px] transition-opacity active:opacity-60"
        >
          <Github
            size={19}
            strokeWidth={cartActive ? 2.3 : 1.7}
            className={cartActive ? "text-ink" : "text-ink-mute"}
          />
          <span
            className={`text-[10px] tracking-[-.005em] leading-none ${
              cartActive ? "font-semibold text-ink" : "text-ink-mute"
            }`}
          >
            Projects
          </span>
        </Link>

        <Link
          prefetch={false}
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
            Profile
          </span>
        </Link>
      </div>
    </nav>
  );
}