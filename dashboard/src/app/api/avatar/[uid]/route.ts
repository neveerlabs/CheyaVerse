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

  let fileId: string | null = null;
  try {
    fileId = (await getTelegramUser(uid))?.photo_file_id ?? null;
  } catch (error) {
    console.error("[avatar] failed to load cached Telegram photo:", error);
  }

  if (!fileId) fileId = await getTelegramAvatarFileId(uid);

  let upstream = fileId ? await fetchTelegramFile(fileId) : null;
  if (!upstream?.body) {
    const refreshedFileId = await getTelegramAvatarFileId(uid);
    if (refreshedFileId && refreshedFileId !== fileId) {
      fileId = refreshedFileId;
      await upsertTelegramUser(uid, { photo_file_id: fileId });
      upstream = await fetchTelegramFile(fileId);
    }
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
  headers.set("Cache-Control", "private, max-age=300, stale-while-revalidate=3600");
  headers.set("X-Content-Type-Options", "nosniff");

  return new NextResponse(upstream.body, { status: 200, headers });
}