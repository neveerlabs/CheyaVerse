import { NextRequest, NextResponse } from "next/server";
import { fetchMedia } from "@/lib/storage";
import { getCachedMedia } from "@/lib/media-cache";
import type { MediaMeta } from "@/lib/storage";
import { fetchUserMediaObject } from "@/lib/supabase-storage";

export const runtime = "nodejs";

const MEDIA_ID_RE = /^\d{7}$/;
const MAX_CHUNK = 4 * 1024 * 1024;

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!MEDIA_ID_RE.test(params.id)) {
    return new NextResponse("Invalid media link.", { status: 400 });
  }

  let meta: MediaMeta | null;
  try {
    meta = await fetchMedia(params.id);
  } catch (error) {
    console.error(`[media/content] failed to load metadata for ${params.id}:`, error);
    return new NextResponse("Media data is temporarily unavailable.", {
      status: 503,
      headers: { "Cache-Control": "no-store", "Retry-After": "5" },
    });
  }
  if (!meta?.storage_path) {
    return new NextResponse("Media not found.", { status: 404 });
  }

  const rangeHeader = req.headers.get("range");
  const baseHeaders: Record<string, string> = {
    "Content-Type": meta.content_type || "application/octet-stream",
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=86400, immutable",
    "X-Content-Type-Options": "nosniff",
  };

  const cached = getCachedMedia(params.id);
  if (cached) {
    const totalLength = cached.contentLength;
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
        if (end - start + 1 > MAX_CHUNK) {
          end = start + MAX_CHUNK - 1;
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

  let upstream: Response | null;
  try {
    upstream = await fetchUserMediaObject(
      meta.owner_id,
      meta.storage_path,
      rangeHeader ? { headers: { Range: rangeHeader } } : undefined,
    );
  } catch (error) {
    console.error(`[media/content] failed to open Supabase media ${params.id}:`, error);
    return new NextResponse("Media is temporarily unavailable.", {
      status: 503,
      headers: { "Cache-Control": "no-store", "Retry-After": "5" },
    });
  }
  if (!upstream?.ok || !upstream.body) {
    return new NextResponse("Media is temporarily unavailable.", {
      status: 503,
      headers: { "Cache-Control": "no-store", "Retry-After": "5" },
    });
  }

  const contentType =
    upstream.headers.get("Content-Type") ||
    meta.content_type ||
    "application/octet-stream";
  const contentLength = upstream.headers.get("Content-Length");
  const headers = new Headers(baseHeaders);
  headers.set("Content-Type", contentType);
  if (contentLength) headers.set("Content-Length", contentLength);
  const contentRange = upstream.headers.get("Content-Range");
  if (contentRange) headers.set("Content-Range", contentRange);

  if (rangeHeader && upstream.status === 200 && contentLength) {
    const bytes = Buffer.from(await upstream.arrayBuffer());
    const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
    if (!match || (!match[1] && !match[2])) {
      return new NextResponse("Range Not Satisfiable.", {
        status: 416,
        headers: { "Content-Range": `bytes */${bytes.length}` },
      });
    }
    const requestedStart = match[1] ? Number(match[1]) : 0;
    const requestedEnd = match[2] ? Number(match[2]) : bytes.length - 1;
    if (
      !Number.isSafeInteger(requestedStart) ||
      !Number.isSafeInteger(requestedEnd) ||
      requestedStart < 0 ||
      requestedStart > requestedEnd ||
      requestedStart >= bytes.length
    ) {
      return new NextResponse("Range Not Satisfiable.", {
        status: 416,
        headers: { "Content-Range": `bytes */${bytes.length}` },
      });
    }
    const end = Math.min(requestedEnd, requestedStart + MAX_CHUNK - 1, bytes.length - 1);
    const chunk = new Uint8Array(bytes.subarray(requestedStart, end + 1));
    return new NextResponse(chunk, {
      status: 206,
      headers: {
        ...Object.fromEntries(headers.entries()),
        "Content-Range": `bytes ${requestedStart}-${end}/${bytes.length}`,
        "Content-Length": String(chunk.byteLength),
      },
    });
  }

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers,
  });
}
