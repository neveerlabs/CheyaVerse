"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useRealtime } from "@/lib/use-realtime";
import { playReceiveSoundOutside } from "@/lib/chat-sounds";

const REFRESH_THROTTLE_MS = 800;

export function RealtimeSync({ uid }: { uid: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  const lastRefreshRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  useRealtime(uid, (event) => {
    const refresh = () => {
      const now = Date.now();
      const elapsed = now - lastRefreshRef.current;
      if (elapsed >= REFRESH_THROTTLE_MS) {
        lastRefreshRef.current = now;
        router.refresh();
        return;
      }
      if (timerRef.current) return;
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        lastRefreshRef.current = Date.now();
        router.refresh();
      }, REFRESH_THROTTLE_MS - elapsed);
    };

    if (
      event.type === "media:changed" ||
      event.type === "notification:new" ||
      event.type === "notification:read" ||
      event.type === "direct-message:new" ||
      event.type === "direct-message:read"
    ) {
      refresh();
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
        const originalTitle = document.title;
        document.title = "Pesan baru · CheyaVerse";
        window.setTimeout(() => {
          if (document.title === "Pesan baru · CheyaVerse") {
            document.title = originalTitle;
          }
        }, 5000);
      }
    }
  });

  return null;
}