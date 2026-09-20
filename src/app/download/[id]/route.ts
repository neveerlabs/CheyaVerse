import { NextRequest, NextResponse } from "next/server";
import { fetchMedia, createSignedUrl } from "@/lib/storage";
import { config } from "@/lib/config";
import { consumeVerified } from "@/lib/captcha";
import { isRateLimited, clientIp } from "@/lib/rate-limit";

const MEDIA_ID_RE = /^\d{7}$/;

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ip = clientIp(req);
  if (isRateLimited(ip)) {
    return new NextResponse("Too many requests", {
      status: 429,
      headers: { "Retry-After": String(config.rateLimitWindowSec) },
    });
  }
  if (!MEDIA_ID_RE.test(params.id)) {
    return new NextResponse("Invalid media link.", { status: 400 });
  }
  const nonce = req.nextUrl.searchParams.get("nonce") ?? "";
  if (!nonce || !consumeVerified(nonce)) {
    return new NextResponse("Captcha verification required.", { status: 403 });
  }
  const meta = await fetchMedia(params.id).catch(() => null);
  if (!meta?.storage_path) {
    return new NextResponse("Media not found.", { status: 404 });
  }
  const signed = await createSignedUrl(meta.storage_path, config.signedUrlTtl);
  if (!signed) {
    return new NextResponse("Media gateway error.", { status: 502 });
  }

  const upstream = await fetch(signed);
  if (!upstream.ok || !upstream.body) {
    return new NextResponse("Media not available.", { status: upstream.status });
  }

  const cl = upstream.headers.get("content-length");
  if (cl && Number(cl) > config.maxProxyBytes) {
    return new NextResponse("Media too large.", { status: 413 });
  }

  const safeName = (meta.filename || params.id)
    .replace(/["\\\r\n]/g, "")
    .slice(0, 200) || "file";

  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      "Content-Type":
        upstream.headers.get("content-type") ||
        meta.content_type ||
        "application/octet-stream",
      "Content-Disposition": `attachment; filename="${safeName}"`,
      "Cache-Control": "no-store",
    },
  });
}