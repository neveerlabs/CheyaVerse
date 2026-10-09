import asyncio
import hashlib
import html
import json
import random
import re
import uuid
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import quote

import aiohttp
import asyncpg

from config import (
    SUPABASE_DB_URL,
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    TELEGRAM_STORAGE_CHAT_ID,
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY,
    VAPID_SUBJECT,
)
from logger import logger
from pywebpush import WebPushException, webpush


_telegram_bot_user_ids_ready = False
_telegram_bot_user_ids_lock = asyncio.Lock()
_db_pool: asyncpg.Pool | None = None
_db_pool_lock = asyncio.Lock()
_storage_session: aiohttp.ClientSession | None = None
_storage_session_lock = asyncio.Lock()
SUPABASE_MEDIA_BUCKET = "user-media"


async def _get_db_pool() -> asyncpg.Pool:
    global _db_pool
    if not SUPABASE_DB_URL:
        raise RuntimeError("SUPABASE_DB_URL is required to connect to Supabase PostgreSQL")
    if _db_pool is None or _db_pool.is_closing():
        async with _db_pool_lock:
            if _db_pool is None or _db_pool.is_closing():
                try:
                    _db_pool = await asyncpg.create_pool(
                        dsn=SUPABASE_DB_URL,
                        min_size=1,
                        max_size=10,
                        command_timeout=30,
                        statement_cache_size=0,
                    )
                except Exception as exc:
                    raise RuntimeError(
                        f"Failed to connect to Supabase PostgreSQL: {exc}"
                    ) from exc
    return _db_pool


async def close_db_pool() -> None:
    global _db_pool
    pool = _db_pool
    _db_pool = None
    if pool is not None and not pool.is_closing():
        await pool.close()
    global _storage_session
    session = _storage_session
    _storage_session = None
    if session is not None and not session.closed:
        await session.close()


def _supabase_storage_headers() -> dict[str, str]:
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        raise RuntimeError(
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for Supabase Storage"
        )
    key = SUPABASE_SERVICE_ROLE_KEY
    headers = {"apikey": key}
    if key.startswith("sb_secret_"):
        return headers
    if len(key.split(".")) == 3:
        headers["Authorization"] = f"Bearer {key}"
        return headers
    raise RuntimeError(
        "SUPABASE_SERVICE_ROLE_KEY must be a Supabase sb_secret_ key or a legacy service_role JWT"
    )


async def _get_storage_session() -> aiohttp.ClientSession:
    global _storage_session
    if _storage_session is None or _storage_session.closed:
        async with _storage_session_lock:
            if _storage_session is None or _storage_session.closed:
                _storage_session = aiohttp.ClientSession(
                    timeout=aiohttp.ClientTimeout(total=60)
                )
    return _storage_session


def _storage_object_url(path: str) -> str:
    encoded_path = "/".join(quote(part, safe="") for part in path.split("/"))
    return f"{SUPABASE_URL}/storage/v1/object/{SUPABASE_MEDIA_BUCKET}/{encoded_path}"


def build_media_object_path(owner_id: int, media_id: str, filename: str) -> str:
    if owner_id <= 0:
        raise ValueError("Media owner ID must be positive")
    if not media_id or "/" in media_id or "\\" in media_id:
        raise ValueError("Invalid media ID for storage object key")
    safe_name = filename.replace("\\", "/").rsplit("/", 1)[-1].strip()
    if not safe_name or safe_name in {".", ".."}:
        safe_name = "media"
    return f"{owner_id}/{media_id}/{safe_name}"


async def upload_media_object(
    owner_id: int,
    media_id: str,
    filename: str,
    content: bytes,
    content_type: str,
) -> str:
    object_path = build_media_object_path(owner_id, media_id, filename)
    headers = _supabase_storage_headers()
    headers["Content-Type"] = content_type
    session = await _get_storage_session()
    try:
        async with session.post(
            _storage_object_url(object_path),
            data=content,
            headers=headers,
        ) as response:
            if response.status >= 400:
                detail = await response.text()
                raise RuntimeError(
                    f"Supabase Storage upload failed (HTTP {response.status}): {detail}"
                )
    except Exception as exc:
        if isinstance(exc, RuntimeError):
            raise
        raise RuntimeError(f"Supabase Storage upload failed: {exc}") from exc
    return object_path


