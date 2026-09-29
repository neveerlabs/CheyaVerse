import { NextRequest, NextResponse } from "next/server";
import {
  ensureWelcomeNotification,
  getDeviceIdRow,
  insertDeviceId,
  touchDeviceId,
  updateDeviceFingerprint,
  countDeviceIdsForUid,
  isDeviceBlacklisted,
  getTelegramUser,
} from "@/lib/storage";
import { getClientIp, lookupLocation, parseDeviceInfo } from "@/lib/device";
import { sendTelegramMessage } from "@/lib/telegram";
import {
  computeFingerprint,
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
  const requestedDeviceId =
    typeof body?.deviceId === "string" && DEVICE_ID_RE.test(body.deviceId)
      ? body.deviceId
      : "";
  const rawDeviceId =
    session.deviceId ?? (session.deviceLink ? "" : requestedDeviceId);
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
  let deviceId = rawDeviceId;

  if (
    session.deviceId &&
    (typeof body?.deviceId !== "string" || body.deviceId !== session.deviceId)
  ) {
    const response = NextResponse.json(
      { ok: false, error: "device_id_mismatch" },
      { status: 401 },
    );
    response.cookies.set(SESSION_COOKIE_NAME, "", {
      httpOnly: true,
      secure:
        process.env.NODE_ENV === "production" ||
        req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() === "https" ||
        req.nextUrl.protocol === "https:",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    return response;
  }

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
      return withDeviceSession(req, uid, deviceId, session.sessionVersion);
    }

    if (session.deviceId) {
      const response = NextResponse.json(
        { ok: false, error: "unknown_device" },
        { status: 401 },
      );
      response.cookies.set(SESSION_COOKIE_NAME, "", {
        httpOnly: true,
        secure:
          process.env.NODE_ENV === "production" ||
          req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() === "https" ||
          req.nextUrl.protocol === "https:",
        sameSite: "lax",
        path: "/",
        maxAge: 0,
      });
      return response;
    }
    deviceId = "";
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

    return withDeviceSession(req, uid, deviceId, session.sessionVersion, {
      ok: true,
      state: "welcome",
      deviceId,
    });
  }

  const deviceType =
    info.type === "mobile"
      ? "Mobile"
      : info.type === "tablet"
        ? "Tablet"
        : info.type === "desktop"
          ? "Desktop"
          : info.type === "bot"
            ? "Bot"
            : "Unknown";
  const platformVersion =
    info.os?.match(/[\d]+(?:\.[\d]+)*/)?.[0] ?? "Unknown";
  const operatingSystem =
    info.os?.replace(/\s+[\d].*$/, "").trim() || info.os || "Unknown";
  const model =
    info.brand &&
    info.model &&
    !info.model.toUpperCase().includes(info.brand.toUpperCase())
      ? `${info.brand} ${info.model}`
      : info.model ?? info.brand ?? "Unknown";
  const timestampLocal = nowWaktu();
  const timestampUtc = new Date()
    .toISOString()
    .replace("T", " ")
    .replace(/\.\d{3}Z$/, "");
  const location = await lookupLocation(getClientIp(req.headers));
  const locationParts = location?.split(",").map((part) => part.trim()) ?? [];
  const city = locationParts[0] || "Unknown";
  const region = locationParts[1] || "Unknown";

  const blockOrigin = config.publicUrl || req.nextUrl.origin;
  const blockUrl = `${blockOrigin}/security/block?uid=${uid}&did=${encodeURIComponent(deviceId)}`;

  const dmText = [
    'New login. Dear ${escapeHtml(account.first_name || "user")}, we detected a login into your account from a new device on ${escapeHtml(timestampLocal)} at ${escapeHtml(timestampUtc)} UTC.',
    "",
    `Device: ${escapeHtml(deviceType)}, ${escapeHtml(platformVersion)}, ${escapeHtml(model)}, ${escapeHtml(operatingSystem)}`,
    `Location: ${escapeHtml(city)}, ${escapeHtml(region)}`,
    "",
    `If this wasn't you, you can terminate that session in <b>Setting &gt; Devices &amp; Security</b> (or open <b>@${escapeHtml(config.botUsername || "CheyaVersebot")}</b> and tap <b>Blokir Device</b>).`,
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

  return withDeviceSession(req, uid, deviceId, session.sessionVersion, {
    ok: true,
    state: "new-device",
    deviceId,
  });
}

function withDeviceSession(
  req: NextRequest,
  uid: number,
  deviceId: string,
  sessionVersion: number,
  payload: Record<string, unknown> = { ok: true, state: "known", deviceId },
) {
  const response = NextResponse.json(payload);
  response.cookies.set(
    SESSION_COOKIE_NAME,
    createSessionToken(uid, deviceId, false, sessionVersion),
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
