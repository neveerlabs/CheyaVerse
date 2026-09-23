import { getTurso } from "./turso";
import { config } from "./config";
import { deleteTelegramMessage } from "./telegram";

export type MediaMeta = {
  id: string;
  owner_id: number | null;
  filename: string;
  storage_path: string;
  storage_message_id: number | null;
  content_type: string;
  file_size: number;
  expires_at: string;
};

function rowToMedia(row: Record<string, unknown>): MediaMeta {
  return {
    id: String(row.id ?? ""),
    owner_id: row.owner_id == null ? null : Number(row.owner_id),
    filename: String(row.filename ?? ""),
    storage_path: String(row.storage_path ?? ""),
    storage_message_id:
      row.storage_message_id == null ? null : Number(row.storage_message_id),
    content_type: String(row.content_type ?? ""),
    file_size: Number(row.file_size ?? 0),
    expires_at: String(row.expires_at ?? ""),
  };
}

export async function fetchMedia(mediaId: string): Promise<MediaMeta | null> {
  const result = await getTurso().execute({
    sql: "SELECT * FROM media WHERE id = ? LIMIT 1",
    args: [mediaId],
  });
  if (result.rows.length === 0) return null;
  return rowToMedia(result.rows[0] as unknown as Record<string, unknown>);
}

export async function listRecentMedia(uid: number, limit = 50): Promise<MediaMeta[]> {
  const result = await getTurso().execute({
    sql: "SELECT * FROM media WHERE owner_id = ? ORDER BY expires_at DESC LIMIT ?",
    args: [uid, limit],
  });
  return result.rows.map((r) => rowToMedia(r as unknown as Record<string, unknown>));
}

export async function getStats(uid: number) {
  const nowIso = new Date().toISOString();
  const [totalRes, activeRes] = await Promise.all([
    getTurso().execute({
      sql: "SELECT COUNT(*) as c FROM media WHERE owner_id = ?",
      args: [uid],
    }),
    getTurso().execute({
      sql: "SELECT COUNT(*) as c FROM media WHERE owner_id = ? AND expires_at >= ?",
      args: [uid, nowIso],
    }),
  ]);
  const total = Number(totalRes.rows[0]?.c ?? 0);
  const active = Number(activeRes.rows[0]?.c ?? 0);
  return { total, active, expired: Math.max(0, total - active) };
}

export async function deleteMediaById(
  mediaId: string,
  ownerId: number,
): Promise<{ ok: boolean; reason?: string }> {
  const meta = await fetchMedia(mediaId);
  if (!meta) return { ok: false, reason: "not_found" };
  if (meta.owner_id !== ownerId) return { ok: false, reason: "forbidden" };

  try {
    const result = await getTurso().execute({
      sql: "DELETE FROM media WHERE id = ?",
      args: [mediaId],
    });
    if (result.rowsAffected === 0) return { ok: false, reason: "db_error" };

    if (meta.storage_message_id) {
      const deleted = await deleteTelegramMessage(meta.storage_message_id);
      if (!deleted) {
        console.warn(
          `Failed to delete Telegram storage message ${meta.storage_message_id} for media ${mediaId}`,
        );
      }
    }

    return { ok: true };
  } catch {
    return { ok: false, reason: "db_error" };
  }
}

export async function renameMediaById(
  mediaId: string,
  ownerId: number,
  newName: string,
): Promise<{ ok: boolean; reason?: string }> {
  const meta = await fetchMedia(mediaId);
  if (!meta) return { ok: false, reason: "not_found" };
  if (meta.owner_id !== ownerId) return { ok: false, reason: "forbidden" };

  const cleaned = newName.replace(/[\\/\r\n\t]/g, "").trim().slice(0, 200);
  if (!cleaned) return { ok: false, reason: "invalid_name" };

  try {
    await getTurso().execute({
      sql: "UPDATE media SET filename = ? WHERE id = ?",
      args: [cleaned, mediaId],
    });
    return { ok: true };
  } catch {
    return { ok: false, reason: "db_error" };
  }
}

export type CoverType = "color" | "upload" | "telegram";

