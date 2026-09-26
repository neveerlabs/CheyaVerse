import type { NextRequest } from "next/server";
import { isDeviceBlacklisted } from "@/lib/storage";
import {
  readSessionToken,
  SESSION_COOKIE_NAME,
  type UserSession,
} from "@/lib/session-token";

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
