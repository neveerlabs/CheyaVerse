import { get } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { getUserSession } from "@/lib/auth-request";
import { getLibraryNode } from "@/lib/library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: { uid: string; id: string } },
) {
  const uid = Number(params.uid);
  if (!Number.isSafeInteger(uid) || uid <= 0) {
    return NextResponse.json({ error: "Invalid account." }, { status: 400 });
  }
  if (!(await getUserSession(request, uid))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const node = await getLibraryNode(uid, params.id);
  if (!node || node.kind !== "media") {
    return NextResponse.json({ error: "Media not found." }, { status: 404 });
  }
  const safeType = node.content_type ?? "application/octet-stream";
  if (!safeType.startsWith("image/") && !safeType.startsWith("video/")) {
    return NextResponse.json({ error: "Preview is not available for this file." }, { status: 415 });
  }

  const range = request.headers.get("range");
  try {
    if (node.storage_url) {
      const blob = await get(node.storage_url, {
        access: "private",
        ...(range ? { headers: { Range: range } } : {}),
      });
      if (!blob || blob.statusCode !== 200) {
        return NextResponse.json({ error: "Media is temporarily unavailable." }, { status: 502 });
      }
      const contentRange = blob.headers.get("content-range");
      const headers = new Headers({
        "Content-Type": safeType,
        "Cache-Control": "private, max-age=3600",
        "Accept-Ranges": "bytes",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": "inline",
      });
      const contentLength = blob.headers.get("content-length");
      if (contentLength) headers.set("Content-Length", contentLength);
      if (contentRange) headers.set("Content-Range", contentRange);
      return new NextResponse(blob.stream, {
        status: contentRange ? 206 : 200,
        headers,
      });
    }

    if (node.content) {
      const bytes = Buffer.from(node.content, "base64");
      const partial = parseByteRange(range, bytes.length);
      if (range && !partial) {
        return new NextResponse(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${bytes.length}` },
        });
      }
      const start = partial?.start ?? 0;
      const end = partial?.end ?? bytes.length - 1;
      const content = bytes.subarray(start, end + 1);
      return new NextResponse(content, {
        status: partial ? 206 : 200,
        headers: {
          "Content-Type": safeType,
          "Content-Length": String(content.length),
          ...(partial ? { "Content-Range": `bytes ${start}-${end}/${bytes.length}` } : {}),
          "Accept-Ranges": "bytes",
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
          "Content-Disposition": "inline",
        },
      });
    }
    return NextResponse.json({ error: "Media is not available." }, { status: 404 });
  } catch (error) {
    console.error("[library/content] Media preview failed:", error);
    return NextResponse.json({ error: "Media is temporarily unavailable." }, { status: 502 });
  }
}

function parseByteRange(
  range: string | null,
  size: number,
): { start: number; end: number } | null {
  if (!range) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match || (!match[1] && !match[2])) return null;
  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null;
    return {
      start: Math.max(0, size - suffixLength),
      end: size - 1,
    };
  }
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : size - 1;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    end < start ||
    start >= size
  ) {
    return null;
  }
  return { start, end: Math.min(end, size - 1) };
}
