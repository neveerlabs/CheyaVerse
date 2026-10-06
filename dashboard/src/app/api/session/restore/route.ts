import { NextRequest, NextResponse } from "next/server";
import { hasValidSameOrigin } from "@/lib/auth-request";
import {
  getAccountSessionVersion,
  getDeviceIdRow,
  isDeviceBlacklisted,
} from "@/lib/storage";
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
  const signedDeviceId = session.deviceId ?? "";
  if (!/^\d{10}$/.test(signedDeviceId)) {
    const response = NextResponse.json({
      ok: true,
      authenticated: false,
    });
    return clearSession(response);
  }

  try {
    const sessionVersion = await getAccountSessionVersion(session.uid);
    if (session.sessionVersion !== sessionVersion) {
      return clearSession(
        NextResponse.json({ ok: true, authenticated: false }),
      );
    }

    const [device, blocked] = await Promise.all([
      getDeviceIdRow(signedDeviceId, session.uid),
      isDeviceBlacklisted(signedDeviceId, session.uid),
    ]);
    if (!device || blocked) {
      const response = NextResponse.json({
        ok: true,
        authenticated: false,
      });
      return clearSession(response);
    }
  } catch (error) {
    console.error("[session/restore] session verification failed:", error);
    return NextResponse.json(
      { ok: false, error: "session_verification_unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json({
    ok: true,
    authenticated: true,
    uid: session.uid,
    deviceId: signedDeviceId,
    localDeviceIdMatched: deviceId === signedDeviceId,
  });
}
