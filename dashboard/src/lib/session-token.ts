import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE_NAME = "cheya_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export type UserSession = {
  uid: number;
  deviceId: string | null;
  exp: number;
};

function sessionSecret(): string {
  const secret = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!secret) throw new Error("TELEGRAM_BOT_TOKEN is required for sessions.");
  return secret;
}

function encode(value: string): string {
  return Buffer.from(value).toString("base64url");
}

function signature(payload: string): string {
  return createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
}

export function createSessionToken(
  uid: number,
  deviceId: string | null = null,
): string {
  const payload = encode(
    JSON.stringify({
      uid,
      deviceId,
      exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS,
    } satisfies UserSession),
  );
  return `${payload}.${signature(payload)}`;
}

export function readSessionToken(token: string | undefined): UserSession | null {
  if (!token) return null;
  try {
    const [payload, suppliedSignature, ...extra] = token.split(".");
    if (!payload || !suppliedSignature || extra.length) return null;
    const expected = Buffer.from(signature(payload));
    const supplied = Buffer.from(suppliedSignature);
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
      return null;
    }
    const session = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as Partial<UserSession>;
    if (
      !Number.isSafeInteger(session.uid) ||
      (session.uid ?? 0) <= 0 ||
      !Number.isSafeInteger(session.exp) ||
      (session.exp ?? 0) <= Math.floor(Date.now() / 1000) ||
      (session.deviceId !== null &&
        session.deviceId !== undefined &&
        !/^\d{10}$/.test(session.deviceId))
    ) {
      return null;
    }
    return {
      uid: session.uid!,
      deviceId: session.deviceId ?? null,
      exp: session.exp!,
    };
  } catch {
    return null;
  }
}
