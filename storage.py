import asyncio
import random
from datetime import datetime, timezone
from typing import Optional

from config import (
    SUPABASE_URL,
    SUPABASE_KEY,
    SUPABASE_BUCKET,
    SUPABASE_TABLE,
)
from logger import logger

_client = None


def _get_client():
    global _client
    if _client is None:
        if not SUPABASE_URL or not SUPABASE_KEY:
            raise RuntimeError(
                "Supabase credentials not configured. Set SUPABASE_URL and SUPABASE_KEY in .env"
            )
        from supabase import create_client
        _client = create_client(SUPABASE_URL, SUPABASE_KEY)
    return _client


def _gen_random_id() -> str:
    return str(random.randint(1000000, 9999999))


def _id_exists_sync(media_id: str) -> bool:
    res = (
        _get_client()
        .table(SUPABASE_TABLE)
        .select("id")
        .eq("id", media_id)
        .limit(1)
        .execute()
    )
    return bool(res.data)


def _generate_unique_id_sync() -> str:
    for _ in range(12):
        candidate = _gen_random_id()
        if not _id_exists_sync(candidate):
            return candidate
    raise RuntimeError("Failed to generate a unique numeric ID")


async def generate_unique_id() -> str:
    return await asyncio.to_thread(_generate_unique_id_sync)


def _upload_sync(storage_path: str, file_bytes: bytes, content_type: str) -> None:
    _get_client().storage.from_(SUPABASE_BUCKET).upload(
        path=storage_path,
        file=file_bytes,
        file_options={
            "content-type": content_type,
            "upsert": "false",
        },
    )


def _insert_row_sync(row: dict) -> None:
    _get_client().table(SUPABASE_TABLE).insert(row).execute()


def _remove_objects_sync(paths: list) -> None:
    if not paths:
        return
    _get_client().storage.from_(SUPABASE_BUCKET).remove(paths)


async def upload_media(
    storage_path: str,
    file_bytes: bytes,
    content_type: str,
    row: dict,
) -> None:
    await asyncio.to_thread(_upload_sync, storage_path, file_bytes, content_type)
    try:
        await asyncio.to_thread(_insert_row_sync, row)
    except Exception:
        try:
            await asyncio.to_thread(_remove_objects_sync, [storage_path])
        except Exception:
            pass
        raise


def _fetch_media_sync(media_id: str) -> Optional[dict]:
    res = (
        _get_client()
        .table(SUPABASE_TABLE)
        .select("*")
        .eq("id", media_id)
        .limit(1)
        .execute()
    )
    return res.data[0] if res.data else None


async def fetch_media(media_id: str) -> Optional[dict]:
    return await asyncio.to_thread(_fetch_media_sync, media_id)


def _create_signed_url_sync(storage_path: str, expires_in: int) -> Optional[str]:
    try:
        res = _get_client().storage.from_(SUPABASE_BUCKET).create_signed_url(
            storage_path, expires_in
        )
    except Exception as exc:
        logger.error(f"Signed URL error for {storage_path}: {exc}")
        return None

    if isinstance(res, dict):
        for key in ("signedURL", "signedUrl", "signed_url"):
            val = res.get(key)
            if val:
                return val
        return None

    for attr in ("signed_url", "signedURL", "signedUrl"):
        val = getattr(res, attr, None)
        if val:
            return val
    return None


async def create_signed_url(storage_path: str, expires_in: int) -> Optional[str]:
    return await asyncio.to_thread(_create_signed_url_sync, storage_path, expires_in)


def _cleanup_expired_sync() -> int:
    client = _get_client()
    now_iso = datetime.now(timezone.utc).isoformat()

    try:
        res = (
            client.table(SUPABASE_TABLE)
            .select("id,storage_path")
            .lt("expires_at", now_iso)
            .execute()
        )
    except Exception as exc:
        logger.error(f"Failed to query expired media: {exc}")
        return 0

    rows = res.data or []
    if not rows:
        return 0

    ids = [r["id"] for r in rows if r.get("id")]
    paths = [r["storage_path"] for r in rows if r.get("storage_path")]

    if paths:
        try:
            client.storage.from_(SUPABASE_BUCKET).remove(paths)
        except Exception as exc:
            logger.error(f"Failed to remove expired objects: {exc}")

    if ids:
        try:
            client.table(SUPABASE_TABLE).delete().in_("id", ids).execute()
        except Exception as exc:
            logger.error(f"Failed to delete expired rows: {exc}")

    return len(ids)


async def cleanup_expired() -> int:
    return await asyncio.to_thread(_cleanup_expired_sync)
