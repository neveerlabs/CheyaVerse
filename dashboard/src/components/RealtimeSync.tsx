"use client";

import { useCallback, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { reconnectRealtime, useRealtime } from "@/lib/use-realtime";
import { playReceiveSoundOutside } from "@/lib/chat-sounds";

export function RealtimeSync({ uid }: { uid: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  const lastPathnameRef = useRef(pathname);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playedSoundIdsRef = useRef(new Set<string>());
  const lastSystemSoundAtRef = useRef(0);
  const botChatOpenRef = useRef(false);

  const playOutsideOnce = (id: string) => {
    if (playedSoundIdsRef.current.has(id)) return;
    playedSoundIdsRef.current.add(id);
    if (playedSoundIdsRef.current.size > 100) {
      const oldestId = playedSoundIdsRef.current.values().next().value;
      if (oldestId) playedSoundIdsRef.current.delete(oldestId);
    }
    playReceiveSoundOutside();
  };

  const scheduleRefresh = useCallback(
    (delay = 80) => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = setTimeout(() => {
        refreshTimerRef.current = null;
        router.refresh();
      }, delay);
    },
    [router],
  );

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    if (lastPathnameRef.current === pathname) return;
    lastPathnameRef.current = pathname;
    reconnectRealtime(uid);
    scheduleRefresh(0);
  }, [pathname, scheduleRefresh, uid]);

  useEffect(() => {
    const onBotChatOpen = (event: Event) => {
      botChatOpenRef.current =
        (event as CustomEvent<{ open?: boolean }>).detail?.open === true;
    };
    window.addEventListener("cheya:bot-chat-open", onBotChatOpen);
    return () => window.removeEventListener("cheya:bot-chat-open", onBotChatOpen);
  }, []);

  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (document.visibilityState !== "visible") return;
      reconnectRealtime(uid, event.persisted);
      scheduleRefresh(event.persisted ? 0 : 80);
    };
    const onPopState = () => {
      reconnectRealtime(uid);
      scheduleRefresh(0);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        reconnectRealtime(uid);
        scheduleRefresh(140);
      }
    };
    const onFocus = () => {
      reconnectRealtime(uid);
      scheduleRefresh(80);
    };

    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("popstate", onPopState);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, [scheduleRefresh, uid]);

  useRealtime(uid, (event) => {
    const pathname = pathnameRef.current;
    const handledByBotChat =
      botChatOpenRef.current &&
      (event.type.startsWith("message:") ||
        event.type.startsWith("notification:"));

    if (!handledByBotChat) {
      scheduleRefresh(40);
    }

    if (event.type === "message:new" && !botChatOpenRef.current) {
      const message = event.message as
        | { uid?: number; sender?: string; sender_role?: string }
        | undefined;
      if (
        message?.uid === Number(uid) &&
        (message.sender === "bot" || message.sender_role === "admin")
      ) {
        lastSystemSoundAtRef.current = Date.now();
        const messageId =
          "id" in message && typeof message.id === "string"
            ? message.id
            : `${message.sender}:${String(message.sender_role)}`;
        playOutsideOnce(`system-message:${messageId}`);
      }
    }

    if (event.type === "notification:new" && !botChatOpenRef.current) {
      if (Date.now() - lastSystemSoundAtRef.current > 1_000) {
        const notificationId =
          typeof event.notificationId === "string"
            ? event.notificationId
            : `${String(event.title ?? "")}:${String(event.body ?? "")}:${Math.floor(Date.now() / 2_000)}`;
        playOutsideOnce(`notification:${notificationId}`);
      }
    }
  });

  return null;
}