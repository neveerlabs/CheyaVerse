import { NextRequest, NextResponse } from "next/server";
import { getUserSession } from "@/lib/auth-request";
import {
  createDirectMessage,
  getDirectMessageById,
  getPinnedDirectMessage,
  getTelegramUser,
  listDirectMessages,
  markDirectMessagesRead,
  isTelegramUserOnline,
} from "@/lib/storage";
import { broadcastToUid } from "@/lib/realtime";
import { sendOfflineDirectMessageNotifications } from "@/lib/chat-notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseContactId(value: string): number | null {
  const uid = Number(value);
  return Number.isSafeInteger(uid) && uid > 0 ? uid : null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { contactId: string } },
) {
  const session = await getUserSession(request);
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const contactUid = parseContactId(params.contactId);
  if (!contactUid || contactUid === session.uid) {
    return NextResponse.json({ ok: false, error: "invalid_contact" }, { status: 400 });
  }
  const contact = await getTelegramUser(contactUid);
  if (!contact) {
    return NextResponse.json({ ok: false, error: "account_not_found" }, { status: 404 });
  }
  const readAt = await markDirectMessagesRead(session.uid, contactUid);
  const [items, pinned] = await Promise.all([
    listDirectMessages(session.uid, contactUid),
    getPinnedDirectMessage(session.uid, contactUid),
  ]);
  if (readAt) {
    broadcastToUid(contactUid, {
      type: "direct-message:read",
      uid: session.uid,
      read_at: readAt,
    });
  }
  return NextResponse.json({
    ok: true,
    contact: {
      uid: contact.uid,
      username: contact.username,
      first_name: contact.first_name,
      last_name: contact.last_name,
      photo_url: contact.photo_url,
      role: contact.role,
    },
    items,
    pinned,
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: { contactId: string } },
) {
  const session = await getUserSession(request);
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const contactUid = parseContactId(params.contactId);
  if (!contactUid || contactUid === session.uid) {
    return NextResponse.json({ ok: false, error: "invalid_contact" }, { status: 400 });
  }
  const contact = await getTelegramUser(contactUid);
  if (!contact) {
    return NextResponse.json({ ok: false, error: "account_not_found" }, { status: 404 });
  }
  if (contact.role === "deleted") {
    return NextResponse.json({ ok: false, error: "account_deleted" }, { status: 410 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || !("content" in body)) {
    return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }
  const content =
    typeof body.content === "string" ? body.content.trim().slice(0, 2000) : "";
  if (!content) {
    return NextResponse.json({ ok: false, error: "empty_content" }, { status: 400 });
  }
  const replyToId =
    "replyToId" in body && typeof body.replyToId === "string"
      ? body.replyToId
      : null;
  if ("replyToId" in body && body.replyToId !== null && replyToId === null) {
    return NextResponse.json({ ok: false, error: "invalid_reply" }, { status: 400 });
  }
  if (replyToId) {
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(replyToId)) {
      return NextResponse.json({ ok: false, error: "invalid_reply" }, { status: 400 });
    }
    const repliedMessage = await getDirectMessageById(replyToId);
    if (
      !repliedMessage ||
      !(
        (repliedMessage.sender_uid === session.uid &&
          repliedMessage.recipient_uid === contactUid) ||
        (repliedMessage.sender_uid === contactUid &&
          repliedMessage.recipient_uid === session.uid)
      )
    ) {
      return NextResponse.json({ ok: false, error: "reply_not_found" }, { status: 404 });
    }
  }
  try {
    const recipientOnline = await isTelegramUserOnline(contactUid);
    const message = await createDirectMessage(session.uid, contactUid, content, {
      deliveredAt: recipientOnline ? new Date().toISOString() : null,
      replyToId,
    });
    broadcastToUid(contactUid, { type: "direct-message:new", message });
    broadcastToUid(session.uid, { type: "direct-message:new", message });
    const sender = await getTelegramUser(session.uid);
    const senderName = sender
      ? [sender.first_name, sender.last_name].filter(Boolean).join(" ").trim() ||
        (sender.username ? `@${sender.username}` : `Telegram ${session.uid}`)
      : `Telegram ${session.uid}`;
    if (!recipientOnline) {
      void sendOfflineDirectMessageNotifications({
        recipientUid: contactUid,
        senderUid: session.uid,
        senderName,
        content,
      });
    }
    return NextResponse.json({ ok: true, message });
  } catch (error) {
    console.error("[chats] failed to send direct message:", error);
    return NextResponse.json({ ok: false, error: "message_send_failed" }, { status: 500 });
  }
}