async def delete_media_object(object_path: str) -> None:
    if not object_path:
        return
    headers = _supabase_storage_headers()
    session = await _get_storage_session()
    try:
        async with session.delete(
            f"{SUPABASE_URL}/storage/v1/object/{SUPABASE_MEDIA_BUCKET}",
            json={"prefixes": [object_path]},
            headers=headers,
        ) as response:
            if response.status >= 400 and response.status != 404:
                detail = await response.text()
                raise RuntimeError(
                    f"Supabase Storage delete failed (HTTP {response.status}): {detail}"
                )
    except Exception as exc:
        if isinstance(exc, RuntimeError):
            raise
        raise RuntimeError(f"Supabase Storage delete failed: {exc}") from exc


async def ensure_telegram_bot_user_ids_table() -> None:
    global _telegram_bot_user_ids_ready
    if _telegram_bot_user_ids_ready:
        return
    async with _telegram_bot_user_ids_lock:
        if _telegram_bot_user_ids_ready:
            return
        await _execute(
            """
            CREATE TABLE IF NOT EXISTS telegram_bot_user_ids (
                telegram_uid INTEGER PRIMARY KEY,
                first_seen_at TEXT NOT NULL
            )
            """,
            [],
        )
        await _execute(
            """
            CREATE OR REPLACE FUNCTION public.reject_telegram_bot_user_ids_mutation()
            RETURNS trigger
            LANGUAGE plpgsql
            AS $$
            BEGIN
                RAISE EXCEPTION 'Telegram bot user IDs are append-only';
                RETURN OLD;
            END;
            $$
            """,
            [],
        )
        await _execute(
            """
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_trigger
                    WHERE tgname = 'telegram_bot_user_ids_no_update'
                      AND tgrelid = 'public.telegram_bot_user_ids'::regclass
                      AND NOT tgisinternal
                ) THEN
                    CREATE TRIGGER telegram_bot_user_ids_no_update
                    BEFORE UPDATE ON public.telegram_bot_user_ids
                    FOR EACH ROW
                    EXECUTE FUNCTION public.reject_telegram_bot_user_ids_mutation();
                END IF;
                IF NOT EXISTS (
                    SELECT 1 FROM pg_trigger
                    WHERE tgname = 'telegram_bot_user_ids_no_delete'
                      AND tgrelid = 'public.telegram_bot_user_ids'::regclass
                      AND NOT tgisinternal
                ) THEN
                    CREATE TRIGGER telegram_bot_user_ids_no_delete
                    BEFORE DELETE ON public.telegram_bot_user_ids
                    FOR EACH ROW
                    EXECUTE FUNCTION public.reject_telegram_bot_user_ids_mutation();
                END IF;
            END;
            $$
            """,
            [],
        )
        _columns, account_tables = await _execute(
            """
            SELECT table_name FROM information_schema.tables
            WHERE table_schema = current_schema() AND table_name IN (?, ?)
            """,
            ["akun-telegram", "telegram_users"],
        )
        existing_tables = {str(row[0]) for row in account_tables}
        first_seen_at = datetime.now(timezone.utc).isoformat()
        for table in ('"akun-telegram"', "telegram_users"):
            if table.strip('"') not in existing_tables:
                continue
            await _execute(
                f"""
                INSERT INTO telegram_bot_user_ids
                    (telegram_uid, first_seen_at)
                SELECT uid, ? FROM {table} WHERE uid IS NOT NULL
                ON CONFLICT DO NOTHING
                """,
                [first_seen_at],
            )
        _telegram_bot_user_ids_ready = True


async def record_telegram_bot_user_id(telegram_uid: int) -> None:
    if telegram_uid <= 0:
        raise ValueError("Telegram user ID must be positive")
    await ensure_telegram_bot_user_ids_table()
    await _execute(
        """
        INSERT INTO telegram_bot_user_ids (telegram_uid, first_seen_at)
        VALUES (?, ?)
        ON CONFLICT DO NOTHING
        """,
        [telegram_uid, datetime.now(timezone.utc).isoformat()],
    )


