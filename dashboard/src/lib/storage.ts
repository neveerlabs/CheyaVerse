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

export async function updateMediaExpiresAt(
  mediaId: string,
  ownerId: number,
  expiresAt: string,
): Promise<{ ok: boolean; reason?: string }> {
  const meta = await fetchMedia(mediaId);
  if (!meta) return { ok: false, reason: "not_found" };
  if (meta.owner_id !== ownerId) return { ok: false, reason: "forbidden" };

  try {
    await getTurso().execute({
      sql: "UPDATE media SET expires_at = ? WHERE id = ?",
      args: [expiresAt, mediaId],
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
      sender_role: "admin",
      title: "CheyaVerse · Admin",
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
): Promise<{ created: boolean; message: string | null }> {
  const id = `welcome-${uid}`;
  try {
    const existing = await getTurso().execute({
      sql: "SELECT id FROM notifications WHERE id = ? LIMIT 1",
      args: [id],
    });
    if (existing.rows.length > 0) return { created: false, message: null };

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
      `Login Telegram berhasil untuk akun ${userMention}. Perangkat ini sekarang terhubung ke akun CheyaVerse Anda.`,
      "",
      "<b>Session active:</b>",
      `• <b>Perangkat:</b> ${deviceLine}`,
      `• <b>Hardware:</b> ${hardwareLine}`,
      `• <b>Browser:</b> ${browserLine}`,
      `• <b>Waktu:</b> ${waktu}`,
      "",
      "⚠️ <b>PERINGATAN KEAMANAN:</b> Jangan bagikan kode login Telegram atau sesi browser Anda. Login dari perangkat baru akan dikirim sebagai laporan keamanan langsung melalui bot Telegram.",
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
        "CheyaVerse · Admin",
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
        sender_role: "admin",
        title: "CheyaVerse · Admin",
        content: message,
      }).catch(() => {});
    }

    return {
      created: result.rowsAffected > 0,
      message: result.rowsAffected > 0 ? message : null,
    };
  } catch (err) {
    console.error("[welcome] FAILED:", err);
    return { created: false, message: null };
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
  language: string | null;
  timezone: string | null;
  platform: string | null;
  max_touch: number | null;
  color_depth: number | null;
  webgl_vendor: string | null;
  webgl_renderer: string | null;
  screen_w: number | null;
  screen_h: number | null;
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
    language: row.language == null ? null : String(row.language),
    timezone: row.timezone == null ? null : String(row.timezone),
    platform: row.platform == null ? null : String(row.platform),
    max_touch: row.max_touch == null ? null : Number(row.max_touch),
    color_depth: row.color_depth == null ? null : Number(row.color_depth),
    webgl_vendor: row.webgl_vendor == null ? null : String(row.webgl_vendor),
    webgl_renderer: row.webgl_renderer == null ? null : String(row.webgl_renderer),
    screen_w: row.screen_w == null ? null : Number(row.screen_w),
    screen_h: row.screen_h == null ? null : Number(row.screen_h),
    first_seen: String(row.first_seen ?? ""),
    last_seen: String(row.last_seen ?? ""),
  };
}

type DeviceFingerprintDetails = Pick<
  DeviceIdRow,
  | "language"
  | "timezone"
  | "platform"
  | "max_touch"
  | "color_depth"
  | "webgl_vendor"
  | "webgl_renderer"
  | "screen_w"
  | "screen_h"
>;

let deviceFingerprintColumnsReady: Promise<void> | null = null;

async function ensureDeviceFingerprintColumns(): Promise<void> {
  if (!deviceFingerprintColumnsReady) {
    deviceFingerprintColumnsReady = (async () => {
      const db = getTurso();
      const result = await db.execute("PRAGMA table_info(device_ids)");
      const existing = new Set(
        result.rows.map((row) =>
          String((row as unknown as Record<string, unknown>).name ?? ""),
        ),
      );
      const columns: Array<[keyof DeviceFingerprintDetails, string]> = [
        ["language", "TEXT"],
        ["timezone", "TEXT"],
        ["platform", "TEXT"],
        ["max_touch", "INTEGER"],
        ["color_depth", "INTEGER"],
        ["webgl_vendor", "TEXT"],
        ["webgl_renderer", "TEXT"],
        ["screen_w", "INTEGER"],
        ["screen_h", "INTEGER"],
      ];
      for (const [name, type] of columns) {
        if (!existing.has(name)) {
          await db.execute(`ALTER TABLE device_ids ADD COLUMN ${name} ${type}`);
        }
      }
    })().catch((error) => {
      deviceFingerprintColumnsReady = null;
      throw error;
    });
  }
  await deviceFingerprintColumnsReady;
}

