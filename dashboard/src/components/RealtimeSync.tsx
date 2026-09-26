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
  });

  return null;
}