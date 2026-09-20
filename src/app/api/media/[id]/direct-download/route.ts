import { NextRequest, NextResponse } from "next/server";
import { fetchMedia, createSignedUrl } from "@/lib/storage";

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

  const signed = await createSignedUrl(meta.storage_path, 60);
  if (!signed) {
    return new NextResponse("Media gateway error.", { status: 502 });
  }

  const upstream = await fetch(signed);
  if (!upstream.ok || !upstream.body) {
    return new NextResponse("Media not available.", { status: upstream.status });
  }

  const safeName = (meta.filename || params.id).replace(/["\\\r\n]/g, "").slice(0, 200) || "file";

  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": meta.content_type || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${safeName}"`,
      "Cache-Control": "no-store",
    },
  });
}