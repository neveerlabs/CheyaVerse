import { NextRequest, NextResponse } from "next/server";
import { getTelegramUser, upsertTelegramUser } from "@/lib/storage";
import { getTelegramAvatarFileId, fetchTelegramFile } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function placeholderResponse() {
  return new NextResponse(null, {
    status: 404,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
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

  let cachedFileId: string | null = null;
  try {
    cachedFileId = (await getTelegramUser(uid))?.photo_file_id ?? null;
  } catch (error) {
    console.error("[avatar] failed to load cached Telegram photo:", error);
  }

  const latestFileId = await getTelegramAvatarFileId(uid);
  let fileId = latestFileId ?? cachedFileId;
  if (latestFileId && latestFileId !== cachedFileId) {
    try {
      await upsertTelegramUser(uid, { photo_file_id: latestFileId });
    } catch (error) {
      console.warn("[avatar] failed to refresh cached Telegram photo ID:", error);
    }
  }

  let upstream = fileId ? await fetchTelegramFile(fileId) : null;
  if ((!upstream?.body) && cachedFileId && cachedFileId !== fileId) {
    upstream = await fetchTelegramFile(cachedFileId);
  }
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
  headers.set("Cache-Control", "private, no-store, max-age=0");
  headers.set("X-Content-Type-Options", "nosniff");

  return new NextResponse(upstream.body, { status: 200, headers });
}