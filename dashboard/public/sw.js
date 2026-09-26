const ICON_PATH = "/api/avatar/system/circular";
const CACHE_NAME = "cheya-push-assets-v3";
const DEFAULT_TAG = "cheyaverse-system-alert";
const DEFAULT_TITLE = "CheyaVerse";

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

  const iconRaw = typeof payload.icon === "string" && payload.icon ? payload.icon : ICON_PATH;

  const options = {
    body,
    icon: absoluteUrl(iconRaw),
    tag: typeof payload.tag === "string" && payload.tag ? payload.tag : DEFAULT_TAG,
    renotify: payload.renotify !== false,
    data,
    actions: Array.isArray(payload.actions) && payload.actions.length > 0
      ? payload.actions
      : [
          { action: "mark-read", title: "Mark as Read" },
          { action: "reply", type: "text", title: "Reply", placeholder: "Type a message..." },
        ],
  };

  if (typeof payload.badge === "string" && payload.badge) {
    options.badge = absoluteUrl(payload.badge);
  }

  event.waitUntil(self.registration.showNotification(title, options));
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
