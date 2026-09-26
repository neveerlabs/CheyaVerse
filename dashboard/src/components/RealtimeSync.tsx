"use client";

import { useRouter } from "next/navigation";
import { useRealtime } from "@/lib/use-realtime";

export function RealtimeSync({ uid }: { uid: string }) {
  const router = useRouter();

  useRealtime(uid, (event) => {
    if (
      event.type === "media:changed" ||
      event.type === "notification:new" ||
      event.type === "notification:read" ||
      event.type === "direct-message:new" ||
      event.type === "direct-message:read"
    ) {
      router.refresh();
    }
    if (event.type === "direct-message:new") {
      const message = event.message as
        | { sender_uid?: number; recipient_uid?: number; content?: string }
        | undefined;
      if (message?.recipient_uid === Number(uid)) {
        const originalTitle = document.title;
        document.title = "Pesan baru · CheyaVerse";
        window.setTimeout(() => {
          if (document.title === "Pesan baru · CheyaVerse") {
            document.title = originalTitle;
          }
        }, 5000);
        router.refresh();
      }
    }
  });

  return null;
}