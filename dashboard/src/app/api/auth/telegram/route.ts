import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json(
    { error: "telegram_widget_login_disabled" },
    { status: 410, headers: { "Cache-Control": "no-store" } },
  );
}
