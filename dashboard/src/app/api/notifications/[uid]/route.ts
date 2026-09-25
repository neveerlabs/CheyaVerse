// src/app/api/notifications/[uid]/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  listNotifications,
  countUnreadNotifications,
  markNotificationsRead,
} from "@/lib/storage";
import { broadcastToUid } from "@/lib/realtime";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { uid: string } },
) {
  const uid = Number(params.uid);
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
  if (!Number.isInteger(uid) || uid <= 0) {
    return NextResponse.json({ ok: false, error: "invalid_uid" }, { status: 400 });
  }
  await markNotificationsRead(uid);
  broadcastToUid(uid, { type: "notification:read" });
  revalidatePath(`/${uid}/chat`);
  return NextResponse.json({ ok: true });
}