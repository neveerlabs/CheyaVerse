// src/app/api/messages/[uid]/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  createMessage,
  listMessages,
  getTelegramUser,
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
  });
  if (!msg) {
    return NextResponse.json({ ok: false, error: "db_error" }, { status: 500 });
  }

  broadcastToUid(uid, { type: "message:new", message: msg });

  const msgId = msg.id;
  setTimeout(async () => {
    try {
      const readAt = await markMessageRead(msgId, uid);
      if (!readAt) return;
      broadcastToUid(uid, {
        type: "message:read",
        messageId: msgId,
        read_at: readAt,
      });
    } catch {}
  }, 1200);

  const delivered = await markMessageDelivered(msgId, uid);
  if (delivered && delivered !== deliveredAt) {
    broadcastToUid(uid, {
      type: "message:delivered",
      messageId: msgId,
      delivered_at: delivered,
    });
  }

  return NextResponse.json({ ok: true, message: msg });
}