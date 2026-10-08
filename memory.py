"""SQLite-backed personal long-term memory operations."""

import json
import re
import threading
import unicodedata
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import memory_telegram as database


LEGACY_MEMORY_PATH = Path(__file__).resolve().parent / "data" / "memory.json"
MAX_MEMORIES = 5000
MAX_CONTENT_LENGTH = 2000
_secret_patterns = (
    re.compile(
        r"\b(?:password|passphrase|api[_ -]?key|access[_ -]?token|refresh[_ -]?token|"
        r"client[_ -]?secret|private[_ -]?key|otp|one[- ]time code|verification code|"
        r"kode (?:login|verifikasi))\b\s*(?:is|=|:|adalah)\s*[\"']?[A-Za-z0-9_./+=-]{6,}",
        re.IGNORECASE,
    ),
    re.compile(r"\b(?:otp|verification code|kode (?:login|verifikasi))\b[^0-9]{0,20}\d{4,8}\b", re.IGNORECASE),
    re.compile(r"\b(?:gh[pousr]_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9_-]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16})\b"),
    re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
)
_initialization_lock = threading.Lock()
_initialized_paths: set[Path] = set()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def _validate_owner(owner_uid: int) -> None:
    if isinstance(owner_uid, bool) or not isinstance(owner_uid, int) or owner_uid <= 0:
        raise ValueError("A valid memory owner is required.")


def _normalize(value: str) -> str:
    return " ".join(unicodedata.normalize("NFKC", value).casefold().split())


def _validate_content(content: Any) -> str:
    if not isinstance(content, str):
        raise ValueError("Memory content must be text.")
    value = content.strip()
    if not value or len(value) > MAX_CONTENT_LENGTH:
        raise ValueError(f"Memory content must be between 1 and {MAX_CONTENT_LENGTH} characters.")
    if any(pattern.search(value) for pattern in _secret_patterns):
        raise ValueError("Passwords, tokens, login codes, keys, and credentials cannot be saved as memory.")
    return value


def _validate_tags(value: Any) -> list[str]:
    if value is None:
        return []
    if (
        not isinstance(value, list)
        or len(value) > 12
        or any(not isinstance(tag, str) or not tag.strip() or len(tag.strip()) > 48 for tag in value)
    ):
        raise ValueError("Memory tags must be a list of at most 12 short text labels.")
    return list(dict.fromkeys(tag.strip() for tag in value))


def _entry(row: Any) -> dict[str, Any]:
    try:
        tags = json.loads(str(row["tags"]))
    except (TypeError, json.JSONDecodeError) as error:
        raise RuntimeError("Personal memory database contains invalid tag data.") from error
    if (
        not isinstance(tags, list)
        or any(not isinstance(tag, str) for tag in tags)
        or row["source"] not in {"web", "telegram"}
    ):
        raise RuntimeError("Personal memory database contains an invalid record.")
    return {
        "id": str(row["id"]),
        "owner_uid": int(row["owner_uid"]),
        "content": str(row["content"]),
        "tags": tags,
        "created_at": str(row["created_at"]),
        "updated_at": str(row["updated_at"]),
        "source": str(row["source"]),
    }


