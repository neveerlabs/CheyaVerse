import { NextRequest, NextResponse } from "next/server";
import { hasValidSameOrigin } from "@/lib/auth-request";
import {
  SESSION_COOKIE_NAME,
} from "@/lib/session-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!hasValidSameOrigin(request)) {
    return NextResponse.json({ ok: false, error: "invalid_origin" }, { status: 403 });
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure:
      process.env.NODE_ENV === "production" ||
      request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() === "https" ||
      request.nextUrl.protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