async def list_telegram_bot_user_ids() -> list[int]:
    await ensure_telegram_bot_user_ids_table()
    _columns, rows = await _execute(
        """
        SELECT known.telegram_uid
        FROM telegram_bot_user_ids known
        LEFT JOIN "akun-telegram" account ON account.uid = known.telegram_uid
        WHERE COALESCE(account.role, 'user') NOT IN ('deleted', 'admin')
        ORDER BY known.telegram_uid
        """,
        [],
    )
    return [int(row[0]) for row in rows]


def _validate_unblock_request(uid: int, device_id: str | None = None) -> None:
    if not isinstance(uid, int) or isinstance(uid, bool) or uid <= 0:
        raise ValueError("Telegram user ID must be positive")
    if device_id is not None and not re.fullmatch(r"[0-9]{10}", device_id):
        raise ValueError("Invalid device ID")


async def list_blacklisted_devices_for_uid(uid: int) -> list[dict]:
    _validate_unblock_request(uid)
    columns, rows = await _execute(
        """
        SELECT
            d.device_id AS device_id,
            d.device_type AS device_type,
            d.os AS os,
            d.brand AS brand,
            d.model AS model,
            d.browser AS browser,
            d.browser_version AS browser_version,
            d.language AS language,
            d.timezone AS timezone,
            d.screen_w AS screen_w,
            d.screen_h AS screen_h,
            d.last_seen AS last_seen,
            b.created_at AS blocked_at
        FROM session_blacklist b
        JOIN device_ids d
          ON d.device_id = b.device_id
         AND d.uid = b.uid
        WHERE b.uid = ?
        ORDER BY b.created_at DESC
        """,
        [uid],
    )
    return [dict(zip(columns, row)) for row in rows]


async def get_blacklisted_device_for_uid(uid: int, device_id: str) -> dict | None:
    _validate_unblock_request(uid, device_id)
    columns, rows = await _execute(
        """
        SELECT
            d.device_id AS device_id,
            d.device_type AS device_type,
            d.os AS os,
            d.brand AS brand,
            d.model AS model,
            d.browser AS browser,
            d.browser_version AS browser_version,
            d.language AS language,
            d.timezone AS timezone,
            d.screen_w AS screen_w,
            d.screen_h AS screen_h,
            d.last_seen AS last_seen,
            b.created_at AS blocked_at
        FROM session_blacklist b
        JOIN device_ids d
          ON d.device_id = b.device_id
         AND d.uid = b.uid
        WHERE b.uid = ? AND b.device_id = ?
        LIMIT 1
        """,
        [uid, device_id],
    )
    return dict(zip(columns, rows[0])) if rows else None


async def unblock_device_for_uid(uid: int, device_id: str) -> bool:
    _validate_unblock_request(uid, device_id)
    _columns, rows = await _execute(
        """
        DELETE FROM session_blacklist AS blocked
        WHERE blocked.uid = ?
          AND blocked.device_id = ?
          AND EXISTS (
              SELECT 1
              FROM device_ids device
              WHERE device.uid = blocked.uid
                AND device.device_id = blocked.device_id
          )
        RETURNING blocked.device_id
        """,
        [uid, device_id],
    )
    return bool(rows)


def _telegram_login_challenge_hash(challenge: str) -> str | None:
    if not re.fullmatch(r"[A-Za-z0-9_-]{43}", challenge):
        return None
    return hashlib.sha256(challenge.encode("ascii")).hexdigest()


async def _ensure_telegram_login_challenges_table() -> None:
    await _execute(
        """
        CREATE TABLE IF NOT EXISTS telegram_login_challenges (
            challenge_hash TEXT PRIMARY KEY,
            requester_hash TEXT,
            uid INTEGER,
            status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'consumed')),
            created_at INTEGER NOT NULL,
            expires_at INTEGER NOT NULL,
            approved_at INTEGER,
            consumed_at INTEGER
        )
        """,
        [],
    )
    _cols, columns = await _execute(
        """
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'telegram_login_challenges'
        """,
        [],
    )
    if not any(str(row[0]) == "requester_hash" for row in columns):
        await _execute(
            "ALTER TABLE telegram_login_challenges ADD COLUMN requester_hash TEXT",
            [],
        )


