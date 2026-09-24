"use client";

import { useEffect, useRef } from "react";
import { useRealtime } from "@/lib/use-realtime";

export function DeviceNotifications({ uid }: { uid: string }) {
  const granted = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (typeof Notification === "undefined") return;

    if (Notification.permission === "granted") {
      granted.current = true;
      return;
    }
    if (Notification.permission === "denied") return;

    const t = window.setTimeout(() => {
      try {
        Notification.requestPermission()
          .then((p) => {
            granted.current = p === "granted";
          })
          .catch(() => {});
      } catch {}
    }, 4000);

    return () => window.clearTimeout(t);
  }, []);

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
