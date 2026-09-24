import { NextRequest, NextResponse } from "next/server";
import { addFingerprintToBlacklist } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const uid = Number(body?.uid);
  const fp = String(body?.fp ?? "").trim();

  if (!Number.isInteger(uid) || uid <= 0) {
    return NextResponse.json({ ok: false, error: "invalid_uid" }, { status: 400 });
  }
  if (!fp || fp.length > 128) {
    return NextResponse.json({ ok: false, error: "invalid_fp" }, { status: 400 });
  }

  await addFingerprintToBlacklist(uid, fp);

  return NextResponse.json({ ok: true });
}
