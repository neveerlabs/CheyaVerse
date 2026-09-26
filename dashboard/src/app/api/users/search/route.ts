import { NextRequest, NextResponse } from "next/server";
import { getUserSession } from "@/lib/auth-request";
import { searchTelegramUsers } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await getUserSession(request);
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const query = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 80);
  if (!query) return NextResponse.json({ ok: true, users: [] });
  try {
    const users = await searchTelegramUsers(query, session.uid);
    return NextResponse.json({
      ok: true,
      users: users.map(({ uid, username, first_name, last_name, photo_url }) => ({
        uid,
        username,
        first_name,
        last_name,
        photo_url,
      })),
    });
  } catch (error) {
    console.error("[users/search] failed:", error);
    return NextResponse.json({ ok: false, error: "search_failed" }, { status: 500 });
  }
}
