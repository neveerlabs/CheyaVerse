import { NextRequest, NextResponse } from "next/server";
import { fetchMedia } from "@/lib/storage";
import { fetchTelegramFile } from "@/lib/telegram";

export const runtime = "nodejs";

const MEDIA_ID_RE = /^\d{7}$/;

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!MEDIA_ID_RE.test(params.id)) {
    return new NextResponse("Invalid media link.", { status: 400 });
  }

  const meta = await fetchMedia(params.id).catch(() => null);
  if (!meta?.storage_path) {
    return new NextResponse("Media not found.", { status: 404 });
  }

  const upstream = await fetchTelegramFile(meta.storage_path);
  if (!upstream || !upstream.body) {
    return new NextResponse("Media not available.", { status: 502 });
  }

  const headers = new Headers();
  headers.set(
    "Content-Type",
    meta.content_type || upstream.headers.get("Content-Type") || "application/octet-stream",
  );
  const len = upstream.headers.get("Content-Length");
  if (len) headers.set("Content-Length", len);
  headers.set("Cache-Control", "public, max-age=3600, immutable");

  return new NextResponse(upstream.body, { status: 200, headers });
}
