"use client";

import { useCallback, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { reconnectRealtime, useRealtime } from "@/lib/use-realtime";
import { playSystemReceiveSoundOnce } from "@/lib/chat-sounds";
import { wasOverlayBackDismissed } from "@/lib/back-dismiss";

function systemSoundCorrelationKey(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200)
    .toLocaleLowerCase();
  return normalized ? `admin:${normalized}` : undefined;
}

export function RealtimeSync({ uid }: { uid: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  const lastPathnameRef = useRef(pathname);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const botChatOpenRef = useRef(false);

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
    let stopped = false;
    let inFlight = false;
    const heartbeat = async () => {
      if (
        stopped ||
        inFlight ||
        document.visibilityState !== "visible"
      ) return;
      inFlight = true;
      try {
        const response = await fetch("/api/presence/heartbeat", {
          method: "POST",
          cache: "no-store",
        });
        if (!response.ok) {
          if (response.status === 401) stopped = true;
          console.warn(
            `[presence] heartbeat was rejected (${response.status}).`,
          );
        }
      } catch (error) {
        console.warn("[presence] heartbeat could not reach the server:", error);
      } finally {
        inFlight = false;
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void heartbeat();
    };

    void heartbeat();
    const timer = window.setInterval(() => void heartbeat(), 20_000);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [uid]);

  useEffect(() => {
    if (lastPathnameRef.current === pathname) return;
    lastPathnameRef.current = pathname;
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
    const onPopState = (event: PopStateEvent) => {
      if (wasOverlayBackDismissed(event)) return;
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

    if (event.type === "message:new") {
      const message = event.message as
        | { uid?: number | string; sender?: string; sender_role?: string }
        | undefined;
      if (
        message &&
        Number(message.uid) === Number(uid) &&
        (message.sender === "bot" ||
          message.sender_role === "admin" ||
          message.sender_role === "ai")
      ) {
        const messageId =
          "id" in message && typeof message.id === "string"
            ? message.id
            : `${message.sender}:${String(message.sender_role)}`;
        const correlationKey =
          message.sender_role === "admin"
            ? systemSoundCorrelationKey(
                "content" in message ? message.content : undefined,
              )
            : undefined;
        const roomIsOpen =
          botChatOpenRef.current ||
          /^\/\d+\/chat\/[^/]+\/?$/.test(pathname);
        if (roomIsOpen) {
          playSystemReceiveSoundOnce(messageId, correlationKey);
        }
      }
    }

    if (event.type === "notification:new") {
      const notificationId =
        typeof event.notificationId === "string"
          ? event.notificationId
          : `${String(event.title ?? "")}:${String(event.body ?? "")}:${Math.floor(Date.now() / 2_000)}`;
      const roomIsOpen =
        botChatOpenRef.current ||
        /^\/\d+\/chat\/[^/]+\/?$/.test(pathname);
      const correlationKey =
        String(event.title ?? "") === "CheyaVerse · Admin"
          ? systemSoundCorrelationKey(event.body)
          : undefined;
      if (roomIsOpen) {
        playSystemReceiveSoundOnce(notificationId, correlationKey);
      }
    }
  });

  return null;
}