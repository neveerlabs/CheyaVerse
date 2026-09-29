import { NextRequest, NextResponse } from "next/server";
import { getUserSession } from "@/lib/auth-request";
import { broadcastToUid } from "@/lib/realtime";
import { sendOfflineDirectMessageNotifications } from "@/lib/chat-notifications";
import {
  createDirectMessage,
  getChatMessage,
  getChatNotification,
  getTelegramUser,
  isTelegramUserOnline,
  toggleChatMessagePin,
  toggleChatNotificationPin,
} from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function plainText(content: string): string {
  return content
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|li)>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .trim()
    .slice(0, 2000);
}

export async function POST(
  request: NextRequest,
  { params }: { params: { uid: string } },
) {
  const uid = Number(params.uid);
  const session = await getUserSession(request, uid);
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!Number.isSafeInteger(uid) || uid <= 0) {
    return NextResponse.json({ ok: false, error: "invalid_uid" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || !("action" in body) || !("messageId" in body)) {
    return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }
  const { action, messageId } = body as { action: unknown; messageId: unknown };
  if (typeof messageId !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(messageId)) {
    return NextResponse.json({ ok: false, error: "invalid_message" }, { status: 400 });
  }
  const notificationId = messageId.startsWith("n-") ? messageId.slice(2) : null;
  const notification = notificationId
    ? await getChatNotification(uid, notificationId)
    : null;
  const message = notification ? null : await getChatMessage(uid, messageId);
  const contentToForward = notification?.message ?? message?.content;
  if ((!notification && !message) || message?.deleted_at) {
    return NextResponse.json({ ok: false, error: "message_not_found" }, { status: 404 });
  }

  if (action === "pin") {
    const pinned = notificationId
      ? await toggleChatNotificationPin(uid, notificationId)
      : await toggleChatMessagePin(uid, messageId);
    if (pinned === null) {
      return NextResponse.json({ ok: false, error: "message_not_found" }, { status: 404 });
    }
    broadcastToUid(uid, notificationId
      ? { type: "notification:pinned", notificationId, pinned }
      : { type: "message:pinned", messageId, pinned });
    return NextResponse.json({ ok: true, pinned });
  }

  if (action === "forward" && contentToForward) {
    const targetUid =
      "targetUid" in body ? Number((body as { targetUid: unknown }).targetUid) : NaN;
    if (!Number.isSafeInteger(targetUid) || targetUid <= 0 || targetUid === uid) {
      return NextResponse.json({ ok: false, error: "invalid_target" }, { status: 400 });
    }
    const target = await getTelegramUser(targetUid);
    if (!target) {
      return NextResponse.json({ ok: false, error: "account_not_found" }, { status: 404 });
    }
    if (target.role === "deleted") {
      return NextResponse.json({ ok: false, error: "account_deleted" }, { status: 410 });
    }
    const content = plainText(contentToForward);
    if (!content) {
      return NextResponse.json({ ok: false, error: "empty_content" }, { status: 409 });
    }
    const online = await isTelegramUserOnline(targetUid);
    const forwarded = await createDirectMessage(uid, targetUid, content, {
      deliveredAt: online ? new Date().toISOString() : null,
      forwardedFromUid: uid,
    });
    broadcastToUid(targetUid, { type: "direct-message:new", message: forwarded });
    broadcastToUid(uid, { type: "direct-message:new", message: forwarded });
    if (!online) {
      const sender = await getTelegramUser(uid);
      const senderName = sender
        ? [sender.first_name, sender.last_name].filter(Boolean).join(" ").trim() ||
          (sender.username ? `@${sender.username}` : `Telegram ${uid}`)
        : `Telegram ${uid}`;
      void sendOfflineDirectMessageNotifications({
        recipientUid: targetUid,
        senderUid: uid,
        senderName,
        content,
      });
    }
    return NextResponse.json({ ok: true, message: forwarded });
  }

  return NextResponse.json({ ok: false, error: "unknown_action" }, { status: 400 });
}
