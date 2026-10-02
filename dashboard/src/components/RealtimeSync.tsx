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
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        scheduleRefresh();
      }
    };
    const onPopState = () => {
      scheduleRefresh();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        scheduleRefresh(140);
      }
    };

    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("popstate", onPopState);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("popstate", onPopState);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, [scheduleRefresh]);

  useEffect(() => {
    if (!/^\/[^/]+\/chat\/?$/.test(pathname)) return;
    const refreshChatList = () => {
      if (document.visibilityState === "visible") scheduleRefresh(0);
    };
    const interval = window.setInterval(refreshChatList, 5_000);
    window.addEventListener("focus", refreshChatList);
    window.addEventListener("online", refreshChatList);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshChatList);
      window.removeEventListener("online", refreshChatList);
    };
  }, [pathname, scheduleRefresh]);

  useRealtime(uid, (event) => {
    const pathname = pathnameRef.current;
    const inSystemChat = /^\/[^/]+\/chat\/system\/?$/.test(pathname);
    const inDirectChat = /^\/[^/]+\/chat\/\d+\/?$/.test(pathname);
    const inChatRoom = inSystemChat || inDirectChat;
    const handledByChatRoom =
      (inSystemChat &&
        event.type.startsWith("message:")) ||
      (inDirectChat &&
        event.type.startsWith("direct-message:")) ||
      (inChatRoom &&
        (event.type.startsWith("notification:") ||
          event.type === "direct-unread:changed"));

    if (!handledByChatRoom && event.type !== "direct-chat:typing") {
      scheduleRefresh(40);
    }

    if (event.type === "direct-message:new") {
      const message = event.message as
        | { sender_uid?: number; recipient_uid?: number; content?: string }
        | undefined;
      if (message?.recipient_uid === Number(uid)) {
        const senderUid = message.sender_uid;
        const match = pathnameRef.current.match(/^\/([^/]+)\/chat\/([^/]+)$/);
        const activeContactId = match ? match[2] : null;
        const activeContactUid =
          activeContactId && activeContactId !== "system"
            ? Number(activeContactId)
            : null;
        if (
          typeof senderUid === "number" &&
          senderUid !== Number(uid) &&
          senderUid !== activeContactUid
        ) {
          const messageId =
            message && "id" in message && typeof message.id === "string"
              ? message.id
              : `${senderUid}:${String(message?.content ?? "")}`;
          playOutsideOnce(`direct:${messageId}`);
        }
      }
    }

    if (event.type === "message:new" && !inSystemChat) {
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

    if (event.type === "notification:new" && !inSystemChat) {
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