import { NextRequest, NextResponse } from "next/server";
import { getUserSession } from "@/lib/auth-request";
import { countUnreadDirectMessages } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await getUserSession(request);
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  try {
    const unread = await countUnreadDirectMessages(session.uid);
    return NextResponse.json(
      { ok: true, unread },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[chats/unread] failed to count unread messages:", error);
    return NextResponse.json(
      { ok: false, error: "unread_count_unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "15" } },
    );
  }
}
