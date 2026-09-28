"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useRealtime } from "@/lib/use-realtime";
import { playReceiveSoundOutside } from "@/lib/chat-sounds";

export function RealtimeSync({ uid }: { uid: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useRealtime(uid, (event) => {
    const inChatRoom = /^\/[^/]+\/chat\/[^/]+\/?$/.test(pathnameRef.current);

    if (!inChatRoom) {
      if (
        event.type === "media:changed" ||
        event.type === "message:new" ||
        event.type === "notification:new" ||
        event.type === "notification:read" ||
        event.type === "direct-message:new" ||
        event.type === "direct-message:read"
      ) {
        router.refresh();
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