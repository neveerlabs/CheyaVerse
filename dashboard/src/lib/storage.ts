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
