import { NextRequest, NextResponse } from "next/server";
import { deleteMediaById, fetchMedia, createNotification } from "@/lib/storage";
import { broadcastToUid } from "@/lib/realtime";
import { parseDevice, getClientIp } from "@/lib/device";

export const runtime = "nodejs";

const MEDIA_ID_RE = /^\d{7}$/;

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const uid = Number(req.nextUrl.searchParams.get("uid"));
  if (!Number.isInteger(uid) || uid <= 0) {
    return NextResponse.json({ ok: false, error: "invalid_uid" }, { status: 400 });
  }
  if (!MEDIA_ID_RE.test(params.id)) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  const meta = await fetchMedia(params.id).catch(() => null);

  const result = await deleteMediaById(params.id, uid).catch(() => ({ ok: false, reason: "error" }));
  if (!result.ok) {
    const status =
      result.reason === "forbidden"
        ? 403
        : result.reason === "db_error"
        ? 500
        : 404;
    return NextResponse.json({ ok: false, error: result.reason }, { status });
  }

  try {
    const ipRaw = getClientIp(req.headers);
    const ua = req.headers.get("user-agent") ?? "";
    const device = parseDevice(ua);
    const notif = await createNotification({
      uid,
      title: "Media dihapus",
      message: `Media "${meta?.filename ?? params.id}" (ID ${params.id}) telah dihapus dari server.`,
      ip: ipRaw === "unknown" ? null : ipRaw,
      location: null,
      device,
    });
    if (notif) broadcastToUid(uid, { type: "notification:new" });
  } catch {}

  broadcastToUid(uid, { type: "media:changed" });

  return NextResponse.json({ ok: true });
}