export type CoverConfig = {
  uid: number;
  type: CoverType;
  color1: string | null;
  color2: string | null;
  icon: string | null;
  storage_path: string | null;
  storage_message_id: number | null;
  content_type: string | null;
  bg_size: number | null;
  bg_x: number | null;
  bg_y: number | null;
  updated_at: string | null;
};

export async function getCover(uid: number): Promise<CoverConfig | null> {
  try {
    const result = await getTurso().execute({
      sql: "SELECT * FROM user_covers WHERE uid = ? LIMIT 1",
      args: [uid],
    });
    if (result.rows.length === 0) return null;
    const r = result.rows[0] as unknown as Record<string, unknown>;
    const type = String(r.type ?? "color") as CoverType;
    return {
      uid: Number(r.uid),
      type: type === "upload" || type === "telegram" ? type : "color",
      color1: r.color1 == null ? null : String(r.color1),
      color2: r.color2 == null ? null : String(r.color2),
      icon: r.icon == null ? null : String(r.icon),
      storage_path: r.storage_path == null ? null : String(r.storage_path),
      storage_message_id:
        r.storage_message_id == null ? null : Number(r.storage_message_id),
      content_type: r.content_type == null ? null : String(r.content_type),
      bg_size: r.bg_size == null ? null : Number(r.bg_size),
      bg_x: r.bg_x == null ? null : Number(r.bg_x),
      bg_y: r.bg_y == null ? null : Number(r.bg_y),
      updated_at: r.updated_at == null ? null : String(r.updated_at),
    };
  } catch {
    return null;
  }
}

export async function upsertCover(
  uid: number,
  data: Partial<Omit<CoverConfig, "uid">>,
): Promise<{ ok: boolean; reason?: string }> {
  const existing = await getCover(uid);
  const merged: CoverConfig = {
    uid,
    type: (data.type ?? existing?.type ?? "color") as CoverType,
    color1: data.color1 !== undefined ? data.color1 : existing?.color1 ?? null,
    color2: data.color2 !== undefined ? data.color2 : existing?.color2 ?? null,
    icon: data.icon !== undefined ? data.icon : existing?.icon ?? null,
    storage_path:
      data.storage_path !== undefined ? data.storage_path : existing?.storage_path ?? null,
    storage_message_id:
      data.storage_message_id !== undefined
        ? data.storage_message_id
        : existing?.storage_message_id ?? null,
    content_type:
      data.content_type !== undefined ? data.content_type : existing?.content_type ?? null,
    bg_size: data.bg_size !== undefined ? data.bg_size : existing?.bg_size ?? null,
    bg_x: data.bg_x !== undefined ? data.bg_x : existing?.bg_x ?? null,
    bg_y: data.bg_y !== undefined ? data.bg_y : existing?.bg_y ?? null,
    updated_at: new Date().toISOString(),
  };
  try {
    await getTurso().execute({
      sql: `INSERT INTO user_covers
              (uid, type, color1, color2, icon, storage_path, storage_message_id, content_type, bg_size, bg_x, bg_y, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(uid) DO UPDATE SET
              type = excluded.type,
              color1 = excluded.color1,
              color2 = excluded.color2,
              icon = excluded.icon,
              storage_path = excluded.storage_path,
              storage_message_id = excluded.storage_message_id,
              content_type = excluded.content_type,
              bg_size = excluded.bg_size,
              bg_x = excluded.bg_x,
              bg_y = excluded.bg_y,
              updated_at = excluded.updated_at`,
      args: [
        uid,
        merged.type,
        merged.color1,
        merged.color2,
        merged.icon,
        merged.storage_path,
        merged.storage_message_id,
        merged.content_type,
        merged.bg_size,
        merged.bg_x,
        merged.bg_y,
        merged.updated_at,
      ],
    });
    return { ok: true };
  } catch (err) {
    console.error("upsertCover error:", err);
    return { ok: false, reason: "db_error" };
  }
}

export async function deleteCover(
  uid: number,
): Promise<{ ok: boolean; reason?: string }> {
  try {
    const existing = await getCover(uid);
    if (existing?.storage_message_id) {
      await deleteTelegramMessage(existing.storage_message_id).catch(() => {});
    }
    await getTurso().execute({
      sql: "DELETE FROM user_covers WHERE uid = ?",
      args: [uid],
    });
    return { ok: true };
  } catch {
    return { ok: false, reason: "db_error" };
  }
}