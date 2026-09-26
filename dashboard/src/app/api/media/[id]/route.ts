import { NextRequest, NextResponse } from "next/server";
import {
  deleteMediaById,
  fetchMedia,
  createNotification,
  getTelegramUser,
} from "@/lib/storage";
import { broadcastToUid } from "@/lib/realtime";
import { parseDevice, getClientIp } from "@/lib/device";
import { sendPushToUid, buildSystemPush } from "@/lib/push";
import { getUserSession } from "@/lib/auth-request";

export const runtime = "nodejs";

const MEDIA_ID_RE = /^\d{7}$/;

function stripHtml(input: string): string {
  return input
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getUserSession(req);
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const uid = Number(req.nextUrl.searchParams.get("uid"));
  if (!Number.isInteger(uid) || uid !== session.uid) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
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

  const ipRaw = getClientIp(req.headers);
  const ua = req.headers.get("user-agent") ?? "";
  const device = parseDevice(ua);
  const account = await getTelegramUser(uid);
  const fullName = [account?.first_name, account?.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  const displayName = escapeHtml(
    fullName || (account?.username ? `@${account.username}` : "Pengguna"),
  );
  const safeFilename = escapeHtml(deletedFilename);

  const now = new Date();
  const wib = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
  const formattedTime = `${wib.getFullYear()}-${String(wib.getMonth() + 1).padStart(2, "0")}-${String(wib.getDate()).padStart(2, "0")} ${String(wib.getHours()).padStart(2, "0")}:${String(wib.getMinutes()).padStart(2, "0")}:${String(wib.getSeconds()).padStart(2, "0")} WIB`;
  const message = `Halo, <b>${displayName}</b>\n\nTindakan penghapusan berkas media hasil generate barcode Anda telah berhasil diproses oleh sistem.\n\n<b>Detail Aktivitas:</b>\n• <b>ID Barcode:</b> <code>${params.id}</code>\n• <b>Nama Berkas:</b> <code>${safeFilename}</code>\n• <b>Waktu:</b> <code>${formattedTime}</code>\n\nTautan unduhan dan data media terkait kini sudah tidak dapat diakses lagi.`;

  const notif = await createNotification({
    uid,
    title: "CheyaVerse · Admin",
    message,
    ip: ipRaw === "unknown" ? null : ipRaw,
    location: null,
    device,
  });
  if (!notif) {
    console.error(`[media/delete] Media ${params.id} was deleted but its web notice could not be stored.`);
  } else {
    broadcastToUid(uid, {
      type: "notification:new",
      title: "CheyaVerse · Admin",
      body: stripHtml(message).slice(0, 200),
    });
    void sendPushToUid(
      uid,
      buildSystemPush(uid, stripHtml(message), { notifId: notif.id }),
    ).catch((error) => console.error("[media/delete] push delivery failed:", error));
  }

  broadcastToUid(uid, { type: "media:changed" });

  return NextResponse.json({ ok: true });
}
