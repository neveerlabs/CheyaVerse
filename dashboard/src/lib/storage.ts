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

export type Notification = {
  id: string;
  uid: number;
  title: string;
  message: string;
  ip: string | null;
  location: string | null;
  device: string | null;
  read: number;
  created_at: string;
};

function rowToNotification(row: Record<string, unknown>): Notification {
  return {
    id: String(row.id ?? ""),
    uid: Number(row.uid ?? 0),
    title: String(row.title ?? ""),
    message: String(row.message ?? ""),
    ip: row.ip == null ? null : String(row.ip),
    location: row.location == null ? null : String(row.location),
    device: row.device == null ? null : String(row.device),
    read: Number(row.read ?? 0),
    created_at: String(row.created_at ?? ""),
  };
}

function genNotificationId(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `n${Date.now().toString(36)}${rand}`;
}

export async function createNotification(data: {
  uid: number;
  title: string;
  message: string;
  ip?: string | null;
  location?: string | null;
  device?: string | null;
}): Promise<Notification | null> {
  const id = genNotificationId();
  const createdAt = new Date().toISOString();
  try {
    await getTurso().execute({
      sql: `INSERT INTO notifications
              (id, uid, title, message, ip, location, device, read, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`,
      args: [
        id,
        data.uid,
        data.title,
        data.message,
        data.ip ?? null,
        data.location ?? null,
        data.device ?? null,
        createdAt,
      ],
    });
    return {
      id,
      uid: data.uid,
      title: data.title,
      message: data.message,
      ip: data.ip ?? null,
      location: data.location ?? null,
      device: data.device ?? null,
      read: 0,
      created_at: createdAt,
    };
  } catch (err) {
    console.error("createNotification error:", err);
    return null;
  }
}

export type UserSession = {
  uid: number;
  device_type: string | null;
  os: string | null;
  brand: string | null;
  model: string | null;
  browser: string | null;
  cpu_cores: number | null;
  ram_gb: number | null;
  user_agent: string | null;
  first_seen: string;
  last_seen: string;
};

export async function getUserSession(uid: number): Promise<UserSession | null> {
  try {
    const result = await getTurso().execute({
      sql: "SELECT * FROM user_sessions WHERE uid = ? LIMIT 1",
      args: [uid],
    });
    if (result.rows.length === 0) return null;
    const r = result.rows[0] as unknown as Record<string, unknown>;
    return {
      uid: Number(r.uid),
      device_type: r.device_type == null ? null : String(r.device_type),
      os: r.os == null ? null : String(r.os),
      brand: r.brand == null ? null : String(r.brand),
      model: r.model == null ? null : String(r.model),
      browser: r.browser == null ? null : String(r.browser),
      cpu_cores: r.cpu_cores == null ? null : Number(r.cpu_cores),
      ram_gb: r.ram_gb == null ? null : Number(r.ram_gb),
      user_agent: r.user_agent == null ? null : String(r.user_agent),
      first_seen: String(r.first_seen ?? ""),
      last_seen: String(r.last_seen ?? ""),
    };
  } catch {
    return null;
  }
}

export async function upsertUserSession(
  uid: number,
  data: {
    device_type: string | null;
    os: string | null;
    brand: string | null;
    model: string | null;
    browser: string | null;
    cpu_cores: number | null;
    ram_gb: number | null;
    user_agent: string | null;
  },
): Promise<void> {
  const now = new Date().toISOString();
  try {
    await getTurso().execute({
      sql: `INSERT INTO user_sessions
              (uid, device_type, os, brand, model, browser, cpu_cores, ram_gb, user_agent, first_seen, last_seen)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(uid) DO UPDATE SET
              device_type = excluded.device_type,
              os = excluded.os,
              brand = excluded.brand,
              model = excluded.model,
              browser = excluded.browser,
              cpu_cores = COALESCE(excluded.cpu_cores, user_sessions.cpu_cores),
              ram_gb = COALESCE(excluded.ram_gb, user_sessions.ram_gb),
              user_agent = excluded.user_agent,
              last_seen = excluded.last_seen`,
      args: [
        uid,
        data.device_type,
        data.os,
        data.brand,
        data.model,
        data.browser,
        data.cpu_cores,
        data.ram_gb,
        data.user_agent,
        now,
        now,
      ],
    });
  } catch (err) {
    console.error("upsertUserSession error:", err);
  }
}

