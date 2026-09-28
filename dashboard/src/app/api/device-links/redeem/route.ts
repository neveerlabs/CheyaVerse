import { NextRequest, NextResponse } from "next/server";
import { hasValidSameOrigin } from "@/lib/auth-request";
import { redeemDeviceLink } from "@/lib/device-links";
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/session-token";
import { getTelegramUser } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!hasValidSameOrigin(request)) {
    return NextResponse.json({ ok: false, error: "invalid_origin" }, { status: 403 });
  }
  const body = await request.json().catch(() => ({}));
  const token = typeof body?.token === "string" ? body.token : "";
  const uid = await redeemDeviceLink(token);
  if (!uid) {
    return NextResponse.json(
      { ok: false, error: "invalid_or_expired_link" },
      { status: 410 },
    );
  }
  if (!(await getTelegramUser(uid))) {
    return NextResponse.json({ ok: false, error: "account_not_found" }, { status: 410 });
  }

  const response = NextResponse.json({ ok: true, uid });
  response.cookies.set(SESSION_COOKIE_NAME, createSessionToken(uid, null, true), {
    httpOnly: true,
    secure:
      process.env.NODE_ENV === "production" ||
      request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() === "https" ||
      request.nextUrl.protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return response;
}
