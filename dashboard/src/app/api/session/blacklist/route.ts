import { NextRequest, NextResponse } from "next/server";
import { addDeviceToBlacklist } from "@/lib/storage";
import { broadcastToUid } from "@/lib/realtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEVICE_ID_RE = /^\d{10}$/;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const uid = Number(body?.uid);
  const deviceId = String(body?.deviceId ?? "").trim();

  if (!Number.isInteger(uid) || uid <= 0) {
    return NextResponse.json({ ok: false, error: "invalid_uid" }, { status: 400 });
  }
  if (!DEVICE_ID_RE.test(deviceId)) {
    return NextResponse.json({ ok: false, error: "invalid_device_id" }, { status: 400 });
  }

  await addDeviceToBlacklist(deviceId, uid);

  broadcastToUid(uid, { type: "session:blocked", deviceId });

  return NextResponse.json({ ok: true });
}