import { NextRequest, NextResponse } from "next/server";
import { getUserSession } from "@/lib/auth-request";
import {
  getChatMessage,
  getChatNotification,
  toggleChatMessagePin,
  toggleChatNotificationPin,
} from "@/lib/storage";
import { broadcastToUid } from "@/lib/realtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  if (
    !body ||
    typeof body !== "object" ||
    !("action" in body) ||
    !("messageId" in body)
  ) {
    return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }

  const { action, messageId } = body as {
    action: unknown;
    messageId: unknown;
  };
  if (
    action !== "pin" ||
    typeof messageId !== "string" ||
    !/^[A-Za-z0-9_-]{1,120}$/.test(messageId)
  ) {
    return NextResponse.json({ ok: false, error: "unsupported_action" }, { status: 400 });
  }

  const notificationId = messageId.startsWith("n-")
    ? messageId.slice(2)
    : null;
  const notification = notificationId
    ? await getChatNotification(uid, notificationId)
    : null;
  const message = notification ? null : await getChatMessage(uid, messageId);
  if ((!notification && !message) || message?.deleted_at) {
    return NextResponse.json({ ok: false, error: "message_not_found" }, { status: 404 });
  }

  const pinned = notificationId
    ? await toggleChatNotificationPin(uid, notificationId)
    : await toggleChatMessagePin(uid, messageId);
  if (pinned === null) {
    return NextResponse.json({ ok: false, error: "message_not_found" }, { status: 404 });
  }

  broadcastToUid(
    uid,
    notificationId
      ? { type: "notification:pinned", notificationId, pinned }
      : { type: "message:pinned", messageId, pinned },
  );
  return NextResponse.json({ ok: true, pinned });
}
