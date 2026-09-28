import { NextRequest, NextResponse } from "next/server";
import { getTelegramAvatarFileId, fetchTelegramFile } from "@/lib/telegram";

export const runtime = "nodejs";

const PLACEHOLDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="32" fill="#e5e7eb"/><path d="M32 16a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 24c-8 0-16 4-16 12v4h32v-4c0-8-8-12-16-12z" fill="#9ca3af"/></svg>`;

function placeholderResponse() {
  return new NextResponse(PLACEHOLDER_SVG, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=3600, immutable",
    },
  });
}

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
    return placeholderResponse();
  }

  const upstream = await fetchTelegramFile(fileId);
  if (!upstream || !upstream.body) {
    return placeholderResponse();
  }

  const headers = new Headers();
  const upstreamContentType = upstream.headers.get("Content-Type");
  headers.set(
    "Content-Type",
    upstreamContentType?.startsWith("image/")
      ? upstreamContentType
      : "image/jpeg",
  );
  headers.set("Cache-Control", "public, max-age=1800, immutable");

  return new NextResponse(upstream.body, { status: 200, headers });
}