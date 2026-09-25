import { NextRequest, NextResponse } from "next/server";
import { fetchMedia } from "@/lib/storage";
import { fetchTelegramFile } from "@/lib/telegram";

export const runtime = "nodejs";

const MEDIA_ID_RE = /^\d{7}$/;

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const uid = Number(req.nextUrl.searchParams.get("uid"));
  if (!Number.isInteger(uid) || uid <= 0) {
    return new NextResponse("Invalid owner.", { status: 400 });
  }
  if (!MEDIA_ID_RE.test(params.id)) {
    return new NextResponse("Invalid media link.", { status: 400 });
  }

  const meta = await fetchMedia(params.id).catch(() => null);
  if (!meta?.storage_path) {
    return new NextResponse("Media not found.", { status: 404 });
  }
  if (meta.owner_id !== uid) {
    return new NextResponse("Forbidden.", { status: 403 });
  }

  const upstream = await fetchTelegramFile(meta.storage_path);
  if (!upstream || !upstream.body) {
    return new NextResponse("Media not available.", { status: 502 });
  }

  const safeName =
    (meta.filename || params.id).replace(/["\\\r\n]/g, "").slice(0, 200) || "file";

  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": meta.content_type || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${safeName}"`,
      "Cache-Control": "no-store",
    },
  });
}