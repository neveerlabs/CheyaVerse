"use client";

import { useRealtime } from "@/lib/use-realtime";

export function DeviceNotifications({ uid }: { uid: string }) {
  useRealtime(uid, (event) => {
    if (event.type !== "notification:new") return;
    if (typeof Notification === "undefined") return;
    if (Notification.permission !== "granted") return;

    const title =
      typeof event.title === "string" && event.title
        ? event.title
        : "CheyaVerse";
    const body = typeof event.body === "string" ? event.body : "";

    try {
      const n = new Notification(title, {
        body,
        icon: "/icon.png",
        badge: "/icon.png",
        tag: `cheyaverse-${uid}`,
      });
      n.onclick = () => {
        try {
          window.focus();
          n.close();
        } catch {}
      };
    } catch {}
  });

  return null;
}
