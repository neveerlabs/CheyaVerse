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
  const activeDevices = devices.filter(
    (device) => !blocked.has(device.device_id),
  );
  return NextResponse.json(
    {
      ok: true,
      currentDeviceId: session.deviceId,
      devices: activeDevices.map((device) => ({
        deviceId: device.device_id,
        type: device.device_type,
        os: device.os,
        brand: device.brand,
        model: device.model,
        browser: device.browser,
        browserVersion: device.browser_version,
        cpuCores: device.cpu_cores,
        ramGb: device.ram_gb,
        screen: device.screen_w && device.screen_h
          ? `${device.screen_w} × ${device.screen_h}`
          : null,
        viewport: device.viewport_w && device.viewport_h
          ? `${device.viewport_w} × ${device.viewport_h}`
          : null,
        pixelRatio: device.pixel_ratio,
        orientation: device.orientation,
        colorGamut: device.color_gamut,
        architecture: device.ua_architecture,
        platformVersion: device.ua_platform_version,
        bitness: device.ua_bitness,
        networkType: device.network_type,
        language: device.language,
        timezone: device.timezone,
        lastSeen: device.last_seen,
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
