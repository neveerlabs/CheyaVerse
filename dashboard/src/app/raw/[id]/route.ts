import { NextRequest, NextResponse } from "next/server";
import { fetchMedia, createSignedUrl } from "@/lib/storage";

const MEDIA_ID_RE = /^\d{7}$/;

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!MEDIA_ID_RE.test(params.id)) {
    return new NextResponse("Not found.", { status: 404 });
  }

  const meta = await fetchMedia(params.id).catch(() => null);
  if (!meta?.storage_path) {
    return new NextResponse("Not found.", { status: 404 });
  }

  const signed = await createSignedUrl(meta.storage_path, 60);
  if (!signed) {
    return new NextResponse("Media gateway error.", { status: 502 });
  }

  const upstream = await fetch(signed);
  if (!upstream.ok || !upstream.body) {
    return new NextResponse("Media not available.", { status: upstream.status });
  }

  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": meta.content_type || "application/octet-stream",
      "Content-Disposition": "inline",
      "Cache-Control": "no-store",
    },
  });
}
