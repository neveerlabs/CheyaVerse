import { NextRequest, NextResponse } from "next/server";
import { createNotification } from "@/lib/storage";
import { broadcastToUid } from "@/lib/realtime";
import { parseDevice, getClientIp, lookupLocation } from "@/lib/device";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const uid = Number(body?.uid);
  const title = String(body?.title ?? "").slice(0, 200);
  const message = String(body?.message ?? "").slice(0, 2000);

  if (!Number.isInteger(uid) || uid <= 0) {
    return NextResponse.json({ ok: false, error: "invalid_uid" }, { status: 400 });
  }
  if (!title || !message) {
    return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
  }

  const ipRaw = getClientIp(req.headers);
  const ua = req.headers.get("user-agent") ?? "";
  const device = parseDevice(ua);
  const ip = ipRaw === "unknown" ? null : ipRaw;
  const location = ip ? await lookupLocation(ip) : null;

  const notif = await createNotification({ uid, title, message, ip, location, device });
  if (!notif) {
    return NextResponse.json({ ok: false, error: "db_error" }, { status: 500 });
  }
  broadcastToUid(uid, { type: "notification:new" });
  return NextResponse.json({ ok: true, notification: notif });
}