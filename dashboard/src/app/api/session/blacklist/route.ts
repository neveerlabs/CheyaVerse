import { NextRequest, NextResponse } from "next/server";
import { addDeviceToBlacklist, getDeviceIdRow } from "@/lib/storage";
import { broadcastToUid } from "@/lib/realtime";
import { getUserSession } from "@/lib/auth-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEVICE_ID_RE = /^\d{10}$/;

export async function POST(req: NextRequest) {
  const session = await getUserSession(req);
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const uid = Number(body?.uid);
  const deviceId = String(body?.deviceId ?? "").trim();

  if (!Number.isInteger(uid) || uid !== session.uid) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  if (!DEVICE_ID_RE.test(deviceId)) {
    return NextResponse.json({ ok: false, error: "invalid_device_id" }, { status: 400 });
  }

  const device = await getDeviceIdRow(deviceId, uid);
  if (!device) {
    return NextResponse.json({ ok: false, error: "unknown_device" }, { status: 404 });
  }

  await addDeviceToBlacklist(deviceId, uid);

  broadcastToUid(uid, { type: "session:blocked", deviceId });

  return NextResponse.json({ ok: true });
}