async def is_telegram_login_challenge_pending(challenge: str) -> bool:
    challenge_hash = _telegram_login_challenge_hash(challenge)
    if not challenge_hash:
        return False
    now = int(datetime.now(timezone.utc).timestamp())
    await _ensure_telegram_login_challenges_table()
    _cols, pending = await _execute(
        """
        SELECT challenge_hash FROM telegram_login_challenges
        WHERE challenge_hash = ? AND status = 'pending' AND expires_at > ?
        LIMIT 1
        """,
        [challenge_hash, now],
    )
    return bool(pending)


async def respond_to_telegram_login_challenge(
    challenge: str,
    user,
    approve: bool,
) -> bool:
    challenge_hash = _telegram_login_challenge_hash(challenge)
    if not challenge_hash:
        return False
    now = int(datetime.now(timezone.utc).timestamp())
    now_iso = datetime.now(timezone.utc).isoformat()
    await _ensure_telegram_login_challenges_table()
    _cols, pending = await _execute(
        """
        SELECT challenge_hash FROM telegram_login_challenges
        WHERE challenge_hash = ? AND status = 'pending' AND expires_at > ?
        LIMIT 1
        """,
        [challenge_hash, now],
    )
    if not pending:
        return False

    status = "approved" if approve else "consumed"
    if approve:
        await _execute(
            """
            CREATE TABLE IF NOT EXISTS "akun-telegram" (
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
            )
            """,
            [],
        )
        await _execute(
            """
            INSERT INTO "akun-telegram"
                (uid, username, first_name, last_name, photo_url, photo_file_id,
                 auth_date, allows_write_to_pm, role, created_at, updated_at)
            VALUES (?, ?, ?, ?, NULL, NULL, ?, 1, 'user', ?, ?)
            ON CONFLICT(uid) DO UPDATE SET
                username = excluded.username,
                first_name = excluded.first_name,
                last_name = excluded.last_name,
                auth_date = excluded.auth_date,
                allows_write_to_pm = 1,
                updated_at = excluded.updated_at
            """,
            [
                user.id,
                user.username,
                user.first_name,
                user.last_name,
                now,
                now_iso,
                now_iso,
            ],
        )

    await _execute(
        """
        UPDATE telegram_login_challenges
        SET uid = ?, status = ?, approved_at = ?, consumed_at = ?
        WHERE challenge_hash = ? AND status = 'pending' AND expires_at > ?
        """,
        [
            user.id if approve else None,
            status,
            now if approve else None,
            None if approve else now,
            challenge_hash,
            now,
        ],
    )
    _cols, approved = await _execute(
        """
        SELECT uid FROM telegram_login_challenges
        WHERE challenge_hash = ? AND status = ? AND expires_at > ?
        LIMIT 1
        """,
        [challenge_hash, status, now],
    )
    return bool(
        approved
        and (not approve or int(approved[0][0]) == user.id)
        and (approve or approved[0][0] is None)
    )


def _postgres_placeholders(sql: str, args: list) -> str:
    """Replace SQLite-style ? parameters without touching quoted/commented text."""
    result: list[str] = []
    i = 0
    arg_index = 0
    length = len(sql)

    while i < length:
        char = sql[i]
        if char == "'":
            start = i
            i += 1
            while i < length:
                if sql[i] == "\\" and i + 1 < length:
                    i += 2
                elif sql[i] == "'":
                    if i + 1 < length and sql[i + 1] == "'":
                        i += 2
                    else:
                        i += 1
                        break
                else:
                    i += 1
            result.append(sql[start:i])
        elif char == '"':
            start = i
            i += 1
            while i < length:
                if sql[i] == '"':
                    if i + 1 < length and sql[i + 1] == '"':
                        i += 2
                    else:
                        i += 1
                        break
                else:
                    i += 1
            result.append(sql[start:i])
        elif sql.startswith("--", i):
            end = sql.find("\n", i)
            if end == -1:
                result.append(sql[i:])
                i = length
            else:
                result.append(sql[i:end + 1])
                i = end + 1
        elif sql.startswith("/*", i):
            start = i
            i += 2
            depth = 1
            while i < length and depth:
                if sql.startswith("/*", i):
                    depth += 1
                    i += 2
                elif sql.startswith("*/", i):
                    depth -= 1
                    i += 2
                else:
                    i += 1
            result.append(sql[start:i])
        elif char == "$":
            delimiter_match = re.match(r"\$[A-Za-z_][A-Za-z_0-9]*\$|\$\$", sql[i:])
            if delimiter_match:
                delimiter = delimiter_match.group(0)
                end = sql.find(delimiter, i + len(delimiter))
                if end != -1:
                    end += len(delimiter)
                    result.append(sql[i:end])
                    i = end
                    continue
            result.append(char)
            i += 1
        elif char == "?" and (
            i + 1 >= length or sql[i + 1] not in {"|", "&", "?"}
        ):
            arg_index += 1
            result.append(f"${arg_index}")
            i += 1
        else:
            result.append(char)
            i += 1

    if arg_index != len(args):
        raise ValueError(
            f"SQL placeholder count ({arg_index}) does not match argument count ({len(args)})"
        )
    return "".join(result)


