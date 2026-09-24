import { NextRequest, NextResponse } from "next/server";
import {
  ensureWelcomeNotification,
  getDeviceIdRow,
  insertDeviceId,
  touchDeviceId,
  countDeviceIdsForUid,
  isDeviceBlacklisted,
} from "@/lib/storage";
import { parseDeviceInfo } from "@/lib/device";
import { getTelegramChatInfo, sendTelegramMessage } from "@/lib/telegram";
import { computeFingerprint } from "@/lib/session-fingerprint";
import { generateDeviceId } from "@/lib/device-id";
import { config } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEVICE_ID_RE = /^\d{10}$/;

function buildDeviceLine(info: ReturnType<typeof parseDeviceInfo>): string | null {
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

  const parts: string[] = [];
  if (typeLabel) parts.push(typeLabel);
  if (info.os) parts.push(info.os);
  if (
    info.brand &&
    info.model &&
    !info.model.toUpperCase().includes(info.brand.toUpperCase())
  ) {
    parts.push(`${info.brand} ${info.model}`);
  } else if (info.brand) {
    parts.push(info.brand);
  } else if (info.model) {
    parts.push(info.model);
  }
  return parts.join(" · ") || null;
}

function buildHardwareLine(
  cpuCores: number | null,
  ramGb: number | null,
): string {
  const parts: string[] = [];
  if (typeof cpuCores === "number" && cpuCores > 0) parts.push(`${cpuCores} core`);
  if (typeof ramGb === "number" && ramGb > 0) parts.push(`${ramGb} GB RAM`);
  return parts.length ? parts.join(" · ") : "Tidak terdeteksi";
}

function nowWaktu(): string {
  try {
    return new Date().toLocaleString("id-ID", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Jakarta",
    });
  } catch {
    return new Date().toISOString();
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const uid = Number(body?.uid);
  const rawDeviceId =
    typeof body?.deviceId === "string" ? body.deviceId.trim() : "";
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
  const deviceLine = buildDeviceLine(info);
  const hardwareLine = buildHardwareLine(cpuCores, ramGb);

  const fingerprint = computeFingerprint({
    device_type: info.type === "unknown" ? null : info.type,
    os: info.os,
    brand: info.brand,
    model: info.model,
    browser: info.browser,
    cpu_cores: cpuCores,
    ram_gb: ramGb,
  });

  let deviceId = rawDeviceId;

  if (DEVICE_ID_RE.test(deviceId)) {
    const blocked = await isDeviceBlacklisted(deviceId, uid);
    if (blocked) {
      return NextResponse.json({ ok: false, error: "blocked" }, { status: 403 });
    }

    const existing = await getDeviceIdRow(deviceId, uid);
    if (existing) {
      await touchDeviceId(deviceId, uid);
      return NextResponse.json({ ok: true, state: "known", deviceId });
    }
  }

  deviceId = generateDeviceId();
  for (let i = 0; i < 12; i++) {
    const clash = await getDeviceIdRow(deviceId, uid);
    if (!clash) break;
    deviceId = generateDeviceId();
  }

  const beforeCount = await countDeviceIdsForUid(uid);

  const now = new Date().toISOString();

  await insertDeviceId({
    device_id: deviceId,
    uid,
    fingerprint,
    device_type: info.type === "unknown" ? null : info.type,
    os: info.os,
    brand: info.brand,
    model: info.model,
    browser: info.browser,
    cpu_cores: cpuCores,
    ram_gb: ramGb,
    user_agent: ua || null,
    first_seen: now,
    last_seen: now,
  });

  const tgInfo = await getTelegramChatInfo(uid).catch(() => null);
  const username =
    tgInfo?.username ||
    [tgInfo?.first_name, tgInfo?.last_name].filter(Boolean).join(" ") ||
    null;

  if (beforeCount === 0) {
    await ensureWelcomeNotification(
      uid,
      username,
      deviceLine,
      info.browser,
      cpuCores,
      ramGb,
    );
    return NextResponse.json({ ok: true, state: "welcome", deviceId });
  }

  const deviceBaru = deviceLine || "Tidak terdeteksi";
  const browserBaru = info.browser || "Tidak terdeteksi";
  const waktuBaru = nowWaktu();

  const blockUrl = config.publicUrl
    ? `${config.publicUrl}/security/block?uid=${uid}&did=${encodeURIComponent(deviceId)}`
    : "";

  const dmText = [
    "<b>CheyaVerse Security Service</b>",
    "",
    "Sistem mendeteksi adanya aktivitas masuk dari perangkat baru menggunakan otorisasi akun Telegram Anda.",
    "",
    "<b>Detail device:</b>",
    `• <b>Perangkat:</b> ${deviceBaru}`,
    `• <b>Hardware:</b> ${hardwareLine}`,
    `• <b>Browser:</b> ${browserBaru}`,
    `• <b>Waktu:</b> ${waktuBaru}`,
    "",
    "⚠️ <b>TINDAKAN DIPERLUKAN:</b> Sesi aktif sebelumnya pada perangkat lama Anda akan tetap dipertahankan. Namun, jika Anda tidak merasa melakukan login dari perangkat dengan spesifikasi di atas, seseorang kemungkinan telah menyalin tautan instan privat Anda.",
    "",
    "<i>Demi keamanan, segera amankan akun Anda dengan cara klik tombol <b>Blokir IP</b> dibawah ini atau abaikan saja jika ini memang anda.</i>",
  ].join("\n");

  if (blockUrl) {
    await sendTelegramMessage(uid, dmText, {
      parseMode: "HTML",
      replyMarkup: {
        inline_keyboard: [[{ text: "Blokir IP", url: blockUrl }]],
      },
      disableWebPagePreview: true,
    });
  }

  return NextResponse.json({ ok: true, state: "new-device", deviceId });
}
