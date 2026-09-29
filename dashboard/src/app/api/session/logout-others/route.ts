import { NextRequest, NextResponse } from "next/server";
import { getUserSession, hasValidSameOrigin } from "@/lib/auth-request";
import { incrementAccountSessionVersion } from "@/lib/storage";
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
} from "@/lib/session-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!hasValidSameOrigin(request)) {
    return NextResponse.json(
      { ok: false, error: "invalid_origin" },
      { status: 403 },
    );
  }

  const session = await getUserSession(request);
  if (!session) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 },
    );
  }

  try {
    const sessionVersion = await incrementAccountSessionVersion(session.uid);
    const maxAge = Math.max(1, session.exp - Math.floor(Date.now() / 1000));
    const response = NextResponse.json({ ok: true });
    response.cookies.set(
      SESSION_COOKIE_NAME,
      createSessionToken(
        session.uid,
        session.deviceId,
        session.deviceLink,
        sessionVersion,
        session.exp,
      ),
      {
        httpOnly: true,
        secure:
          process.env.NODE_ENV === "production" ||
          request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ===
            "https" ||
          request.nextUrl.protocol === "https:",
        sameSite: "lax",
        path: "/",
        maxAge,
      },
    );
    return response;
  } catch (error) {
    console.error("[session/logout-others] could not revoke other sessions:", error);
    return NextResponse.json(
      { ok: false, error: "logout_others_failed" },
      { status: 500 },
    );
  }
}
