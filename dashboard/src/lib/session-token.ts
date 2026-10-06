import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE_NAME = "cheya_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export type UserSession = {
  uid: number;
  deviceId: string | null;
  deviceLink?: boolean;
  sessionVersion: number;
  exp: number;
};

function sessionSecret(): string {
  const secret =
    process.env.SESSION_SECRET?.trim() ||
    process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!secret) {
    throw new Error("SESSION_SECRET or TELEGRAM_BOT_TOKEN is required for sessions.");
  }
  return secret;
}

function legacySessionSecret(): string | null {
  const secret = process.env.TELEGRAM_BOT_TOKEN?.trim();
  return secret && secret !== process.env.SESSION_SECRET?.trim()
    ? secret
    : null;
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
  deviceLink = false,
  sessionVersion = 0,
  expiresAt = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS,
): string {
  const payload = encode(
    JSON.stringify({
      uid,
      deviceId,
      deviceLink,
      sessionVersion,
      exp: expiresAt,
    } satisfies UserSession),
  );
  return `${payload}.${signature(payload)}`;
}

export function readSessionToken(token: string | undefined): UserSession | null {
  if (!token) return null;
  try {
    const [payload, suppliedSignature, ...extra] = token.split(".");
    if (!payload || !suppliedSignature || extra.length) return null;
    const supplied = Buffer.from(suppliedSignature);
    const validSignature = [sessionSecret(), legacySessionSecret()]
      .filter((secret): secret is string => Boolean(secret))
      .some((secret) => {
        const expected = createHmac("sha256", secret)
          .update(payload)
          .digest("base64url");
        const expectedBuffer = Buffer.from(expected);
        return expectedBuffer.length === supplied.length &&
          timingSafeEqual(expectedBuffer, supplied);
      });
    if (!validSignature) {
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
      (session.sessionVersion !== undefined &&
        (!Number.isSafeInteger(session.sessionVersion) ||
          session.sessionVersion < 0)) ||
      (session.deviceId !== null &&
        session.deviceId !== undefined &&
        !/^\d{10}$/.test(session.deviceId))
    ) {
      return null;
    }
    return {
      uid: session.uid!,
      deviceId: session.deviceId ?? null,
      deviceLink: session.deviceLink === true,
      sessionVersion: session.sessionVersion ?? 0,
      exp: session.exp!,
    };
  } catch {
    return null;
  }
}
