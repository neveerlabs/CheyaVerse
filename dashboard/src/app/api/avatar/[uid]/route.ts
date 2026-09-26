import { NextRequest, NextResponse } from "next/server";
import { getTelegramAvatarFileId, fetchTelegramFile } from "@/lib/telegram";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: { uid: string } },
) {
  const uid = Number(params.uid);
  if (!Number.isInteger(uid) || uid <= 0) {
    return new NextResponse("Invalid uid", { status: 400 });
  }

  const fileId = await getTelegramAvatarFileId(uid);
  if (!fileId) {
    return new NextResponse("No avatar", { status: 404 });
  }

  const upstream = await fetchTelegramFile(fileId);
  if (!upstream || !upstream.body) {
    return new NextResponse("Avatar unavailable", { status: 502 });
  }

  const headers = new Headers();
  headers.set(
    "Content-Type",
    upstream.headers.get("Content-Type") ?? "image/jpeg",
  );
  headers.set("Cache-Control", "public, max-age=1800, immutable");

  return new NextResponse(upstream.body, { status: 200, headers });
}