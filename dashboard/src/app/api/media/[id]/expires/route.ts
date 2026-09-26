import { NextRequest, NextResponse } from "next/server";
import { updateMediaExpiresAt, getDeviceIdRow } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEVICE_ID_RE = /^\d{10}$/;
const MEDIA_ID_RE = /^\d{7}$/;
const NEVER_ISO = "9999-12-31T23:59:59.999Z";

const DURATION_MS: Record<string, number | null> = {
  "12h": 12 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "1w": 7 * 24 * 60 * 60 * 1000,
  "1m": 30 * 24 * 60 * 60 * 1000,
  "1y": 365 * 24 * 60 * 60 * 1000,
  never: null,
};

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!MEDIA_ID_RE.test(params.id)) {
    return NextResponse.json(
      { ok: false, error: "invalid_media_id" },
      { status: 400 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const uid = Number(body?.uid);
  const deviceId = String(body?.deviceId ?? "").trim();
  const duration = String(body?.duration ?? "").trim();

  if (!Number.isInteger(uid) || uid <= 0) {
    return NextResponse.json(
      { ok: false, error: "invalid_uid" },
      { status: 400 },
    );
  }
  if (!DEVICE_ID_RE.test(deviceId)) {
    return NextResponse.json(
      { ok: false, error: "invalid_device_id" },
      { status: 400 },
    );
  }
  if (!(duration in DURATION_MS)) {
    return NextResponse.json(
      { ok: false, error: "invalid_duration" },
      { status: 400 },
    );
  }

  const device = await getDeviceIdRow(deviceId, uid);
  if (!device) {
    return NextResponse.json(
      { ok: false, error: "unknown_device" },
      { status: 403 },
    );
  }

  const ms = DURATION_MS[duration];
  const expiresAt =
    ms === null ? NEVER_ISO : new Date(Date.now() + ms).toISOString();

  const res = await updateMediaExpiresAt(params.id, uid, expiresAt);
  if (!res.ok) {
    return NextResponse.json(
      { ok: false, error: res.reason ?? "update_failed" },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true, expiresAt });
}
