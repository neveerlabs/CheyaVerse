"use client";

import { useRouter } from "next/navigation";
import { useRealtime } from "@/lib/use-realtime";

export function RealtimeSync({ uid }: { uid: string }) {
  const router = useRouter();

  useRealtime(uid, (event) => {
    if (
      event.type === "media:changed" ||
      event.type === "notification:new" ||
      event.type === "notification:read"
    ) {
      router.refresh();
    }
  });

  return null;
}