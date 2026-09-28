import { NextRequest, NextResponse } from "next/server";
import { getUserSession, hasValidSameOrigin } from "@/lib/auth-request";
import { createDeviceLink } from "@/lib/device-links";
import { getDeviceIdRow } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!hasValidSameOrigin(request)) {
    return NextResponse.json({ ok: false, error: "invalid_origin" }, { status: 403 });
  }
  const session = await getUserSession(request);
  if (!session?.deviceId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const device = await getDeviceIdRow(session.deviceId, session.uid);
  if (!device) {
    return NextResponse.json({ ok: false, error: "unknown_device" }, { status: 401 });
  }

  const invite = await createDeviceLink(session.uid, session.deviceId);
  return NextResponse.json({ ok: true, ...invite });
}
