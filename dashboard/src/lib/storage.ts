// src/lib/storage.ts
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

    await createMessage({
      uid: data.uid,
      sender: "bot",
      sender_role: "system",
      title: "service notifications",
      content: data.message,
    }).catch(() => {});

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

    const userMention = username ? `<b>@${username}</b>` : "Anda";
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
        "CheyaVerse Service Notifications",
        message,
        null,
        null,
        device,
        createdAt,
      ],
    });

    if (result.rowsAffected > 0) {
      await createMessage({
        uid,
        sender: "bot",
        sender_role: "system",
        title: "service notifications",
        content: message,
      }).catch(() => {});
    }

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

export type DeviceIdRow = {
  device_id: string;
  uid: number;
  fingerprint: string;
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

function rowToDeviceId(row: Record<string, unknown>): DeviceIdRow {
  return {
    device_id: String(row.device_id ?? ""),
    uid: Number(row.uid ?? 0),
    fingerprint: String(row.fingerprint ?? ""),
    device_type: row.device_type == null ? null : String(row.device_type),
    os: row.os == null ? null : String(row.os),
    brand: row.brand == null ? null : String(row.brand),
    model: row.model == null ? null : String(row.model),
    browser: row.browser == null ? null : String(row.browser),
    cpu_cores: row.cpu_cores == null ? null : Number(row.cpu_cores),
    ram_gb: row.ram_gb == null ? null : Number(row.ram_gb),
    user_agent: row.user_agent == null ? null : String(row.user_agent),
    first_seen: String(row.first_seen ?? ""),
    last_seen: String(row.last_seen ?? ""),
  };
}

export async function getDeviceIdRow(
  deviceId: string,
  uid: number,
): Promise<DeviceIdRow | null> {
  try {
    const result = await getTurso().execute({
      sql: "SELECT * FROM device_ids WHERE device_id = ? AND uid = ? LIMIT 1",
      args: [deviceId, uid],
    });
    if (result.rows.length === 0) return null;
    return rowToDeviceId(result.rows[0] as unknown as Record<string, unknown>);
  } catch {
    return null;
  }
}

export async function findDeviceIdByFingerprint(
  uid: number,
  fingerprint: string,
): Promise<DeviceIdRow | null> {
  try {
    const result = await getTurso().execute({
      sql: "SELECT * FROM device_ids WHERE uid = ? AND fingerprint = ? LIMIT 1",
      args: [uid, fingerprint],
    });
    if (result.rows.length === 0) return null;
    return rowToDeviceId(result.rows[0] as unknown as Record<string, unknown>);
  } catch {
    return null;
  }
}

export async function insertDeviceId(row: DeviceIdRow): Promise<void> {
  try {
    await getTurso().execute({
      sql: `INSERT OR IGNORE INTO device_ids
              (device_id, uid, fingerprint, device_type, os, brand, model, browser, cpu_cores, ram_gb, user_agent, first_seen, last_seen)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        row.device_id,
        row.uid,
        row.fingerprint,
        row.device_type,
        row.os,
        row.brand,
        row.model,
        row.browser,
        row.cpu_cores,
        row.ram_gb,
        row.user_agent,
        row.first_seen,
        row.last_seen,
      ],
    });
  } catch (err) {
    console.error("insertDeviceId error:", err);
  }
}

export async function touchDeviceId(
  deviceId: string,
  uid: number,
): Promise<void> {
  const now = new Date().toISOString();
  try {
    await getTurso().execute({
      sql: "UPDATE device_ids SET last_seen = ? WHERE device_id = ? AND uid = ?",
      args: [now, deviceId, uid],
    });
  } catch {}
}

export async function countDeviceIdsForUid(uid: number): Promise<number> {
  try {
    const result = await getTurso().execute({
      sql: "SELECT COUNT(*) as c FROM device_ids WHERE uid = ?",
      args: [uid],
    });
    return Number(result.rows[0]?.c ?? 0);
  } catch {
    return 0;
  }
}

export async function isDeviceBlacklisted(
  deviceId: string,
  uid: number,
): Promise<boolean> {
  try {
    const result = await getTurso().execute({
      sql: "SELECT device_id FROM session_blacklist WHERE device_id = ? AND uid = ? LIMIT 1",
      args: [deviceId, uid],
    });
    return result.rows.length > 0;
  } catch {
    return false;
  }
}

export async function addDeviceToBlacklist(
  deviceId: string,
  uid: number,
): Promise<void> {
  const createdAt = new Date().toISOString();
  try {
    await getTurso().execute({
      sql: "INSERT OR IGNORE INTO session_blacklist (device_id, uid, created_at) VALUES (?, ?, ?)",
      args: [deviceId, uid, createdAt],
    });
  } catch (err) {
    console.error("addDeviceToBlacklist error:", err);
  }
}

export async function removeDeviceFromBlacklist(
  deviceId: string,
  uid: number,
): Promise<void> {
  try {
    await getTurso().execute({
      sql: "DELETE FROM session_blacklist WHERE device_id = ? AND uid = ?",
      args: [deviceId, uid],
    });
  } catch {}
}

export type TelegramUser = {
  uid: number;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  photo_file_id: string | null;
  role: string;
  created_at: string | null;
  updated_at: string | null;
};

function rowToTelegramUser(row: Record<string, unknown>): TelegramUser {
  return {
    uid: Number(row.uid ?? 0),
    username: row.username == null ? null : String(row.username),
    first_name: row.first_name == null ? null : String(row.first_name),
    last_name: row.last_name == null ? null : String(row.last_name),
    photo_file_id: row.photo_file_id == null ? null : String(row.photo_file_id),
    role: row.role == null ? "user" : String(row.role),
    created_at: row.created_at == null ? null : String(row.created_at),
    updated_at: row.updated_at == null ? null : String(row.updated_at),
  };
}

export async function getTelegramUser(uid: number): Promise<TelegramUser | null> {
  try {
    const result = await getTurso().execute({
      sql: "SELECT * FROM telegram_users WHERE uid = ? LIMIT 1",
      args: [uid],
    });
    if (result.rows.length === 0) return null;
    return rowToTelegramUser(result.rows[0] as unknown as Record<string, unknown>);
  } catch {
    return null;
  }
}

export async function upsertTelegramUser(
  uid: number,
  data: {
    username?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    photo_file_id?: string | null;
    role?: string;
  },
): Promise<void> {
  const now = new Date().toISOString();
  try {
    await getTurso().execute({
      sql: `INSERT INTO telegram_users
              (uid, username, first_name, last_name, photo_file_id, role, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(uid) DO UPDATE SET
              username = COALESCE(excluded.username, telegram_users.username),
              first_name = COALESCE(excluded.first_name, telegram_users.first_name),
              last_name = COALESCE(excluded.last_name, telegram_users.last_name),
              photo_file_id = COALESCE(excluded.photo_file_id, telegram_users.photo_file_id),
              role = COALESCE(excluded.role, telegram_users.role),
              updated_at = excluded.updated_at`,
      args: [
        uid,
        data.username ?? null,
        data.first_name ?? null,
        data.last_name ?? null,
        data.photo_file_id ?? null,
        data.role ?? "user",
        now,
        now,
      ],
    });
  } catch (err) {
    console.error("upsertTelegramUser error:", err);
  }
}

export type ChatMessage = {
  id: string;
  uid: number;
  sender: "user" | "bot";
  sender_role: string;
  title: string | null;
  content: string;
  created_at: string;
  delivered_at: string | null;
  read_at: string | null;
};

function rowToMessage(row: Record<string, unknown>): ChatMessage {
  return {
    id: String(row.id ?? ""),
    uid: Number(row.uid ?? 0),
    sender: String(row.sender ?? "user") === "bot" ? "bot" : "user",
    sender_role: String(row.sender_role ?? "user"),
    title: row.title == null ? null : String(row.title),
    content: String(row.content ?? ""),
    created_at: String(row.created_at ?? ""),
    delivered_at: row.delivered_at == null ? null : String(row.delivered_at),
    read_at: row.read_at == null ? null : String(row.read_at),
  };
}

function genMessageId(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `m${Date.now().toString(36)}${rand}`;
}

export async function createMessage(data: {
  uid: number;
  sender: "user" | "bot";
  sender_role: string;
  title?: string | null;
  content: string;
  delivered_at?: string | null;
  read_at?: string | null;
}): Promise<ChatMessage | null> {
  const id = genMessageId();
  const createdAt = new Date().toISOString();
  const deliveredAt = data.delivered_at ?? null;
  const readAt = data.read_at ?? null;
  try {
    await getTurso().execute({
      sql: `INSERT INTO messages
              (id, uid, sender, sender_role, title, content, created_at, delivered_at, read_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        id,
        data.uid,
        data.sender,
        data.sender_role,
        data.title ?? null,
        data.content,
        createdAt,
        deliveredAt,
        readAt,
      ],
    });
    return {
      id,
      uid: data.uid,
      sender: data.sender,
      sender_role: data.sender_role,
      title: data.title ?? null,
      content: data.content,
      created_at: createdAt,
      delivered_at: deliveredAt,
      read_at: readAt,
    };
  } catch (err) {
    console.error("createMessage error:", err);
    return null;
  }
}

export async function listMessages(uid: number, limit = 500): Promise<ChatMessage[]> {
  try {
    const result = await getTurso().execute({
      sql: "SELECT * FROM messages WHERE uid = ? ORDER BY created_at ASC LIMIT ?",
      args: [uid, limit],
    });
    return result.rows.map((r) => rowToMessage(r as unknown as Record<string, unknown>));
  } catch {
    return [];
  }
}

export async function getLastMessage(uid: number): Promise<ChatMessage | null> {
  try {
    const result = await getTurso().execute({
      sql: "SELECT * FROM messages WHERE uid = ? ORDER BY created_at DESC LIMIT 1",
      args: [uid],
    });
    if (result.rows.length === 0) return null;
    return rowToMessage(result.rows[0] as unknown as Record<string, unknown>);
  } catch {
    return null;
  }
}

export async function markMessageDelivered(
  messageId: string,
  uid: number,
): Promise<string | null> {
  const now = new Date().toISOString();
  try {
    const res = await getTurso().execute({
      sql: "UPDATE messages SET delivered_at = ? WHERE id = ? AND uid = ? AND delivered_at IS NULL",
      args: [now, messageId, uid],
    });
    if (res.rowsAffected === 0) {
      const existing = await getTurso().execute({
        sql: "SELECT delivered_at FROM messages WHERE id = ? AND uid = ? LIMIT 1",
        args: [messageId, uid],
      });
      const d = existing.rows[0]?.delivered_at;
      return d == null ? null : String(d);
    }
    return now;
  } catch {
    return null;
  }
}

export async function markMessageRead(
  messageId: string,
  uid: number,
): Promise<string | null> {
  const now = new Date().toISOString();
  try {
    const res = await getTurso().execute({
      sql: "UPDATE messages SET read_at = ? WHERE id = ? AND uid = ? AND read_at IS NULL",
      args: [now, messageId, uid],
    });
    if (res.rowsAffected === 0) {
      const existing = await getTurso().execute({
        sql: "SELECT read_at FROM messages WHERE id = ? AND uid = ? LIMIT 1",
        args: [messageId, uid],
      });
      const r = existing.rows[0]?.read_at;
      return r == null ? null : String(r);
    }
    return now;
  } catch {
    return null;
  }
}