export async function ensureWelcomeNotification(
  uid: number,
  username: string | null,
  device: string | null,
  browser: string | null,
  cpuCores: number | null,
  ramGb: number | null,
): Promise<boolean> {
  const id = `welcome-${uid}`;
  try {
    const existing = await getTurso().execute({
      sql: "SELECT id FROM notifications WHERE id = ? LIMIT 1",
      args: [id],
    });
    if (existing.rows.length > 0) return false;

    const userMention = username ? `@${username}` : "Anda";
    const deviceLine = device || "Tidak terdeteksi";
    const browserLine = browser || "Tidak terdeteksi";

    const hwParts: string[] = [];
    if (typeof cpuCores === "number" && cpuCores > 0) {
      hwParts.push(`${cpuCores} core`);
    }
    if (typeof ramGb === "number" && ramGb > 0) {
      hwParts.push(`${ramGb} GB RAM`);
    }
    const hardwareLine = hwParts.length ? hwParts.join(" · ") : "Tidak terdeteksi";

    let waktu: string;
    try {
      waktu = new Date().toLocaleString("id-ID", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Jakarta",
      });
    } catch {
      waktu = new Date().toISOString();
    }

    const message = [
      `Otorisasi akun berhasil. Sistem mendeteksi aktivitas masuk pada akun ${userMention} melalui tautan instan Telegram.`,
      "",
      "<b>Session active:</b>",
      `• <b>Perangkat:</b> ${deviceLine}`,
      `• <b>Hardware:</b> ${hardwareLine}`,
      `• <b>Browser:</b> ${browserLine}`,
      `• <b>Waktu:</b> ${waktu}`,
      "",
      "⚠️ <b>PERINGATAN KEAMANAN:</b> Tautan masuk ini bersifat privat dan mengandung kredensial enkripsi unik akun Anda. Menyebarkan URL ini sama dengan menyerahkan hak akses akun kepada orang lain.",
      "",
      "<i>Jika ini adalah aktivitas Anda, tidak ada tindakan lebih lanjut yang diperlukan. Selamat menggunakan layanan kami.</i>",
    ].join("\n");

    const createdAt = new Date().toISOString();

    const result = await getTurso().execute({
      sql: `INSERT OR IGNORE INTO notifications
              (id, uid, title, message, ip, location, device, read, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`,
      args: [
        id,
        uid,
        "CheyaVerse Security Service",
        message,
        null,
        null,
        device,
        createdAt,
      ],
    });

    return result.rowsAffected > 0;
  } catch (err) {
    console.error("[welcome] FAILED:", err);
    return false;
  }
}

export async function listNotifications(uid: number, limit = 100): Promise<Notification[]> {
  try {
    const result = await getTurso().execute({
      sql: "SELECT * FROM notifications WHERE uid = ? ORDER BY created_at DESC LIMIT ?",
      args: [uid, limit],
    });
    return result.rows.map((r) => rowToNotification(r as unknown as Record<string, unknown>));
  } catch {
    return [];
  }
}

export async function countNotifications(uid: number): Promise<number> {
  try {
    const result = await getTurso().execute({
      sql: "SELECT COUNT(*) as c FROM notifications WHERE uid = ?",
      args: [uid],
    });
    return Number(result.rows[0]?.c ?? 0);
  } catch {
    return 0;
  }
}

export async function countUnreadNotifications(uid: number): Promise<number> {
  try {
    const result = await getTurso().execute({
      sql: "SELECT COUNT(*) as c FROM notifications WHERE uid = ? AND read = 0",
      args: [uid],
    });
    return Number(result.rows[0]?.c ?? 0);
  } catch {
    return 0;
  }
}

