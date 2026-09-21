import base64
import random
from datetime import datetime, timezone
from typing import Optional

import aiohttp

from config import TURSO_URL, TURSO_AUTH_TOKEN, TELEGRAM_STORAGE_CHAT_ID
from logger import logger


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


async def cleanup_expired(bot=None) -> int:
    now_iso = datetime.now(timezone.utc).isoformat()
    try:
        cols, rows = await _execute(
            "SELECT id, storage_message_id FROM media WHERE expires_at < ?",
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

    return len(records)
