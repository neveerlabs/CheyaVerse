import json
import os
import re
import tempfile
import threading
import unicodedata
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


MEMORY_PATH = Path(__file__).resolve().parent / "data" / "memory.json"
MAX_MEMORIES = 5000
MAX_CONTENT_LENGTH = 2000
_lock = threading.RLock()
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


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def _validate_owner(owner_uid: int) -> None:
    if isinstance(owner_uid, bool) or not isinstance(owner_uid, int) or owner_uid <= 0:
        raise ValueError("A valid memory owner is required.")


def _normalize(value: str) -> str:
    return " ".join(
        unicodedata.normalize("NFKC", value).casefold().split()
    )


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


def _read() -> list[dict[str, Any]]:
    try:
        content = MEMORY_PATH.read_text(encoding="utf-8")
    except FileNotFoundError:
        return []
    try:
        document = json.loads(content)
    except json.JSONDecodeError as error:
        raise RuntimeError(f"Personal memory file is not valid JSON: {error}") from error
    if (
        not isinstance(document, dict)
        or document.get("version") != 1
        or not isinstance(document.get("memories"), list)
        or len(document["memories"]) > MAX_MEMORIES
        or any(not isinstance(item, dict) for item in document["memories"])
    ):
        raise RuntimeError("Personal memory file has an unsupported structure.")
    seen_ids: set[str] = set()
    for item in document["memories"]:
        owner_uid = item.get("owner_uid")
        memory_id = item.get("id")
        if (
            isinstance(owner_uid, bool)
            or not isinstance(owner_uid, int)
            or owner_uid <= 0
            or not isinstance(memory_id, str)
            or not re.fullmatch(r"[0-9a-f]{32}", memory_id)
            or memory_id in seen_ids
            or not isinstance(item.get("content"), str)
            or not isinstance(item.get("tags"), list)
            or any(not isinstance(tag, str) for tag in item["tags"])
            or not isinstance(item.get("created_at"), str)
            or not isinstance(item.get("updated_at"), str)
            or item.get("source") not in {"web", "telegram"}
        ):
            raise RuntimeError("Personal memory file contains an invalid record.")
        _validate_content(item["content"])
        seen_ids.add(memory_id)
    try:
        os.chmod(MEMORY_PATH, 0o600)
    except OSError as error:
        raise RuntimeError(f"Could not protect personal memory file permissions: {error}") from error
    return document["memories"]


def _write(memories: list[dict[str, Any]]) -> None:
    MEMORY_PATH.parent.mkdir(parents=True, exist_ok=True)
    temporary_path: str | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            dir=MEMORY_PATH.parent,
            prefix=".memory.",
            suffix=".tmp",
            delete=False,
        ) as temporary:
            temporary_path = temporary.name
            os.chmod(temporary_path, 0o600)
            json.dump({"version": 1, "memories": memories}, temporary, ensure_ascii=False, indent=2)
            temporary.write("\n")
            temporary.flush()
            os.fsync(temporary.fileno())
        os.replace(temporary_path, MEMORY_PATH)
        temporary_path = None
        os.chmod(MEMORY_PATH, 0o600)
    finally:
        if temporary_path and os.path.exists(temporary_path):
            os.unlink(temporary_path)


def search(owner_uid: int, query: str = "", limit: int = 20) -> list[dict[str, Any]]:
    _validate_owner(owner_uid)
    if not isinstance(query, str) or len(query) > 1000:
        raise ValueError("Memory search query must be text no longer than 1000 characters.")
    if isinstance(limit, bool) or not isinstance(limit, int) or not 1 <= limit <= 50:
        raise ValueError("Memory search limit must be between 1 and 50.")
    terms = set(re.findall(r"[\w'-]{2,}", _normalize(query)))
    with _lock:
        memories = [
            item for item in _read()
            if item.get("owner_uid") == owner_uid
        ]
    ranked = []
    for item in memories:
        content = _normalize(str(item.get("content", "")))
        tags = " ".join(str(tag) for tag in item.get("tags", []))
        searchable = _normalize(f"{content} {tags}")
        score = sum(1 for term in terms if term in searchable)
        if not terms or score:
            ranked.append((score, item))
    ranked.sort(
        key=lambda pair: (
            pair[0],
            str(pair[1].get("updated_at", "")),
            str(pair[1].get("id", "")),
        ),
        reverse=True,
    )
    return [dict(item) for _, item in ranked[:limit]]


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
    with _lock:
        memories = _read()
        normalized = _normalize(normalized_content)
        for item in memories:
            if item.get("owner_uid") == owner_uid and _normalize(str(item.get("content", ""))) == normalized:
                item["tags"] = list(dict.fromkeys([*item.get("tags", []), *normalized_tags]))
                item["updated_at"] = _now()
                item["source"] = source
                _write(memories)
                return {"created": False, "memory": dict(item)}
        if len(memories) >= MAX_MEMORIES:
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
        memories.append(item)
        _write(memories)
        return {"created": True, "memory": dict(item)}


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
    with _lock:
        memories = _read()
        for item in memories:
            if item.get("owner_uid") == owner_uid and item.get("id") == memory_id:
                if normalized_content is not None:
                    item["content"] = normalized_content
                if normalized_tags is not None:
                    item["tags"] = normalized_tags
                item["updated_at"] = _now()
                item["source"] = source
                _write(memories)
                return dict(item)
    return None


def delete(owner_uid: int, memory_id: str) -> bool:
    _validate_owner(owner_uid)
    if not isinstance(memory_id, str) or not re.fullmatch(r"[0-9a-f]{32}", memory_id):
        raise ValueError("A valid memory ID is required.")
    with _lock:
        memories = _read()
        filtered = [
            item for item in memories
            if not (item.get("owner_uid") == owner_uid and item.get("id") == memory_id)
        ]
        if len(filtered) == len(memories):
            return False
        _write(filtered)
        return True