export async function markNotificationsRead(uid: number): Promise<void> {
  try {
    await getTurso().execute({
      sql: "UPDATE notifications SET read = 1 WHERE uid = ? AND read = 0",
      args: [uid],
    });
  } catch {}
}

export type BlacklistEntry = {
  uid: number;
  fingerprint: string;
  created_at: string;
};

export async function isFingerprintBlacklisted(
  uid: number,
  fingerprint: string,
): Promise<boolean> {
  try {
    const result = await getTurso().execute({
      sql: "SELECT fingerprint FROM session_blacklist WHERE uid = ? AND fingerprint = ? LIMIT 1",
      args: [uid, fingerprint],
    });
    return result.rows.length > 0;
  } catch {
    return false;
  }
}

export async function addFingerprintToBlacklist(
  uid: number,
  fingerprint: string,
): Promise<void> {
  const createdAt = new Date().toISOString();
  try {
    await getTurso().execute({
      sql: `INSERT OR IGNORE INTO session_blacklist
              (uid, fingerprint, created_at)
            VALUES (?, ?, ?)`,
      args: [uid, fingerprint, createdAt],
    });
    await getTurso().execute({
      sql: "DELETE FROM known_devices WHERE uid = ? AND fingerprint = ?",
      args: [uid, fingerprint],
    });
  } catch (err) {
    console.error("addFingerprintToBlacklist error:", err);
  }
}

export async function removeFingerprintFromBlacklist(
  uid: number,
  fingerprint: string,
): Promise<void> {
  try {
    await getTurso().execute({
      sql: "DELETE FROM session_blacklist WHERE uid = ? AND fingerprint = ?",
      args: [uid, fingerprint],
    });
  } catch {}
}

export async function listBlacklist(uid: number): Promise<BlacklistEntry[]> {
  try {
    const result = await getTurso().execute({
      sql: "SELECT uid, fingerprint, created_at FROM session_blacklist WHERE uid = ? ORDER BY created_at DESC",
      args: [uid],
    });
    return result.rows.map((r) => {
      const row = r as unknown as Record<string, unknown>;
      return {
        uid: Number(row.uid),
        fingerprint: String(row.fingerprint ?? ""),
        created_at: String(row.created_at ?? ""),
      };
    });
  } catch {
    return [];
  }
}

export async function listKnownDevices(uid: number): Promise<
  { uid: number; fingerprint: string; first_seen: string }[]
> {
  try {
    const result = await getTurso().execute({
      sql: "SELECT uid, fingerprint, first_seen FROM known_devices WHERE uid = ? ORDER BY first_seen ASC",
      args: [uid],
    });
    return result.rows.map((r) => {
      const row = r as unknown as Record<string, unknown>;
      return {
        uid: Number(row.uid),
        fingerprint: String(row.fingerprint ?? ""),
        first_seen: String(row.first_seen ?? ""),
      };
    });
  } catch {
    return [];
  }
}

export async function isKnownDevice(
  uid: number,
  fingerprint: string,
): Promise<boolean> {
  try {
    const result = await getTurso().execute({
      sql: "SELECT fingerprint FROM known_devices WHERE uid = ? AND fingerprint = ? LIMIT 1",
      args: [uid, fingerprint],
    });
    return result.rows.length > 0;
  } catch {
    return false;
  }
}

export async function addKnownDevice(
  uid: number,
  fingerprint: string,
): Promise<void> {
  const firstSeen = new Date().toISOString();
  try {
    await getTurso().execute({
      sql: `INSERT OR IGNORE INTO known_devices
              (uid, fingerprint, first_seen)
            VALUES (?, ?, ?)`,
      args: [uid, fingerprint, firstSeen],
    });
  } catch (err) {
    console.error("addKnownDevice error:", err);
  }
}

export async function countKnownDevices(uid: number): Promise<number> {
  try {
    const result = await getTurso().execute({
      sql: "SELECT COUNT(*) as c FROM known_devices WHERE uid = ?",
      args: [uid],
    });
    return Number(result.rows[0]?.c ?? 0);
  } catch {
    return 0;
  }
}
