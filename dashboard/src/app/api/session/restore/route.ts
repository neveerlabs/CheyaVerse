import { NextRequest, NextResponse } from "next/server";
import { hasValidSameOrigin } from "@/lib/auth-request";
import { getDeviceIdRow, isDeviceBlacklisted } from "@/lib/storage";
import {
  readSessionToken,
  SESSION_COOKIE_NAME,
} from "@/lib/session-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clearSession(response: NextResponse): NextResponse {
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}

export async function POST(request: NextRequest) {
  if (!hasValidSameOrigin(request)) {
    return NextResponse.json({ ok: false, error: "invalid_origin" }, { status: 403 });
  }

  const session = readSessionToken(
    request.cookies.get(SESSION_COOKIE_NAME)?.value,
  );
  if (!session) {
    const response = NextResponse.json({ ok: true, authenticated: false });
    return request.cookies.has(SESSION_COOKIE_NAME)
      ? clearSession(response)
      : response;
  }

  const body = await request.json().catch(() => ({}));
  const deviceId =
    typeof body?.deviceId === "string" ? body.deviceId.trim() : "";
  const validDeviceId = /^\d{10}$/.test(deviceId);

  if (!validDeviceId || session.deviceId !== deviceId) {
    const response = NextResponse.json({
      ok: true,
      authenticated: false,
      clearDeviceId: true,
    });
    return clearSession(response);
  }

  const [device, blocked] = await Promise.all([
    getDeviceIdRow(deviceId, session.uid),
    isDeviceBlacklisted(deviceId, session.uid),
  ]);
  if (!device || blocked) {
    const response = NextResponse.json({
      ok: true,
      authenticated: false,
      clearDeviceId: true,
    });
    return clearSession(response);
  }

  return NextResponse.json({
    ok: true,
    authenticated: true,
    uid: session.uid,
  });
}
