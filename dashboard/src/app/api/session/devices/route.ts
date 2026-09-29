import { NextRequest, NextResponse } from "next/server";
import { getUserSession } from "@/lib/auth-request";
import {
  listBlacklistedDeviceIds,
  listDeviceIdsForUid,
} from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await getUserSession(request);
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const [devices, blockedIds] = await Promise.all([
    listDeviceIdsForUid(session.uid),
    listBlacklistedDeviceIds(session.uid),
  ]);
  const blocked = new Set(blockedIds);
  return NextResponse.json(
    {
      ok: true,
      currentDeviceId: session.deviceId,
      devices: devices.map((device) => ({
        deviceId: device.device_id,
        type: device.device_type,
        os: device.os,
        brand: device.brand,
        model: device.model,
        browser: device.browser,
        lastSeen: device.last_seen,
        revoked: blocked.has(device.device_id),
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
