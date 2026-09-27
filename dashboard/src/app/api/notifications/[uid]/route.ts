// src/app/api/notifications/[uid]/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  listNotifications,
  countUnreadNotifications,
  markNotificationsRead,
  deleteChatNotification,
} from "@/lib/storage";
import { broadcastToUid } from "@/lib/realtime";
import { revalidatePath } from "next/cache";
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
  const [items, unread] = await Promise.all([
    listNotifications(uid, 100),
    countUnreadNotifications(uid),
  ]);
  return NextResponse.json({ ok: true, items, unread });
}

export async function POST(
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
  await markNotificationsRead(uid);
  broadcastToUid(uid, { type: "notification:read" });
  revalidatePath(`/${uid}/chat`);
  return NextResponse.json({ ok: true });
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
  if (!Number.isSafeInteger(uid) || uid <= 0) {
    return NextResponse.json({ ok: false, error: "invalid_uid" }, { status: 400 });
  }
  const notificationId = req.nextUrl.searchParams.get("id") || "";
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(notificationId)) {
    return NextResponse.json({ ok: false, error: "invalid_notification" }, { status: 400 });
  }
  const deleted = await deleteChatNotification(uid, notificationId);
  if (!deleted) {
    return NextResponse.json({ ok: false, error: "notification_not_found" }, { status: 404 });
  }
  broadcastToUid(uid, { type: "notification:deleted", notificationId });
  revalidatePath(`/${uid}/chat`);
  return NextResponse.json({ ok: true });
}