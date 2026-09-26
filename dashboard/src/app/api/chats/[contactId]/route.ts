import { NextRequest, NextResponse } from "next/server";
import { getUserSession } from "@/lib/auth-request";
import {
  createDirectMessage,
  getTelegramUser,
  listDirectMessages,
  markDirectMessagesRead,
} from "@/lib/storage";
import { broadcastToUid } from "@/lib/realtime";
import { buildPushNotification, sendPushToUid } from "@/lib/push";

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
  const items = await listDirectMessages(session.uid, contactUid);
  await markDirectMessagesRead(session.uid, contactUid);
  broadcastToUid(contactUid, { type: "direct-message:read", uid: session.uid });
  return NextResponse.json({
    ok: true,
    contact: {
      uid: contact.uid,
      username: contact.username,
      first_name: contact.first_name,
      last_name: contact.last_name,
      photo_url: contact.photo_url,
    },
    items,
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

  let body: { content?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }
  const content =
    typeof body.content === "string" ? body.content.trim().slice(0, 2000) : "";
  if (!content) {
    return NextResponse.json({ ok: false, error: "empty_content" }, { status: 400 });
  }
  if (!(await getTelegramUser(contactUid))) {
    return NextResponse.json({ ok: false, error: "account_not_found" }, { status: 404 });
  }

  try {
    const message = await createDirectMessage(session.uid, contactUid, content);
    broadcastToUid(contactUid, { type: "direct-message:new", message });
    broadcastToUid(session.uid, { type: "direct-message:new", message });
    const sender = await getTelegramUser(session.uid);
    const senderName = sender
      ? [sender.first_name, sender.last_name].filter(Boolean).join(" ").trim() ||
        (sender.username ? `@${sender.username}` : `Telegram ${session.uid}`)
      : `Telegram ${session.uid}`;
    void sendPushToUid(
      contactUid,
      buildPushNotification({
        uid: contactUid,
        contact: {
          id: String(session.uid),
          name: senderName,
          avatarUrl: `/api/avatar/${session.uid}/circular`,
        },
        body: content,
        url: `/${contactUid}/chat/${session.uid}`,
        msgId: message.id,
      }),
    ).catch((error) =>
      console.error("[chats] push delivery failed:", error),
    );
    return NextResponse.json({ ok: true, message });
  } catch (error) {
    console.error("[chats] failed to send direct message:", error);
    return NextResponse.json({ ok: false, error: "message_send_failed" }, { status: 500 });
  }
}
