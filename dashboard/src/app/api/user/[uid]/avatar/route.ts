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

  let cachedFileId: string | null = null;

  try {
    const user = await getTelegramUser(uid);
    cachedFileId = user?.photo_file_id ?? null;
  } catch (error) {
    console.error("[user-avatar] failed to load cached Telegram photo:", error);
  }

  const latestFileId = await getTelegramAvatarFileId(uid);
  let fileId = latestFileId ?? cachedFileId;
  if (latestFileId && latestFileId !== cachedFileId) {
    try {
      await upsertTelegramUser(uid, { photo_file_id: latestFileId });
    } catch (error) {
      console.warn("[user-avatar] failed to refresh cached Telegram photo ID:", error);
    }
  }

  if (!fileId) {
    return new NextResponse(null, { status: 404 });
  }

  let upstream = await fetchTelegramFile(fileId);
  if ((!upstream?.body) && cachedFileId && cachedFileId !== fileId) {
    upstream = await fetchTelegramFile(cachedFileId);
  }
  if (!upstream?.body) {
    return new NextResponse(null, { status: 404 });
  }

  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "image/jpeg",
      "Cache-Control": "private, no-store, max-age=0",
    },
  });
}
