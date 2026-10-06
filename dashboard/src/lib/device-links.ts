import { createHash, randomBytes } from "node:crypto";
import { getDatabase } from "@/lib/database";

const TOKEN_TTL_SECONDS = 60;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

async function ensureDeviceLinkTable(): Promise<void> {
  await getDatabase().execute(`
    CREATE TABLE IF NOT EXISTS device_link_tokens (
      token_hash TEXT PRIMARY KEY,
      uid INTEGER NOT NULL,
      created_by_device_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      consumed_at INTEGER
    )
  `);
  await getDatabase().execute(
    "CREATE INDEX IF NOT EXISTS idx_device_link_tokens_expiry ON device_link_tokens(expires_at)",
  );
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createDeviceLink(
  uid: number,
  deviceId: string,
): Promise<{ token: string; expiresAt: number }> {
  await ensureDeviceLinkTable();
  const now = Date.now();
  const expiresAt = now + TOKEN_TTL_SECONDS * 1000;
  const token = randomBytes(32).toString("base64url");
  await getDatabase().execute({
    sql: "DELETE FROM device_link_tokens WHERE expires_at <= ? OR consumed_at IS NOT NULL",
    args: [now],
  });
  await getDatabase().execute({
    sql: `INSERT INTO device_link_tokens
            (token_hash, uid, created_by_device_id, created_at, expires_at)
          VALUES (?, ?, ?, ?, ?)`,
    args: [hashToken(token), uid, deviceId, now, expiresAt],
  });
  return { token, expiresAt };
}

export async function redeemDeviceLink(token: string): Promise<number | null> {
  if (!TOKEN_PATTERN.test(token)) return null;
  await ensureDeviceLinkTable();
  const now = Date.now();
  const result = await getDatabase().execute({
    sql: `UPDATE device_link_tokens
          SET consumed_at = ?
          WHERE token_hash = ? AND consumed_at IS NULL AND expires_at > ?
          RETURNING uid`,
    args: [now, hashToken(token), now],
  });
  return result.rows.length ? Number(result.rows[0].uid) : null;
}
