import { NextRequest, NextResponse } from "next/server";
import { getUserSession, hasValidSameOrigin } from "@/lib/auth-request";
import { touchWebPresence } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!hasValidSameOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  const session = await getUserSession(request);
  if (!session?.deviceId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    await touchWebPresence(session.uid, session.deviceId);
    return NextResponse.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[presence] failed to update the active web session:", error);
    return NextResponse.json(
      { error: "Online status is temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
