import { NextRequest, NextResponse } from "next/server";
import { getCover } from "@/lib/storage";
import { fetchTelegramFile } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  _req: NextRequest,
  { params }: { params: { uid: string } },
) {
  const uid = Number(params.uid);
  if (!Number.isInteger(uid) || uid <= 0) {
    return new NextResponse("Invalid uid", {
      status: 400,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const cover = await getCover(uid);
  if (!cover || (cover.type !== "upload" && cover.type !== "telegram")) {
    return new NextResponse("No cover image", {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }
  if (!cover.storage_path) {
    return new NextResponse("No cover image", {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const upstream = await fetchTelegramFile(cover.storage_path);
  if (!upstream || !upstream.body) {
    return new NextResponse("Cover unavailable", {
      status: 502,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const headers = new Headers();
  headers.set(
    "Content-Type",
    cover.content_type || upstream.headers.get("Content-Type") || "image/jpeg",
  );
  headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  headers.set("Pragma", "no-cache");
  headers.set("Expires", "0");

  return new NextResponse(upstream.body, { status: 200, headers });
}