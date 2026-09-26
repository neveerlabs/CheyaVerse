import { NextRequest, NextResponse } from "next/server";
import { upsertPushSubscription } from "@/lib/storage";
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
  const rawDeviceId = session.deviceId ?? "";
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint.trim() : "";
  const p256dh = typeof body?.p256dh === "string" ? body.p256dh.trim() : "";
  const auth = typeof body?.auth === "string" ? body.auth.trim() : "";

  if (!Number.isInteger(uid) || uid !== session.uid) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
  }

  const deviceId = DEVICE_ID_RE.test(rawDeviceId) ? rawDeviceId : null;

  await upsertPushSubscription({ endpoint, uid, deviceId, p256dh, auth });

  return NextResponse.json({ ok: true });
}
