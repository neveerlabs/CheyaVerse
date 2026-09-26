import { createHash, createHmac, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { hasValidSameOrigin } from "@/lib/auth-request";
import { config } from "@/lib/config";
import { createTelegramLoginChallenge } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CHALLENGE_TTL_SECONDS = 5 * 60;

export async function POST(request: NextRequest) {
  if (!hasValidSameOrigin(request)) {
    return NextResponse.json({ error: "invalid_origin" }, { status: 403 });
  }
  if (!config.botUsername || !/^[A-Za-z0-9_]{5,32}$/.test(config.botUsername)) {
    console.error("[auth/challenge] BOT_USERNAME is missing or invalid");
    return NextResponse.json({ error: "bot_not_configured" }, { status: 503 });
  }
  if (!config.telegram.botToken) {
    console.error("[auth/challenge] TELEGRAM_BOT_TOKEN is missing");
    return NextResponse.json({ error: "bot_not_configured" }, { status: 503 });
  }

  const challenge = randomBytes(32).toString("base64url");
  const challengeHash = createHash("sha256").update(challenge).digest("hex");
  const requesterAddress =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim();
  const requesterHash = requesterAddress
    ? createHmac("sha256", config.telegram.botToken)
        .update(requesterAddress)
        .digest("hex")
    : null;
  const expiresAt = Math.floor(Date.now() / 1000) + CHALLENGE_TTL_SECONDS;

  try {
    const created = await createTelegramLoginChallenge(
      challengeHash,
      expiresAt,
      requesterHash,
    );
    if (!created) {
      return NextResponse.json(
        { error: "rate_limited" },
        { status: 429, headers: { "Cache-Control": "no-store" } },
      );
    }
  } catch (error) {
    console.error("[auth/challenge] failed to create challenge:", error);
    return NextResponse.json({ error: "challenge_creation_failed" }, { status: 500 });
  }

  return NextResponse.json(
    {
      challenge,
      botUrl: `https://t.me/${config.botUsername}?start=auth_${challenge}`,
      expiresIn: CHALLENGE_TTL_SECONDS,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
