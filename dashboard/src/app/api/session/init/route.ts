import { NextRequest, NextResponse } from "next/server";
import {
  upsertUserSession,
  ensureWelcomeNotification,
} from "@/lib/storage";
import { parseDeviceInfo } from "@/lib/device";
import { getTelegramChatInfo } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const uid = Number(body?.uid);
  const ua = String(body?.ua ?? "");
  const cpuCores =
    typeof body?.cpuCores === "number" && body.cpuCores > 0
      ? Math.floor(body.cpuCores)
      : null;
  const ramGb =
    typeof body?.ramGb === "number" && body.ramGb > 0
      ? Number(body.ramGb)
      : null;

  if (!Number.isInteger(uid) || uid <= 0) {
    return NextResponse.json({ ok: false, error: "invalid_uid" }, { status: 400 });
  }

  const info = parseDeviceInfo(ua);

  const typeLabel =
    info.type === "mobile"
      ? "Mobile"
      : info.type === "tablet"
        ? "Tablet"
        : info.type === "desktop"
          ? "Desktop"
          : info.type === "bot"
            ? "Bot"
            : null;

  const deviceParts: string[] = [];
  if (typeLabel) deviceParts.push(typeLabel);
  if (info.os) deviceParts.push(info.os);
  if (
    info.brand &&
    info.model &&
    !info.model.toUpperCase().includes(info.brand.toUpperCase())
  ) {
    deviceParts.push(`${info.brand} ${info.model}`);
  } else if (info.brand) {
    deviceParts.push(info.brand);
  } else if (info.model) {
    deviceParts.push(info.model);
  }
  const deviceLine = deviceParts.join(" · ") || null;

  await upsertUserSession(uid, {
    device_type: info.type === "unknown" ? null : info.type,
    os: info.os,
    brand: info.brand,
    model: info.model,
    browser: info.browser,
    cpu_cores: cpuCores,
    ram_gb: ramGb,
    user_agent: ua || null,
  });

  const tgInfo = await getTelegramChatInfo(uid).catch(() => null);
  const username =
    tgInfo?.username ||
    [tgInfo?.first_name, tgInfo?.last_name].filter(Boolean).join(" ") ||
    null;

  await ensureWelcomeNotification(
    uid,
    username,
    deviceLine,
    info.browser,
    cpuCores,
    ramGb,
  );

  return NextResponse.json({ ok: true });
}
