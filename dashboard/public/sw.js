const ICON_PATH = "/push-icon.png";
const CACHE_NAME = "cheya-push-assets-v5";
const DEFAULT_TITLE = "CheyaVerse · Web";

function absoluteUrl(path) {
  if (!path) return undefined;
  try {
    return new URL(path, self.location.origin).href;
  } catch {
    return path;
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE_NAME);
        await cache.add(new Request(ICON_PATH, { cache: "reload" }));
      } catch {}
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

async function postReply(uid, content) {
  const text = String(content || "").trim().slice(0, 2000);
  if (!uid || !text) return false;
  try {
    const res = await fetch(`/api/messages/${encodeURIComponent(String(uid))}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: text }),
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function markAllRead(uid) {
  if (!uid) return;
  try {
    await fetch(`/api/notifications/${encodeURIComponent(String(uid))}`, {
      method: "POST",
      cache: "no-store",
    });
  } catch {}
}

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: DEFAULT_TITLE, body: event.data ? event.data.text() : "" };
  }

  const title = typeof payload.title === "string" && payload.title
    ? payload.title
    : DEFAULT_TITLE;
  const body = typeof payload.body === "string" ? payload.body : "";
  const data = payload.data && typeof payload.data === "object" ? payload.data : {};
  const messageId = typeof data.msgId === "string"
    ? data.msgId
    : typeof data.notifId === "string"
      ? data.notifId
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const tag = typeof payload.tag === "string" && payload.tag
    ? payload.tag
    : `cheyaverse-${messageId}`;
  const iconRaw = typeof payload.icon === "string" && payload.icon
    ? payload.icon
    : ICON_PATH;

  event.waitUntil((async () => {
    const options = {
      body,
      icon: absoluteUrl(iconRaw),
      tag,
      renotify: payload.renotify !== false,
      silent: payload.silent === true,
      vibrate: Array.isArray(payload.vibrate)
        ? payload.vibrate
        : [200, 100, 200],
      data,
      actions: Array.isArray(payload.actions) && payload.actions.length > 0
        ? payload.actions
        : [
            { action: "mark-read", title: "Mark as read" },
            { action: "reply", type: "text", title: "Reply", placeholder: "Type a message..." },
          ],
    };
    if (typeof payload.badge === "string" && payload.badge) {
      options.badge = absoluteUrl(payload.badge);
    }

    await self.registration.showNotification(title, options);
  })());
});

self.addEventListener("notificationclick", (event) => {
  const action = event.action;
  const notification = event.notification;
  const data = notification.data || {};
  const uid = data.uid;
  const contactId = typeof data.contactId === "string" ? data.contactId : "system";
  const url = typeof data.url === "string" && data.url
    ? data.url
    : uid
      ? `/${uid}/chat/${contactId}`
      : "/";

  if (action === "reply") {
    const reply = event.reply;
    notification.close();
    if (reply && uid) {
      event.waitUntil(
        (async () => {
          await postReply(uid, reply);
          await markAllRead(uid);
        })(),
      );
    }
    return;
  }

  if (action === "mark-read") {
    notification.close();
    if (uid) {
      event.waitUntil(markAllRead(uid));
    }
    return;
  }

  notification.close();
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of all) {
        try {
          const clientUrl = new URL(client.url);
          if (uid && clientUrl.pathname.startsWith(`/${uid}`)) {
            await client.focus();
            try { await client.navigate(url); } catch {}
            return;
          }
        } catch {}
      }
      if (self.clients.openWindow) {
        await self.clients.openWindow(url);
      }
    })(),
  );
});

self.addEventListener("notificationclose", () => {});
