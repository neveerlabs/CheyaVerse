import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";
import { upsertVerifiedTelegramUser } from "@/lib/storage";
import {
  createSessionToken,
  readSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/session-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TelegramLoginData = {
  id?: unknown;
  first_name?: unknown;
  last_name?: unknown;
  username?: unknown;
  photo_url?: unknown;
  auth_date?: unknown;
  allows_write_to_pm?: unknown;
  hash?: unknown;
};

function validateTelegramLogin(data: TelegramLoginData): number | null {
  const token = config.telegram.botToken;
  if (!token || typeof data.hash !== "string" || !/^[a-f0-9]{64}$/i.test(data.hash)) {
    return null;
  }

  const uid = Number(data.id);
  const authDate = Number(data.auth_date);
  const now = Math.floor(Date.now() / 1000);
  if (
    !Number.isSafeInteger(uid) ||
    uid <= 0 ||
    !Number.isSafeInteger(authDate) ||
    authDate > now + 30 ||
    now - authDate > 60 * 60 * 24
  ) {
    return null;
  }

  const checkString = Object.entries(data)
    .filter(([key, value]) => key !== "hash" && value !== undefined && value !== null)
    .map(([key, value]) => `${key}=${String(value)}`)
    .sort()
    .join("\n");
  const secret = createHash("sha256").update(token).digest();
  const expected = createHmac("sha256", secret)
    .update(checkString)
    .digest();
  const supplied = Buffer.from(data.hash, "hex");
  return expected.length === supplied.length && timingSafeEqual(expected, supplied)
    ? uid
    : null;
}

function stringField(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().slice(0, maxLength);
  return cleaned || null;
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const expectedHost =
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    request.headers.get("host") ||
    request.nextUrl.host;
  let validOrigin = false;
  try {
    const parsedOrigin = new URL(origin ?? "");
    validOrigin =
      (parsedOrigin.protocol === "https:" || parsedOrigin.protocol === "http:") &&
      parsedOrigin.host === expectedHost;
  } catch {}
  if (!validOrigin) {
    return NextResponse.json({ ok: false, error: "invalid_origin" }, { status: 403 });
  }
  let body: TelegramLoginData;
  try {
    body = (await request.json()) as TelegramLoginData;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }

  const uid = validateTelegramLogin(body);
  if (!uid) {
    return NextResponse.json({ ok: false, error: "telegram_auth_invalid" }, { status: 401 });
  }

  try {
    await upsertVerifiedTelegramUser(uid, {
      username: stringField(body.username, 64),
      first_name: stringField(body.first_name, 128),
      last_name: stringField(body.last_name, 128),
      photo_url: stringField(body.photo_url, 2048),
      auth_date: Number(body.auth_date),
      allows_write_to_pm:
        typeof body.allows_write_to_pm === "boolean"
          ? body.allows_write_to_pm
          : null,
    });
  } catch (error) {
    console.error("[auth/telegram] failed to store Telegram profile:", error);
    return NextResponse.json({ ok: false, error: "account_storage_failed" }, { status: 500 });
  }

  const previous = readSessionToken(
    request.cookies.get(SESSION_COOKIE_NAME)?.value,
  );
  const deviceId = previous?.uid === uid ? previous.deviceId : null;
  const response = NextResponse.json({ ok: true, uid });
  response.cookies.set(SESSION_COOKIE_NAME, createSessionToken(uid, deviceId), {
    httpOnly: true,
    secure:
      process.env.NODE_ENV === "production" ||
      (origin ? new URL(origin).protocol === "https:" : false),
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return response;
}
