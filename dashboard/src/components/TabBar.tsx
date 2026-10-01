"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Home, Image as ImageIcon, User, Send, Github,
} from "lucide-react";
import { useRealtime } from "@/lib/use-realtime";
import { readApiJson } from "@/lib/read-api-json";

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
        readApiJson<{ ok?: boolean; unread?: unknown }>(notificationResponse),
        readApiJson<{ ok?: boolean; unread?: unknown }>(chatResponse),
      ]);
      if (notifications?.ok !== true || chats?.ok !== true) {
        throw new Error("Unread count response was unsuccessful.");
      }
      const notificationUnread = Number(notifications.unread);
      const chatUnread = Number(chats.unread);
      if (
        !Number.isSafeInteger(notificationUnread) ||
        notificationUnread < 0 ||
        !Number.isSafeInteger(chatUnread) ||
        chatUnread < 0
      ) {
        throw new Error("Unread count response was invalid.");
      }
      setUnread(notificationUnread + chatUnread);
    } catch (error) {
      console.error("[tab-bar] failed to refresh unread count:", error);
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
    const refreshOnHistoryRestore = () => scheduleLoad();
    const refreshInterval = window.setInterval(() => {
      if (document.visibilityState === "visible") scheduleLoad();
    }, 60_000);
    window.addEventListener("focus", refreshWhenConnected);
    window.addEventListener("online", refreshWhenConnected);
    window.addEventListener("pageshow", refreshOnHistoryRestore);
    window.addEventListener("popstate", refreshOnHistoryRestore);
    document.addEventListener("visibilitychange", refreshWhenConnected);
    return () => {
      window.clearInterval(refreshInterval);
      window.removeEventListener("focus", refreshWhenConnected);
      window.removeEventListener("online", refreshWhenConnected);
      window.removeEventListener("pageshow", refreshOnHistoryRestore);
      window.removeEventListener("popstate", refreshOnHistoryRestore);
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
      event.type === "direct-message:cleared-for-me" ||
      event.type === "direct-unread:changed"
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
  const projectsHref = `${base}/project`;

  const homeActive = pathname === base;
  const mediaActive = pathname.startsWith(mediaHref);
  const profileActive = pathname.startsWith(profileHref);
  const chatActive = pathname.startsWith(chatHref);
  const projectsActive =
    pathname.startsWith(projectsHref) || pathname.startsWith(`${base}/keranjang`);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 rounded-t-[20px] border-t border-slate-200/70 bg-white/85 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_30px_-24px_rgba(15,23,42,.45)] backdrop-blur-2xl">
      <div className="relative flex h-[56px] max-w-[600px] mx-auto">
        <Link
          prefetch={false}
          href={base}
          className="group flex-1 flex flex-col items-center justify-center gap-[3px] transition-opacity active:opacity-60"
        >
          <Home
            size={19}
            strokeWidth={homeActive ? 2.3 : 1.7}
            className={homeActive ? "text-black" : "text-ink-mute group-hover:text-black"}
          />
          <span
            className={`text-[10px] tracking-[-.005em] leading-none ${
              homeActive ? "font-semibold text-black" : "text-ink-mute group-hover:text-black"
            }`}
          >
            Home
          </span>
        </Link>

        <Link
          prefetch={false}
          href={chatHref}
          className="group relative flex-1 flex flex-col items-center justify-center gap-[3px] transition-opacity active:opacity-60"
        >
          <div className="relative">
            <Send
              size={19}
              strokeWidth={chatActive ? 2.3 : 1.7}
              className={chatActive ? "text-black" : "text-ink-mute group-hover:text-black"}
            />
            {unread > 0 && (
              <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-[16px] px-1 rounded-full bg-danger text-white text-[9.5px] font-bold flex items-center justify-center tabular-nums shadow-[0_0_0_2px_#fff]">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </div>
          <span
            className={`text-[10px] tracking-[-.005em] leading-none ${
              chatActive ? "font-semibold text-black" : "text-ink-mute group-hover:text-black"
            }`}
          >
            Chat
          </span>
        </Link>

        <div className="group relative w-[78px] flex-shrink-0">
          <Link
            prefetch={false}
            href={mediaHref}
            aria-label="Media"
            className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 flex h-[50px] w-[50px] items-center justify-center rounded-full border border-white bg-slate-950 text-white shadow-[0_8px_22px_-6px_rgba(0,0,0,.4)] transition-transform active:scale-95"
          >
            <ImageIcon size={20} strokeWidth={2.2} />
          </Link>
          <span
            className={`absolute bottom-[7px] left-1/2 -translate-x-1/2 text-[10px] tracking-[-.005em] leading-none ${
              mediaActive ? "font-semibold text-black" : "text-ink-mute group-hover:text-black"
            }`}
          >
            Media
          </span>
        </div>

        <Link
          prefetch={false}
          href={projectsHref}
          className="group flex-1 flex flex-col items-center justify-center gap-[3px] transition-opacity active:opacity-60"
        >
          <Github
            size={19}
            strokeWidth={projectsActive ? 2.3 : 1.7}
            className={projectsActive ? "text-black" : "text-ink-mute group-hover:text-black"}
          />
          <span
            className={`text-[10px] tracking-[-.005em] leading-none ${
              projectsActive ? "font-semibold text-black" : "text-ink-mute group-hover:text-black"
            }`}
          >
            Projects
          </span>
        </Link>

        <Link
          prefetch={false}
          href={profileHref}
          className="group flex-1 flex flex-col items-center justify-center gap-[3px] transition-opacity active:opacity-60"
        >
          <User
            size={19}
            strokeWidth={profileActive ? 2.3 : 1.7}
            className={profileActive ? "text-black" : "text-ink-mute group-hover:text-black"}
          />
          <span
            className={`text-[10px] tracking-[-.005em] leading-none ${
              profileActive ? "font-semibold text-black" : "text-ink-mute group-hover:text-black"
            }`}
          >
            Profile
          </span>
        </Link>
      </div>
    </nav>
  );
}