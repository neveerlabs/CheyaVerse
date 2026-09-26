import { NextRequest, NextResponse } from "next/server";
import { deleteMediaById, fetchMedia, createNotification } from "@/lib/storage";
import { broadcastToUid } from "@/lib/realtime";
import { parseDevice, getClientIp } from "@/lib/device";
import { getTelegramChatInfo } from "@/lib/telegram";
import { sendPushToUid, buildSystemPush } from "@/lib/push";

export const runtime = "nodejs";

const MEDIA_ID_RE = /^\d{7}$/;

function stripHtml(input: string): string {
  return input
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

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

  const deletedFilename = meta?.filename ?? params.id;

  try {
    const ipRaw = getClientIp(req.headers);
    const ua = req.headers.get("user-agent") ?? "";
    const device = parseDevice(ua);

    const tgInfo = await getTelegramChatInfo(uid).catch(() => null);
    const fullName = [tgInfo?.first_name, tgInfo?.last_name]
      .filter(Boolean)
      .join(" ")
      .trim();
    const displayName = fullName || tgInfo?.username || "Pengguna";

    const now = new Date();
    const wib = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
    const formattedTime = `${wib.getFullYear()}-${String(wib.getMonth() + 1).padStart(2, "0")}-${String(wib.getDate()).padStart(2, "0")} ${String(wib.getHours()).padStart(2, "0")}:${String(wib.getMinutes()).padStart(2, "0")}:${String(wib.getSeconds()).padStart(2, "0")} WIB`;

    const message = `Halo, <b>${displayName}</b>\n\nTindakan penghapusan berkas media yang terhubung dengan hasil generate barcode Anda telah berhasil diproses oleh sistem.\n\n<b>Detail Aktivitas:</b>\n• <b>ID Barcode:</b> <code>${params.id}</code>\n• <b>Nama Berkas:</b> <code>${deletedFilename}</code>\n• <b>Status Server:</b> <code>Query OK, 1 row affected</code>\n• <b>Waktu Sesi:</b> <code>${formattedTime}</code>\n\nTautan unduhan dan data media terkait kini sudah tidak dapat diakses lagi oleh siapa pun. Terima kasih telah menjaga privasi data Anda.`;

    const notif = await createNotification({
      uid,
      title: "CheyaVerse Service Notifications",
      message,
      ip: ipRaw === "unknown" ? null : ipRaw,
      location: null,
      device,
    });
    if (notif) {
      broadcastToUid(uid, {
        type: "notification:new",
        title: "CheyaVerse Service Notifications",
        body: stripHtml(message).slice(0, 200),
      });
    }

    sendPushToUid(
      uid,
      buildSystemPush(uid, stripHtml(message), { notifId: notif?.id }),
    ).catch(() => {});
  } catch {}

  broadcastToUid(uid, { type: "media:changed" });

  return NextResponse.json({ ok: true });
}
