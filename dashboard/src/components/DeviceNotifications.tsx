"use client";

import { useRealtime } from "@/lib/use-realtime";

export function DeviceNotifications({ uid }: { uid: string }) {
  useRealtime(uid, (event) => {
    const rawMessage = event.type === "message:new" ? event.message : null;
    const candidateMessage =
      rawMessage &&
      typeof rawMessage === "object" &&
      !Array.isArray(rawMessage)
      ? (rawMessage as Record<string, unknown>)
      : null;
    const botMessage =
      candidateMessage?.sender === "bot" &&
      candidateMessage.sender_role === "admin"
        ? candidateMessage
        : null;
    const notificationTitle =
      typeof event.title === "string" ? event.title : "";
    const notificationBody =
      typeof event.body === "string" ? event.body : "";
    const adminNotification =
      event.type === "notification:new" &&
      notificationTitle === "CheyaVerse · Admin";
    if (!botMessage && !adminNotification) return;
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

    const title = botMessage
      ? typeof botMessage.title === "string" && botMessage.title
        ? botMessage.title
        : "CheyaVerse"
      : event.type === "notification:new"
        ? notificationTitle
        : "CheyaVerse";
    const body = botMessage
      ? typeof botMessage.content === "string"
        ? botMessage.content
        : ""
      : event.type === "notification:new"
        ? notificationBody
        : "";
    if (!body) return;

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
          icon: "/icon.png?v=20261009",
          badge: "/icon.png?v=20261009",
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
