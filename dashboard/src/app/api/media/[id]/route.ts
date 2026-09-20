import { NextRequest, NextResponse } from "next/server";
import { deleteMediaById } from "@/lib/storage";

export const runtime = "nodejs";

const MEDIA_ID_RE = /^\d{7}$/;

export async function DELETE(
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

  const result = await deleteMediaById(params.id, uid).catch(() => ({ ok: false, reason: "error" }));
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