export async function getDeviceIdRow(
  deviceId: string,
  uid: number,
): Promise<DeviceIdRow | null> {
  await ensureDeviceFingerprintColumns();
  const result = await getTurso().execute({
    sql: "SELECT * FROM device_ids WHERE device_id = ? AND uid = ? LIMIT 1",
    args: [deviceId, uid],
  });
  if (result.rows.length === 0) return null;
  return rowToDeviceId(result.rows[0] as unknown as Record<string, unknown>);
}

export async function findDeviceIdByFingerprint(
  uid: number,
  fingerprint: string,
): Promise<DeviceIdRow | null> {
  await ensureDeviceFingerprintColumns();
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
  await ensureDeviceFingerprintColumns();
  const result = await getTurso().execute({
    sql: `INSERT OR IGNORE INTO device_ids
            (device_id, uid, fingerprint, device_type, os, brand, model, browser, cpu_cores, ram_gb, user_agent,
             language, timezone, platform, max_touch, color_depth, webgl_vendor, webgl_renderer, screen_w, screen_h,
             first_seen, last_seen)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      row.language,
      row.timezone,
      row.platform,
      row.max_touch,
      row.color_depth,
      row.webgl_vendor,
      row.webgl_renderer,
      row.screen_w,
      row.screen_h,
      row.first_seen,
      row.last_seen,
    ],
  });
  if (result.rowsAffected === 0) {
    throw new Error("Device ID could not be registered.");
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

export async function updateDeviceFingerprint(
  deviceId: string,
  uid: number,
  fingerprint: string,
  details: DeviceFingerprintDetails,
): Promise<void> {
  await ensureDeviceFingerprintColumns();
  const now = new Date().toISOString();
  await getTurso().execute({
    sql: `UPDATE device_ids
          SET fingerprint = ?, last_seen = ?, language = ?, timezone = ?, platform = ?,
              max_touch = ?, color_depth = ?, webgl_vendor = ?, webgl_renderer = ?, screen_w = ?, screen_h = ?
          WHERE device_id = ? AND uid = ?`,
    args: [
      fingerprint,
      now,
      details.language,
      details.timezone,
      details.platform,
      details.max_touch,
      details.color_depth,
      details.webgl_vendor,
      details.webgl_renderer,
      details.screen_w,
      details.screen_h,
      deviceId,
      uid,
    ],
  });
}

export async function countDeviceIdsForUid(uid: number): Promise<number> {
  const result = await getTurso().execute({
    sql: "SELECT COUNT(*) as c FROM device_ids WHERE uid = ?",
    args: [uid],
  });
  return Number(result.rows[0]?.c ?? 0);
}

export async function isDeviceBlacklisted(
  deviceId: string,
  uid: number,
): Promise<boolean> {
  const result = await getTurso().execute({
    sql: "SELECT device_id FROM session_blacklist WHERE device_id = ? AND uid = ? LIMIT 1",
    args: [deviceId, uid],
  });
  return result.rows.length > 0;
}

export async function addDeviceToBlacklist(
  deviceId: string,
  uid: number,
): Promise<void> {
  const createdAt = new Date().toISOString();
  await getTurso().execute({
    sql: "INSERT OR IGNORE INTO session_blacklist (device_id, uid, created_at) VALUES (?, ?, ?)",
    args: [deviceId, uid, createdAt],
  });
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
  photo_url: string | null;
  photo_file_id: string | null;
  auth_date: number | null;
  allows_write_to_pm: boolean | null;
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
    photo_url: row.photo_url == null ? null : String(row.photo_url),
    photo_file_id: row.photo_file_id == null ? null : String(row.photo_file_id),
    auth_date: row.auth_date == null ? null : Number(row.auth_date),
    allows_write_to_pm:
      row.allows_write_to_pm == null
        ? null
        : Number(row.allows_write_to_pm) === 1,
    role: row.role == null ? "user" : String(row.role),
    created_at: row.created_at == null ? null : String(row.created_at),
    updated_at: row.updated_at == null ? null : String(row.updated_at),
  };
}

let telegramAccountsReady: Promise<void> | null = null;

async function ensureTelegramAccountsTable(): Promise<void> {
  if (!telegramAccountsReady) {
    telegramAccountsReady = (async () => {
      const db = getTurso();
      await db.execute(`CREATE TABLE IF NOT EXISTS "akun-telegram" (
        uid INTEGER PRIMARY KEY,
        username TEXT,
        first_name TEXT,
        last_name TEXT,
        photo_url TEXT,
        photo_file_id TEXT,
        auth_date INTEGER,
        allows_write_to_pm INTEGER,
        role TEXT NOT NULL DEFAULT 'user',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`);
      await db.execute(
        `CREATE INDEX IF NOT EXISTS idx_akun_telegram_name
         ON "akun-telegram"(first_name, last_name)`,
      );
      await db.execute(
        `CREATE INDEX IF NOT EXISTS idx_akun_telegram_username
         ON "akun-telegram"(username)`,
      );
      const accountColumns = await db.execute(
        `PRAGMA table_info("akun-telegram")`,
      );
      const knownColumns = new Set(
        accountColumns.rows.map((row) =>
          String((row as unknown as Record<string, unknown>).name ?? ""),
        ),
      );
      if (!knownColumns.has("allows_write_to_pm")) {
        await db.execute(
          `ALTER TABLE "akun-telegram" ADD COLUMN allows_write_to_pm INTEGER`,
        );
      }
      await db.execute({
        sql: `INSERT OR IGNORE INTO "akun-telegram"
          (uid, username, first_name, last_name, photo_url, photo_file_id, auth_date, allows_write_to_pm, role, created_at, updated_at)
         SELECT uid, username, first_name, last_name, NULL, photo_file_id, NULL, NULL, role,
                COALESCE(created_at, ?), COALESCE(updated_at, ?)
         FROM telegram_users`,
        args: [new Date().toISOString(), new Date().toISOString()],
      });
    })().catch((error) => {
      telegramAccountsReady = null;
      throw error;
    });
  }
  await telegramAccountsReady;
}

export async function getTelegramUser(uid: number): Promise<TelegramUser | null> {
  try {
    await ensureTelegramAccountsTable();
    const result = await getTurso().execute({
      sql: `SELECT * FROM "akun-telegram" WHERE uid = ? LIMIT 1`,
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
    photo_url?: string | null;
    photo_file_id?: string | null;
    auth_date?: number | null;
    allows_write_to_pm?: boolean | null;
    role?: string;
  },
): Promise<void> {
  try {
    await upsertTelegramAccount(uid, data);
  } catch (err) {
    console.error("upsertTelegramUser error:", err);
  }
}

export async function upsertVerifiedTelegramUser(
  uid: number,
  data: {
    username: string | null;
    first_name: string | null;
    last_name: string | null;
    photo_url: string | null;
    auth_date: number;
    allows_write_to_pm: boolean | null;
  },
): Promise<void> {
  await upsertTelegramAccount(uid, { ...data, role: "user" });
}

async function upsertTelegramAccount(
  uid: number,
  data: {
    username?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    photo_url?: string | null;
    photo_file_id?: string | null;
    auth_date?: number | null;
    allows_write_to_pm?: boolean | null;
    role?: string;
  },
): Promise<void> {
  const now = new Date().toISOString();
  await ensureTelegramAccountsTable();
  await getTurso().execute({
    sql: `INSERT INTO "akun-telegram"
            (uid, username, first_name, last_name, photo_url, photo_file_id, auth_date, allows_write_to_pm, role, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(uid) DO UPDATE SET
            username = COALESCE(excluded.username, "akun-telegram".username),
            first_name = COALESCE(excluded.first_name, "akun-telegram".first_name),
            last_name = COALESCE(excluded.last_name, "akun-telegram".last_name),
            photo_url = COALESCE(excluded.photo_url, "akun-telegram".photo_url),
            photo_file_id = COALESCE(excluded.photo_file_id, "akun-telegram".photo_file_id),
            auth_date = COALESCE(excluded.auth_date, "akun-telegram".auth_date),
            allows_write_to_pm = COALESCE(excluded.allows_write_to_pm, "akun-telegram".allows_write_to_pm),
            role = COALESCE(excluded.role, "akun-telegram".role),
            updated_at = excluded.updated_at`,
    args: [
      uid,
      data.username ?? null,
      data.first_name ?? null,
      data.last_name ?? null,
      data.photo_url ?? null,
      data.photo_file_id ?? null,
      data.auth_date ?? null,
      data.allows_write_to_pm == null
        ? null
        : data.allows_write_to_pm
          ? 1
          : 0,
      data.role ?? "user",
      now,
      now,
    ],
  });

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
    console.error("upsert legacy telegram_users mirror error:", err);
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

export type DirectMessage = {
  id: string;
  sender_uid: number;
  recipient_uid: number;
  content: string;
  created_at: string;
  delivered_at: string | null;
  read_at: string | null;
};

export type DirectConversation = {
  user: TelegramUser;
  last_message: DirectMessage;
  unread: number;
};

let directMessagesReady: Promise<void> | null = null;

async function ensureDirectMessagesTable(): Promise<void> {
  if (!directMessagesReady) {
    directMessagesReady = (async () => {
      const db = getTurso();
      await db.execute(`CREATE TABLE IF NOT EXISTS direct_messages (
        id TEXT PRIMARY KEY,
        sender_uid INTEGER NOT NULL,
        recipient_uid INTEGER NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL,
        delivered_at TEXT,
        read_at TEXT
      )`);
      await db.execute(
        `CREATE INDEX IF NOT EXISTS idx_direct_messages_participants
         ON direct_messages(sender_uid, recipient_uid, created_at)`,
      );
      await db.execute(
        `CREATE INDEX IF NOT EXISTS idx_direct_messages_recipient_unread
         ON direct_messages(recipient_uid, read_at, created_at)`,
      );
    })().catch((error) => {
      directMessagesReady = null;
      throw error;
    });
  }
  await directMessagesReady;
}

function rowToDirectMessage(row: Record<string, unknown>): DirectMessage {
  return {
    id: String(row.id ?? ""),
    sender_uid: Number(row.sender_uid ?? 0),
    recipient_uid: Number(row.recipient_uid ?? 0),
    content: String(row.content ?? ""),
    created_at: String(row.created_at ?? ""),
    delivered_at: row.delivered_at == null ? null : String(row.delivered_at),
    read_at: row.read_at == null ? null : String(row.read_at),
  };
}

export async function searchTelegramUsers(
  query: string,
  excludeUid: number,
  limit = 30,
): Promise<TelegramUser[]> {
  const term = query.trim().replace(/^@/, "").toLowerCase();
  if (!term) return [];
  await ensureTelegramAccountsTable();
  const match = `%${term.replace(/[\\%_]/g, "\\$&")}%`;
  const result = await getTurso().execute({
    sql: `SELECT * FROM "akun-telegram"
          WHERE uid != ? AND (
            LOWER(COALESCE(username, '')) LIKE ? ESCAPE '\\'
            OR LOWER(COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')) LIKE ? ESCAPE '\\'
          )
          ORDER BY
            CASE WHEN LOWER(COALESCE(username, '')) = ? THEN 0 ELSE 1 END,
            first_name COLLATE NOCASE, last_name COLLATE NOCASE
          LIMIT ?`,
    args: [excludeUid, match, match, term, limit],
  });
  return result.rows.map((row) =>
    rowToTelegramUser(row as unknown as Record<string, unknown>),
  );
}

export async function listDirectMessages(
  uid: number,
  contactUid: number,
  limit = 500,
): Promise<DirectMessage[]> {
  await ensureDirectMessagesTable();
  const result = await getTurso().execute({
    sql: `SELECT * FROM direct_messages
          WHERE (sender_uid = ? AND recipient_uid = ?)
             OR (sender_uid = ? AND recipient_uid = ?)
          ORDER BY created_at ASC LIMIT ?`,
    args: [uid, contactUid, contactUid, uid, limit],
  });
  return result.rows.map((row) =>
    rowToDirectMessage(row as unknown as Record<string, unknown>),
  );
}

export async function createDirectMessage(
  senderUid: number,
  recipientUid: number,
  content: string,
): Promise<DirectMessage> {
  await ensureDirectMessagesTable();
  const message: DirectMessage = {
    id: genMessageId(),
    sender_uid: senderUid,
    recipient_uid: recipientUid,
    content,
    created_at: new Date().toISOString(),
    delivered_at: new Date().toISOString(),
    read_at: null,
  };
  await getTurso().execute({
    sql: `INSERT INTO direct_messages
          (id, sender_uid, recipient_uid, content, created_at, delivered_at, read_at)
          VALUES (?, ?, ?, ?, ?, ?, NULL)`,
    args: [
      message.id,
      message.sender_uid,
      message.recipient_uid,
      message.content,
      message.created_at,
      message.delivered_at,
    ],
  });
  return message;
}

export async function markDirectMessagesRead(
  readerUid: number,
  senderUid: number,
): Promise<void> {
  await ensureDirectMessagesTable();
  await getTurso().execute({
    sql: `UPDATE direct_messages SET read_at = ?
          WHERE sender_uid = ? AND recipient_uid = ? AND read_at IS NULL`,
    args: [new Date().toISOString(), senderUid, readerUid],
  });
}

export async function listDirectConversations(
  uid: number,
): Promise<DirectConversation[]> {
  await ensureDirectMessagesTable();
  const result = await getTurso().execute({
    sql: `SELECT dm.*,
            CASE WHEN dm.sender_uid = ? THEN dm.recipient_uid ELSE dm.sender_uid END AS peer_uid
          FROM direct_messages dm
          WHERE dm.sender_uid = ? OR dm.recipient_uid = ?
          ORDER BY dm.created_at DESC`,
    args: [uid, uid, uid],
  });
  const seen = new Set<number>();
  const latest: Array<{ peerUid: number; message: DirectMessage }> = [];
  for (const raw of result.rows) {
    const row = raw as unknown as Record<string, unknown>;
    const peerUid = Number(row.peer_uid);
    if (seen.has(peerUid)) continue;
    seen.add(peerUid);
    latest.push({ peerUid, message: rowToDirectMessage(row) });
  }
  return Promise.all(
    latest.map(async ({ peerUid, message }) => {
      const user = await getTelegramUser(peerUid);
      if (!user) return null;
      const unreadResult = await getTurso().execute({
        sql: `SELECT COUNT(*) AS c FROM direct_messages
              WHERE sender_uid = ? AND recipient_uid = ? AND read_at IS NULL`,
        args: [peerUid, uid],
      });
      return {
        user,
        last_message: message,
        unread: Number(unreadResult.rows[0]?.c ?? 0),
      };
    }),
  ).then((items) => items.filter((item): item is DirectConversation => item !== null));
}

export async function getLatestDirectMessage(
  uid: number,
): Promise<DirectMessage | null> {
  await ensureDirectMessagesTable();
  const result = await getTurso().execute({
    sql: `SELECT * FROM direct_messages
          WHERE sender_uid = ? OR recipient_uid = ?
          ORDER BY created_at DESC LIMIT 1`,
    args: [uid, uid],
  });
  if (result.rows.length === 0) return null;
  return rowToDirectMessage(
    result.rows[0] as unknown as Record<string, unknown>,
  );
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

export type PushSubscriptionRow = {
  endpoint: string;
  uid: number;
  device_id: string | null;
  p256dh: string;
  auth: string;
  created_at: string;
  updated_at: string;
};

function rowToPushSubscription(row: Record<string, unknown>): PushSubscriptionRow {
  return {
    endpoint: String(row.endpoint ?? ""),
    uid: Number(row.uid ?? 0),
    device_id: row.device_id == null ? null : String(row.device_id),
    p256dh: String(row.p256dh ?? ""),
    auth: String(row.auth ?? ""),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

export async function upsertPushSubscription(data: {
  endpoint: string;
  uid: number;
  deviceId: string | null;
  p256dh: string;
  auth: string;
}): Promise<void> {
  const now = new Date().toISOString();
  try {
    await getTurso().execute({
      sql: `INSERT INTO push_subscriptions
              (endpoint, uid, device_id, p256dh, auth, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(endpoint) DO UPDATE SET
              uid = excluded.uid,
              device_id = excluded.device_id,
              p256dh = excluded.p256dh,
              auth = excluded.auth,
              updated_at = excluded.updated_at`,
      args: [
        data.endpoint,
        data.uid,
        data.deviceId,
        data.p256dh,
        data.auth,
        now,
        now,
      ],
    });
  } catch (err) {
    console.error("upsertPushSubscription error:", err);
  }
}

export async function deletePushSubscription(
  endpoint: string,
  uid: number,
): Promise<void> {
  await getTurso().execute({
    sql: "DELETE FROM push_subscriptions WHERE endpoint = ? AND uid = ?",
    args: [endpoint, uid],
  });
}

export async function listPushSubscriptions(
  uid: number,
): Promise<PushSubscriptionRow[]> {
  try {
    const result = await getTurso().execute({
      sql: "SELECT * FROM push_subscriptions WHERE uid = ?",
      args: [uid],
    });
    return result.rows.map((r) =>
      rowToPushSubscription(r as unknown as Record<string, unknown>),
    );
  } catch {
    return [];
  }
}
