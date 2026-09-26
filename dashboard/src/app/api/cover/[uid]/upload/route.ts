import { NextRequest, NextResponse } from "next/server";
import { getCover, upsertCover } from "@/lib/storage";
import { uploadPhotoToStorage, deleteTelegramMessage } from "@/lib/telegram";
import { broadcastToUid } from "@/lib/realtime";
import { getUserSession } from "@/lib/auth-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(
  req: NextRequest,
  { params }: { params: { uid: string } },
) {
  const uid = Number(params.uid);
  if (!Number.isInteger(uid) || uid <= 0) {
    return NextResponse.json({ ok: false, error: "invalid_uid" }, { status: 400 });
  }
  if (!(await getUserSession(req, uid))) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ ok: false, error: "invalid_form" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof Blob)) {
    return NextResponse.json({ ok: false, error: "missing_file" }, { status: 400 });
  }

  const contentType = file.type || "image/jpeg";
  if (!contentType.startsWith("image/")) {
    return NextResponse.json({ ok: false, error: "only_images" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: "too_large" }, { status: 413 });
  }

  const filename =
    (form.get("filename") as string | null)?.slice(0, 120) ||
    `cover-${uid}-${Date.now()}.jpg`;

  const uploaded = await uploadPhotoToStorage(file, filename);
  if (!uploaded) {
    return NextResponse.json({ ok: false, error: "upload_failed" }, { status: 502 });
  }

  const prev = await getCover(uid);
  if (
    prev?.storage_message_id &&
    prev.storage_message_id !== uploaded.message_id
  ) {
    await deleteTelegramMessage(prev.storage_message_id).catch(() => {});
  }

  const res = await upsertCover(uid, {
    type: "upload",
    storage_path: uploaded.file_id,
    storage_message_id: uploaded.message_id,
    content_type: contentType,
    color1: prev?.color1 ?? null,
    color2: prev?.color2 ?? null,
    icon: prev?.icon ?? null,
    bg_size: 100,
    bg_x: 50,
    bg_y: 50,
  });

  if (!res.ok) {
    await deleteTelegramMessage(uploaded.message_id).catch(() => {});
    return NextResponse.json({ ok: false, error: res.reason }, { status: 500 });
  }

  const cover = await getCover(uid);
  broadcastToUid(uid, { type: "cover:changed" });
  return NextResponse.json({ ok: true, cover });
}