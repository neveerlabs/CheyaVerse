"use client";

import { useEffect, useRef, useState } from "react";

const DEVICE_ID_KEY = "cheya_device_id";

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

async function registerPushSubscription(uid: string, vapidKey: string) {
  const registration = await navigator.serviceWorker.register("/sw.js", {
    scope: "/",
  });
  await navigator.serviceWorker.ready;

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    });
  }

  const json = subscription.toJSON();
  const endpoint = json.endpoint;
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!endpoint || !p256dh || !auth) {
    throw new Error("Push subscription is missing required keys.");
  }

  const response = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      uid: Number(uid),
      deviceId: readDeviceId(),
      endpoint,
      p256dh,
      auth,
    }),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Push subscription registration failed (${response.status}).`);
  }
}

export function PushRegister({ uid }: { uid: string }) {
  const done = useRef(false);
  const [status, setStatus] = useState("");
  const [canRequestPermission, setCanRequestPermission] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (done.current) return;

    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (
      !vapidKey ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !("Notification" in window) ||
      !window.isSecureContext
    ) {
      return;
    }

    let cancelled = false;

    const subscribe = async () => {
      try {
        await registerPushSubscription(uid, vapidKey);
        if (cancelled) return;

        done.current = true;
        setStatus("");
        setCanRequestPermission(false);
      } catch (error) {
        if (!cancelled) {
          console.error("[push-register] subscription setup failed:", error);
        }
      }
    };

    const permission = Notification.permission;
    if (permission === "granted") {
      void subscribe();
    } else if (permission === "default") {
      let dismissed = false;
      try {
        dismissed =
          window.localStorage.getItem(`cheya-push-prompt-dismissed:${uid}`) ===
          "1";
      } catch {}
      if (!dismissed) {
        setStatus("Aktifkan notifikasi agar kabar baru tetap terlihat.");
        setCanRequestPermission(true);
      }
    }

    return () => {
      cancelled = true;
    };
  }, [uid]);

  async function requestNotifications() {
    if (!canRequestPermission || Notification.permission !== "default") return;
    try {
      const permission = await Notification.requestPermission();
      setCanRequestPermission(false);
      setStatus("");
      if (permission === "granted") {
        const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        if (!vapidKey) return;
        await registerPushSubscription(uid, vapidKey);
        done.current = true;
      }
    } catch (error) {
      console.error("[push-register] permission request failed:", error);
    }
  }

  function dismissPrompt() {
    try {
      window.localStorage.setItem(`cheya-push-prompt-dismissed:${uid}`, "1");
    } catch {}
    setCanRequestPermission(false);
    setStatus("");
  }

  if (!status) return null;
  return (
    <div
      role="status"
      className="fixed bottom-20 left-4 right-4 z-[100] mx-auto max-w-[560px] rounded-xl border border-amber-200 bg-white px-4 py-3 text-[12px] text-amber-900 shadow-lg"
    >
      <div className="flex items-center justify-between gap-3">
        <span>{status}</span>
        <div className="flex shrink-0 items-center gap-3">
          {canRequestPermission && (
            <button
              type="button"
              onClick={() => void requestNotifications()}
              className="font-semibold"
            >
              Aktifkan
            </button>
          )}
          <button type="button" onClick={dismissPrompt} className="font-semibold">
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
