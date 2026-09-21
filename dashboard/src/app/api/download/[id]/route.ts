import { NextRequest, NextResponse } from "next/server";
import { fetchMedia } from "@/lib/storage";
import { fetchTelegramFile } from "@/lib/telegram";
import { verifyRecaptcha } from "@/lib/recaptcha";

const MEDIA_ID_RE = /^\d{7}$/;

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!MEDIA_ID_RE.test(params.id)) {
    return new NextResponse("Invalid media link.", { status: 400 });
  }

  const token = req.nextUrl.searchParams.get("token") ?? "";
  const ok = await verifyRecaptcha(token);
  if (!ok) {
    return new NextResponse("Captcha verification required.", { status: 403 });
  }

  const meta = await fetchMedia(params.id).catch(() => null);
  if (!meta?.storage_path) {
    return new NextResponse("Media not found.", { status: 404 });
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
