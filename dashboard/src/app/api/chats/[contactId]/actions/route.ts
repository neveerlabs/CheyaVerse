import { NextRequest, NextResponse } from "next/server";
import { getUserSession } from "@/lib/auth-request";
import { broadcastToUid } from "@/lib/realtime";
import { sendOfflineDirectMessageNotifications } from "@/lib/chat-notifications";
import {
  createDirectMessage,
  getDirectMessageById,
  getTelegramUser,
  isTelegramUserOnline,
  toggleDirectMessagePin,
} from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: { contactId: string } },
) {
  const session = await getUserSession(request);
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const contactUid = Number(params.contactId);
  if (
    !Number.isSafeInteger(contactUid) ||
    contactUid <= 0 ||
    contactUid === session.uid
  ) {
    return NextResponse.json({ ok: false, error: "invalid_contact" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }
  if (
    !("messageId" in body) ||
    typeof body.messageId !== "string" ||
    !/^[A-Za-z0-9_-]{1,80}$/.test(body.messageId)
  ) {
    return NextResponse.json({ ok: false, error: "invalid_message" }, { status: 400 });
  }
  const message = await getDirectMessageById(body.messageId);
  if (
    !message ||
    !(
      (message.sender_uid === session.uid && message.recipient_uid === contactUid) ||
      (message.sender_uid === contactUid && message.recipient_uid === session.uid)
    )
  ) {
    return NextResponse.json({ ok: false, error: "message_not_found" }, { status: 404 });
  }

  if ("action" in body && body.action === "pin") {
    if (message.deleted_at) {
      return NextResponse.json({ ok: false, error: "message_deleted" }, { status: 409 });
    }
    const pinned = await toggleDirectMessagePin(session.uid, message.id);
    if (pinned === null) {
      return NextResponse.json({ ok: false, error: "message_not_found" }, { status: 404 });
    }
    broadcastToUid(session.uid, { type: "direct-message:pinned", messageId: message.id });
    return NextResponse.json({ ok: true, pinned });
  }

  if ("action" in body && body.action === "forward") {
    if (message.deleted_at) {
      return NextResponse.json({ ok: false, error: "message_deleted" }, { status: 409 });
    }
    const targetUid = Number("targetUid" in body ? body.targetUid : NaN);
    if (
      !Number.isSafeInteger(targetUid) ||
      targetUid <= 0 ||
      targetUid === session.uid
    ) {
      return NextResponse.json({ ok: false, error: "invalid_target" }, { status: 400 });
    }
    if (!(await getTelegramUser(targetUid))) {
      return NextResponse.json({ ok: false, error: "account_not_found" }, { status: 404 });
    }
    const online = await isTelegramUserOnline(targetUid);
    const forwarded = await createDirectMessage(session.uid, targetUid, message.content, {
      deliveredAt: online ? new Date().toISOString() : null,
      forwardedFromUid: message.sender_uid,
    });
    broadcastToUid(targetUid, { type: "direct-message:new", message: forwarded });
    broadcastToUid(session.uid, { type: "direct-message:new", message: forwarded });
    if (!online) {
      const sender = await getTelegramUser(session.uid);
      const senderName = sender
        ? [sender.first_name, sender.last_name].filter(Boolean).join(" ").trim() ||
          (sender.username ? `@${sender.username}` : `Telegram ${session.uid}`)
        : `Telegram ${session.uid}`;
      void sendOfflineDirectMessageNotifications({
        recipientUid: targetUid,
        senderUid: session.uid,
        senderName,
        content: message.content,
        messageId: forwarded.id,
      });
    }
    return NextResponse.json({ ok: true, message: forwarded });
  }
  return NextResponse.json({ ok: false, error: "unknown_action" }, { status: 400 });
}
