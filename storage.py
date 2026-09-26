import asyncio
import base64
import hashlib
import html
import json
import random
import re
import uuid
from datetime import datetime, timezone
from typing import Optional

import aiohttp

from config import (
    TURSO_URL,
    TURSO_AUTH_TOKEN,
    TELEGRAM_STORAGE_CHAT_ID,
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY,
    VAPID_SUBJECT,
)
from logger import logger
from pywebpush import WebPushException, webpush


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
        "PRAGMA table_info(telegram_login_challenges)",
        [],
    )
    if not any(str(row[1]) == "requester_hash" for row in columns):
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


def _http_url() -> str:
    if TURSO_URL.startswith("libsql://"):
        return "https://" + TURSO_URL[len("libsql://"):]
    if TURSO_URL.startswith("wss://"):
        return "https://" + TURSO_URL[len("wss://"):]
    if TURSO_URL.startswith("ws://"):
        return "http://" + TURSO_URL[len("ws://"):]
    return TURSO_URL


def _to_arg(v):
    if v is None:
        return {"type": "null"}
    if isinstance(v, bool):
        return {"type": "integer", "value": "1" if v else "0"}
    if isinstance(v, int):
        return {"type": "integer", "value": str(v)}
    if isinstance(v, float):
        return {"type": "float", "value": v}
    if isinstance(v, (bytes, bytearray)):
        return {"type": "blob", "base64": base64.b64encode(bytes(v)).decode()}
    return {"type": "text", "value": str(v)}


def _from_cell(cell):
    t = cell.get("type")
    if t == "null":
        return None
    if t == "integer":
        return int(cell["value"])
    if t == "float":
        return float(cell["value"])
    if t == "blob":
        return base64.b64decode(cell["base64"])
    return cell.get("value")


async def _execute(sql: str, args: list):
    url = f"{_http_url()}/v2/pipeline"
    body = {
        "requests": [
            {
                "type": "execute",
                "stmt": {"sql": sql, "args": [_to_arg(a) for a in args]},
            },
            {"type": "close"},
        ]
    }
    headers = {
        "Authorization": f"Bearer {TURSO_AUTH_TOKEN}",
        "Content-Type": "application/json",
    }
    timeout = aiohttp.ClientTimeout(total=30)
    async with aiohttp.ClientSession(timeout=timeout) as sess:
        async with sess.post(url, json=body, headers=headers) as resp:
            if resp.status != 200:
                text = await resp.text()
                raise RuntimeError(f"Turso HTTP {resp.status}: {text}")
            data = await resp.json()

    results = data.get("results") or []
    if not results:
        raise RuntimeError("Empty Turso response")
    first = results[0]
    if first.get("type") == "error":
        err = first.get("error") or {}
        raise RuntimeError(err.get("message", "Turso error"))
    if first.get("type") != "ok":
        raise RuntimeError(f"Unexpected Turso response: {first.get('type')}")

    response = first.get("response") or {}
    result = response.get("result") or {}
    cols = [c["name"] for c in result.get("cols", [])]
    rows = []
    for row in result.get("rows", []):
        rows.append([_from_cell(cell) for cell in row])
    return cols, rows


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
        "body": f"Masa simpan media {filename[:60]} berakhir; data dihapus.",
        "icon": "/icon.png",
        "tag": f"cheya-system-expiry-{notification_id}",
        "renotify": True,
        "data": {
            "uid": uid,
            "url": f"/{uid}/chat/system",
            "contactId": "system",
            "notifId": notification_id,
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
            "SELECT id, owner_id, filename, storage_message_id FROM media WHERE expires_at < ?",
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
            "karena masa simpannya berakhir.\n\n"
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
