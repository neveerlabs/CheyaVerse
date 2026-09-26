"use client";

import { useEffect, useRef } from "react";

const DEVICE_ID_KEY = "cheya_device_id";
const TAG = "[PushRegister]";

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const out = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; i++) out[i] = rawData.charCodeAt(i);
  return out;
}

function readDeviceId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(DEVICE_ID_KEY);
  } catch {
    return null;
  }
}

export function PushRegister({ uid }: { uid: string }) {
  const done = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (done.current) return;

    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    console.log(TAG, "start", {
      uid,
      hasVapidKey: Boolean(vapidKey),
      vapidKeyLength: vapidKey?.length ?? 0,
      hasSW: "serviceWorker" in navigator,
      hasPushManager: "PushManager" in window,
      hasNotification: "Notification" in window,
      perm: typeof Notification !== "undefined" ? Notification.permission : "n/a",
      isSecureContext: window.isSecureContext,
      origin: window.location.origin,
    });

    if (!vapidKey) {
      console.warn(TAG, "EXIT: NEXT_PUBLIC_VAPID_PUBLIC_KEY is empty");
      return;
    }
    if (!("serviceWorker" in navigator)) {
      console.warn(TAG, "EXIT: serviceWorker not supported");
      return;
    }
    if (!("PushManager" in window)) {
      console.warn(TAG, "EXIT: PushManager not supported");
      return;
    }
    if (!("Notification" in window)) {
      console.warn(TAG, "EXIT: Notification not supported");
      return;
    }
    if (!window.isSecureContext) {
      console.warn(TAG, "EXIT: not a secure context (needs https or localhost)");
      return;
    }

    let cancelled = false;

    const run = async () => {
      try {
        console.log(TAG, "registering /sw.js ...");
        const reg = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        });
        console.log(TAG, "registered, waiting ready ...", {
          scope: reg.scope,
          state: reg.installing?.state ?? reg.waiting?.state ?? reg.active?.state,
        });
        await navigator.serviceWorker.ready;
        console.log(TAG, "service worker ready");

        let perm = Notification.permission;
        console.log(TAG, "current permission:", perm);

        if (perm === "default") {
          console.log(TAG, "requesting permission ...");
          try {
            perm = await Notification.requestPermission();
          } catch (err) {
            console.error(TAG, "requestPermission threw:", err);
            return;
          }
          console.log(TAG, "permission after request:", perm);
        }

        if (perm !== "granted") {
          console.warn(TAG, "EXIT: permission not granted:", perm);
          return;
        }

        let sub = await reg.pushManager.getSubscription();
        console.log(TAG, "existing subscription:", sub ? "yes" : "no");

        if (!sub) {
          console.log(TAG, "subscribing to push manager ...");
          try {
            sub = await reg.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: urlBase64ToUint8Array(vapidKey),
            });
            console.log(TAG, "subscription created");
          } catch (err) {
            console.error(TAG, "subscribe threw:", err);
            return;
          }
        }

        if (cancelled) {
          console.log(TAG, "cancelled before POST");
          return;
        }

        const json = sub.toJSON();
        const endpoint = json.endpoint;
        const p256dh = json.keys?.p256dh;
        const auth = json.keys?.auth;

        console.log(TAG, "subscription payload", {
          endpoint: endpoint?.slice(0, 60) + "...",
          hasP256dh: Boolean(p256dh),
          hasAuth: Boolean(auth),
        });

        if (!endpoint || !p256dh || !auth) {
          console.error(TAG, "EXIT: incomplete subscription payload");
          return;
        }

        const deviceId = readDeviceId();
        console.log(TAG, "POST /api/push/subscribe ...", { uid, deviceId });

        const res = await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            uid: Number(uid),
            deviceId,
            endpoint,
            p256dh,
            auth,
          }),
          cache: "no-store",
        });

        console.log(TAG, "POST response:", res.status);
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          console.error(TAG, "POST failed:", res.status, text);
          return;
        }

        console.log(TAG, "SUCCESS - subscription saved");
        done.current = true;
      } catch (err) {
        console.error(TAG, "unexpected error:", err);
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [uid]);

  return null;
}
