import { NextRequest, NextResponse } from "next/server";
import { deletePushSubscription } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint.trim() : "";
  if (!endpoint) {
    return NextResponse.json({ ok: false, error: "missing_endpoint" }, { status: 400 });
  }
  await deletePushSubscription(endpoint);
  return NextResponse.json({ ok: true });
}
