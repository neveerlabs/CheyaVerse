"use client";

import { useRealtime } from "@/lib/use-realtime";

export function DeviceNotifications({ uid }: { uid: string }) {
  useRealtime(uid, (event) => {
    if (event.type !== "notification:new") return;
    if (typeof Notification === "undefined") return;
    if (Notification.permission !== "granted") return;
    if (document.visibilityState === "visible") return;

    try {
      if (
        window.localStorage.getItem(
          `cheya-browser-notifications-muted:${uid}`,
        ) === "true"
      ) {
        return;
      }
    } catch (error) {
      console.error("[device-notifications] failed to read notification preference:", error);
      return;
    }

    const title =
      typeof event.title === "string" && event.title
        ? event.title
        : "CheyaVerse";
    const body = typeof event.body === "string" ? event.body : "";

    void (async () => {
      try {
        if ("serviceWorker" in navigator) {
          const registration = await navigator.serviceWorker.ready;
          if (await registration.pushManager.getSubscription()) return;
        }
      } catch (error) {
        console.error("[device-notifications] failed to check push subscription:", error);
      }

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
      } catch (error) {
        console.error("[device-notifications] could not display notification:", error);
      }
    })();
  });

  return null;
}
