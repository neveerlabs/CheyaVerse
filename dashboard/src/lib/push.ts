import webpush from "web-push";
import { config } from "./config";
import { listPushSubscriptions, deletePushSubscription } from "./storage";

let configured = false;

const MAX_BODY_LENGTH = 140;
const TRUNCATE_SUFFIX = "…";

function ensureConfigured(): boolean {
  if (configured) return true;
  if (!config.vapid.publicKey || !config.vapid.privateKey) return false;
  try {
    webpush.setVapidDetails(
      config.vapid.subject,
      config.vapid.publicKey,
      config.vapid.privateKey,
    );
    configured = true;
    return true;
  } catch {
    return false;
  }
}

function truncateBody(input: string): string {
  const flat = String(input || "").replace(/\s+/g, " ").trim();
  if (!flat) return "";
  if (flat.length <= MAX_BODY_LENGTH) return flat;
  return flat.slice(0, MAX_BODY_LENGTH).trimEnd() + TRUNCATE_SUFFIX;
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
  { action: "mark-read", title: "Mark as Read" },
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
    title: opts.contact.name,
    body: truncateBody(opts.body),
    icon,
    tag,
    renotify: true,
    data: {
      uid: opts.uid,
      url: targetUrl,
      contactId: opts.contact.id,
      notifId: opts.notifId ?? null,
      msgId: opts.msgId ?? null,
    },
    actions: opts.actions ?? DEFAULT_PUSH_ACTIONS,
  };
}

export function buildSystemPush(
  uid: number,
  body: string,
  extras?: { notifId?: string; msgId?: string },
): PushPayload {
  return buildPushNotification({
    uid,
    contact: {
      id: "system",
      name: "CheyaVerse",
    },
    body,
    url: `/${uid}/chat/system`,
    notifId: extras?.notifId,
    msgId: extras?.msgId,
  });
}

export async function sendPushToUid(uid: number, payload: PushPayload): Promise<number> {
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
      } catch (err) {
        const status = (err as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) {
          await deletePushSubscription(sub.endpoint).catch(() => {});
        }
      }
    }),
  );

  return sent;
}
