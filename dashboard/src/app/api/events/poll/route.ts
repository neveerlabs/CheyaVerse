import { NextRequest, NextResponse } from "next/server";
import { getTurso } from "@/lib/turso";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Snapshot = {
  notifCount: number;
  unread: number;
  msgCount: number;
  mediaCount: number;
  notifLastAt: string | null;
  mediaLastId: string | null;
  msgLast: {
    id: string;
    uid: number;
    sender: "user" | "bot";
    sender_role: string;
    title: string | null;
    content: string;
    created_at: string;
    delivered_at: string | null;
    read_at: string | null;
  } | null;
};

function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function s(v: unknown): string {
  return v == null ? "" : String(v);
}

export async function GET(req: NextRequest) {
  const uidRaw = req.nextUrl.searchParams.get("uid");
  const uidNum = uidRaw ? Number(uidRaw) : NaN;
  const uid = Number.isInteger(uidNum) && uidNum > 0 ? uidNum : null;

  if (uid == null) {
    return NextResponse.json(
      { ok: false, error: "invalid_uid" },
      { status: 200 },
    );
  }

  try {
    const client = getTurso();

    const [countsRes, lastMsgRes] = await Promise.all([
      client.execute({
        sql: `SELECT
                (SELECT COUNT(*) FROM notifications WHERE uid = ?) AS notif_count,
                (SELECT COUNT(*) FROM notifications WHERE uid = ? AND read = 0) AS unread,
                (SELECT COUNT(*) FROM messages WHERE uid = ?) AS msg_count,
                (SELECT COUNT(*) FROM media WHERE owner_id = ?) AS media_count,
                (SELECT created_at FROM notifications WHERE uid = ? ORDER BY created_at DESC LIMIT 1) AS notif_last_at,
                (SELECT id FROM media WHERE owner_id = ? ORDER BY expires_at DESC LIMIT 1) AS media_last_id`,
        args: [uid, uid, uid, uid, uid, uid],
      }),
      client.execute({
        sql: `SELECT id, uid, sender, sender_role, title, content, created_at, delivered_at, read_at
              FROM messages WHERE uid = ? ORDER BY created_at DESC LIMIT 1`,
        args: [uid],
      }),
    ]);

    const row = (countsRes.rows[0] ?? {}) as Record<string, unknown>;

    const snapshot: Snapshot = {
      notifCount: n(row.notif_count),
      unread: n(row.unread),
      msgCount: n(row.msg_count),
      mediaCount: n(row.media_count),
      notifLastAt: s(row.notif_last_at) || null,
      mediaLastId: s(row.media_last_id) || null,
      msgLast: null,
    };

    if (lastMsgRes.rows.length > 0) {
      const m = lastMsgRes.rows[0] as Record<string, unknown>;
      snapshot.msgLast = {
        id: s(m.id),
        uid: n(m.uid),
        sender: s(m.sender) === "bot" ? "bot" : "user",
        sender_role: s(m.sender_role) || "user",
        title: m.title == null ? null : s(m.title),
        content: s(m.content),
        created_at: s(m.created_at),
        delivered_at: m.delivered_at == null ? null : s(m.delivered_at),
        read_at: m.read_at == null ? null : s(m.read_at),
      };
    }

    return NextResponse.json({
      ok: true,
      serverTime: new Date().toISOString(),
      snapshot,
    });
  } catch (err) {
    console.error("[events/poll] error:", err);
    return NextResponse.json(
      { ok: false, error: "server_error" },
      { status: 200 },
    );
  }
}
