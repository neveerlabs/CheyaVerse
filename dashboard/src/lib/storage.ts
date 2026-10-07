import { getDatabase, type DatabaseStatement } from "./database";
import { config } from "./config";
import { deleteUserMediaObject, isUserMediaPath } from "./supabase-storage";

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
  const result = await getDatabase().execute({
    sql: "SELECT * FROM media WHERE id = ? LIMIT 1",
    args: [mediaId],
  });
  if (result.rows.length === 0) return null;
  return rowToMedia(result.rows[0] as unknown as Record<string, unknown>);
}

export async function listRecentMedia(uid: number, limit = 50): Promise<MediaMeta[]> {
  const result = await getDatabase().execute({
    sql: "SELECT * FROM media WHERE owner_id = ? ORDER BY expires_at DESC LIMIT ?",
    args: [uid, limit],
  });
  return result.rows.map((r) => rowToMedia(r as unknown as Record<string, unknown>));
}

export async function getStats(uid: number) {
  const nowIso = new Date().toISOString();
  const [totalRes, activeRes] = await Promise.all([
    getDatabase().execute({
      sql: "SELECT COUNT(*) as c FROM media WHERE owner_id = ?",
      args: [uid],
    }),
    getDatabase().execute({
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
    const result = await getDatabase().execute({
      sql: "DELETE FROM media WHERE id = ?",
      args: [mediaId],
    });
    if (result.rowsAffected === 0) return { ok: false, reason: "db_error" };

    if (meta.owner_id && isUserMediaPath(meta.owner_id, meta.storage_path)) {
      await deleteUserMediaObject(meta.owner_id, meta.storage_path).catch((error) => {
        console.warn(`Failed to delete Supabase Storage object for media ${mediaId}:`, error);
      });
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
    await getDatabase().execute({
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
    await getDatabase().execute({
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
    const result = await getDatabase().execute({
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
    await getDatabase().execute({
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
    await getDatabase().execute({
      sql: "DELETE FROM user_covers WHERE uid = ?",
      args: [uid],
    });
    if (existing?.storage_path && isUserMediaPath(uid, existing.storage_path)) {
      await deleteUserMediaObject(uid, existing.storage_path).catch((error) => {
        console.warn(`Failed to delete Supabase Storage cover for account ${uid}:`, error);
      });
    }
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
  is_pinned: boolean;
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
    is_pinned: Number(row.is_pinned ?? 0) === 1,
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
    await getDatabase().execute({
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
      is_pinned: false,
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
    const existing = await getDatabase().execute({
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
      `Login berhasil dilakukan dengan akun Telegram untuk akun ${userMention}. Perangkat ini sekarang terhubung ke akun CheyaVerse Anda.`,
      "",
      "<b>Session active:</b>",
      `• <b>Perangkat:</b> ${deviceLine}`,
      `• <b>Hardware:</b> ${hardwareLine}`,
      `• <b>Browser:</b> ${browserLine}`,
      `• <b>Waktu:</b> ${waktu}`,
      "",
      "⚠️ <b>PERINGATAN KEAMANAN:</b> Jangan bagikan kode login Telegram atau sesi browser Anda. Login dari perangkat baru akan dikirim sebagai laporan keamanan langsung melalui bot Telegram.",
      "",
      "<i>Jika ini adalah aktivitas Anda, tidak ada tindakan lebih lanjut yang diperlukan. Selamat menggunakan layanan CheyaVerse.</i>",
    ].join("\n");

    const createdAt = new Date().toISOString();

    const result = await getDatabase().execute({
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
    await ensureChatMessageActions();
    const result = await getDatabase().execute({
      sql: `SELECT notifications.*,
                   EXISTS (
                     SELECT 1 FROM chat_notification_pins pins
                     WHERE pins.uid = notifications.uid AND pins.notification_id = notifications.id
                   ) AS is_pinned
            FROM notifications
            WHERE uid = ?
            ORDER BY created_at DESC LIMIT ?`,
      args: [uid, limit],
    });
    return result.rows.map((r) => rowToNotification(r as unknown as Record<string, unknown>));
  } catch (error) {
    console.error("[notifications] failed to list notifications:", error);
    throw error;
  }
}

export async function countNotifications(uid: number): Promise<number> {
  try {
    const result = await getDatabase().execute({
      sql: "SELECT COUNT(*) as c FROM notifications WHERE uid = ?",
      args: [uid],
    });
    return Number(result.rows[0]?.c ?? 0);
  } catch {
    return 0;
  }
}

export async function countUnreadNotifications(uid: number): Promise<number> {
  const result = await getDatabase().execute({
    sql: "SELECT COUNT(*) as c FROM notifications WHERE uid = ? AND read = 0",
    args: [uid],
  });
  return Number(result.rows[0]?.c ?? 0);
}

export async function markNotificationsRead(uid: number): Promise<void> {
  await getDatabase().execute({
    sql: "UPDATE notifications SET read = 1 WHERE uid = ? AND read = 0",
    args: [uid],
  });
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
  viewport_w: number | null;
  viewport_h: number | null;
  screen_avail_w: number | null;
  screen_avail_h: number | null;
  pixel_ratio: number | null;
  orientation: string | null;
  color_gamut: string | null;
  network_type: string | null;
  browser_version: string | null;
  ua_architecture: string | null;
  ua_platform_version: string | null;
  ua_bitness: string | null;
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
    viewport_w: row.viewport_w == null ? null : Number(row.viewport_w),
    viewport_h: row.viewport_h == null ? null : Number(row.viewport_h),
    screen_avail_w:
      row.screen_avail_w == null ? null : Number(row.screen_avail_w),
    screen_avail_h:
      row.screen_avail_h == null ? null : Number(row.screen_avail_h),
    pixel_ratio: row.pixel_ratio == null ? null : Number(row.pixel_ratio),
    orientation: row.orientation == null ? null : String(row.orientation),
    color_gamut: row.color_gamut == null ? null : String(row.color_gamut),
    network_type: row.network_type == null ? null : String(row.network_type),
    browser_version:
      row.browser_version == null ? null : String(row.browser_version),
    ua_architecture:
      row.ua_architecture == null ? null : String(row.ua_architecture),
    ua_platform_version:
      row.ua_platform_version == null ? null : String(row.ua_platform_version),
    ua_bitness: row.ua_bitness == null ? null : String(row.ua_bitness),
    first_seen: String(row.first_seen ?? ""),
    last_seen: String(row.last_seen ?? ""),
  };
}

type DeviceFingerprintDetails = Pick<
  DeviceIdRow,
  | "model"
  | "language"
  | "timezone"
  | "platform"
  | "max_touch"
  | "color_depth"
  | "webgl_vendor"
  | "webgl_renderer"
  | "screen_w"
  | "screen_h"
  | "viewport_w"
  | "viewport_h"
  | "screen_avail_w"
  | "screen_avail_h"
  | "pixel_ratio"
  | "orientation"
  | "color_gamut"
  | "network_type"
  | "browser_version"
  | "ua_architecture"
  | "ua_platform_version"
  | "ua_bitness"
>;

let deviceFingerprintColumnsReady: Promise<void> | null = null;

async function ensureDeviceFingerprintColumns(): Promise<void> {
  if (!deviceFingerprintColumnsReady) {
    deviceFingerprintColumnsReady = (async () => {
      const db = getDatabase();
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
        ["viewport_w", "INTEGER"],
        ["viewport_h", "INTEGER"],
        ["screen_avail_w", "INTEGER"],
        ["screen_avail_h", "INTEGER"],
        ["pixel_ratio", "REAL"],
        ["orientation", "TEXT"],
        ["color_gamut", "TEXT"],
        ["network_type", "TEXT"],
        ["browser_version", "TEXT"],
        ["ua_architecture", "TEXT"],
        ["ua_platform_version", "TEXT"],
        ["ua_bitness", "TEXT"],
      ];
      for (const [name, type] of columns) {
        if (!existing.has(name)) {
          try {
            await db.execute(`ALTER TABLE device_ids ADD COLUMN ${name} ${type}`);
          } catch (error) {
            const refreshed = await db.execute("PRAGMA table_info(device_ids)");
            const wasAdded = refreshed.rows.some(
              (row) =>
                String(
                  (row as unknown as Record<string, unknown>).name ?? "",
                ) === name,
            );
            if (!wasAdded) throw error;
          }
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
  const result = await getDatabase().execute({
    sql: "SELECT * FROM device_ids WHERE device_id = ? AND uid = ? LIMIT 1",
    args: [deviceId, uid],
  });
  if (result.rows.length === 0) return null;
  return rowToDeviceId(result.rows[0] as unknown as Record<string, unknown>);
}

export async function listDeviceIdsForUid(
  uid: number,
  limit?: number,
): Promise<DeviceIdRow[]> {
  await ensureDeviceFingerprintColumns();
  const result = await getDatabase().execute({
    sql: `SELECT * FROM device_ids
          WHERE uid = ?
          ORDER BY last_seen DESC
          ${limit === undefined ? "" : "LIMIT ?"}`,
    args: limit === undefined
      ? [uid]
      : [uid, Math.max(1, Math.min(100, Math.floor(limit)))],
  });
  return result.rows.map((row) =>
    rowToDeviceId(row as unknown as Record<string, unknown>),
  );
}

export async function listBlacklistedDeviceIds(uid: number): Promise<string[]> {
  const result = await getDatabase().execute({
    sql: "SELECT device_id FROM session_blacklist WHERE uid = ?",
    args: [uid],
  });
  return result.rows.map((row) => String(row.device_id ?? ""));
}

let accountSessionVersionsReady: Promise<void> | null = null;

async function ensureAccountSessionVersionsTable(): Promise<void> {
  if (!accountSessionVersionsReady) {
    accountSessionVersionsReady = getDatabase()
      .execute(`CREATE TABLE IF NOT EXISTS account_session_versions (
        uid INTEGER PRIMARY KEY,
        session_version INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      )`)
      .then(() => undefined)
      .catch((error) => {
        accountSessionVersionsReady = null;
        throw error;
      });
  }
  await accountSessionVersionsReady;
}

export async function getAccountSessionVersion(uid: number): Promise<number> {
  await ensureAccountSessionVersionsTable();
  const result = await getDatabase().execute({
    sql: "SELECT session_version FROM account_session_versions WHERE uid = ? LIMIT 1",
    args: [uid],
  });
  return Number(result.rows[0]?.session_version ?? 0);
}

export async function incrementAccountSessionVersion(uid: number): Promise<number> {
  await ensureAccountSessionVersionsTable();
  const result = await getDatabase().execute({
    sql: `INSERT INTO account_session_versions (uid, session_version, updated_at)
          VALUES (?, 1, ?)
          ON CONFLICT(uid) DO UPDATE SET
            session_version = account_session_versions.session_version + 1,
            updated_at = excluded.updated_at
          RETURNING session_version`,
    args: [uid, new Date().toISOString()],
  });
  const version = Number(result.rows[0]?.session_version);
  if (!Number.isSafeInteger(version) || version < 1) {
    throw new Error("Could not increment the account session version.");
  }
  return version;
}

let webPresenceTableReady: Promise<void> | null = null;

async function ensureWebPresenceTable(): Promise<void> {
  if (!webPresenceTableReady) {
    webPresenceTableReady = (async () => {
      const database = getDatabase();
      await database.execute(`CREATE TABLE IF NOT EXISTS web_presence (
          uid BIGINT NOT NULL,
          device_id TEXT NOT NULL,
          last_seen TEXT NOT NULL,
          PRIMARY KEY (uid, device_id)
        )`);
      await database.execute("ALTER TABLE web_presence ENABLE ROW LEVEL SECURITY");
      await database.execute(
        "REVOKE ALL ON web_presence FROM anon, authenticated",
      );
    })()
      .catch((error) => {
        webPresenceTableReady = null;
        throw error;
      });
  }
  await webPresenceTableReady;
}

export async function touchWebPresence(
  uid: number,
  deviceId: string,
): Promise<void> {
  await ensureWebPresenceTable();
  const now = new Date().toISOString();
  await getDatabase().execute({
    sql: `INSERT INTO web_presence (uid, device_id, last_seen)
          VALUES (?, ?, ?)
          ON CONFLICT(uid, device_id) DO UPDATE SET last_seen = excluded.last_seen`,
    args: [uid, deviceId, now],
  });
}

export async function listOnlineWebPresence(
  uids: number[],
  withinMs = 55_000,
): Promise<Set<number>> {
  const uniqueUids = Array.from(
    new Set(uids.filter((uid) => Number.isSafeInteger(uid) && uid > 0)),
  );
  if (uniqueUids.length === 0) return new Set();
  await ensureWebPresenceTable();
  const cutoff = new Date(Date.now() - withinMs).toISOString();
  const result = await getDatabase().execute({
    sql: `SELECT DISTINCT uid FROM web_presence
          WHERE uid IN (${uniqueUids.map(() => "?").join(", ")})
            AND last_seen >= ?`,
    args: [...uniqueUids, cutoff],
  });
  return new Set(result.rows.map((row) => Number(row.uid)));
}

export async function getTelegramWebLoginStatus(uid: number): Promise<{
  telegramId: number;
  accountFound: boolean;
  role: string | null;
  hasLoggedIntoWeb: boolean;
  activeOnWebNow: boolean;
  retrievedAt: string;
}> {
  await Promise.all([
    ensureTelegramAccountsTable(),
    ensureDeviceAccountStateTable(),
    ensureWebPresenceTable(),
  ]);
  const activeCutoff = new Date(Date.now() - 55_000).toISOString();
  const result = await getDatabase().execute({
    sql: `SELECT accounts.role,
                 EXISTS (
                   SELECT 1 FROM device_ids devices
                   WHERE devices.uid = accounts.uid
                 ) AS has_logged_into_web,
                 EXISTS (
                   SELECT 1
                   FROM device_account_state state
                   INNER JOIN web_presence presence
                     ON presence.device_id = state.device_id
                   WHERE state.current_uid = accounts.uid
                     AND presence.uid = accounts.uid
                     AND presence.last_seen >= ?
                 ) AS active_on_web_now
          FROM "akun-telegram" accounts
          WHERE accounts.uid = ?
          LIMIT 1`,
    args: [activeCutoff, uid],
  });
  const row = result.rows[0];
  const asBoolean = (value: unknown) =>
    value === true || value === 1 || value === "1" || value === "t";
  return {
    telegramId: uid,
    accountFound: Boolean(row),
    role: row?.role == null ? null : String(row.role),
    hasLoggedIntoWeb: asBoolean(row?.has_logged_into_web),
    activeOnWebNow: asBoolean(row?.active_on_web_now),
    retrievedAt: new Date().toISOString(),
  };
}

export async function getAccountSessionState(
  uid: number,
): Promise<{ sessionVersion: number; active: boolean }> {
  await Promise.all([
    ensureAccountSessionVersionsTable(),
    ensureTelegramAccountsTable(),
  ]);
  const result = await getDatabase().execute({
    sql: `SELECT COALESCE(versions.session_version, 0) AS session_version,
                 accounts.role AS role
          FROM "akun-telegram" AS accounts
          LEFT JOIN account_session_versions AS versions ON versions.uid = accounts.uid
          WHERE accounts.uid = ? LIMIT 1`,
    args: [uid],
  });
  if (!result.rows.length) return { sessionVersion: 0, active: false };
  return {
    sessionVersion: Number(result.rows[0].session_version ?? 0),
    active: String(result.rows[0].role ?? "user") !== "deleted",
  };
}

export type DeviceAccount = {
  uid: number;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  photoUrl: string | null;
  sessionVersion: number;
};

export async function listActiveAccountsForDevice(
  deviceId: string,
  uid?: number,
): Promise<DeviceAccount[]> {
  await Promise.all([
    ensureAccountSessionVersionsTable(),
    ensureTelegramAccountsTable(),
  ]);
  const result = await getDatabase().execute({
    sql: `SELECT accounts.uid,
                 accounts.username,
                 accounts.first_name,
                 accounts.last_name,
                 accounts.photo_url,
                 COALESCE(versions.session_version, 0) AS session_version
          FROM device_ids AS devices
          INNER JOIN "akun-telegram" AS accounts ON accounts.uid = devices.uid
          LEFT JOIN account_session_versions AS versions ON versions.uid = accounts.uid
          WHERE devices.device_id = ?
            AND accounts.role <> 'deleted'
            AND NOT EXISTS (
              SELECT 1 FROM session_blacklist AS blocked
              WHERE blocked.device_id = devices.device_id
                AND blocked.uid = devices.uid
            )
            ${uid === undefined ? "" : "AND devices.uid = ?"}
          ORDER BY devices.last_seen DESC, accounts.uid ASC`,
    args: uid === undefined ? [deviceId] : [deviceId, uid],
  });
  return result.rows.map((row) => ({
    uid: Number(row.uid),
    username: row.username == null ? null : String(row.username),
    firstName: row.first_name == null ? null : String(row.first_name),
    lastName: row.last_name == null ? null : String(row.last_name),
    photoUrl: row.photo_url == null ? null : String(row.photo_url),
    sessionVersion: Number(row.session_version ?? 0),
  }));
}

export async function restoreDeletedTelegramAccount(
  uid: number,
): Promise<void> {
  await ensureTelegramAccountsTable();
  const now = new Date().toISOString();
  await getDatabase().batch(
    [
      {
        sql: `UPDATE "akun-telegram"
              SET role = 'user', updated_at = ?
              WHERE uid = ? AND role = 'deleted'`,
        args: [now, uid],
      },
      {
        sql: `UPDATE telegram_users
              SET role = 'user', updated_at = ?
              WHERE uid = ? AND role = 'deleted'`,
        args: [now, uid],
      },
    ],
    "write",
  );
}

export async function findDeviceIdByFingerprint(
  uid: number,
  fingerprint: string,
): Promise<DeviceIdRow | null> {
  await ensureDeviceFingerprintColumns();
  try {
    const result = await getDatabase().execute({
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
  const result = await getDatabase().execute({
    sql: `INSERT OR IGNORE INTO device_ids
            (device_id, uid, fingerprint, device_type, os, brand, model, browser, cpu_cores, ram_gb, user_agent,
             language, timezone, platform, max_touch, color_depth, webgl_vendor, webgl_renderer, screen_w, screen_h,
             viewport_w, viewport_h, screen_avail_w, screen_avail_h, pixel_ratio, orientation, color_gamut,
             network_type, browser_version, ua_architecture, ua_platform_version, ua_bitness, first_seen, last_seen)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      row.viewport_w,
      row.viewport_h,
      row.screen_avail_w,
      row.screen_avail_h,
      row.pixel_ratio,
      row.orientation,
      row.color_gamut,
      row.network_type,
      row.browser_version,
      row.ua_architecture,
      row.ua_platform_version,
      row.ua_bitness,
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
    await getDatabase().execute({
      sql: "UPDATE device_ids SET last_seen = ? WHERE device_id = ? AND uid = ?",
      args: [now, deviceId, uid],
    });
  } catch {}
}

let deviceAccountStateReady: Promise<void> | null = null;

async function ensureDeviceAccountStateTable(): Promise<void> {
  if (!deviceAccountStateReady) {
    deviceAccountStateReady = (async () => {
      const database = getDatabase();
      await database.execute(`CREATE TABLE IF NOT EXISTS device_account_state (
          device_id TEXT PRIMARY KEY,
          current_uid BIGINT,
          updated_at TEXT NOT NULL
        )`);
      await database.execute(
        "ALTER TABLE device_account_state ENABLE ROW LEVEL SECURITY",
      );
      await database.execute(
        "REVOKE ALL ON device_account_state FROM anon, authenticated",
      );
    })()
      .catch((error) => {
        deviceAccountStateReady = null;
        throw error;
      });
  }
  await deviceAccountStateReady;
}

export async function setDeviceAccountState(
  deviceId: string,
  uid: number | null,
): Promise<void> {
  if (!/^\d{10}$/.test(deviceId)) {
    throw new Error("Invalid DeviceID.");
  }
  if (uid !== null && (!Number.isSafeInteger(uid) || uid <= 0)) {
    throw new Error("Invalid account ID for DeviceID.");
  }
  await ensureDeviceAccountStateTable();
  await getDatabase().execute({
    sql: `INSERT INTO device_account_state (device_id, current_uid, updated_at)
          VALUES (?, ?, ?)
          ON CONFLICT(device_id) DO UPDATE SET
            current_uid = excluded.current_uid,
            updated_at = excluded.updated_at`,
    args: [deviceId, uid, new Date().toISOString()],
  });
}

export async function updateDeviceFingerprint(
  deviceId: string,
  uid: number,
  fingerprint: string,
  details: DeviceFingerprintDetails,
): Promise<void> {
  await ensureDeviceFingerprintColumns();
  const now = new Date().toISOString();
  await getDatabase().execute({
    sql: `UPDATE device_ids
          SET fingerprint = ?, last_seen = ?, model = COALESCE(?, model),
              language = ?, timezone = ?, platform = ?,
              max_touch = ?, color_depth = ?, webgl_vendor = ?, webgl_renderer = ?, screen_w = ?, screen_h = ?,
              viewport_w = ?, viewport_h = ?, screen_avail_w = ?, screen_avail_h = ?, pixel_ratio = ?,
              orientation = ?, color_gamut = ?, network_type = ?, browser_version = ?,
              ua_architecture = ?, ua_platform_version = ?, ua_bitness = ?
          WHERE device_id = ? AND uid = ?`,
    args: [
      fingerprint,
      now,
      details.model,
      details.language,
      details.timezone,
      details.platform,
      details.max_touch,
      details.color_depth,
      details.webgl_vendor,
      details.webgl_renderer,
      details.screen_w,
      details.screen_h,
      details.viewport_w,
      details.viewport_h,
      details.screen_avail_w,
      details.screen_avail_h,
      details.pixel_ratio,
      details.orientation,
      details.color_gamut,
      details.network_type,
      details.browser_version,
      details.ua_architecture,
      details.ua_platform_version,
      details.ua_bitness,
      deviceId,
      uid,
    ],
  });
}

export async function countDeviceIdsForUid(uid: number): Promise<number> {
  const result = await getDatabase().execute({
    sql: "SELECT COUNT(*) as c FROM device_ids WHERE uid = ?",
    args: [uid],
  });
  return Number(result.rows[0]?.c ?? 0);
}

export async function isDeviceBlacklisted(
  deviceId: string,
  uid: number,
): Promise<boolean> {
  const result = await getDatabase().execute({
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
  await getDatabase().execute({
    sql: "INSERT OR IGNORE INTO session_blacklist (device_id, uid, created_at) VALUES (?, ?, ?)",
    args: [deviceId, uid, createdAt],
  });
}

export async function removeDeviceFromBlacklist(
  deviceId: string,
  uid: number,
): Promise<void> {
  try {
    await getDatabase().execute({
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

export type TelegramLoginChallenge = {
  uid: number | null;
  status: "pending" | "approved" | "consumed";
  expires_at: number;
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
let telegramLoginChallengesReady: Promise<void> | null = null;
let accountPreferencesReady: Promise<void> | null = null;

async function ensureAccountPreferencesTable(): Promise<void> {
  if (!accountPreferencesReady) {
    accountPreferencesReady = getDatabase()
      .execute(`CREATE TABLE IF NOT EXISTS account_preferences (
        uid BIGINT PRIMARY KEY,
        display_name TEXT,
        updated_at TEXT NOT NULL
      )`)
      .then(async () => {
        await getDatabase().execute(
          "ALTER TABLE account_preferences ALTER COLUMN uid TYPE BIGINT USING uid::BIGINT",
        );
      })
      .then(() => undefined)
      .catch((error) => {
        accountPreferencesReady = null;
        throw error;
      });
  }
  await accountPreferencesReady;
}

export async function getAccountDisplayName(uid: number): Promise<string | null> {
  await ensureAccountPreferencesTable();
  const result = await getDatabase().execute({
    sql: "SELECT display_name FROM account_preferences WHERE uid = ? LIMIT 1",
    args: [uid],
  });
  const value = result.rows[0]?.display_name;
  return value == null ? null : String(value);
}

export async function saveAccountDisplayName(
  uid: number,
  displayName: string,
): Promise<void> {
  await ensureAccountPreferencesTable();
  await getDatabase().execute({
    sql: `INSERT INTO account_preferences (uid, display_name, updated_at)
          VALUES (?, ?, ?)
          ON CONFLICT(uid) DO UPDATE SET
            display_name = excluded.display_name,
            updated_at = excluded.updated_at`,
    args: [uid, displayName, new Date().toISOString()],
  });
}

export async function clearAccountDisplayName(uid: number): Promise<void> {
  await ensureAccountPreferencesTable();
  await getDatabase().execute({
    sql: "DELETE FROM account_preferences WHERE uid = ?",
    args: [uid],
  });
}

async function ensureTelegramAccountsTable(): Promise<void> {
  if (!telegramAccountsReady) {
    telegramAccountsReady = (async () => {
      const db = getDatabase();
      await db.execute(`CREATE TABLE IF NOT EXISTS "akun-telegram" (
        uid BIGINT PRIMARY KEY,
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
        'ALTER TABLE "akun-telegram" ALTER COLUMN uid TYPE BIGINT USING uid::BIGINT',
      );
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

async function ensureTelegramLoginChallengesTable(): Promise<void> {
  if (!telegramLoginChallengesReady) {
    telegramLoginChallengesReady = getDatabase()
      .execute(`CREATE TABLE IF NOT EXISTS telegram_login_challenges (
        challenge_hash TEXT PRIMARY KEY,
        requester_hash TEXT,
        uid INTEGER,
        status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'consumed')),
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        approved_at INTEGER,
        consumed_at INTEGER
      )`)
      .then(async () => {
        const columns = await getDatabase().execute(
          "PRAGMA table_info(telegram_login_challenges)",
        );
        const knownColumns = new Set(
          columns.rows.map((row) =>
            String((row as unknown as Record<string, unknown>).name ?? ""),
          ),
        );
        if (!knownColumns.has("requester_hash")) {
          await getDatabase().execute(
            "ALTER TABLE telegram_login_challenges ADD COLUMN requester_hash TEXT",
          );
        }
      })
      .catch((error) => {
        telegramLoginChallengesReady = null;
        throw error;
      });
  }
  await telegramLoginChallengesReady;
  await getDatabase().execute(
    `CREATE INDEX IF NOT EXISTS idx_login_challenges_requester_created
     ON telegram_login_challenges(requester_hash, created_at)`,
  );
}

export async function createTelegramLoginChallenge(
  challengeHash: string,
  expiresAt: number,
  requesterHash: string | null,
): Promise<boolean> {
  await ensureTelegramAccountsTable();
  await ensureTelegramLoginChallengesTable();
  const now = Math.floor(Date.now() / 1000);
  await getDatabase().execute({
    sql: "DELETE FROM telegram_login_challenges WHERE expires_at <= ?",
    args: [now],
  });
  if (requesterHash) {
    const recent = await getDatabase().execute({
      sql: `SELECT COUNT(*) AS count FROM telegram_login_challenges
            WHERE requester_hash = ? AND created_at > ?`,
      args: [requesterHash, now - 60],
    });
    if (Number(recent.rows[0]?.count ?? 0) >= 10) return false;
  }
  await getDatabase().execute({
    sql: `INSERT INTO telegram_login_challenges
          (challenge_hash, requester_hash, uid, status, created_at, expires_at)
          VALUES (?, ?, NULL, 'pending', ?, ?)`,
    args: [challengeHash, requesterHash, now, expiresAt],
  });
  return true;
}

export async function getChatNotification(uid: number, id: string): Promise<Notification | null> {
  await ensureChatMessageActions();
  const result = await getDatabase().execute({
    sql: `SELECT notifications.*,
                 EXISTS (
                   SELECT 1 FROM chat_notification_pins pins
                   WHERE pins.uid = notifications.uid AND pins.notification_id = notifications.id
                 ) AS is_pinned
          FROM notifications WHERE uid = ? AND id = ? LIMIT 1`,
    args: [uid, id],
  });
  return result.rows[0]
    ? rowToNotification(result.rows[0] as unknown as Record<string, unknown>)
    : null;
}

export async function deleteChatNotification(uid: number, id: string): Promise<boolean> {
  await ensureChatMessageActions();
  const result = await getDatabase().execute({
    sql: "DELETE FROM notifications WHERE uid = ? AND id = ?",
    args: [uid, id],
  });
  if (result.rowsAffected > 0) {
    await getDatabase().execute({
      sql: "DELETE FROM chat_notification_pins WHERE uid = ? AND notification_id = ?",
      args: [uid, id],
    });
  }
  return result.rowsAffected > 0;
}

export async function toggleChatNotificationPin(
  uid: number,
  id: string,
): Promise<boolean | null> {
  await ensureChatMessageActions();
  const notification = await getChatNotification(uid, id);
  if (!notification) return null;
  if (notification.is_pinned) {
    await getDatabase().execute({
      sql: "DELETE FROM chat_notification_pins WHERE uid = ? AND notification_id = ?",
      args: [uid, id],
    });
    return false;
  }
  await getDatabase().execute({
    sql: `INSERT OR IGNORE INTO chat_notification_pins (uid, notification_id, created_at)
          VALUES (?, ?, ?)`,
    args: [uid, id, new Date().toISOString()],
  });
  return true;
}

export async function getTelegramLoginChallenge(
  challengeHash: string,
): Promise<TelegramLoginChallenge | null> {
  await ensureTelegramLoginChallengesTable();
  const result = await getDatabase().execute({
    sql: `SELECT uid, status, expires_at FROM telegram_login_challenges
          WHERE challenge_hash = ? LIMIT 1`,
    args: [challengeHash],
  });
  if (result.rows.length === 0) return null;
  const row = result.rows[0] as unknown as Record<string, unknown>;
  const status = String(row.status);
  if (
    status !== "pending" &&
    status !== "approved" &&
    status !== "consumed"
  ) {
    return null;
  }
  return {
    uid: row.uid == null ? null : Number(row.uid),
    status,
    expires_at: Number(row.expires_at),
  };
}

export async function consumeTelegramLoginChallenge(
  challengeHash: string,
): Promise<number | null> {
  await ensureTelegramLoginChallengesTable();
  const now = Math.floor(Date.now() / 1000);
  const challenge = await getTelegramLoginChallenge(challengeHash);
  if (!challenge || challenge.status !== "approved" || !challenge.uid) return null;
  const result = await getDatabase().execute({
    sql: `UPDATE telegram_login_challenges
          SET status = 'consumed', consumed_at = ?
          WHERE challenge_hash = ? AND status = 'approved' AND expires_at > ?`,
    args: [now, challengeHash, now],
  });
  if (result.rowsAffected !== 1) return null;
  return challenge.uid;
}

export async function getTelegramUser(uid: number): Promise<TelegramUser | null> {
  try {
    await ensureTelegramAccountsTable();
    const result = await getDatabase().execute({
      sql: `SELECT * FROM "akun-telegram" WHERE uid = ? LIMIT 1`,
      args: [uid],
    });
    if (result.rows.length === 0) return null;
    return rowToTelegramUser(result.rows[0] as unknown as Record<string, unknown>);
  } catch {
    return null;
  }
}

let telegramGroupAiTablesReady: Promise<void> | null = null;

async function ensureTelegramGroupAiTables(): Promise<void> {
  if (!telegramGroupAiTablesReady) {
    telegramGroupAiTablesReady = (async () => {
      const database = getDatabase();
      await database.execute(`CREATE TABLE IF NOT EXISTS telegram_group_ai_settings (
        group_id BIGINT PRIMARY KEY,
        owner_uid BIGINT NOT NULL,
        group_title TEXT NOT NULL DEFAULT '',
        enabled INTEGER NOT NULL DEFAULT 1,
        send_enabled INTEGER NOT NULL DEFAULT 0,
        enabled_by BIGINT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`);
      await database.execute(
        "ALTER TABLE telegram_group_ai_settings ADD COLUMN IF NOT EXISTS send_enabled INTEGER NOT NULL DEFAULT 0",
      );
      await database.execute(`CREATE TABLE IF NOT EXISTS telegram_group_ai_consents (
        group_id BIGINT NOT NULL,
        telegram_uid BIGINT NOT NULL,
        display_name TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        consented_at TEXT NOT NULL,
        revoked_at TEXT,
        PRIMARY KEY (group_id, telegram_uid)
      )`);
      await database.execute(`CREATE TABLE IF NOT EXISTS telegram_group_ai_messages (
        id TEXT PRIMARY KEY,
        group_id BIGINT NOT NULL,
        telegram_message_id BIGINT NOT NULL,
        sender_uid BIGINT,
        sender_name TEXT NOT NULL,
        sender_kind TEXT NOT NULL,
        content TEXT NOT NULL,
        media_types TEXT NOT NULL DEFAULT '',
        reply_to_message_id BIGINT,
        created_at TEXT NOT NULL,
        UNIQUE (group_id, telegram_message_id)
      )`);
      await database.execute(`CREATE TABLE IF NOT EXISTS telegram_group_ai_insights (
        id TEXT PRIMARY KEY,
        group_id BIGINT NOT NULL,
        owner_uid BIGINT NOT NULL,
        telegram_message_id BIGINT NOT NULL,
        summary TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE (group_id, telegram_message_id)
      )`);
      await database.execute(`CREATE INDEX IF NOT EXISTS idx_telegram_group_ai_messages_time
        ON telegram_group_ai_messages(group_id, created_at DESC)`);
      await database.execute(`CREATE INDEX IF NOT EXISTS idx_telegram_group_ai_insights_time
        ON telegram_group_ai_insights(group_id, owner_uid, created_at DESC)`);
      await database.execute(`CREATE INDEX IF NOT EXISTS idx_telegram_group_ai_insights_search
        ON telegram_group_ai_insights USING GIN
        (to_tsvector('simple'::regconfig, summary))`);
      await database.execute(`WITH ranked_insights AS (
        SELECT ctid,
               ROW_NUMBER() OVER (
                 PARTITION BY group_id, owner_uid,
                   lower(regexp_replace(btrim(summary), '[[:space:]]+', ' ', 'g'))
                 ORDER BY created_at DESC, telegram_message_id DESC
               ) AS duplicate_rank
        FROM telegram_group_ai_insights
      )
      DELETE FROM telegram_group_ai_insights AS insight
      USING ranked_insights
      WHERE insight.ctid = ranked_insights.ctid
        AND ranked_insights.duplicate_rank > 1`);
      await database.execute(`CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_group_ai_insights_unique_summary
        ON telegram_group_ai_insights
        (group_id, owner_uid,
         lower(regexp_replace(btrim(summary), '[[:space:]]+', ' ', 'g')))`);
      await database.execute(`CREATE INDEX IF NOT EXISTS idx_telegram_group_ai_messages_search
        ON telegram_group_ai_messages USING GIN
        (to_tsvector('simple'::regconfig, content))`);
      for (const table of [
        "telegram_group_ai_settings",
        "telegram_group_ai_consents",
        "telegram_group_ai_messages",
        "telegram_group_ai_insights",
      ]) {
        await database.execute(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
        await database.execute(`REVOKE ALL ON ${table} FROM anon, authenticated`);
      }
    })().catch((error) => {
      telegramGroupAiTablesReady = null;
      throw error;
    });
  }
  await telegramGroupAiTablesReady;
}

export async function enableTelegramGroupAi(
  groupId: number,
  ownerUid: number,
  groupTitle: string,
  enabledBy: number,
): Promise<void> {
  await ensureTelegramGroupAiTables();
  const now = new Date().toISOString();
  await getDatabase().execute({
    sql: `INSERT INTO telegram_group_ai_settings
            (group_id, owner_uid, group_title, enabled, enabled_by, created_at, updated_at)
          VALUES (?, ?, ?, 1, ?, ?, ?)
          ON CONFLICT(group_id) DO UPDATE SET
            owner_uid = excluded.owner_uid,
            group_title = excluded.group_title,
            enabled = 1,
            enabled_by = excluded.enabled_by,
            updated_at = excluded.updated_at`,
    args: [groupId, ownerUid, groupTitle.slice(0, 200), enabledBy, now, now],
  });
}

export async function disableTelegramGroupAi(groupId: number): Promise<void> {
  await ensureTelegramGroupAiTables();
  const now = new Date().toISOString();
  await getDatabase().batch([
    {
      sql: `UPDATE telegram_group_ai_settings
            SET enabled = 0, updated_at = ?
            WHERE group_id = ?`,
      args: [now, groupId],
    },
    {
      sql: "DELETE FROM telegram_group_ai_messages WHERE group_id = ?",
      args: [groupId],
    },
    {
      sql: "DELETE FROM telegram_group_ai_insights WHERE group_id = ?",
      args: [groupId],
    },
    {
      sql: `UPDATE telegram_group_ai_consents
            SET is_active = 0, revoked_at = ?
            WHERE group_id = ? AND is_active = 1`,
      args: [now, groupId],
    },
  ]);
}

export async function setTelegramGroupAiSendPermission(
  groupId: number,
  ownerUid: number,
  enabled: boolean,
): Promise<boolean> {
  await ensureTelegramGroupAiTables();
  const result = await getDatabase().execute({
    sql: `UPDATE telegram_group_ai_settings
          SET send_enabled = ?, updated_at = ?
          WHERE group_id = ? AND owner_uid = ? AND enabled = 1`,
    args: [enabled ? 1 : 0, new Date().toISOString(), groupId, ownerUid],
  });
  return result.rowsAffected > 0;
}

export async function storeTelegramGroupAiInsight(input: {
  groupId: number;
  ownerUid: number;
  messageId: number;
  summary: string;
  replace?: boolean;
}): Promise<void> {
  const summary = input.summary.trim().slice(0, 1600);
  await ensureTelegramGroupAiTables();
  const statements: DatabaseStatement[] = [];
  if (input.replace) {
    statements.push({
      sql: `DELETE FROM telegram_group_ai_insights
            WHERE id = ?
              AND EXISTS (
                SELECT 1 FROM telegram_group_ai_settings
                WHERE group_id = ? AND owner_uid = ? AND enabled = 1
              )`,
      args: [
        `tgi-${input.groupId}-${input.messageId}`,
        input.groupId,
        input.ownerUid,
      ],
    });
  }
  if (!summary) {
    if (statements.length > 0) await getDatabase().batch(statements);
    return;
  }
  statements.push({
    sql: `INSERT INTO telegram_group_ai_insights
            (id, group_id, owner_uid, telegram_message_id, summary, created_at)
          SELECT ?, ?, ?, ?, ?, ?
          WHERE EXISTS (
            SELECT 1 FROM telegram_group_ai_settings
            WHERE group_id = ? AND owner_uid = ? AND enabled = 1
          )
          ON CONFLICT DO NOTHING`,
    args: [
      `tgi-${input.groupId}-${input.messageId}`,
      input.groupId,
      input.ownerUid,
      input.messageId,
      summary,
      new Date().toISOString(),
      input.groupId,
      input.ownerUid,
    ],
  });
  if (input.replace) {
    await getDatabase().batch(statements);
    return;
  }
  await getDatabase().execute({
    sql: statements[0].sql,
    args: statements[0].args,
  });
}

export async function getTelegramGroupAiInsight(
  groupId: number,
  ownerUid: number,
  messageId: number,
): Promise<string | null> {
  await ensureTelegramGroupAiTables();
  const result = await getDatabase().execute({
    sql: `SELECT summary FROM telegram_group_ai_insights
          WHERE group_id = ? AND owner_uid = ? AND telegram_message_id = ?
          LIMIT 1`,
    args: [groupId, ownerUid, messageId],
  });
  const summary = result.rows[0]?.summary;
  return typeof summary === "string" ? summary : null;
}

export async function setTelegramGroupAiConsent(
  groupId: number,
  telegramUid: number,
  displayName: string,
): Promise<boolean> {
  await ensureTelegramGroupAiTables();
  const now = new Date().toISOString();
  const result = await getDatabase().execute({
    sql: `INSERT INTO telegram_group_ai_consents
            (group_id, telegram_uid, display_name, is_active, consented_at, revoked_at)
          SELECT ?, ?, ?, 1, ?, NULL
          WHERE EXISTS (
            SELECT 1 FROM telegram_group_ai_settings
            WHERE group_id = ? AND enabled = 1
          )
          ON CONFLICT(group_id, telegram_uid) DO UPDATE SET
            display_name = excluded.display_name,
            is_active = 1,
            consented_at = excluded.consented_at,
            revoked_at = NULL`,
    args: [
      groupId,
      telegramUid,
      displayName.slice(0, 120),
      now,
      groupId,
    ],
  });
  return result.rowsAffected > 0;
}

export async function revokeTelegramGroupAiConsent(
  groupId: number,
  telegramUid: number,
): Promise<boolean> {
  await ensureTelegramGroupAiTables();
  const now = new Date().toISOString();
  const results = await getDatabase().batch([
    {
      sql: `UPDATE telegram_group_ai_consents
            SET is_active = 0, revoked_at = ?
            WHERE group_id = ? AND telegram_uid = ? AND is_active = 1`,
      args: [now, groupId, telegramUid],
    },
    {
      sql: `DELETE FROM telegram_group_ai_messages
            WHERE group_id = ?
              AND sender_kind = 'bot'
              AND reply_to_message_id IN (
                SELECT telegram_message_id
                FROM telegram_group_ai_messages
                WHERE group_id = ? AND sender_uid = ?
              )`,
      args: [groupId, groupId, telegramUid],
    },
    {
      sql: "DELETE FROM telegram_group_ai_messages WHERE group_id = ? AND sender_uid = ?",
      args: [groupId, telegramUid],
    },
  ]);
  return results[0].rowsAffected > 0;
}

export async function getTelegramGroupAiStatus(
  groupId: number,
  telegramUid?: number,
): Promise<{
  enabled: boolean;
  sendEnabled: boolean;
  consented: boolean;
  groupTitle: string;
  ownerUid: number | null;
}> {
  await ensureTelegramGroupAiTables();
  const result = await getDatabase().execute({
    sql: `SELECT settings.enabled, settings.send_enabled, settings.group_title, settings.owner_uid,
                 EXISTS (
                   SELECT 1 FROM telegram_group_ai_consents consent
                   WHERE consent.group_id = settings.group_id
                     AND consent.telegram_uid = ?
                     AND consent.is_active = 1
                 ) AS consented
          FROM telegram_group_ai_settings settings
          WHERE settings.group_id = ?
          LIMIT 1`,
    args: [telegramUid ?? 0, groupId],
  });
  const row = result.rows[0];
  const isTrue = (value: unknown) =>
    value === true || value === 1 || value === "1" || value === "t";
  return {
    enabled: isTrue(row?.enabled),
    sendEnabled: isTrue(row?.send_enabled),
    consented: isTrue(row?.consented),
    groupTitle: row?.group_title == null ? "" : String(row.group_title),
    ownerUid: row?.owner_uid == null ? null : Number(row.owner_uid),
  };
}

export async function storeTelegramGroupAiMessage(input: {
  groupId: number;
  messageId: number;
  senderUid: number;
  senderName: string;
  content: string;
  mediaTypes: string[];
  replyToMessageId: number | null;
}): Promise<"stored" | "not_consented" | "duplicate"> {
  await ensureTelegramGroupAiTables();
  const now = new Date().toISOString();
  const result = await getDatabase().execute({
    sql: `INSERT INTO telegram_group_ai_messages
            (id, group_id, telegram_message_id, sender_uid, sender_name, sender_kind,
             content, media_types, reply_to_message_id, created_at)
          SELECT ?, ?, ?, ?, ?, 'user', ?, ?, ?, ?
          WHERE EXISTS (
            SELECT 1 FROM telegram_group_ai_settings settings
            INNER JOIN telegram_group_ai_consents consent
              ON consent.group_id = settings.group_id
            WHERE settings.group_id = ?
              AND settings.enabled = 1
              AND consent.telegram_uid = ?
              AND consent.is_active = 1
          )
          ON CONFLICT(group_id, telegram_message_id) DO NOTHING`,
    args: [
      `tg-${input.groupId}-${input.messageId}`,
      input.groupId,
      input.messageId,
      input.senderUid,
      input.senderName.slice(0, 120),
      input.content.slice(0, 4000),
      input.mediaTypes.slice(0, 8).join(","),
      input.replyToMessageId,
      now,
      input.groupId,
      input.senderUid,
    ],
  });
  if (result.rowsAffected > 0) return "stored";
  const status = await getTelegramGroupAiStatus(input.groupId, input.senderUid);
  if (!status.enabled || !status.consented) return "not_consented";
  return "duplicate";
}

export async function storeTelegramGroupAiAdminMessage(input: {
  groupId: number;
  ownerUid: number;
  messageId: number;
  senderName: string;
  mediaTypes: string[];
  replyToMessageId: number | null;
  edited?: boolean;
}): Promise<"stored" | "not_enabled" | "duplicate"> {
  await ensureTelegramGroupAiTables();
  const now = new Date().toISOString();
  const conflictAction = input.edited
    ? `DO UPDATE SET
         sender_uid = excluded.sender_uid,
         sender_name = excluded.sender_name,
         content = excluded.content,
         media_types = excluded.media_types,
         reply_to_message_id = excluded.reply_to_message_id,
         created_at = excluded.created_at`
    : "DO NOTHING";
  const result = await getDatabase().execute({
    sql: `INSERT INTO telegram_group_ai_messages
            (id, group_id, telegram_message_id, sender_uid, sender_name, sender_kind,
             content, media_types, reply_to_message_id, created_at)
          SELECT ?, ?, ?, ?, ?, 'user', ?, ?, ?, ?
          WHERE EXISTS (
            SELECT 1 FROM telegram_group_ai_settings
            WHERE group_id = ? AND owner_uid = ? AND enabled = 1
          )
          ON CONFLICT(group_id, telegram_message_id) ${conflictAction}`,
    args: [
      `tg-${input.groupId}-${input.messageId}`,
      input.groupId,
      input.messageId,
      input.ownerUid,
      input.senderName.slice(0, 120),
      "[owner message; details are distilled into private memory]",
      input.mediaTypes.slice(0, 8).join(","),
      input.replyToMessageId,
      now,
      input.groupId,
      input.ownerUid,
    ],
  });
  if (result.rowsAffected > 0) return "stored";
  const status = await getTelegramGroupAiStatus(input.groupId);
  return status.enabled && status.ownerUid === input.ownerUid
    ? "duplicate"
    : "not_enabled";
}

export async function storeTelegramGroupAiBotMessage(input: {
  groupId: number;
  messageId: number;
  content: string;
  replyToMessageId: number | null;
}): Promise<void> {
  await ensureTelegramGroupAiTables();
  const now = new Date().toISOString();
  await getDatabase().execute({
    sql: `INSERT INTO telegram_group_ai_messages
            (id, group_id, telegram_message_id, sender_uid, sender_name, sender_kind,
             content, media_types, reply_to_message_id, created_at)
          SELECT ?, ?, ?, NULL, 'Cheya', 'bot', ?, '', ?, ?
          WHERE EXISTS (
            SELECT 1 FROM telegram_group_ai_settings
            WHERE group_id = ? AND enabled = 1
          )
          ON CONFLICT(group_id, telegram_message_id) DO NOTHING`,
    args: [
      `tg-${input.groupId}-${input.messageId}`,
      input.groupId,
      input.messageId,
      input.content.slice(0, 4000),
      input.replyToMessageId,
      now,
      input.groupId,
    ],
  });
}

export async function retrieveTelegramGroupAiMemory(
  groupId: number,
  ownerUid: number,
  query: string,
  replyToMessageId: number | null,
): Promise<Array<{
  messageId: number;
  senderName: string;
  senderKind: string;
  content: string;
  createdAt: string;
  mediaTypes: string[];
}>> {
  await ensureTelegramGroupAiTables();
  const normalizedQuery = query.trim().slice(0, 1000);
  const insightLimit = /\b(kebiasaan|habit|pola|rutinitas|biasanya|sering|selalu|preferensi|suka)\b/i
    .test(normalizedQuery)
    ? 32
    : 8;
  const recent = await getDatabase().execute({
    sql: `SELECT telegram_message_id, sender_name, sender_kind, content, created_at, media_types
          FROM telegram_group_ai_messages
          WHERE group_id = ?
            AND (sender_uid = ? OR (
              sender_kind = 'bot'
              AND reply_to_message_id IN (
                SELECT telegram_message_id FROM telegram_group_ai_messages
                WHERE group_id = ? AND sender_uid = ?
              )
            ))
          ORDER BY created_at DESC, telegram_message_id DESC
          LIMIT 12`,
    args: [groupId, ownerUid, groupId, ownerUid],
  });
  const relevant = normalizedQuery
    ? await getDatabase().execute({
        sql: `SELECT telegram_message_id, sender_name, sender_kind, content, created_at, media_types
              FROM telegram_group_ai_messages
              WHERE group_id = ?
                AND (sender_uid = ? OR (
                  sender_kind = 'bot'
                  AND reply_to_message_id IN (
                    SELECT telegram_message_id FROM telegram_group_ai_messages
                    WHERE group_id = ? AND sender_uid = ?
                  )
                ))
                AND to_tsvector('simple'::regconfig, content)
                    @@ websearch_to_tsquery('simple'::regconfig, ?)
              ORDER BY ts_rank(
                to_tsvector('simple'::regconfig, content),
                websearch_to_tsquery('simple'::regconfig, ?)
              ) DESC, created_at DESC
              LIMIT 12`,
        args: [
          groupId,
          ownerUid,
          groupId,
          ownerUid,
          normalizedQuery,
          normalizedQuery,
        ],
      })
    : { rows: [] };
  const replied = replyToMessageId === null
    ? { rows: [] }
    : await getDatabase().execute({
        sql: `SELECT telegram_message_id, sender_name, sender_kind, content, created_at, media_types
              FROM telegram_group_ai_messages
              WHERE group_id = ?
                AND telegram_message_id = ?
                AND (
                  sender_uid = ?
                  OR (
                    sender_kind = 'bot'
                    AND reply_to_message_id IN (
                      SELECT telegram_message_id FROM telegram_group_ai_messages
                      WHERE group_id = ? AND sender_uid = ?
                    )
                  )
                )
              LIMIT 1`,
        args: [groupId, replyToMessageId, ownerUid, groupId, ownerUid],
      });
  const insightArgs = normalizedQuery
    ? [groupId, ownerUid, normalizedQuery, normalizedQuery]
    : [groupId, ownerUid];
  const [recentInsights, relevantInsights, repliedInsight] = await Promise.all([
    getDatabase().execute({
      sql: `SELECT telegram_message_id, summary, created_at
            FROM telegram_group_ai_insights
            WHERE group_id = ? AND owner_uid = ?
            ORDER BY created_at DESC
            LIMIT ${insightLimit}`,
      args: [groupId, ownerUid],
    }),
    normalizedQuery
      ? getDatabase().execute({
          sql: `SELECT telegram_message_id, summary, created_at
                FROM telegram_group_ai_insights
                WHERE group_id = ? AND owner_uid = ?
                  AND to_tsvector('simple'::regconfig, summary)
                      @@ websearch_to_tsquery('simple'::regconfig, ?)
                ORDER BY ts_rank(
                  to_tsvector('simple'::regconfig, summary),
                  websearch_to_tsquery('simple'::regconfig, ?)
                ) DESC, created_at DESC
                LIMIT ${insightLimit}`,
          args: insightArgs,
        })
      : Promise.resolve({ rows: [] as Record<string, unknown>[] }),
    replyToMessageId === null
      ? Promise.resolve({ rows: [] as Record<string, unknown>[] })
      : getDatabase().execute({
          sql: `SELECT telegram_message_id, summary, created_at
                FROM telegram_group_ai_insights
                WHERE group_id = ? AND owner_uid = ? AND telegram_message_id = ?
                LIMIT 1`,
          args: [groupId, ownerUid, replyToMessageId],
        }),
  ]);

  const byMessageId = new Map<string, Record<string, unknown>>();
  for (const row of [...recent.rows, ...relevant.rows, ...replied.rows]) {
    byMessageId.set(String(row.telegram_message_id), row);
  }
  const messages = Array.from(byMessageId.values())
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
    .slice(-24)
    .map((row) => ({
      messageId: Number(row.telegram_message_id),
      senderName: String(row.sender_name ?? "Group member"),
      senderKind: String(row.sender_kind ?? "user"),
      content: String(row.content ?? "").slice(0, 1200),
      createdAt: String(row.created_at ?? ""),
      mediaTypes: String(row.media_types ?? "")
        .split(",")
        .filter(Boolean),
    }));
  const uniqueInsights = new Map<string, Record<string, unknown>>();
  for (const row of [
    ...recentInsights.rows,
    ...relevantInsights.rows,
    ...repliedInsight.rows,
  ]) {
    uniqueInsights.set(String(row.telegram_message_id), row);
  }
  return [
    ...messages,
    ...Array.from(uniqueInsights.values()).map((row) => ({
      messageId: Number(row.telegram_message_id),
      senderName: "Long-term memory",
      senderKind: "memory",
      content: String(row.summary ?? "").slice(0, 1600),
      createdAt: String(row.created_at ?? ""),
      mediaTypes: [] as string[],
    })),
  ].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function retrieveTelegramGroupAiMemoryForOwner(
  ownerUid: number,
  query: string,
): Promise<Array<{
  groupId: number;
  groupTitle: string;
  messageId: number;
  source: "summary" | "reply";
  content: string;
  createdAt: string;
}>> {
  if (!Number.isSafeInteger(ownerUid) || ownerUid <= 0) {
    throw new Error("Invalid Telegram group AI memory owner.");
  }
  await ensureTelegramGroupAiTables();
  const normalizedQuery = query.trim().slice(0, 1000);
  const summarySearch = normalizedQuery
    ? getDatabase().execute({
        sql: `SELECT settings.group_id, settings.group_title,
                     insight.telegram_message_id, insight.summary, insight.created_at,
                     ts_rank(
                       to_tsvector('simple'::regconfig, insight.summary),
                       websearch_to_tsquery('simple'::regconfig, ?)
                     ) AS rank
              FROM telegram_group_ai_settings settings
              INNER JOIN telegram_group_ai_insights insight
                ON insight.group_id = settings.group_id
               AND insight.owner_uid = settings.owner_uid
              WHERE settings.owner_uid = ?
                AND settings.enabled = 1
                AND to_tsvector('simple'::regconfig, insight.summary)
                    @@ websearch_to_tsquery('simple'::regconfig, ?)
              ORDER BY rank DESC, insight.created_at DESC
              LIMIT 12`,
        args: [normalizedQuery, ownerUid, normalizedQuery],
      })
    : Promise.resolve({ rows: [] as Record<string, unknown>[] });
  const replySearch = normalizedQuery
    ? getDatabase().execute({
        sql: `SELECT settings.group_id, settings.group_title,
                     message.telegram_message_id, message.content, message.created_at,
                     ts_rank(
                       to_tsvector('simple'::regconfig, message.content),
                       websearch_to_tsquery('simple'::regconfig, ?)
                     ) AS rank
              FROM telegram_group_ai_settings settings
              INNER JOIN telegram_group_ai_messages message
                ON message.group_id = settings.group_id
              WHERE settings.owner_uid = ?
                AND settings.enabled = 1
                AND message.sender_kind = 'bot'
                AND EXISTS (
                  SELECT 1
                  FROM telegram_group_ai_messages owner_message
                  WHERE owner_message.group_id = message.group_id
                    AND owner_message.telegram_message_id = message.reply_to_message_id
                    AND owner_message.sender_uid = settings.owner_uid
                )
                AND to_tsvector('simple'::regconfig, message.content)
                    @@ websearch_to_tsquery('simple'::regconfig, ?)
              ORDER BY rank DESC, message.created_at DESC
              LIMIT 8`,
        args: [normalizedQuery, ownerUid, normalizedQuery],
      })
    : Promise.resolve({ rows: [] as Record<string, unknown>[] });
  const [recentSummaries, recentReplies, matchingSummaries, matchingReplies] =
    await Promise.all([
      getDatabase().execute({
        sql: `SELECT settings.group_id, settings.group_title,
                     insight.telegram_message_id, insight.summary, insight.created_at
              FROM telegram_group_ai_settings settings
              INNER JOIN telegram_group_ai_insights insight
                ON insight.group_id = settings.group_id
               AND insight.owner_uid = settings.owner_uid
              WHERE settings.owner_uid = ? AND settings.enabled = 1
              ORDER BY insight.created_at DESC
              LIMIT 10`,
        args: [ownerUid],
      }),
      getDatabase().execute({
        sql: `SELECT settings.group_id, settings.group_title,
                     message.telegram_message_id, message.content, message.created_at
              FROM telegram_group_ai_settings settings
              INNER JOIN telegram_group_ai_messages message
                ON message.group_id = settings.group_id
              WHERE settings.owner_uid = ?
                AND settings.enabled = 1
                AND message.sender_kind = 'bot'
                AND EXISTS (
                  SELECT 1
                  FROM telegram_group_ai_messages owner_message
                  WHERE owner_message.group_id = message.group_id
                    AND owner_message.telegram_message_id = message.reply_to_message_id
                    AND owner_message.sender_uid = settings.owner_uid
                )
              ORDER BY message.created_at DESC
              LIMIT 8`,
        args: [ownerUid],
      }),
      summarySearch,
      replySearch,
    ]);

  const entries = new Map<string, {
    groupId: number;
    groupTitle: string;
    messageId: number;
    source: "summary" | "reply";
    content: string;
    createdAt: string;
  }>();
  for (const row of [...recentSummaries.rows, ...matchingSummaries.rows]) {
    const groupId = Number(row.group_id);
    const messageId = Number(row.telegram_message_id);
    const key = `${groupId}:${messageId}:summary`;
    entries.set(key, {
      groupId,
      groupTitle: String(row.group_title ?? ""),
      messageId,
      source: "summary",
      content: String(row.summary ?? "").slice(0, 800),
      createdAt: String(row.created_at ?? ""),
    });
  }
  for (const row of [...recentReplies.rows, ...matchingReplies.rows]) {
    const groupId = Number(row.group_id);
    const messageId = Number(row.telegram_message_id);
    const key = `${groupId}:${messageId}:reply`;
    entries.set(key, {
      groupId,
      groupTitle: String(row.group_title ?? ""),
      messageId,
      source: "reply",
      content: String(row.content ?? "").slice(0, 800),
      createdAt: String(row.created_at ?? ""),
    });
  }
  const matchingKeys = new Set([
    ...matchingSummaries.rows.map(
      (row) => `${Number(row.group_id)}:${Number(row.telegram_message_id)}:summary`,
    ),
    ...matchingReplies.rows.map(
      (row) => `${Number(row.group_id)}:${Number(row.telegram_message_id)}:reply`,
    ),
  ]);
  return Array.from(entries.entries())
    .sort(([keyA, a], [keyB, b]) => {
      const matchDifference =
        Number(matchingKeys.has(keyB)) - Number(matchingKeys.has(keyA));
      return matchDifference || b.createdAt.localeCompare(a.createdAt);
    })
    .slice(0, 20)
    .map(([, entry]) => entry)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export type TelegramGroupHistoryImportMessage = {
  messageId: number;
  senderKind: "user" | "bot";
  senderName: string;
  content: string;
  mediaTypes: string[];
  replyToMessageId: number | null;
  createdAt: string;
};

export async function listOwnedTelegramGroupAiSettings(
  ownerUid: number,
): Promise<Array<{ groupId: number; groupTitle: string }>> {
  await ensureTelegramGroupAiTables();
  const result = await getDatabase().execute({
    sql: `SELECT group_id, group_title
          FROM telegram_group_ai_settings
          WHERE owner_uid = ? AND enabled = 1
          ORDER BY updated_at DESC`,
    args: [ownerUid],
  });
  return result.rows.map((row) => ({
    groupId: Number(row.group_id),
    groupTitle: String(row.group_title ?? ""),
  }));
}

export async function importTelegramGroupAiHistory(
  ownerUid: number,
  groupId: number,
  messages: TelegramGroupHistoryImportMessage[],
): Promise<number> {
  if (
    !Number.isSafeInteger(ownerUid) ||
    ownerUid <= 0 ||
    !Number.isSafeInteger(groupId) ||
    groupId >= 0 ||
    messages.length > 100
  ) {
    throw new Error("Invalid Telegram history import request.");
  }
  if (messages.length === 0) return 0;
  await ensureTelegramGroupAiTables();

  const values = messages
    .map(() => "(?::TEXT, ?::BIGINT, ?::BIGINT, ?::BIGINT, ?::TEXT, ?::TEXT, ?::TEXT, ?::TEXT, ?::BIGINT, ?::TEXT)")
    .join(", ");
  const args = messages.flatMap((message) => [
    `tg-${groupId}-${message.messageId}`,
    groupId,
    message.messageId,
    message.senderKind === "user" ? ownerUid : null,
    message.senderName.slice(0, 120),
    message.senderKind,
    message.content.slice(0, 4000),
    message.mediaTypes.slice(0, 8).join(","),
    message.replyToMessageId,
    message.createdAt,
  ]);
  const result = await getDatabase().execute({
    sql: `INSERT INTO telegram_group_ai_messages
            (id, group_id, telegram_message_id, sender_uid, sender_name, sender_kind,
             content, media_types, reply_to_message_id, created_at)
          SELECT imported.*
          FROM (VALUES ${values}) AS imported
            (id, group_id, telegram_message_id, sender_uid, sender_name, sender_kind,
             content, media_types, reply_to_message_id, created_at)
          WHERE EXISTS (
            SELECT 1 FROM telegram_group_ai_settings
            WHERE group_id = ? AND owner_uid = ? AND enabled = 1
          )
          ON CONFLICT(group_id, telegram_message_id) DO UPDATE SET
            sender_uid = excluded.sender_uid,
            sender_name = excluded.sender_name,
            sender_kind = excluded.sender_kind,
            content = excluded.content,
            media_types = excluded.media_types,
            reply_to_message_id = excluded.reply_to_message_id,
            created_at = excluded.created_at`,
    args: [...args, groupId, ownerUid],
  });
  return result.rowsAffected;
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
  await getDatabase().execute({
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
    await getDatabase().execute({
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
  edited_at: string | null;
  deleted_at: string | null;
  reply_to_id: string | null;
  is_pinned: boolean;
  ai_input_tokens: number | null;
  ai_output_tokens: number | null;
  sender_device_id: string | null;
};

let chatMessageActionsReady: Promise<void> | null = null;

async function ensureChatMessageActions(): Promise<void> {
  if (!chatMessageActionsReady) {
    chatMessageActionsReady = (async () => {
      const db = getDatabase();
      const columns = await db.execute("PRAGMA table_info(messages)");
      const existing = new Set(
        columns.rows.map((row) => String((row as Record<string, unknown>).name)),
      );
      for (const [name, type] of [
        ["edited_at", "TEXT"],
        ["deleted_at", "TEXT"],
        ["reply_to_id", "TEXT"],
        ["ai_input_tokens", "INTEGER"],
        ["ai_output_tokens", "INTEGER"],
        ["sender_device_id", "TEXT"],
      ]) {
        if (!existing.has(name)) {
          await db.execute(`ALTER TABLE messages ADD COLUMN ${name} ${type}`);
        }
      }
      await db.execute(`CREATE TABLE IF NOT EXISTS chat_message_hides (
        uid INTEGER NOT NULL,
        message_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (uid, message_id)
      )`);
      await db.execute(`CREATE TABLE IF NOT EXISTS chat_message_pins (
        uid INTEGER NOT NULL,
        message_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (uid, message_id)
      )`);
      await db.execute(`CREATE TABLE IF NOT EXISTS chat_notification_pins (
        uid INTEGER NOT NULL,
        notification_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (uid, notification_id)
      )`);
      await db.execute(`CREATE INDEX IF NOT EXISTS idx_messages_ai_memory_search
        ON messages USING GIN (to_tsvector('simple'::regconfig, content))
        WHERE deleted_at IS NULL`);
    })().catch((error) => {
      chatMessageActionsReady = null;
      throw error;
    });
  }
  await chatMessageActionsReady;
}

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
    edited_at: row.edited_at == null ? null : String(row.edited_at),
    deleted_at: row.deleted_at == null ? null : String(row.deleted_at),
    reply_to_id: row.reply_to_id == null ? null : String(row.reply_to_id),
    is_pinned: Number(row.is_pinned ?? 0) === 1,
    ai_input_tokens:
      row.ai_input_tokens == null ? null : Number(row.ai_input_tokens),
    ai_output_tokens:
      row.ai_output_tokens == null ? null : Number(row.ai_output_tokens),
    sender_device_id:
      row.sender_device_id == null ? null : String(row.sender_device_id),
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
  reply_to_id?: string | null;
  ai_input_tokens?: number | null;
  ai_output_tokens?: number | null;
  sender_device_id?: string | null;
}): Promise<ChatMessage | null> {
  try {
    await ensureChatMessageActions();
    const id = genMessageId();
    const createdAt = new Date().toISOString();
    const deliveredAt = data.delivered_at ?? null;
    const readAt = data.read_at ?? null;
    await getDatabase().execute({
      sql: `INSERT INTO messages
              (id, uid, sender, sender_role, title, content, created_at, delivered_at, read_at, reply_to_id, ai_input_tokens, ai_output_tokens, sender_device_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        data.reply_to_id ?? null,
        data.ai_input_tokens ?? null,
        data.ai_output_tokens ?? null,
        data.sender_device_id ?? null,
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
      edited_at: null,
      deleted_at: null,
      reply_to_id: data.reply_to_id ?? null,
      is_pinned: false,
      ai_input_tokens: data.ai_input_tokens ?? null,
      ai_output_tokens: data.ai_output_tokens ?? null,
      sender_device_id: data.sender_device_id ?? null,
    };
  } catch (err) {
    console.error("createMessage error:", err);
    return null;
  }
}

export async function listMessages(uid: number, limit = 500): Promise<ChatMessage[]> {
  try {
    await ensureChatMessageActions();
    const result = await getDatabase().execute({
      sql: `SELECT messages.*,
                   EXISTS (
                     SELECT 1 FROM chat_message_pins pins
                     WHERE pins.uid = messages.uid AND pins.message_id = messages.id
                   ) AS is_pinned
            FROM messages
            WHERE uid = ?
              AND NOT EXISTS (
                SELECT 1 FROM chat_message_hides hides
                WHERE hides.uid = messages.uid AND hides.message_id = messages.id
              )
            ORDER BY created_at ASC LIMIT ?`,
      args: [uid, limit],
    });
    return result.rows.map((r) => rowToMessage(r as unknown as Record<string, unknown>));
  } catch (error) {
    console.error("[chat-messages] failed to list messages:", error);
    throw error;
  }
}

export type AiChatMemoryMatch = {
  message: ChatMessage;
  score: number;
};

export async function listRecentAiChatMessages(
  uid: number,
  limit = 8,
): Promise<ChatMessage[]> {
  await ensureChatMessageActions();
  const result = await getDatabase().execute({
    sql: `SELECT messages.*,
                 EXISTS (
                   SELECT 1 FROM chat_message_pins pins
                   WHERE pins.uid = messages.uid AND pins.message_id = messages.id
                 ) AS is_pinned
          FROM messages
          WHERE uid = ?
            AND deleted_at IS NULL
            AND NOT EXISTS (
              SELECT 1 FROM chat_message_hides hides
              WHERE hides.uid = messages.uid AND hides.message_id = messages.id
            )
          ORDER BY created_at DESC, id DESC
          LIMIT ?`,
    args: [uid, Math.max(1, Math.min(20, Math.floor(limit)))],
  });
  return result.rows
    .map((row) => rowToMessage(row as unknown as Record<string, unknown>))
    .reverse();
}

export async function searchAiChatHistory(
  uid: number,
  query: string,
  limit = 20,
): Promise<AiChatMemoryMatch[]> {
  await ensureChatMessageActions();
  const stopWords = new Set([
    "about", "after", "again", "all", "am", "an", "and", "are", "as", "apa",
    "bagaimana", "baru", "be", "because", "been", "before", "being", "bisa",
    "buat", "but", "by", "can", "could", "dari", "did", "do", "does", "doing",
    "down", "during", "dengan", "di", "for", "from", "gimana", "had", "has",
    "have", "having", "he", "her", "here", "hers", "him", "his", "how", "i",
    "ini", "itu", "its", "just", "kan", "ke", "kita", "kok", "lagi", "lalu",
    "mana", "masih", "mau", "me", "menjadi", "might", "more", "most", "my",
    "must", "nya", "of", "on", "once", "only", "or", "other", "our", "out",
    "pada", "pernah", "saya", "sebelumnya", "she", "should", "so", "some",
    "such", "sudah", "than", "that", "the", "their", "them", "then", "there",
    "these", "they", "this", "those", "through", "to", "too", "under", "until",
    "up", "very", "was", "we", "were", "what", "when", "where", "which", "while",
    "who", "whom", "why", "will", "with", "would", "yang", "you", "your",
    "ingat", "mengingat", "remember", "recall",
  ]);
  const terms = Array.from(new Set(
    query.toLocaleLowerCase()
      .match(/[\p{L}\p{N}]{2,}/gu)
      ?.filter((term) => !stopWords.has(term)) ?? [],
  )).slice(0, 16);
  if (terms.length === 0) return [];

  const tsQuery = terms
    .map((term) => `'${term.replace(/'/g, "''")}':*`)
    .join(" | ");
  const boundedLimit = Math.max(1, Math.min(40, Math.floor(limit)));
  const database = getDatabase();
  const matchedResult = await database.execute({
    sql: `SELECT messages.*,
                 ts_rank_cd(
                   to_tsvector('simple'::regconfig, messages.content),
                   to_tsquery('simple'::regconfig, ?),
                   32
                 ) AS ai_memory_score,
                 EXISTS (
                   SELECT 1 FROM chat_message_pins pins
                   WHERE pins.uid = messages.uid AND pins.message_id = messages.id
                 ) AS is_pinned
          FROM messages
          WHERE uid = ?
            AND deleted_at IS NULL
            AND to_tsvector('simple'::regconfig, content)
              @@ to_tsquery('simple'::regconfig, ?)
            AND NOT EXISTS (
              SELECT 1 FROM chat_message_hides hides
              WHERE hides.uid = messages.uid AND hides.message_id = messages.id
            )
          ORDER BY ai_memory_score DESC, created_at DESC
          LIMIT ?`,
    args: [tsQuery, uid, tsQuery, boundedLimit],
  });
  const matches = matchedResult.rows.map((row) => {
    const record = row as unknown as Record<string, unknown>;
    return {
      message: rowToMessage(record),
      score: Number(record.ai_memory_score ?? 0),
    };
  });
  if (matches.length === 0) return [];

  const matchIds = matches.map(({ message }) => message.id);
  const placeholders = matchIds.map(() => "?").join(", ");
  const linkedResult = await database.execute({
    sql: `SELECT messages.*,
                 EXISTS (
                   SELECT 1 FROM chat_message_pins pins
                   WHERE pins.uid = messages.uid AND pins.message_id = messages.id
                 ) AS is_pinned
          FROM messages
          WHERE uid = ?
            AND deleted_at IS NULL
            AND (id IN (${placeholders}) OR reply_to_id IN (${placeholders}))
            AND NOT EXISTS (
              SELECT 1 FROM chat_message_hides hides
              WHERE hides.uid = messages.uid AND hides.message_id = messages.id
            )`,
    args: [uid, ...matchIds, ...matchIds],
  });
  const scores = new Map(matches.map(({ message, score }) => [message.id, score]));
  const selected = new Map<string, AiChatMemoryMatch>();
  for (const { message, score } of matches) {
    selected.set(message.id, { message, score });
  }
  for (const row of linkedResult.rows) {
    const message = rowToMessage(row as unknown as Record<string, unknown>);
    if (!selected.has(message.id)) {
      selected.set(message.id, {
        message,
        score: scores.get(message.reply_to_id ?? "") ?? 0,
      });
    }
  }
  return Array.from(selected.values()).sort((a, b) =>
    a.message.created_at.localeCompare(b.message.created_at),
  );
}

export async function getChatMessage(uid: number, id: string): Promise<ChatMessage | null> {
  await ensureChatMessageActions();
  const result = await getDatabase().execute({
    sql: `SELECT messages.*,
                 EXISTS (
                   SELECT 1 FROM chat_message_pins pins
                   WHERE pins.uid = messages.uid AND pins.message_id = messages.id
                 ) AS is_pinned
          FROM messages WHERE uid = ? AND id = ? LIMIT 1`,
    args: [uid, id],
  });
  return result.rows[0]
    ? rowToMessage(result.rows[0] as unknown as Record<string, unknown>)
    : null;
}

export async function editChatMessage(
  uid: number,
  id: string,
  content: string,
): Promise<ChatMessage | null> {
  await ensureChatMessageActions();
  await getDatabase().execute({
    sql: `UPDATE messages SET content = ?, edited_at = ?
          WHERE uid = ? AND id = ? AND sender = 'user' AND deleted_at IS NULL`,
    args: [content, new Date().toISOString(), uid, id],
  });
  return getChatMessage(uid, id);
}

export async function deleteChatMessage(
  uid: number,
  id: string,
  scope: "me" | "everyone",
): Promise<boolean> {
  await ensureChatMessageActions();
  const message = await getChatMessage(uid, id);
  if (!message) return false;
  if (message.deleted_at) {
    const results = await getDatabase().batch(
      [
        {
          sql: "DELETE FROM chat_message_pins WHERE uid = ? AND message_id = ?",
          args: [uid, id],
        },
        {
          sql: "DELETE FROM chat_message_hides WHERE message_id = ?",
          args: [id],
        },
        {
          sql: "DELETE FROM messages WHERE uid = ? AND id = ?",
          args: [uid, id],
        },
      ],
      "write",
    );
    return results[2].rowsAffected > 0;
  }
  if (scope === "everyone") {
    const results = await getDatabase().batch(
      [
        {
          sql: "DELETE FROM chat_message_pins WHERE uid = ? AND message_id = ?",
          args: [uid, id],
        },
        {
          sql: "DELETE FROM chat_message_hides WHERE message_id = ?",
          args: [id],
        },
        {
          sql: "DELETE FROM messages WHERE uid = ? AND id = ?",
          args: [uid, id],
        },
      ],
      "write",
    );
    return results[2].rowsAffected > 0;
  }
  await getDatabase().batch(
    [
      {
        sql: `INSERT OR IGNORE INTO chat_message_hides (uid, message_id, created_at)
              VALUES (?, ?, ?)`,
        args: [uid, id, new Date().toISOString()],
      },
      {
        sql: "DELETE FROM chat_message_pins WHERE uid = ? AND message_id = ?",
        args: [uid, id],
      },
    ],
    "write",
  );
  return true;
}

export async function toggleChatMessagePin(uid: number, id: string): Promise<boolean | null> {
  await ensureChatMessageActions();
  const message = await getChatMessage(uid, id);
  if (!message || message.deleted_at) return null;
  if (message.is_pinned) {
    await getDatabase().execute({
      sql: "DELETE FROM chat_message_pins WHERE uid = ? AND message_id = ?",
      args: [uid, id],
    });
    return false;
  }
  await getDatabase().execute({
    sql: `INSERT OR IGNORE INTO chat_message_pins (uid, message_id, created_at)
          VALUES (?, ?, ?)`,
    args: [uid, id, new Date().toISOString()],
  });
  return true;
}

export async function listActiveAnnouncementRecipients(): Promise<number[]> {
  await ensureTelegramAccountsTable();
  const result = await getDatabase().execute({
    sql: `SELECT uid FROM "akun-telegram"
          WHERE COALESCE(role, 'user') NOT IN ('deleted', 'admin')
          ORDER BY uid`,
    args: [],
  });
  return result.rows
    .map((row) => Number(row.uid))
    .filter((uid) => Number.isSafeInteger(uid) && uid > 0);
}

export async function saveBroadcastAnnouncement(
  uid: number,
  broadcastId: string,
  content: string,
): Promise<ChatMessage | null> {
  await ensureChatMessageActions();
  const id = `announcement-${broadcastId}-${uid}`;
  const createdAt = new Date().toISOString();
  const db = getDatabase();
  const activeAccount = `EXISTS (
    SELECT 1 FROM "akun-telegram"
    WHERE uid = ? AND COALESCE(role, 'user') NOT IN ('deleted', 'admin')
  )`;

  await db.execute({
    sql: `INSERT OR IGNORE INTO notifications
            (id, uid, title, message, ip, location, device, read, created_at)
          SELECT ?, ?, 'CheyaVerse Announcement', ?, NULL, NULL, NULL, 0, ?
          WHERE ${activeAccount}`,
    args: [id, uid, content, createdAt, uid],
  });
  await db.execute({
    sql: `INSERT OR IGNORE INTO messages
            (id, uid, sender, sender_role, title, content, created_at, delivered_at, read_at, reply_to_id)
          SELECT ?, ?, 'bot', 'admin', 'CheyaVerse · Admin', ?, ?, NULL, NULL, NULL
          WHERE ${activeAccount}`,
    args: [id, uid, content, createdAt, uid],
  });
  return getChatMessage(uid, id);
}

export async function getLastMessage(uid: number): Promise<ChatMessage | null> {
  try {
    const result = await getDatabase().execute({
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
    const res = await getDatabase().execute({
      sql: "UPDATE messages SET delivered_at = ? WHERE id = ? AND uid = ? AND delivered_at IS NULL",
      args: [now, messageId, uid],
    });
    if (res.rowsAffected === 0) {
      const existing = await getDatabase().execute({
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
    const res = await getDatabase().execute({
      sql: "UPDATE messages SET read_at = ? WHERE id = ? AND uid = ? AND read_at IS NULL",
      args: [now, messageId, uid],
    });
    if (res.rowsAffected === 0) {
      const existing = await getDatabase().execute({
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

export async function markUnreadBotMessagesRead(
  uid: number,
): Promise<{ readAt: string; messageIds: string[] }> {
  await ensureChatMessageActions();
  const result = await getDatabase().execute({
    sql: `SELECT id FROM messages
          WHERE uid = ? AND read_at IS NULL
            AND deleted_at IS NULL
            AND (sender = 'bot' OR sender_role IN ('admin', 'ai'))
          ORDER BY created_at ASC`,
    args: [uid],
  });
  const messageIds = result.rows.map((row) => String(row.id ?? ""));
  if (messageIds.length === 0) {
    return { readAt: new Date().toISOString(), messageIds };
  }
  const readAt = new Date().toISOString();
  await getDatabase().execute({
    sql: `UPDATE messages SET read_at = ?
          WHERE uid = ? AND read_at IS NULL
            AND deleted_at IS NULL
            AND (sender = 'bot' OR sender_role IN ('admin', 'ai'))`,
    args: [readAt, uid],
  });
  return { readAt, messageIds };
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
    await getDatabase().execute({
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
    throw err;
  }
}

export async function deletePushSubscription(
  endpoint: string,
  uid: number,
): Promise<void> {
  await getDatabase().execute({
    sql: "DELETE FROM push_subscriptions WHERE endpoint = ? AND uid = ?",
    args: [endpoint, uid],
  });
}

export async function listPushSubscriptions(
  uid: number,
): Promise<PushSubscriptionRow[]> {
  try {
    const result = await getDatabase().execute({
      sql: "SELECT * FROM push_subscriptions WHERE uid = ?",
      args: [uid],
    });
    return result.rows.map((r) =>
      rowToPushSubscription(r as unknown as Record<string, unknown>),
    );
  } catch (error) {
    console.error("listPushSubscriptions error:", error);
    throw error;
  }
}

export async function deleteWebAccountData(
  uid: number,
): Promise<string[]> {
  await Promise.all([
    ensureTelegramAccountsTable(),
    ensureTelegramLoginChallengesTable(),
    ensureChatMessageActions(),
    ensureDeviceFingerprintColumns(),
    ensureAccountSessionVersionsTable(),
    ensureAccountPreferencesTable(),
  ]);

  const db = getDatabase();
  await db.execute(`CREATE TABLE IF NOT EXISTS device_link_tokens (
    token_hash TEXT PRIMARY KEY,
    uid INTEGER NOT NULL,
    created_by_device_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    consumed_at INTEGER
  )`);

  const [mediaResult, coverResult, tableResult] = await Promise.all([
    db.execute({
      sql: "SELECT storage_path FROM media WHERE owner_id = ?",
      args: [uid],
    }),
    db.execute({
      sql: "SELECT storage_path FROM user_covers WHERE uid = ?",
      args: [uid],
    }),
    db.execute("SELECT name FROM sqlite_master WHERE type = 'table'"),
  ]);
  const storagePaths = Array.from(
    new Set(
      [...mediaResult.rows, ...coverResult.rows]
        .map((row) => String(row.storage_path ?? ""))
        .filter((path) => isUserMediaPath(uid, path)),
    ),
  );
  const tables = new Set(
    tableResult.rows.map((row) => String(row.name ?? "")),
  );
  const statements: Array<{ sql: string; args: (string | number | null)[] }> = [];
  const deleteForUid: Array<[string, string]> = [
    ["telegram_login_challenges", "uid"],
    ["device_link_tokens", "uid"],
    ["device_ids", "uid"],
    ["session_blacklist", "uid"],
    ["notifications", "uid"],
    ["messages", "uid"],
    ["media", "owner_id"],
    ["user_covers", "uid"],
    ["push_subscriptions", "uid"],
    ["chat_message_hides", "uid"],
    ["chat_message_pins", "uid"],
    ["chat_notification_pins", "uid"],
    ["direct_message_hides", "uid"],
    ["direct_message_pins", "uid"],
    ["chat_presence", "uid"],
    ["library_nodes", "owner_uid"],
    ["github_credentials", "uid"],
    ["ai_context_preferences", "uid"],
    ["account_preferences", "uid"],
  ];

  const anonymizedAt = new Date().toISOString();
  if (tables.has("akun-telegram")) {
    statements.push({
      sql: `UPDATE "akun-telegram"
            SET username = NULL, first_name = 'Deleted account', last_name = NULL,
                photo_url = NULL, photo_file_id = NULL, allows_write_to_pm = 0,
                auth_date = NULL, role = 'deleted', created_at = ?, updated_at = ?
            WHERE uid = ?`,
      args: [anonymizedAt, anonymizedAt, uid],
    });
  }
  if (tables.has("telegram_users")) {
    statements.push({
      sql: `UPDATE telegram_users
            SET username = NULL, first_name = 'Deleted account', last_name = NULL,
                photo_file_id = NULL, role = 'deleted', created_at = ?, updated_at = ?
            WHERE uid = ?`,
      args: [anonymizedAt, anonymizedAt, uid],
    });
  }
  for (const [table, column] of deleteForUid) {
    if (!tables.has(table)) continue;
    statements.push({
      sql: `DELETE FROM "${table}" WHERE "${column}" = ?`,
      args: [uid],
    });
  }
  statements.push({
    sql: `INSERT INTO account_session_versions (uid, session_version, updated_at)
          VALUES (?, 1, ?)
          ON CONFLICT(uid) DO UPDATE SET
            session_version = account_session_versions.session_version + 1,
            updated_at = excluded.updated_at`,
    args: [uid, new Date().toISOString()],
  });

  await db.batch(statements, "write");
  return storagePaths;
}