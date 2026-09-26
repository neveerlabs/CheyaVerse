import { NextRequest, NextResponse } from "next/server";
import {
  ensureWelcomeNotification,
  getDeviceIdRow,
  findDeviceIdByFingerprint,
  insertDeviceId,
  touchDeviceId,
  updateDeviceFingerprint,
  countDeviceIdsForUid,
  isDeviceBlacklisted,
  getTelegramUser,
} from "@/lib/storage";
import { parseDeviceInfo } from "@/lib/device";
import { sendTelegramMessage } from "@/lib/telegram";
import {
  computeFingerprint,
  computeLegacyFingerprint,
} from "@/lib/session-fingerprint";
import { generateDeviceId } from "@/lib/device-id";
import { broadcastToUid } from "@/lib/realtime";
import { sendPushToUid, buildSystemPush } from "@/lib/push";
import { config } from "@/lib/config";
import { getUserSession } from "@/lib/auth-request";
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/session-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEVICE_ID_RE = /^\d{10}$/;

function stripHtml(input: string): string {
  return input
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

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

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s : null;
}

export async function POST(req: NextRequest) {
  const session = await getUserSession(req);
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const uid = Number(body?.uid);
  const rawDeviceId = session.deviceId ?? "";
  const ua = String(body?.ua ?? "");
  const cpuCores =
    typeof body?.cpuCores === "number" && body.cpuCores > 0
      ? Math.floor(body.cpuCores)
      : null;
  const ramGb =
    typeof body?.ramGb === "number" && body.ramGb > 0
      ? Number(body.ramGb)
      : null;
  const language = str(body?.language);
  const timezone = str(body?.timezone);
  const screenW = num(body?.screenW);
  const screenH = num(body?.screenH);
  const colorDepth = num(body?.colorDepth);
  const platform = str(body?.platform);
  const maxTouch = num(body?.maxTouch);
  const webglVendor = str(body?.webglVendor);
  const webglRenderer = str(body?.webglRenderer);

  if (!Number.isInteger(uid) || uid !== session.uid) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const account = await getTelegramUser(uid);
  if (!account) {
    return NextResponse.json({ ok: false, error: "telegram_account_not_found" }, { status: 404 });
  }

  const info = parseDeviceInfo(ua);
  const deviceLine = buildDeviceLine(info);
  const hardwareLine = buildHardwareLine(cpuCores, ramGb);

  const ident = {
    device_type: info.type === "unknown" ? null : info.type,
    os: info.os,
    brand: info.brand,
    model: info.model,
    browser: info.browser,
    cpu_cores: cpuCores,
    ram_gb: ramGb,
    language,
    timezone,
    platform,
    max_touch: maxTouch,
    color_depth: colorDepth,
    webgl_vendor: webglVendor,
    webgl_renderer: webglRenderer,
    screen_w: screenW,
    screen_h: screenH,
  };

  const fingerprint = computeFingerprint(ident);
  const legacyFingerprint = computeLegacyFingerprint(ident);

  let deviceId = rawDeviceId;

  if (DEVICE_ID_RE.test(deviceId)) {
    const blocked = await isDeviceBlacklisted(deviceId, uid);
    if (blocked) {
      return NextResponse.json({ ok: false, error: "blocked" }, { status: 403 });
    }

    const existing = await getDeviceIdRow(deviceId, uid);
    if (existing) {
      await touchDeviceId(deviceId, uid);
      await updateDeviceFingerprint(deviceId, uid, fingerprint, {
        language,
        timezone,
        platform,
        max_touch: maxTouch,
        color_depth: colorDepth,
        webgl_vendor: webglVendor,
        webgl_renderer: webglRenderer,
        screen_w: screenW,
        screen_h: screenH,
      });
      return withDeviceSession(req, uid, deviceId);
    }
  }

  const matchByFingerprint = await findDeviceIdByFingerprint(uid, fingerprint);
  if (matchByFingerprint && DEVICE_ID_RE.test(matchByFingerprint.device_id)) {
    const blocked = await isDeviceBlacklisted(matchByFingerprint.device_id, uid);
    if (blocked) {
      return NextResponse.json({ ok: false, error: "blocked" }, { status: 403 });
    }
    await touchDeviceId(matchByFingerprint.device_id, uid);
    await updateDeviceFingerprint(matchByFingerprint.device_id, uid, fingerprint, {
      language,
      timezone,
      platform,
      max_touch: maxTouch,
      color_depth: colorDepth,
      webgl_vendor: webglVendor,
      webgl_renderer: webglRenderer,
      screen_w: screenW,
      screen_h: screenH,
    });
    return withDeviceSession(req, uid, matchByFingerprint.device_id, {
      ok: true,
      state: "known",
      deviceId: matchByFingerprint.device_id,
    });
  }

  const matchByLegacy = await findDeviceIdByFingerprint(uid, legacyFingerprint);
  if (matchByLegacy && DEVICE_ID_RE.test(matchByLegacy.device_id)) {
    const blocked = await isDeviceBlacklisted(matchByLegacy.device_id, uid);
    if (blocked) {
      return NextResponse.json({ ok: false, error: "blocked" }, { status: 403 });
    }
    await updateDeviceFingerprint(matchByLegacy.device_id, uid, fingerprint, {
      language,
      timezone,
      platform,
      max_touch: maxTouch,
      color_depth: colorDepth,
      webgl_vendor: webglVendor,
      webgl_renderer: webglRenderer,
      screen_w: screenW,
      screen_h: screenH,
    });
    return withDeviceSession(req, uid, matchByLegacy.device_id, {
      ok: true,
      state: "known",
      deviceId: matchByLegacy.device_id,
    });
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
    language,
    timezone,
    platform,
    max_touch: maxTouch,
    color_depth: colorDepth,
    webgl_vendor: webglVendor,
    webgl_renderer: webglRenderer,
    screen_w: screenW,
    screen_h: screenH,
    first_seen: now,
    last_seen: now,
  });

  if (beforeCount === 0) {
    const welcome = await ensureWelcomeNotification(
      uid,
      account.username,
      deviceLine,
      info.browser,
      cpuCores,
      ramGb,
    );
    broadcastToUid(uid, { type: "notification:new" });

    const pushBody = welcome.message
      ? stripHtml(welcome.message)
      : "Otorisasi akun berhasil. Akun Anda telah terhubung dengan aman.";
    sendPushToUid(uid, buildSystemPush(uid, pushBody)).catch(() => {});

    return withDeviceSession(req, uid, deviceId, {
      ok: true,
      state: "welcome",
      deviceId,
    });
  }

  const deviceBaru = escapeHtml(deviceLine || "Tidak terdeteksi");
  const browserBaru = escapeHtml(info.browser || "Tidak terdeteksi");
  const waktuBaru = nowWaktu();

  const blockOrigin = config.publicUrl || req.nextUrl.origin;
  const blockUrl = `${blockOrigin}/security/block?uid=${uid}&did=${encodeURIComponent(deviceId)}`;

  const dmText = [
    "<b>CheyaVerse Service Notifications</b>",
    "",
    "Sistem mendeteksi login akun Telegram Anda dari perangkat baru.",
    "",
    "<b>Detail device:</b>",
    `• <b>Device ID:</b> <code>${deviceId}</code>`,
    `• <b>Perangkat:</b> ${deviceBaru}`,
    `• <b>Hardware:</b> ${hardwareLine}`,
    `• <b>Browser:</b> ${browserBaru}`,
    `• <b>Waktu:</b> ${waktuBaru}`,
    "",
    "⚠️ <b>TINDAKAN DIPERLUKAN:</b> Jika Anda tidak melakukan login ini, blokir Device ID di atas. Pemblokiran hanya berlaku untuk akun Telegram ini; perangkat masih dapat memakai akun Telegram lain yang tidak diblokir.",
    "",
    "<i>Pilih <b>Blokir Device</b> di bawah jika login ini bukan milik Anda. Jika memang Anda yang login, tidak perlu melakukan apa pun.</i>",
  ].join("\n");

  const sent = await sendTelegramMessage(uid, dmText, {
    parseMode: "HTML",
    replyMarkup: {
      inline_keyboard: [[{ text: "Blokir Device", url: blockUrl }]],
    },
    disableWebPagePreview: true,
  });
  if (!sent) {
    console.error(`[session/init] Security alert for account ${uid}, device ${deviceId} could not be sent through Telegram.`);
  }

  return withDeviceSession(req, uid, deviceId, {
    ok: true,
    state: "new-device",
    deviceId,
  });
}

function withDeviceSession(
  req: NextRequest,
  uid: number,
  deviceId: string,
  payload: Record<string, unknown> = { ok: true, state: "known", deviceId },
) {
  const response = NextResponse.json(payload);
  response.cookies.set(
    SESSION_COOKIE_NAME,
    createSessionToken(uid, deviceId),
    {
      httpOnly: true,
      secure:
        process.env.NODE_ENV === "production" ||
        req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() === "https" ||
        req.nextUrl.protocol === "https:",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    },
  );
  return response;
}
