import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { hasValidSameOrigin } from "@/lib/auth-request";
import {
  createSessionToken,
  readSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/session-token";
import {
  consumeTelegramLoginChallenge,
  getTelegramLoginChallenge,
} from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export async function POST(request: NextRequest) {
  if (!hasValidSameOrigin(request)) {
    return NextResponse.json({ error: "invalid_origin" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  if (
    !body ||
    typeof body !== "object" ||
    !("challenge" in body) ||
    typeof body.challenge !== "string" ||
    !CHALLENGE_PATTERN.test(body.challenge)
  ) {
    return NextResponse.json({ error: "invalid_challenge" }, { status: 400 });
  }

  const challengeHash = createHash("sha256").update(body.challenge).digest("hex");
  try {
    const challenge = await getTelegramLoginChallenge(challengeHash);
    const now = Math.floor(Date.now() / 1000);
    if (!challenge || challenge.expires_at <= now) {
      return NextResponse.json({ status: "expired" }, { status: 410 });
    }
    if (challenge.status === "pending") {
      return NextResponse.json(
        { status: "pending" },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    if (challenge.status === "consumed") {
      if (challenge.uid === null) {
        return NextResponse.json(
          { status: "denied" },
          { status: 403, headers: { "Cache-Control": "no-store" } },
        );
      }
      const session = readSessionToken(
        request.cookies.get(SESSION_COOKIE_NAME)?.value,
      );
      if (session?.uid === challenge.uid) {
        return NextResponse.json(
          { status: "approved", uid: challenge.uid },
          { headers: { "Cache-Control": "no-store" } },
        );
      }
      return NextResponse.json({ status: "expired" }, { status: 410 });
    }

    const uid = await consumeTelegramLoginChallenge(challengeHash);
    if (!uid) {
      const session = readSessionToken(
        request.cookies.get(SESSION_COOKIE_NAME)?.value,
      );
      if (session?.uid === challenge.uid) {
        return NextResponse.json(
          { status: "approved", uid: challenge.uid },
          { headers: { "Cache-Control": "no-store" } },
        );
      }
      return NextResponse.json({ status: "expired" }, { status: 410 });
    }

    const response = NextResponse.json(
      { status: "approved", uid },
      { headers: { "Cache-Control": "no-store" } },
    );
    response.cookies.set(SESSION_COOKIE_NAME, createSessionToken(uid), {
      httpOnly: true,
      secure:
        process.env.NODE_ENV === "production" ||
        request.headers.get("origin")?.startsWith("https://") === true,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    });
    return response;
  } catch (error) {
    console.error("[auth/challenge/status] failed to verify challenge:", error);
    return NextResponse.json({ error: "challenge_verification_failed" }, { status: 500 });
  }
}
