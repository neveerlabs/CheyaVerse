import { NextRequest, NextResponse } from "next/server";
import { getCover, upsertCover, deleteCover } from "@/lib/storage";
import { getTelegramAvatarFileId, deleteTelegramMessage } from "@/lib/telegram";
import { broadcastToUid } from "@/lib/realtime";
import { getUserSession } from "@/lib/auth-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEX_RE = /^#[0-9a-f]{6}$/i;
const ICON_RE = /^[a-z0-9]{1,32}$/;

function parseUid(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

async function cleanupPrevCover(
  prev: Awaited<ReturnType<typeof getCover>>,
) {
  if (!prev) return;
  if (prev.storage_message_id) {
    await deleteTelegramMessage(prev.storage_message_id).catch(() => {});
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: { uid: string } },
) {
  const uid = parseUid(params.uid);
  if (!uid) return NextResponse.json({ ok: false, error: "invalid_uid" }, { status: 400 });
  if (!(await getUserSession(req, uid))) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const cover = await getCover(uid);
  return NextResponse.json({ ok: true, cover });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { uid: string } },
) {
  const uid = parseUid(params.uid);
  if (!uid) return NextResponse.json({ ok: false, error: "invalid_uid" }, { status: 400 });
  if (!(await getUserSession(req, uid))) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const type = String(body?.type ?? "color");

  if (type === "crop") {
    const bg_size = num(body?.bg_size);
    const bg_x = num(body?.bg_x);
    const bg_y = num(body?.bg_y);
    const clamped = {
      bg_size: bg_size === undefined ? undefined : Math.max(100, Math.min(400, bg_size)),
      bg_x: bg_x === undefined ? undefined : Math.max(0, Math.min(100, bg_x)),
      bg_y: bg_y === undefined ? undefined : Math.max(0, Math.min(100, bg_y)),
    };
    const res = await upsertCover(uid, clamped);
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: res.reason }, { status: 500 });
    }
    broadcastToUid(uid, { type: "cover:changed" });
    return NextResponse.json({ ok: true, cover: await getCover(uid) });
  }

  if (type === "telegram") {
    const fileId = await getTelegramAvatarFileId(uid);
    if (!fileId) {
      return NextResponse.json(
        { ok: false, error: "no_telegram_photo" },
        { status: 404 },
      );
    }
    const prev = await getCover(uid);
    await cleanupPrevCover(prev);
    const res = await upsertCover(uid, {
      type: "telegram",
      storage_path: fileId,
      storage_message_id: null,
      content_type: "image/jpeg",
      color1: prev?.color1 ?? null,
      color2: prev?.color2 ?? null,
      icon: prev?.icon ?? null,
      bg_size: prev?.bg_size ?? 100,
      bg_x: prev?.bg_x ?? 50,
      bg_y: prev?.bg_y ?? 50,
    });
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: res.reason }, { status: 500 });
    }
    broadcastToUid(uid, { type: "cover:changed" });
    return NextResponse.json({ ok: true, cover: await getCover(uid) });
  }

  if (type !== "color") {
    return NextResponse.json({ ok: false, error: "invalid_type" }, { status: 400 });
  }

  const color1 = typeof body?.color1 === "string" ? body.color1 : null;
  const color2 = typeof body?.color2 === "string" ? body.color2 : null;
  const icon = typeof body?.icon === "string" ? body.icon : null;

  if (color1 && !HEX_RE.test(color1)) {
    return NextResponse.json({ ok: false, error: "invalid_color1" }, { status: 400 });
  }
  if (color2 && !HEX_RE.test(color2)) {
    return NextResponse.json({ ok: false, error: "invalid_color2" }, { status: 400 });
  }
  if (icon && !ICON_RE.test(icon)) {
    return NextResponse.json({ ok: false, error: "invalid_icon" }, { status: 400 });
  }

  const prev = await getCover(uid);
  await cleanupPrevCover(prev);

  const res = await upsertCover(uid, {
    type: "color",
    color1: color1 ?? prev?.color1 ?? "#3b82f6",
    color2: color2 ?? prev?.color2 ?? "#93c5fd",
    icon: icon !== null ? icon : prev?.icon ?? null,
    storage_path: null,
    storage_message_id: null,
    content_type: null,
  });

  if (!res.ok) {
    return NextResponse.json({ ok: false, error: res.reason }, { status: 500 });
  }
  broadcastToUid(uid, { type: "cover:changed" });
  return NextResponse.json({ ok: true, cover: await getCover(uid) });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { uid: string } },
) {
  const uid = parseUid(params.uid);
  if (!uid) return NextResponse.json({ ok: false, error: "invalid_uid" }, { status: 400 });
  if (!(await getUserSession(req, uid))) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const res = await deleteCover(uid);
  if (!res.ok) {
    return NextResponse.json({ ok: false, error: res.reason }, { status: 500 });
  }
  broadcastToUid(uid, { type: "cover:changed" });
  return NextResponse.json({ ok: true });
}