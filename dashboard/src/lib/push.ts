import webpush from "web-push";
import { config } from "./config";
import { listPushSubscriptions, deletePushSubscription } from "./storage";

let configured = false;
let configurationWarningLogged = false;

const MAX_BODY_LENGTH = 180;
const TRUNCATE_SUFFIX = "…";

function ensureConfigured(): boolean {
  if (configured) return true;
  if (!config.vapid.publicKey || !config.vapid.privateKey) {
    if (!configurationWarningLogged) {
      console.error("[push] VAPID public/private keys are not configured.");
      configurationWarningLogged = true;
    }
    return false;
  }
  try {
    webpush.setVapidDetails(
      config.vapid.subject,
      config.vapid.publicKey,
      config.vapid.privateKey,
    );
    configured = true;
    return true;
  } catch (error) {
    console.error("[push] VAPID configuration is invalid:", error);
    return false;
  }
}

function truncateBody(input: string): string {
  const formatted = String(input || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|li)>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (formatted.length <= MAX_BODY_LENGTH) return formatted;
  return formatted.slice(0, MAX_BODY_LENGTH).trimEnd() + TRUNCATE_SUFFIX;
}

function uniqueTag(contactId: string): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `cheya-${contactId}-${ts}-${rand}`;
}

export type PushAction = {
  action: string;
  type?: "text";
  title: string;
  placeholder?: string;
};

export type PushPayload = {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  vibrate?: number[];
  silent?: boolean;
  tag?: string;
  renotify?: boolean;
  data?: Record<string, unknown>;
  actions?: PushAction[];
};

export type PushContact = {
  id: string;
  name: string;
  avatarUrl?: string;
};

export type BuildPushOptions = {
  uid: number;
  contact: PushContact;
  body: string;
  url?: string;
  notifId?: string;
  msgId?: string;
  tag?: string;
  actions?: PushAction[];
};

export const DEFAULT_PUSH_ACTIONS: PushAction[] = [
  { action: "mark-read", title: "Mark as read" },
  { action: "reply", type: "text", title: "Reply", placeholder: "Type a message..." },
];

export function circularAvatarUrl(contactId: string): string {
  return `/api/avatar/${encodeURIComponent(contactId)}/circular`;
}

export function buildPushNotification(opts: BuildPushOptions): PushPayload {
  const icon = opts.contact.avatarUrl ?? circularAvatarUrl(opts.contact.id);
  const targetUrl = opts.url ?? `/${opts.uid}/chat/${opts.contact.id}`;
  const tag = opts.tag ?? uniqueTag(opts.contact.id);
  return {
    title: "CheyaVerse · Web",
    body: truncateBody(
      opts.contact.id === "system"
        ? opts.body
        : `${opts.contact.name}\n${opts.body}`,
    ),
    icon,
    tag,
    renotify: true,
    data: {
      uid: opts.uid,
      url: targetUrl,
      contactId: opts.contact.id,
      notifId: opts.notifId ?? null,
      msgId: opts.msgId ?? null,
      source: "bot-message",
      senderRole: "admin",
    },
    actions: opts.actions ?? DEFAULT_PUSH_ACTIONS,
  };
}

export function buildSystemPush(
  uid: number,
  body: string,
  extras?: { notifId?: string; msgId?: string },
): PushPayload {
  const payload = buildPushNotification({
    uid,
    contact: {
      id: "system",
      name: "CheyaVerse",
      avatarUrl: "/icon.png",
    },
    body,
    url: `/${uid}/chat/system`,
    notifId: extras?.notifId,
    msgId: extras?.msgId,
  });
  return {
    ...payload,
    title: "CheyaVerse · Web",
    icon: "/push-icon.png",
    badge: "/push-icon.png",
    silent: false,
    vibrate: [200, 100, 200],
  };
}

export async function sendPushToUid(uid: number, payload: PushPayload): Promise<number> {
  if (
    payload.data?.source !== "bot-message" ||
    payload.data.senderRole === "ai" ||
    payload.data.senderRole !== "admin"
  ) {
    console.error("[push] rejected payload that is not a non-AI bot message.");
    return 0;
  }
  if (!ensureConfigured()) return 0;

  const subs = await listPushSubscriptions(uid);
  if (subs.length === 0) return 0;

  const serialized = JSON.stringify(payload);
  let sent = 0;

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          serialized,
          { TTL: 60 * 60 * 24 },
        );
        sent++;
      } catch (error) {
        const status = (error as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) {
          try {
            await deletePushSubscription(sub.endpoint, uid);
          } catch (deleteError) {
            console.error("[push] failed to remove expired subscription:", deleteError);
          }
        } else {
          console.error(
            `[push] delivery failed for account ${uid} (HTTP ${status ?? "unknown"}):`,
            error,
          );
        }
      }
    }),
  );

  return sent;
}
