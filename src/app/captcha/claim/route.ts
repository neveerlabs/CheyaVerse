import { NextRequest, NextResponse } from "next/server";
import { claimNonce } from "@/lib/captcha";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let payload: any;
  try { payload = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 }); }

  const nonce = String(payload?.nonce ?? "").trim();
  const s = payload?.signals ?? {};
  if (!nonce) {
    return NextResponse.json({ ok: false, error: "missing_nonce" }, { status: 400 });
  }

  const result = claimNonce(nonce, {
    moves: Number(s.moves ?? 0),
    keys: Number(s.keys ?? 0),
    touches: Number(s.touches ?? 0),
    elapsed: Number(s.elapsed ?? 0),
  });

  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}