import { NextRequest, NextResponse } from "next/server";
import { getUserSession } from "@/lib/auth-request";
import { getTelegramUserLastSeen, updateTelegramUserPresence } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unavailable() {
  return NextResponse.json(
    { ok: false, error: "presence_unavailable" },
    {
      status: 503,
      headers: { "Cache-Control": "no-store", "Retry-After": "5" },
    },
  );
}

export async function GET(request: NextRequest) {
  let session: Awaited<ReturnType<typeof getUserSession>>;
  try {
    session = await getUserSession(request);
  } catch (error) {
    console.error("[presence] session verification failed:", error);
    return unavailable();
  }
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const uid = Number(request.nextUrl.searchParams.get("uid"));
  if (!Number.isSafeInteger(uid) || uid <= 0) {
    return NextResponse.json({ ok: false, error: "invalid_uid" }, { status: 400 });
  }
  try {
    const lastSeen = await getTelegramUserLastSeen(uid);
    const online = lastSeen !== null && lastSeen > Math.floor(Date.now() / 1000) - 90;
    return NextResponse.json(
      { ok: true, online, lastSeen },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[presence] status lookup failed:", error);
    return unavailable();
  }
}

export async function POST(request: NextRequest) {
  let session: Awaited<ReturnType<typeof getUserSession>>;
  try {
    session = await getUserSession(request);
  } catch (error) {
    console.error("[presence] session verification failed:", error);
    return unavailable();
  }
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  try {
    await updateTelegramUserPresence(session.uid);
    return NextResponse.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[presence] heartbeat failed:", error);
    return unavailable();
  }
}