def _statement_returns_rows(sql: str) -> bool:
    statement = re.sub(r"^(?:\s|--[^\n]*(?:\n|$)|/\*.*?\*/)*", "", sql, flags=re.S)
    return bool(re.match(r"(?is)^(SELECT|WITH)\b", statement)) or bool(
        re.search(r"(?is)\bRETURNING\b", statement)
    )


async def _execute(sql: str, args: list):
    parameters = args or []
    query = _postgres_placeholders(sql, parameters)
    pool = await _get_db_pool()
    try:
        async with pool.acquire() as connection:
            if _statement_returns_rows(query):
                records = await connection.fetch(query, *parameters)
                columns = list(records[0].keys()) if records else []
                return columns, [list(record) for record in records]
            await connection.execute(query, *parameters)
            return [], []
    except Exception as exc:
        raise RuntimeError(f"Supabase PostgreSQL query failed: {exc}") from exc

def _gen_random_id() -> str:
    return str(random.randint(1000000, 9999999))


async def _id_exists(media_id: str) -> bool:
    _cols, rows = await _execute(
        "SELECT id FROM media WHERE id = ? LIMIT 1", [media_id]
    )
    return len(rows) > 0


async def generate_unique_id() -> str:
    for _ in range(12):
        candidate = _gen_random_id()
        if not await _id_exists(candidate):
            return candidate
    raise RuntimeError("Failed to generate a unique numeric ID")


