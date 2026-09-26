import type { NextRequest } from "next/server";
import { isDeviceBlacklisted } from "@/lib/storage";
import {
  readSessionToken,
  SESSION_COOKIE_NAME,
  type UserSession,
} from "@/lib/session-token";

export function hasValidSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  const expectedHost =
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    request.headers.get("host") ||
    request.nextUrl.host;
  try {
    const parsedOrigin = new URL(origin ?? "");
    return (
      (parsedOrigin.protocol === "https:" || parsedOrigin.protocol === "http:") &&
      parsedOrigin.host === expectedHost
    );
  } catch {
    return false;
  }
}

export async function getUserSession(
  request: NextRequest,
  expectedUid?: number,
): Promise<UserSession | null> {
  const session = readSessionToken(
    request.cookies.get(SESSION_COOKIE_NAME)?.value,
  );
  if (!session || (expectedUid !== undefined && session.uid !== expectedUid)) {
    return null;
  }
  if (
    session.deviceId &&
    (await isDeviceBlacklisted(session.deviceId, session.uid))
  ) {
    return null;
  }
  return session;
}
