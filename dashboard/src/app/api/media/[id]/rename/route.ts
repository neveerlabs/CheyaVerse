import { NextRequest, NextResponse } from "next/server";
import { renameMediaById } from "@/lib/storage";

export const runtime = "nodejs";

const MEDIA_ID_RE = /^\d{7}$/;

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const uid = Number(req.nextUrl.searchParams.get("uid"));
  if (!Number.isInteger(uid) || uid <= 0) {
    return NextResponse.json({ ok: false, error: "invalid_uid" }, { status: 400 });
  }
  if (!MEDIA_ID_RE.test(params.id)) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const filename = String((payload as { filename?: unknown })?.filename ?? "").trim();
  if (!filename || filename.length > 200) {
    return NextResponse.json({ ok: false, error: "invalid_filename" }, { status: 400 });
  }

  const result = await renameMediaById(params.id, uid, filename).catch(() => ({ ok: false, reason: "error" }));
  if (!result.ok) {
    const status =
      result.reason === "forbidden"
        ? 403
        : result.reason === "db_error"
        ? 500
        : 404;
    return NextResponse.json({ ok: false, error: result.reason }, { status });
  }
  return NextResponse.json({ ok: true });
}