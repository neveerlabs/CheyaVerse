import { createHmac } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";
import { getUserSession } from "@/lib/auth-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function encodeBase64Url(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function createRealtimeToken(uid: number): string {
  const secret = config.supabase.jwtSecret;
  if (!secret) {
    throw new Error("Supabase JWT signing secret is not configured.");
  }

  const issuedAt = Math.floor(Date.now() / 1000);
  const header = encodeBase64Url({ alg: "HS256", typ: "JWT" });
  const payload = encodeBase64Url({
    aud: "authenticated",
    exp: issuedAt + 60 * 60,
    iat: issuedAt,
    iss: "supabase",
    role: "authenticated",
    sub: String(uid),
    telegram_uid: String(uid),
  });
  const input = `${header}.${payload}`;
  const signature = createHmac("sha256", secret)
    .update(input)
    .digest("base64url");
  return `${input}.${signature}`;
}

export async function GET(request: NextRequest) {
  const rawUid = request.nextUrl.searchParams.get("uid");
  const uid = rawUid ? Number(rawUid) : NaN;
  if (!Number.isSafeInteger(uid) || uid <= 0) {
    return NextResponse.json({ error: "Invalid account." }, { status: 400 });
  }

  try {
    const session = await getUserSession(request, uid);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    return NextResponse.json(
      { token: createRealtimeToken(uid) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[realtime/token] could not issue a Supabase token:", error);
    return NextResponse.json(
      { error: "Realtime authorization is temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