def _legacy_entries() -> list[dict[str, Any]]:
    if not LEGACY_MEMORY_PATH.is_file():
        return []
    try:
        document = json.loads(LEGACY_MEMORY_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise RuntimeError(f"Legacy personal memory file could not be read: {error}") from error
    if (
        not isinstance(document, dict)
        or document.get("version") != 1
        or not isinstance(document.get("memories"), list)
        or len(document["memories"]) > MAX_MEMORIES
    ):
        raise RuntimeError("Legacy personal memory file has an unsupported structure.")
    entries = []
    seen_ids: set[str] = set()
    for item in document["memories"]:
        if not isinstance(item, dict):
            raise RuntimeError("Legacy personal memory file contains an invalid record.")
        owner_uid = item.get("owner_uid")
        memory_id = item.get("id")
        if (
            isinstance(owner_uid, bool)
            or not isinstance(owner_uid, int)
            or owner_uid <= 0
            or not isinstance(memory_id, str)
            or not re.fullmatch(r"[0-9a-f]{32}", memory_id)
            or memory_id in seen_ids
            or not isinstance(item.get("created_at"), str)
            or not isinstance(item.get("updated_at"), str)
            or item.get("source") not in {"web", "telegram"}
        ):
            raise RuntimeError("Legacy personal memory file contains an invalid record.")
        try:
            content = _validate_content(item.get("content"))
            tags = _validate_tags(item.get("tags"))
        except ValueError as error:
            raise RuntimeError(f"Legacy personal memory file contains an invalid record: {error}") from error
        entries.append({
            "id": memory_id,
            "owner_uid": owner_uid,
            "content": content,
            "tags": tags,
            "created_at": item["created_at"],
            "updated_at": item["updated_at"],
            "source": item["source"],
        })
        seen_ids.add(memory_id)
    return entries


def initialize(path: str | Path | None = None) -> None:
    target = Path(path).resolve() if path is not None else database.database_path().resolve()
    with _initialization_lock:
        if target in _initialized_paths:
            return
        database.initialize(path)
        with database.database(path) as connection:
            connection.execute("BEGIN IMMEDIATE")
            try:
                migrated = connection.execute(
                    "SELECT 1 FROM memory_migrations WHERE migration_key = ?",
                    ("legacy-memory-json-v1",),
                ).fetchone()
                if migrated is None:
                    legacy_entries = _legacy_entries()
                    connection.executemany(
                        """
                        INSERT OR IGNORE INTO memory
                            (id, owner_uid, content, tags, created_at, updated_at, source)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                        """,
                        [
                            (
                                item["id"],
                                item["owner_uid"],
                                item["content"],
                                json.dumps(item["tags"], ensure_ascii=False),
                                item["created_at"],
                                item["updated_at"],
                                item["source"],
                            )
                            for item in legacy_entries
                        ],
                    )
                    connection.execute(
                        "INSERT INTO memory_migrations (migration_key, completed_at) VALUES (?, ?)",
                        ("legacy-memory-json-v1", _now()),
                    )
                connection.commit()
            except Exception:
                connection.rollback()
                raise
        _initialized_paths.add(target)


def search(owner_uid: int, query: str = "", limit: int = 20) -> list[dict[str, Any]]:
    _validate_owner(owner_uid)
    if not isinstance(query, str) or len(query) > 1000:
        raise ValueError("Memory search query must be text no longer than 1000 characters.")
    if isinstance(limit, bool) or not isinstance(limit, int) or not 1 <= limit <= 50:
        raise ValueError("Memory search limit must be between 1 and 50.")
    initialize()
    terms = list(dict.fromkeys(re.findall(r"[\w'-]{2,}", _normalize(query))))[:32]
    sql = (
        "SELECT id, owner_uid, content, tags, created_at, updated_at, source "
        "FROM memory WHERE owner_uid = ?"
    )
    parameters: list[Any] = [owner_uid]
    if terms:
        clauses = []
        for term in terms:
            clauses.append("(content LIKE ? ESCAPE '\\' OR tags LIKE ? ESCAPE '\\')")
            escaped = term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            parameters.extend((f"%{escaped}%", f"%{escaped}%"))
        sql += " AND (" + " OR ".join(clauses) + ")"
    with database.database() as connection:
        rows = connection.execute(sql, parameters).fetchall()
    ranked = []
    for row in rows:
        item = _entry(row)
        searchable = _normalize(f"{item['content']} {' '.join(item['tags'])}")
        score = sum(1 for term in terms if term in searchable)
        ranked.append((score, item))
    ranked.sort(key=lambda pair: (pair[0], pair[1]["updated_at"], pair[1]["id"]), reverse=True)
    return [item for _, item in ranked[:limit]]


def create(
    owner_uid: int,
    content: str,
    tags: Any = None,
    source: str = "web",
) -> dict[str, Any]:
    _validate_owner(owner_uid)
    normalized_content = _validate_content(content)
    normalized_tags = _validate_tags(tags)
    if not isinstance(source, str) or source not in {"web", "telegram"}:
        raise ValueError("Memory source must be web or telegram.")
    initialize()
    with database.database() as connection:
        connection.execute("BEGIN IMMEDIATE")
        try:
            rows = connection.execute(
                "SELECT id, owner_uid, content, tags, created_at, updated_at, source "
                "FROM memory WHERE owner_uid = ?",
                (owner_uid,),
            ).fetchall()
            normalized = _normalize(normalized_content)
            for row in rows:
                item = _entry(row)
                if _normalize(item["content"]) == normalized:
                    merged_tags = list(dict.fromkeys([*item["tags"], *normalized_tags]))
                    updated_at = _now()
                    connection.execute(
                        "UPDATE memory SET tags = ?, updated_at = ?, source = ? WHERE id = ? AND owner_uid = ?",
                        (json.dumps(merged_tags, ensure_ascii=False), updated_at, source, item["id"], owner_uid),
                    )
                    connection.commit()
                    return {
                        "created": False,
                        "memory": {
                            **item,
                            "tags": merged_tags,
                            "updated_at": updated_at,
                            "source": source,
                        },
                    }
            if len(rows) >= MAX_MEMORIES:
                raise ValueError(f"Personal memory limit reached ({MAX_MEMORIES}).")
            now = _now()
            item = {
                "id": uuid.uuid4().hex,
                "owner_uid": owner_uid,
                "content": normalized_content,
                "tags": normalized_tags,
                "created_at": now,
                "updated_at": now,
                "source": source,
            }
            connection.execute(
                """
                INSERT INTO memory
                    (id, owner_uid, content, tags, created_at, updated_at, source)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    item["id"],
                    owner_uid,
                    normalized_content,
                    json.dumps(normalized_tags, ensure_ascii=False),
                    now,
                    now,
                    source,
                ),
            )
            connection.commit()
            return {"created": True, "memory": item}
        except Exception:
            connection.rollback()
            raise


def update(
    owner_uid: int,
    memory_id: str,
    content: str | None = None,
    tags: Any = None,
    source: str = "web",
) -> dict[str, Any] | None:
    _validate_owner(owner_uid)
    if not isinstance(memory_id, str) or not re.fullmatch(r"[0-9a-f]{32}", memory_id):
        raise ValueError("A valid memory ID is required.")
    normalized_content = _validate_content(content) if content is not None else None
    normalized_tags = _validate_tags(tags) if tags is not None else None
    if normalized_content is None and normalized_tags is None:
        raise ValueError("Provide memory content or tags to update.")
    if not isinstance(source, str) or source not in {"web", "telegram"}:
        raise ValueError("Memory source must be web or telegram.")
    initialize()
    with database.database() as connection:
        connection.execute("BEGIN IMMEDIATE")
        try:
            row = connection.execute(
                "SELECT id, owner_uid, content, tags, created_at, updated_at, source "
                "FROM memory WHERE owner_uid = ? AND id = ?",
                (owner_uid, memory_id),
            ).fetchone()
            if row is None:
                connection.commit()
                return None
            item = _entry(row)
            updated = {
                **item,
                "content": normalized_content if normalized_content is not None else item["content"],
                "tags": normalized_tags if normalized_tags is not None else item["tags"],
                "updated_at": _now(),
                "source": source,
            }
            connection.execute(
                """
                UPDATE memory
                SET content = ?, tags = ?, updated_at = ?, source = ?
                WHERE id = ? AND owner_uid = ?
                """,
                (
                    updated["content"],
                    json.dumps(updated["tags"], ensure_ascii=False),
                    updated["updated_at"],
                    source,
                    memory_id,
                    owner_uid,
                ),
            )
            connection.commit()
            return updated
        except Exception:
            connection.rollback()
            raise


def delete(owner_uid: int, memory_id: str) -> bool:
    _validate_owner(owner_uid)
    if not isinstance(memory_id, str) or not re.fullmatch(r"[0-9a-f]{32}", memory_id):
        raise ValueError("A valid memory ID is required.")
    initialize()
    with database.database() as connection:
        cursor = connection.execute(
            "DELETE FROM memory WHERE owner_uid = ? AND id = ?",
            (owner_uid, memory_id),
        )
        return cursor.rowcount > 0
