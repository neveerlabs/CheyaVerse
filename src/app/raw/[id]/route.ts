import { NextRequest, NextResponse } from "next/server";
import { fetchMedia, createSignedUrl } from "@/lib/storage";
import { config } from "@/lib/config";

const MEDIA_ID_RE = /^\d{7}$/;

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!MEDIA_ID_RE.test(params.id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const meta = await fetchMedia(params.id).catch(() => null);
  if (!meta?.storage_path) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const signed = await createSignedUrl(meta.storage_path, config.signedUrlTtl);
  if (!signed) {
    return NextResponse.json({ error: "Gateway error" }, { status: 502 });
  }
  return NextResponse.redirect(signed, 302);
}