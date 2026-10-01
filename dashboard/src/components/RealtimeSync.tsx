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
    scheduleRefresh();
  }, [pathname, scheduleRefresh, uid]);

  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        reconnectRealtime(uid);
        scheduleRefresh();
      }
    };
    const onPopState = () => {
      reconnectRealtime(uid);
      scheduleRefresh();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        reconnectRealtime(uid);
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
  }, [scheduleRefresh, uid]);

  useRealtime(uid, (event) => {
    const inChatRoom = /^\/[^/]+\/chat\/[^/]+\/?$/.test(pathnameRef.current);
    const inSystemChat = /^\/[^/]+\/chat\/system\/?$/.test(pathnameRef.current);

    if (
      !inChatRoom ||
      (inChatRoom &&
        !inSystemChat &&
        (event.type === "message:new" || event.type === "notification:new"))
    ) {
      if (
        event.type === "media:changed" ||
        event.type === "message:new" ||
        event.type === "notification:new" ||
        event.type === "notification:read" ||
        event.type === "direct-message:new" ||
        event.type === "direct-message:read"
      ) {
        scheduleRefresh(40);
      }
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
          playReceiveSoundOutside();
        }
      }
    }

    if (event.type === "notification:new" && !inSystemChat) {
      playReceiveSoundOutside();
    }
  });

  return null;
}