async def insert_media(row: dict) -> None:
    await _execute(
        """
        INSERT INTO media (id, owner_id, filename, storage_path, storage_message_id, content_type, file_size, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
            row["id"],
            row["owner_id"],
            row["filename"],
            row["storage_path"],
            row.get("storage_message_id"),
            row["content_type"],
            row["file_size"],
            row["expires_at"],
        ],
    )


async def fetch_media(media_id: str) -> Optional[dict]:
    cols, rows = await _execute(
        "SELECT * FROM media WHERE id = ? LIMIT 1", [media_id]
    )
    if not rows:
        return None
    return dict(zip(cols, rows[0]))


def _send_web_push(subscription: dict, payload: dict) -> None:
    webpush(
        subscription_info=subscription,
        data=json.dumps(payload),
        vapid_private_key=VAPID_PRIVATE_KEY,
        vapid_claims={"sub": VAPID_SUBJECT},
    )


async def _notify_expired_media(
    uid: int,
    notification_id: str,
    filename: str,
) -> None:
    if not VAPID_PRIVATE_KEY or not VAPID_PUBLIC_KEY:
        logger.warning("VAPID keys are not configured; media expiry push was skipped.")
        return
    try:
        _cols, rows = await _execute(
            "SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE uid = ?",
            [uid],
        )
    except Exception as exc:
        logger.error(f"Failed to load push subscriptions for account {uid}: {exc}")
        return

    payload = {
        "title": "CheyaVerse",
        "body": f"Masa expired media {filename[:60]} berakhir; data telah dihapus.",
        "icon": "/icon.png",
        "tag": f"cheya-system-expiry-{notification_id}",
        "renotify": True,
        "data": {
            "uid": uid,
            "url": f"/{uid}/chat/system",
            "contactId": "system",
            "notifId": notification_id,
            "source": "bot-message",
            "senderRole": "admin",
        },
    }

    async def send(row: list) -> None:
        endpoint, p256dh, auth = row
        subscription = {
            "endpoint": endpoint,
            "keys": {"p256dh": p256dh, "auth": auth},
        }
        try:
            await asyncio.to_thread(_send_web_push, subscription, payload)
        except WebPushException as exc:
            status = getattr(getattr(exc, "response", None), "status_code", None)
            if status in {404, 410}:
                await _execute(
                    "DELETE FROM push_subscriptions WHERE endpoint = ? AND uid = ?",
                    [endpoint, uid],
                )
            logger.warning(f"Media expiry push failed for account {uid}: {exc}")
        except Exception as exc:
            logger.error(f"Media expiry push failed for account {uid}: {exc}")

    await asyncio.gather(*(send(row) for row in rows))


async def cleanup_expired(bot=None) -> int:
    now_iso = datetime.now(timezone.utc).isoformat()
    try:
        cols, rows = await _execute(
            """
            SELECT id, owner_id, filename, storage_path, storage_message_id
            FROM media WHERE expires_at < ?
            """,
            [now_iso],
        )
    except Exception as exc:
        logger.error(f"Failed to query expired media: {exc}")
        return 0

    if not rows:
        return 0

    records = [dict(zip(cols, r)) for r in rows]
    ids = [r["id"] for r in records if r.get("id")]
    if not ids:
        return 0

    try:
        for row in records:
            object_path = row.get("storage_path")
            if object_path and row.get("storage_message_id") is None:
                await delete_media_object(str(object_path))
    except Exception as exc:
        logger.error(f"Failed to delete expired Supabase Storage object: {exc}")
        return 0

    placeholders = ",".join(["?" for _ in ids])
    try:
        await _execute(
            f"DELETE FROM media WHERE id IN ({placeholders})", ids
        )
    except Exception as exc:
        logger.error(f"Failed to delete expired rows: {exc}")
        return 0

    if bot is not None and TELEGRAM_STORAGE_CHAT_ID:
        for row in records:
            msg_id = row.get("storage_message_id")
            if not msg_id:
                continue
            try:
                await bot.delete_message(
                    chat_id=TELEGRAM_STORAGE_CHAT_ID,
                    message_id=int(msg_id),
                )
            except Exception as exc:
                logger.warning(f"Failed to delete storage message {msg_id}: {exc}")

    for row in records:
        uid = row.get("owner_id")
        if not uid:
            continue
        media_id = str(row.get("id") or "")
        filename = html.escape(str(row.get("filename") or media_id))
        created_at = datetime.now(timezone.utc).isoformat()
        message = (
            "Berkas media hasil generate barcode telah dihapus otomatis "
            "karena masa simpan telah berakhir.\n\n"
            f"<b>ID Barcode:</b> <code>{html.escape(media_id)}</code>\n"
            f"<b>Nama berkas:</b> <code>{filename}</code>\n"
            f"<b>Waktu:</b> {created_at}"
        )
        notification_id = f"expiry-{uuid.uuid4().hex}"
        message_id = f"expiry-{uuid.uuid4().hex}"
        try:
            await _execute(
                """
                INSERT INTO notifications
                    (id, uid, title, message, ip, location, device, read, created_at)
                VALUES (?, ?, ?, ?, NULL, NULL, NULL, 0, ?)
                """,
                [
                    notification_id,
                    int(uid),
                    "CheyaVerse · Admin",
                    message,
                    created_at,
                ],
            )
            await _execute(
                """
                INSERT INTO messages
                    (id, uid, sender, sender_role, title, content, created_at, delivered_at, read_at)
                VALUES (?, ?, 'bot', 'admin', ?, ?, ?, ?, NULL)
                """,
                [
                    message_id,
                    int(uid),
                    "CheyaVerse · Admin",
                    message,
                    created_at,
                    created_at,
                ],
            )
            await _notify_expired_media(
                int(uid),
                notification_id,
                str(row.get("filename") or media_id),
            )
        except Exception as exc:
            logger.error(
                f"Failed to create web expiry notification for media {media_id}: {exc}"
            )

    return len(records)