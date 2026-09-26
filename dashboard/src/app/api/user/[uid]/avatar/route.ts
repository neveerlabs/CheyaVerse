import { NextRequest, NextResponse } from "next/server";
import { getTelegramUser, upsertTelegramUser } from "@/lib/storage";
import { getTelegramAvatarFileId, fetchTelegramFile } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { uid: string } },
) {
  const uid = Number(params.uid);
  if (!Number.isInteger(uid) || uid <= 0) {
    return new NextResponse(null, { status: 404 });
  }

  let fileId: string | null = null;

  try {
    const user = await getTelegramUser(uid);
    fileId = user?.photo_file_id ?? null;
  } catch {}

  if (!fileId) {
    try {
      fileId = await getTelegramAvatarFileId(uid);
      if (fileId) {
        await upsertTelegramUser(uid, { photo_file_id: fileId }).catch(() => {});
      }
    } catch {}
  }

  if (!fileId) {
    return new NextResponse(null, { status: 404 });
  }

  const upstream = await fetchTelegramFile(fileId);
  if (!upstream || !upstream.body) {
    return new NextResponse(null, { status: 404 });
  }

  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "image/jpeg",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
