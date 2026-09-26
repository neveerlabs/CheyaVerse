import { NextRequest, NextResponse } from "next/server";
import { upsertPushSubscription } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEVICE_ID_RE = /^\d{10}$/;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const uid = Number(body?.uid);
  const rawDeviceId = typeof body?.deviceId === "string" ? body.deviceId.trim() : "";
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint.trim() : "";
  const p256dh = typeof body?.p256dh === "string" ? body.p256dh.trim() : "";
  const auth = typeof body?.auth === "string" ? body.auth.trim() : "";

  if (!Number.isInteger(uid) || uid <= 0) {
    return NextResponse.json({ ok: false, error: "invalid_uid" }, { status: 400 });
  }
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
  }

  const deviceId = DEVICE_ID_RE.test(rawDeviceId) ? rawDeviceId : null;

  await upsertPushSubscription({ endpoint, uid, deviceId, p256dh, auth });

  return NextResponse.json({ ok: true });
}
