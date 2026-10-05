// src/app/api/messages/[uid]/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  createMessage,
  listMessages,
  getChatMessage,
  getChatNotification,
  getTelegramUser,
  editChatMessage,
  deleteChatMessage,
  markMessageDelivered,
  markMessageRead,
} from "@/lib/storage";
import { broadcastToUid } from "@/lib/realtime";
import { getUserSession } from "@/lib/auth-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { uid: string } },
) {
  const uid = Number(params.uid);
  const session = await getUserSession(_req, uid);
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!Number.isInteger(uid) || uid <= 0) {
    return NextResponse.json({ ok: false, error: "invalid_uid" }, { status: 400 });
  }
  const items = await listMessages(uid, 500);
  return NextResponse.json({ ok: true, items });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { uid: string } },
) {
  const uid = Number(params.uid);
  const session = await getUserSession(req, uid);
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!Number.isInteger(uid) || uid <= 0) {
    return NextResponse.json({ ok: false, error: "invalid_uid" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const rawContent = typeof body?.content === "string" ? body.content : "";
  const content = rawContent.trim().slice(0, 2000);
  if (!content) {
    return NextResponse.json({ ok: false, error: "empty_content" }, { status: 400 });
  }

  const tgUser = await getTelegramUser(uid);
  const replyToId =
    typeof body?.replyToId === "string" ? body.replyToId : null;
  if (replyToId) {
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(replyToId)) {
      return NextResponse.json({ ok: false, error: "invalid_reply" }, { status: 400 });
    }
    const notificationReply = replyToId.startsWith("n-")
      ? await getChatNotification(uid, replyToId.slice(2))
      : null;
    const repliedMessage = notificationReply
      ? null
      : await getChatMessage(uid, replyToId);
    if (
      (!notificationReply && (!repliedMessage || repliedMessage.deleted_at))
    ) {
      return NextResponse.json({ ok: false, error: "reply_not_found" }, { status: 404 });
    }
  }
  const fullName = [tgUser?.first_name, tgUser?.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  const displayName = fullName || tgUser?.username || "Anda";

  const deliveredAt = new Date().toISOString();

  const msg = await createMessage({
    uid,
    sender: "user",
    sender_role: "user",
    title: displayName,
    content,
    delivered_at: deliveredAt,
    read_at: null,
    reply_to_id: replyToId,
    sender_device_id: session.deviceId,
  });
  if (!msg) {
    return NextResponse.json({ ok: false, error: "db_error" }, { status: 500 });
  }

  await broadcastToUid(uid, { type: "message:new", message: msg });

  const msgId = msg.id;
  setTimeout(async () => {
    try {
      const readAt = await markMessageRead(msgId, uid);
      if (!readAt) return;
      await broadcastToUid(uid, {
        type: "message:read",
        messageId: msgId,
        read_at: readAt,
      });
    } catch {}
  }, 1200);

  const delivered = await markMessageDelivered(msgId, uid);
  if (delivered && delivered !== deliveredAt) {
    await broadcastToUid(uid, {
      type: "message:delivered",
      messageId: msgId,
      delivered_at: delivered,
    });
  }

  return NextResponse.json({ ok: true, message: msg });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { uid: string } },
) {
  const uid = Number(params.uid);
  const session = await getUserSession(req, uid);
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!Number.isInteger(uid) || uid <= 0) {
    return NextResponse.json({ ok: false, error: "invalid_uid" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const messageId = typeof body?.messageId === "string" ? body.messageId : "";
  const content =
    typeof body?.content === "string" ? body.content.trim().slice(0, 2000) : "";
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(messageId) || !content) {
    return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }

  const existingMessage = await getChatMessage(uid, messageId);
  if (!existingMessage) {
    return NextResponse.json({ ok: false, error: "message_not_found" }, { status: 404 });
  }
  if (existingMessage.sender !== "user" || existingMessage.deleted_at) {
    return NextResponse.json({ ok: false, error: "message_not_editable" }, { status: 403 });
  }
  const message = await editChatMessage(uid, messageId, content);
  if (!message) {
    return NextResponse.json({ ok: false, error: "message_not_editable" }, { status: 409 });
  }
  await broadcastToUid(uid, { type: "message:updated", message });
  return NextResponse.json({ ok: true, message });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { uid: string } },
) {
  const uid = Number(params.uid);
  const session = await getUserSession(req, uid);
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!Number.isInteger(uid) || uid <= 0) {
    return NextResponse.json({ ok: false, error: "invalid_uid" }, { status: 400 });
  }
  const messageId = req.nextUrl.searchParams.get("messageId") || "";
  const scope = req.nextUrl.searchParams.get("scope");
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(messageId) || (scope !== "me" && scope !== "everyone")) {
    return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }
  const message = await getChatMessage(uid, messageId);
  if (!message) {
    return NextResponse.json({ ok: false, error: "message_not_found" }, { status: 404 });
  }
  const deleted = await deleteChatMessage(uid, messageId, scope);
  if (!deleted) {
    return NextResponse.json({ ok: false, error: "message_not_deletable" }, { status: 409 });
  }
  await broadcastToUid(uid, {
    type: scope === "me" && !message.deleted_at ? "message:hidden" : "message:deleted",
    messageId,
  });
  return NextResponse.json({ ok: true });
}