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
  setDeviceAccountState,
} from "@/lib/storage";
import {
  getClientIp,
  isPublicIp,
  lookupCityAndCountry,
  parseDeviceInfo,
} from "@/lib/device";
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
  return s ? s.slice(0, 160) : null;
}

function boundedNum(v: unknown, max: number): number | null {
  const value = num(v);
  return value !== null && value >= 0 && value <= max ? value : null;
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
  const rawDeviceId = session.deviceId ?? requestedDeviceId;
  const ua = String(body?.ua ?? "").slice(0, 1000);
  const cpuCores =
    typeof body?.cpuCores === "number" &&
    body.cpuCores > 0 &&
    body.cpuCores <= 512
      ? Math.floor(body.cpuCores)
      : null;
  const ramGb =
    typeof body?.ramGb === "number" && body.ramGb > 0 && body.ramGb <= 1024
      ? Number(body.ramGb)
      : null;
  const language = str(body?.language);
  const timezone = str(body?.timezone);
  const screenW = boundedNum(body?.screenW, 10000);
  const screenH = boundedNum(body?.screenH, 10000);
  const colorDepth = boundedNum(body?.colorDepth, 128);
  const platform = str(body?.platform);
  const maxTouch = boundedNum(body?.maxTouch, 100);
  const webglVendor = str(body?.webglVendor);
  const webglRenderer = str(body?.webglRenderer);
  const viewportW = boundedNum(body?.viewportW, 10000);
  const viewportH = boundedNum(body?.viewportH, 10000);
  const screenAvailW = boundedNum(body?.screenAvailW, 10000);
  const screenAvailH = boundedNum(body?.screenAvailH, 10000);
  const pixelRatio = boundedNum(body?.pixelRatio, 10);
  const orientation = str(body?.orientation);
  const colorGamut = str(body?.colorGamut);
  const networkType = str(body?.networkType);
  const browserVersion = str(body?.browserVersion);
  const uaArchitecture = str(body?.uaArchitecture);
  const uaPlatformVersion = str(body?.uaPlatformVersion);
  const uaBitness = str(body?.uaBitness);
  const uaModel = str(body?.uaModel);

  if (!Number.isInteger(uid) || uid !== session.uid) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const account = await getTelegramUser(uid);
  if (!account) {
    return NextResponse.json({ ok: false, error: "telegram_account_not_found" }, { status: 404 });
  }

  const info = parseDeviceInfo(ua);
  if (uaModel) info.model = uaModel;
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
    ua_architecture: uaArchitecture,
  };

  const fingerprint = computeFingerprint(ident);
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
        model: info.model,
        language,
        timezone,
        platform,
        max_touch: maxTouch,
        color_depth: colorDepth,
        webgl_vendor: webglVendor,
        webgl_renderer: webglRenderer,
        screen_w: screenW,
        screen_h: screenH,
        viewport_w: viewportW,
        viewport_h: viewportH,
        screen_avail_w: screenAvailW,
        screen_avail_h: screenAvailH,
        pixel_ratio: pixelRatio,
        orientation,
        color_gamut: colorGamut,
        network_type: networkType,
        browser_version: browserVersion,
        ua_architecture: uaArchitecture,
        ua_platform_version: uaPlatformVersion,
        ua_bitness: uaBitness,
      });
      await setDeviceAccountState(deviceId, uid);
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
  }

  if (!DEVICE_ID_RE.test(deviceId)) {
    deviceId = generateDeviceId();
    for (let i = 0; i < 12; i++) {
      const clash = await getDeviceIdRow(deviceId, uid);
      if (!clash) break;
      deviceId = generateDeviceId();
    }
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
    viewport_w: viewportW,
    viewport_h: viewportH,
    screen_avail_w: screenAvailW,
    screen_avail_h: screenAvailH,
    pixel_ratio: pixelRatio,
    orientation,
    color_gamut: colorGamut,
    network_type: networkType,
    browser_version: browserVersion,
    ua_architecture: uaArchitecture,
    ua_platform_version: uaPlatformVersion,
    ua_bitness: uaBitness,
    first_seen: now,
    last_seen: now,
  });
  await setDeviceAccountState(deviceId, uid);

  if (beforeCount === 0) {
    const welcome = await ensureWelcomeNotification(
      uid,
      account.username,
      deviceLine,
      info.browser,
      cpuCores,
      ramGb,
    );
    if (welcome.created) {
      await broadcastToUid(uid, {
        type: "notification:new",
        notificationId: `welcome-${uid}`,
      });
    }

    const pushBody = welcome.message
      ? stripHtml(welcome.message)
      : "Otorisasi akun berhasil. Akun Anda telah terhubung dengan aman.";
    sendPushToUid(uid, buildSystemPush(uid, pushBody)).catch((error) => {
      console.error("[session/init] welcome push delivery failed:", error);
    });

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
            : null;
  const model =
    info.brand &&
    info.model &&
    !info.model.toUpperCase().includes(info.brand.toUpperCase())
      ? `${info.brand} ${info.model}`
      : info.model ?? info.brand;
  const hardware = [
    model,
    cpuCores ? `${cpuCores} core` : null,
    ramGb ? `${ramGb} GB RAM` : null,
  ].filter((value): value is string => Boolean(value));
  const ipAddress = getClientIp(req.headers);
  const publicIp = isPublicIp(ipAddress) ? ipAddress : null;
  const timestampLocal = nowWaktu();
  const timestampUtc = new Date()
    .toISOString()
    .replace("T", " ")
    .replace(/\.\d{3}Z$/, "");
  const location = publicIp ? await lookupCityAndCountry(publicIp) : null;
  const locationParts = [location?.city, location?.country].filter(
    (value): value is string => Boolean(value),
  );
  const displayDetails = [
    screenW && screenH ? `${screenW}×${screenH}` : null,
    viewportW && viewportH ? `viewport ${viewportW}×${viewportH}` : null,
    pixelRatio ? `DPR ${pixelRatio}×` : null,
    orientation,
  ].filter((value): value is string => Boolean(value));
  const runtimeDetails = [
    browserVersion ? `${info.browser ?? "Browser"} ${browserVersion}` : info.browser,
    uaArchitecture ? `CPU arch ${uaArchitecture}` : null,
    uaPlatformVersion ? `OS version ${uaPlatformVersion}` : null,
    uaBitness ? `${uaBitness}-bit` : null,
    language,
    timezone,
    networkType ? `network ${networkType}` : null,
  ].filter((value): value is string => Boolean(value));
  const deviceParts = [deviceType, publicIp, info.os].filter(
    (value): value is string => Boolean(value),
  );
  const greeting = account.first_name
    ? `Dear ${escapeHtml(account.first_name)},`
    : "Dear,";

  const blockOrigin = config.publicUrl || req.nextUrl.origin;
  const blockUrl = `${blockOrigin}/security/block?uid=${uid}&did=${encodeURIComponent(deviceId)}`;

  const dmText = [
    `<b>New login.</b> ${greeting} we detected a login into your account from a new device on ${escapeHtml(timestampLocal)}, ${escapeHtml(timestampUtc)} UTC.`,
    "",
    ...(deviceParts.length
      ? [`Device: ${deviceParts.map(escapeHtml).join(", ")}`]
      : []),
    ...(hardware.length
      ? [`Hardware: ${hardware.map(escapeHtml).join(", ")}`]
      : []),
    ...(runtimeDetails.length
      ? [`Browser/device details: ${runtimeDetails.map(escapeHtml).join(", ")}`]
      : []),
    ...(displayDetails.length
      ? [`Display: ${displayDetails.map(escapeHtml).join("; ")}`]
      : []),
    ...(locationParts.length
      ? [`Location: ${locationParts.map(escapeHtml).join(", ")}`]
      : []),
    "",
    `If this wasn't you, you can terminate that session in <b>Setting &gt; Devices &amp; Security</b> (or open <b>@${escapeHtml(config.botUsername || "CheyaVersebot")}</b> and tap <b>Blokir Device</b>).`,
  ].join("\n");

  const sent = await sendTelegramMessage(uid, dmText, {
    parseMode: "HTML",
    replyMarkup: {
      inline_keyboard: [[{ text: "Blokir Device", url: blockUrl }]],
    },
    disableWebPagePreview: true,
    retry: { maxAttempts: 3, timeoutMs: 5_000 },
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
