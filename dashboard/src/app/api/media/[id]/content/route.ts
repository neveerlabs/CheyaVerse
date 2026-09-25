import { NextRequest, NextResponse } from "next/server";
import { fetchMedia } from "@/lib/storage";
import { fetchTelegramFile } from "@/lib/telegram";
import { getCachedMedia, setCachedMedia } from "@/lib/media-cache";

export const runtime = "nodejs";

const MEDIA_ID_RE = /^\d{7}$/;

async function ensureCached(
  id: string,
  storagePath: string,
  fallbackType: string,
) {
  const hit = getCachedMedia(id);
  if (hit) return hit;

  const upstream = await fetchTelegramFile(storagePath);
  if (!upstream || !upstream.body) return null;

  const buffer = Buffer.from(await upstream.arrayBuffer());
  const contentType =
    upstream.headers.get("Content-Type") ||
    fallbackType ||
    "application/octet-stream";

  setCachedMedia(id, {
    buffer,
    contentType,
    contentLength: buffer.length,
  });

  return getCachedMedia(id);
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!MEDIA_ID_RE.test(params.id)) {
    return new NextResponse("Invalid media link.", { status: 400 });
  }

  const meta = await fetchMedia(params.id).catch(() => null);
  if (!meta?.storage_path) {
    return new NextResponse("Media not found.", { status: 404 });
  }

  const cached = await ensureCached(
    params.id,
    meta.storage_path,
    meta.content_type || "",
  );
  if (!cached) {
    return new NextResponse("Media not available.", { status: 502 });
  }

  const totalLength = cached.contentLength;
  const rangeHeader = req.headers.get("range");

  const baseHeaders: Record<string, string> = {
    "Content-Type": cached.contentType,
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=86400, immutable",
  };

  if (rangeHeader) {
    const match = /bytes=(\d*)-(\d*)/.exec(rangeHeader);
    if (match) {
      let start = match[1] ? parseInt(match[1], 10) : 0;
      let end = match[2] ? parseInt(match[2], 10) : totalLength - 1;
      if (!isFinite(start) || start < 0) start = 0;
      if (!isFinite(end) || end >= totalLength) end = totalLength - 1;
      if (start > end) {
        return new NextResponse("Range Not Satisfiable.", {
          status: 416,
          headers: { "Content-Range": `bytes */${totalLength}` },
        });
      }
      const chunk = new Uint8Array(cached.buffer.subarray(start, end + 1));
      return new NextResponse(chunk, {
        status: 206,
        headers: {
          ...baseHeaders,
          "Content-Range": `bytes ${start}-${end}/${totalLength}`,
          "Content-Length": String(chunk.byteLength),
        },
      });
    }
  }

  const full = new Uint8Array(cached.buffer);
  return new NextResponse(full, {
    status: 200,
    headers: {
      ...baseHeaders,
      "Content-Length": String(totalLength),
    },
  });
}