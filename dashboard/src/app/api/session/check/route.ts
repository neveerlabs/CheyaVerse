import { NextRequest, NextResponse } from "next/server";
import { isDeviceBlacklisted } from "@/lib/storage";
import { readSessionToken, SESSION_COOKIE_NAME } from "@/lib/session-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEVICE_ID_RE = /^\d{10}$/;

export async function POST(req: NextRequest) {
  const session = readSessionToken(
    req.cookies.get(SESSION_COOKIE_NAME)?.value,
  );
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const uid = Number(body?.uid);

  if (!Number.isInteger(uid) || uid !== session.uid) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const deviceId = session.deviceId ?? "";
  if (!DEVICE_ID_RE.test(deviceId)) {
    return NextResponse.json({ ok: true, blocked: false });
  }

  const blocked = await isDeviceBlacklisted(deviceId, uid);
  return NextResponse.json({ ok: true, blocked });
}