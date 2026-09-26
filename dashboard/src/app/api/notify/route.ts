import { NextRequest, NextResponse } from "next/server";
import { createNotification } from "@/lib/storage";
import { broadcastToUid } from "@/lib/realtime";
import { parseDevice, getClientIp, lookupLocation } from "@/lib/device";
import { getUserSession } from "@/lib/auth-request";
import { sendPushToUid, buildSystemPush } from "@/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await getUserSession(req);
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const uid = Number(body?.uid);
  const title = String(body?.title ?? "").slice(0, 200);
  const message = String(body?.message ?? "").slice(0, 2000);

  if (!Number.isInteger(uid) || uid !== session.uid) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
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

  const plain = message.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();

  broadcastToUid(uid, {
    type: "notification:new",
    title,
    body: plain.slice(0, 200),
  });
  void sendPushToUid(uid, buildSystemPush(uid, plain.slice(0, 200), { notifId: notif.id }))
    .catch((error) => console.error("[notify] push delivery failed:", error));

  return NextResponse.json({ ok: true, notification: notif });
}