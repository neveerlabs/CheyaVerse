import json
import os
import re
import secrets
import sqlite3
import tempfile
import threading
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from collections.abc import Iterator
from zoneinfo import ZoneInfo


DEFAULT_DATABASE_PATH = (
    Path(__file__).resolve().parent / "data" / "memory.sqlite3"
)
LEGACY_DEFAULT_DATABASE_PATH = DEFAULT_DATABASE_PATH.with_name(
    "telegram-ai-memory.sqlite3"
)
_schema_lock = threading.Lock()
_PUBLIC_ID_PATTERN = re.compile(r"^\d{40}$")
_LOCAL_TIMEZONE = ZoneInfo("Asia/Jakarta")
_WEEKDAYS_ID = (
    "Senin",
    "Selasa",
    "Rabu",
    "Kamis",
    "Jumat",
    "Sabtu",
    "Minggu",
)
_MONTHS_ID = (
    "Januari",
    "Februari",
    "Maret",
    "April",
    "Mei",
    "Juni",
    "Juli",
    "Agustus",
    "September",
    "Oktober",
    "November",
    "Desember",
)


def database_path() -> Path:
    configured = os.getenv("TELEGRAM_AI_MEMORY_DB_PATH", "").strip()
    if not configured:
        return DEFAULT_DATABASE_PATH

    target = Path(configured).expanduser()
    if (
        target.resolve() == LEGACY_DEFAULT_DATABASE_PATH.resolve()
        and not target.exists()
        and DEFAULT_DATABASE_PATH.exists()
    ):
        return DEFAULT_DATABASE_PATH
    return target


def connect(path: str | Path | None = None) -> sqlite3.Connection:
    target = Path(path) if path is not None else database_path()
    target.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(target, timeout=10, isolation_level=None)
    os.chmod(target, 0o600)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA busy_timeout = 10000")
    connection.execute("PRAGMA foreign_keys = ON")
    connection.execute("PRAGMA journal_mode = WAL")
    for suffix in ("-wal", "-shm"):
        sidecar = Path(f"{target}{suffix}")
        if sidecar.exists():
            os.chmod(sidecar, 0o600)
    return connection


@contextmanager
def database(path: str | Path | None = None) -> Iterator[sqlite3.Connection]:
    connection = connect(path)
    try:
        yield connection
    finally:
        connection.close()


def initialize(path: str | Path | None = None) -> None:
    with _schema_lock, database(path) as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS telegram_ai_groups (
                group_id INTEGER PRIMARY KEY,
                owner_uid INTEGER NOT NULL,
                group_title TEXT NOT NULL DEFAULT '',
                updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS telegram_ai_groups_owner
                ON telegram_ai_groups(owner_uid, updated_at DESC);

            CREATE TABLE IF NOT EXISTS telegram_ai_messages (
                id TEXT PRIMARY KEY,
                group_id INTEGER NOT NULL,
                telegram_message_id INTEGER NOT NULL,
                sender_uid INTEGER,
                sender_name TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                media_types TEXT NOT NULL DEFAULT '',
                reply_to_message_id TEXT,
                telegram_reply_to_message_id INTEGER,
                timestamp TEXT NOT NULL,
                UNIQUE(group_id, telegram_message_id)
            );
            CREATE TABLE IF NOT EXISTS telegram_ai_insights (
                id TEXT PRIMARY KEY,
                group_id INTEGER NOT NULL,
                owner_uid INTEGER NOT NULL,
                telegram_message_id INTEGER NOT NULL,
                summary TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                UNIQUE(group_id, telegram_message_id)
            );
            CREATE TABLE IF NOT EXISTS memory (
                id TEXT PRIMARY KEY,
                owner_uid INTEGER NOT NULL,
                content TEXT NOT NULL,
                tags TEXT NOT NULL DEFAULT '[]',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                source TEXT NOT NULL CHECK (source IN ('web', 'telegram'))
            );
            CREATE INDEX IF NOT EXISTS memory_owner_updated
                ON memory(owner_uid, updated_at DESC, id);
            CREATE TABLE IF NOT EXISTS memory_migrations (
                migration_key TEXT PRIMARY KEY,
                completed_at TEXT NOT NULL
            );
            CREATE VIRTUAL TABLE IF NOT EXISTS telegram_ai_messages_fts
                USING fts5(content, content='telegram_ai_messages', content_rowid='rowid');
            CREATE TRIGGER IF NOT EXISTS telegram_ai_messages_ai
                AFTER INSERT ON telegram_ai_messages BEGIN
                    INSERT INTO telegram_ai_messages_fts(rowid, content)
                    VALUES (new.rowid, new.content);
                END;
            CREATE TRIGGER IF NOT EXISTS telegram_ai_messages_ad
                AFTER DELETE ON telegram_ai_messages BEGIN
                    INSERT INTO telegram_ai_messages_fts(telegram_ai_messages_fts, rowid, content)
                    VALUES ('delete', old.rowid, old.content);
                END;
            CREATE TRIGGER IF NOT EXISTS telegram_ai_messages_au
                AFTER UPDATE OF content ON telegram_ai_messages BEGIN
                    INSERT INTO telegram_ai_messages_fts(telegram_ai_messages_fts, rowid, content)
                    VALUES ('delete', old.rowid, old.content);
                    INSERT INTO telegram_ai_messages_fts(rowid, content)
                    VALUES (new.rowid, new.content);
                END;

            CREATE VIRTUAL TABLE IF NOT EXISTS telegram_ai_insights_fts
                USING fts5(summary, content='telegram_ai_insights', content_rowid='rowid');
            CREATE TRIGGER IF NOT EXISTS telegram_ai_insights_ai
                AFTER INSERT ON telegram_ai_insights BEGIN
                    INSERT INTO telegram_ai_insights_fts(rowid, summary)
                    VALUES (new.rowid, new.summary);
                END;
            CREATE TRIGGER IF NOT EXISTS telegram_ai_insights_ad
                AFTER DELETE ON telegram_ai_insights BEGIN
                    INSERT INTO telegram_ai_insights_fts(telegram_ai_insights_fts, rowid, summary)
                    VALUES ('delete', old.rowid, old.summary);
                END;
            CREATE TRIGGER IF NOT EXISTS telegram_ai_insights_au
                AFTER UPDATE OF summary ON telegram_ai_insights BEGIN
                    INSERT INTO telegram_ai_insights_fts(telegram_ai_insights_fts, rowid, summary)
                    VALUES ('delete', old.rowid, old.summary);
                    INSERT INTO telegram_ai_insights_fts(rowid, summary)
                    VALUES (new.rowid, new.summary);
                END;
            """
        )
        _migrate_public_ids(connection)
        connection.executescript(
            """
            CREATE TRIGGER IF NOT EXISTS telegram_ai_messages_ai
                AFTER INSERT ON telegram_ai_messages BEGIN
                    INSERT INTO telegram_ai_messages_fts(rowid, content)
                    VALUES (new.rowid, new.content);
                END;
            CREATE TRIGGER IF NOT EXISTS telegram_ai_messages_ad
                AFTER DELETE ON telegram_ai_messages BEGIN
                    INSERT INTO telegram_ai_messages_fts(telegram_ai_messages_fts, rowid, content)
                    VALUES ('delete', old.rowid, old.content);
                END;
            CREATE TRIGGER IF NOT EXISTS telegram_ai_messages_au
                AFTER UPDATE OF content ON telegram_ai_messages BEGIN
                    INSERT INTO telegram_ai_messages_fts(telegram_ai_messages_fts, rowid, content)
                    VALUES ('delete', old.rowid, old.content);
                    INSERT INTO telegram_ai_messages_fts(rowid, content)
                    VALUES (new.rowid, new.content);
                END;
            """
        )
        connection.execute(
            "CREATE INDEX IF NOT EXISTS telegram_ai_messages_time "
            "ON telegram_ai_messages(group_id, timestamp DESC)"
        )
        connection.execute(
            "CREATE INDEX IF NOT EXISTS telegram_ai_insights_time "
            "ON telegram_ai_insights(group_id, owner_uid, timestamp DESC)"
        )


def _normalize_timestamp(value: str | datetime | None = None) -> str:
    if value is None:
        parsed = datetime.now(timezone.utc)
    elif isinstance(value, datetime):
        parsed = value
    elif isinstance(value, str):
        normalized = value.strip()
        if not normalized:
            raise ValueError("Message timestamp must not be empty.")
        try:
            parsed = datetime.fromisoformat(normalized.replace("Z", "+00:00"))
        except ValueError as error:
            raise ValueError("Message timestamp must be a valid ISO-8601 value.") from error
    else:
        raise TypeError("Message timestamp must be an ISO-8601 string or datetime.")
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(_LOCAL_TIMEZONE).isoformat(timespec="milliseconds")


def _timestamp() -> str:
    return _normalize_timestamp()


def _timestamp_fields(value: str) -> dict[str, str]:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(
        _LOCAL_TIMEZONE
    )
    readable = (
        f"{_WEEKDAYS_ID[parsed.weekday()]}, {parsed.day} "
        f"{_MONTHS_ID[parsed.month - 1]} {parsed.year} "
        f"{parsed.hour:02d}:{parsed.minute:02d} WIB"
    )
    return {
        "timestamp": readable,
        "timestampIso": parsed.isoformat(timespec="milliseconds"),
    }


def _new_public_id(connection: sqlite3.Connection, table: str) -> str:
    if table not in {"telegram_ai_messages", "telegram_ai_insights"}:
        raise ValueError("Unsupported Telegram memory table.")
    for _ in range(100):
        candidate = f"{secrets.randbelow(9 * 10**39) + 10**39:040d}"
        if all(
            connection.execute(
                f"SELECT 1 FROM {candidate_table} WHERE id = ? LIMIT 1",
                (candidate,),
            ).fetchone()
            is None
            for candidate_table in ("telegram_ai_messages", "telegram_ai_insights")
        ):
            return candidate
    raise RuntimeError(f"Could not allocate a unique 40-digit ID for {table}.")


def _migrate_public_ids(connection: sqlite3.Connection) -> None:
    version = int(connection.execute("PRAGMA user_version").fetchone()[0])
    if version >= 3:
        return
    columns = {
        str(row["name"])
        for row in connection.execute("PRAGMA table_info(telegram_ai_messages)")
    }
    column_types = {
        str(row["name"]): str(row["type"]).upper()
        for row in connection.execute("PRAGMA table_info(telegram_ai_messages)")
    }
    if "telegram_reply_to_message_id" not in columns:
        connection.execute(
            "ALTER TABLE telegram_ai_messages ADD COLUMN telegram_reply_to_message_id INTEGER"
        )
    if "sender_kind" in columns and "role" not in columns:
        connection.execute(
            "ALTER TABLE telegram_ai_messages RENAME COLUMN sender_kind TO role"
        )
    if "created_at" in columns and "timestamp" not in columns:
        connection.execute(
            "ALTER TABLE telegram_ai_messages RENAME COLUMN created_at TO timestamp"
        )
    insight_columns = {
        str(row["name"])
        for row in connection.execute("PRAGMA table_info(telegram_ai_insights)")
    }
    if "created_at" in insight_columns and "timestamp" not in insight_columns:
        connection.execute(
            "ALTER TABLE telegram_ai_insights RENAME COLUMN created_at TO timestamp"
        )

    connection.execute("BEGIN IMMEDIATE")
    try:
        connection.execute(
            """
            UPDATE telegram_ai_messages
            SET telegram_reply_to_message_id = reply_to_message_id
            WHERE telegram_reply_to_message_id IS NULL
              AND reply_to_message_id IS NOT NULL
            """
        )
        connection.execute(
            "UPDATE telegram_ai_messages SET role = 'admin' WHERE role = 'user'"
        )
        for table in ("telegram_ai_messages", "telegram_ai_insights"):
            rows = connection.execute(
                f"SELECT rowid, id FROM {table} "
                "WHERE id IS NULL OR length(id) != 40 OR id GLOB '*[^0-9]*' "
                "OR EXISTS (SELECT 1 FROM "
                + (
                    "telegram_ai_insights"
                    if table == "telegram_ai_messages"
                    else "telegram_ai_messages"
                )
                + f" AS other WHERE other.id = {table}.id)"
            ).fetchall()
            for row in rows:
                connection.execute(
                    f"UPDATE {table} SET id = ? WHERE rowid = ?",
                    (_new_public_id(connection, table), int(row["rowid"])),
                )
        for table in ("telegram_ai_messages", "telegram_ai_insights"):
            rows = connection.execute(
                f"SELECT rowid, timestamp FROM {table}"
            ).fetchall()
            for row in rows:
                connection.execute(
                    f"UPDATE {table} SET timestamp = ? WHERE rowid = ?",
                    (_normalize_timestamp(str(row["timestamp"])), int(row["rowid"])),
                )
        if column_types.get("reply_to_message_id") != "TEXT":
            connection.execute(
                """
                CREATE TABLE telegram_ai_messages_new (
                    id TEXT PRIMARY KEY,
                    group_id INTEGER NOT NULL,
                    telegram_message_id INTEGER NOT NULL,
                    sender_uid INTEGER,
                    sender_name TEXT NOT NULL,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    media_types TEXT NOT NULL DEFAULT '',
                    reply_to_message_id TEXT,
                    telegram_reply_to_message_id INTEGER,
                    timestamp TEXT NOT NULL,
                    UNIQUE(group_id, telegram_message_id)
                )
                """
            )
            connection.execute(
                """
                INSERT INTO telegram_ai_messages_new(
                    rowid, id, group_id, telegram_message_id, sender_uid, sender_name,
                    role, content, media_types, reply_to_message_id,
                    telegram_reply_to_message_id, timestamp
                )
                SELECT rowid, id, group_id, telegram_message_id, sender_uid, sender_name,
                       role, content, media_types, reply_to_message_id,
                       telegram_reply_to_message_id, timestamp
                FROM telegram_ai_messages
                """
            )
            connection.execute("DROP TABLE telegram_ai_messages")
            connection.execute(
                "ALTER TABLE telegram_ai_messages_new RENAME TO telegram_ai_messages"
            )
            connection.execute(
                "INSERT INTO telegram_ai_messages_fts(telegram_ai_messages_fts) "
                "VALUES ('rebuild')"
            )
        connection.execute(
            """
            UPDATE telegram_ai_messages
            SET reply_to_message_id = (
                SELECT target.id
                FROM telegram_ai_messages AS target
                WHERE target.group_id = telegram_ai_messages.group_id
                  AND target.telegram_message_id =
                      telegram_ai_messages.telegram_reply_to_message_id
                LIMIT 1
            )
            WHERE telegram_reply_to_message_id IS NOT NULL
            """
        )
        connection.execute(
            """
            CREATE INDEX IF NOT EXISTS telegram_ai_messages_telegram_reply
                ON telegram_ai_messages(group_id, telegram_reply_to_message_id)
            """
        )
        connection.execute("PRAGMA user_version = 3")
        connection.commit()
    except Exception:
        connection.rollback()
        raise


def _group_metadata(
    connection: sqlite3.Connection,
    group_id: int,
    owner_uid: int,
    group_title: str,
) -> None:
    connection.execute(
        """
        INSERT INTO telegram_ai_groups(group_id, owner_uid, group_title, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(group_id) DO UPDATE SET
            owner_uid = excluded.owner_uid,
            group_title = excluded.group_title,
            updated_at = excluded.updated_at
        """,
        (group_id, owner_uid, group_title[:200], _timestamp()),
    )


def _store_owner_message_in_transaction(
    connection: Any,
    *,
    group_id: int,
    owner_uid: int,
    group_title: str,
    message_id: int,
    sender_name: str,
    content: str,
    media_types: list[str],
    reply_to_message_id: int | None,
    edited: bool,
    timestamp: str | datetime | None,
) -> str:
    _group_metadata(connection, group_id, owner_uid, group_title)
    existing = connection.execute(
        """
        SELECT id FROM telegram_ai_messages
        WHERE group_id = ? AND telegram_message_id = ? LIMIT 1
        """,
        (group_id, message_id),
    ).fetchone()
    public_reply_id = None
    if reply_to_message_id is not None:
        replied = connection.execute(
            """
            SELECT id FROM telegram_ai_messages
            WHERE group_id = ? AND telegram_message_id = ? LIMIT 1
            """,
            (group_id, reply_to_message_id),
        ).fetchone()
        public_reply_id = str(replied["id"]) if replied else None
    cursor = connection.execute(
        """
        INSERT INTO telegram_ai_messages(
            id, group_id, telegram_message_id, sender_uid, sender_name,
            role, content, media_types, reply_to_message_id,
            telegram_reply_to_message_id, timestamp
        )
        VALUES (?, ?, ?, ?, ?, 'admin', ?, ?, ?, ?, ?)
        ON CONFLICT(group_id, telegram_message_id) DO UPDATE SET
            sender_uid = excluded.sender_uid,
            sender_name = excluded.sender_name,
            content = excluded.content,
            media_types = excluded.media_types,
            reply_to_message_id = excluded.reply_to_message_id,
            telegram_reply_to_message_id = excluded.telegram_reply_to_message_id,
            timestamp = excluded.timestamp
        WHERE ?
        """,
        (
            str(existing["id"])
            if existing
            else _new_public_id(connection, "telegram_ai_messages"),
            group_id,
            message_id,
            owner_uid,
            sender_name[:120],
            content[:4000],
            ",".join(media_types[:8]),
            public_reply_id,
            reply_to_message_id,
            _normalize_timestamp(timestamp),
            int(edited),
        ),
    )
    return "stored" if cursor.rowcount else "duplicate"


def _store_insight_in_transaction(
    connection: Any,
    *,
    group_id: int,
    owner_uid: int,
    group_title: str,
    message_id: int,
    summary: str,
    replace: bool,
) -> None:
    _group_metadata(connection, group_id, owner_uid, group_title)
    source_message = connection.execute(
        """
        SELECT id, timestamp FROM telegram_ai_messages
        WHERE group_id = ? AND telegram_message_id = ? AND sender_uid = ?
        LIMIT 1
        """,
        (group_id, message_id, owner_uid),
    ).fetchone()
    if source_message is None:
        raise ValueError("Insight source message is not stored for this owner.")
    existing = connection.execute(
        """
        SELECT id FROM telegram_ai_insights
        WHERE group_id = ? AND telegram_message_id = ? LIMIT 1
        """,
        (group_id, message_id),
    ).fetchone()
    if not summary.strip():
        if replace:
            connection.execute(
                """
                DELETE FROM telegram_ai_insights
                WHERE group_id = ? AND owner_uid = ? AND telegram_message_id = ?
                """,
                (group_id, owner_uid, message_id),
            )
        return
    connection.execute(
        """
        INSERT INTO telegram_ai_insights(
            id, group_id, owner_uid, telegram_message_id, summary, timestamp
        )
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(group_id, telegram_message_id) DO UPDATE SET
            owner_uid = excluded.owner_uid,
            summary = excluded.summary,
            timestamp = excluded.timestamp
        """,
        (
            str(existing["id"])
            if existing
            else _new_public_id(connection, "telegram_ai_insights"),
            group_id,
            owner_uid,
            message_id,
            summary.strip()[:1600],
            str(source_message["timestamp"]),
        ),
    )


def owner_message_exists(group_id: int, owner_uid: int, message_id: int) -> bool:
    initialize()
    with database() as connection:
        row = connection.execute(
            """
            SELECT 1 FROM telegram_ai_messages
            WHERE group_id = ? AND telegram_message_id = ? AND sender_uid = ?
            LIMIT 1
            """,
            (group_id, message_id, owner_uid),
        ).fetchone()
    return row is not None


def store_owner_message(
    *,
    group_id: int,
    owner_uid: int,
    group_title: str,
    message_id: int,
    sender_name: str,
    content: str,
    media_types: list[str],
    reply_to_message_id: int | None,
    edited: bool,
    timestamp: str | datetime | None = None,
) -> str:
    initialize()
    with database() as connection:
        connection.execute("BEGIN IMMEDIATE")
        result = _store_owner_message_in_transaction(
            connection,
            group_id=group_id,
            owner_uid=owner_uid,
            group_title=group_title,
            message_id=message_id,
            sender_name=sender_name,
            content=content,
            media_types=media_types,
            reply_to_message_id=reply_to_message_id,
            edited=edited,
            timestamp=timestamp,
        )
        connection.commit()
        return result


def store_processed_owner_message(
    *,
    group_id: int,
    owner_uid: int,
    group_title: str,
    message_id: int,
    sender_name: str,
    content: str,
    media_types: list[str],
    reply_to_message_id: int | None,
    edited: bool,
    timestamp: str | datetime | None,
    summary: str,
) -> str:
    initialize()
    with database() as connection:
        connection.execute("BEGIN IMMEDIATE")
        result = _store_owner_message_in_transaction(
            connection,
            group_id=group_id,
            owner_uid=owner_uid,
            group_title=group_title,
            message_id=message_id,
            sender_name=sender_name,
            content=content,
            media_types=media_types,
            reply_to_message_id=reply_to_message_id,
            edited=edited,
            timestamp=timestamp,
        )
        if result == "stored":
            _store_insight_in_transaction(
                connection,
                group_id=group_id,
                owner_uid=owner_uid,
                group_title=group_title,
                message_id=message_id,
                summary=summary,
                replace=edited,
            )
        connection.commit()
        return result


def store_bot_message(
    *,
    group_id: int,
    message_id: int,
    content: str,
    reply_to_message_id: int | None,
    timestamp: str | datetime | None = None,
) -> None:
    initialize()
    with database() as connection:
        connection.execute("BEGIN IMMEDIATE")
        existing = connection.execute(
            """
            SELECT id FROM telegram_ai_messages
            WHERE group_id = ? AND telegram_message_id = ? LIMIT 1
            """,
            (group_id, message_id),
        ).fetchone()
        replied = None
        if reply_to_message_id is not None:
            replied = connection.execute(
                """
                SELECT id FROM telegram_ai_messages
                WHERE group_id = ? AND telegram_message_id = ? LIMIT 1
                """,
                (group_id, reply_to_message_id),
            ).fetchone()
        connection.execute(
            """
            INSERT INTO telegram_ai_messages(
                id, group_id, telegram_message_id, sender_uid, sender_name,
                role, content, media_types, reply_to_message_id,
                telegram_reply_to_message_id, timestamp
            )
            VALUES (?, ?, ?, NULL, 'Cheya', 'bot', ?, '', ?, ?, ?)
            ON CONFLICT(group_id, telegram_message_id) DO NOTHING
            """,
            (
                str(existing["id"])
                if existing
                else _new_public_id(connection, "telegram_ai_messages"),
                group_id,
                message_id,
                content[:4000],
                str(replied["id"]) if replied else None,
                reply_to_message_id,
                _normalize_timestamp(timestamp),
            ),
        )
        connection.commit()


def get_insight(group_id: int, owner_uid: int, message_id: int) -> str | None:
    initialize()
    with database() as connection:
        row = connection.execute(
            """
            SELECT summary FROM telegram_ai_insights
            WHERE group_id = ? AND owner_uid = ? AND telegram_message_id = ?
            """,
            (group_id, owner_uid, message_id),
        ).fetchone()
    return str(row["summary"]) if row else None


def store_insight(
    *,
    group_id: int,
    owner_uid: int,
    group_title: str,
    message_id: int,
    summary: str,
    replace: bool,
) -> None:
    initialize()
    with database() as connection:
        connection.execute("BEGIN IMMEDIATE")
        _store_insight_in_transaction(
            connection,
            group_id=group_id,
            owner_uid=owner_uid,
            group_title=group_title,
            message_id=message_id,
            summary=summary,
            replace=replace,
        )
        connection.commit()


def _fts_query(query: str) -> str:
    tokens = re.findall(r"[^\W_]+", query[:1000], flags=re.UNICODE)[:16]
    return " OR ".join(f'"{token.replace(chr(34), chr(34) * 2)}"' for token in tokens)


def _rows(connection: sqlite3.Connection, sql: str, args: tuple[Any, ...]) -> list[sqlite3.Row]:
    return list(connection.execute(sql, args).fetchall())


def retrieve_group_memory(
    group_id: int, owner_uid: int, query: str, reply_to_message_id: int | None
) -> list[dict[str, Any]]:
    initialize()
    normalized = query.strip()[:1000]
    fts_query = _fts_query(normalized)
    insight_limit = 32 if re.search(
        r"\b(kebiasaan|habit|pola|rutinitas|biasanya|sering|selalu|preferensi|suka|mood|emosi|perasaan|feeling|suasana hati|akhir-akhir)\b",
        normalized,
        re.IGNORECASE,
    ) else 8
    with database() as connection:
        recent = _rows(
            connection,
            """
            SELECT id, telegram_message_id, sender_name, role, content, timestamp,
                   media_types, reply_to_message_id
            FROM telegram_ai_messages
            WHERE group_id = ? AND (
                sender_uid = ? OR (
                    role = 'bot' AND EXISTS (
                        SELECT 1 FROM telegram_ai_messages AS owner_message
                        WHERE owner_message.group_id = telegram_ai_messages.group_id
                          AND owner_message.telegram_message_id =
                              telegram_ai_messages.telegram_reply_to_message_id
                          AND owner_message.sender_uid = ?
                    )
                )
            )
            ORDER BY timestamp DESC, telegram_message_id DESC LIMIT 12
            """,
            (group_id, owner_uid, owner_uid),
        )
        relevant: list[sqlite3.Row] = []
        if fts_query:
            relevant = _rows(
                connection,
                """
                SELECT message.id, message.telegram_message_id, message.sender_name,
                       message.role, message.content, message.timestamp,
                       message.media_types, message.reply_to_message_id
                FROM telegram_ai_messages_fts
                JOIN telegram_ai_messages AS message
                  ON message.rowid = telegram_ai_messages_fts.rowid
                WHERE telegram_ai_messages_fts MATCH ?
                  AND message.group_id = ? AND (
                    message.sender_uid = ? OR (
                        message.role = 'bot' AND EXISTS (
                            SELECT 1 FROM telegram_ai_messages AS owner_message
                            WHERE owner_message.group_id = message.group_id
                              AND owner_message.telegram_message_id =
                                  message.telegram_reply_to_message_id
                              AND owner_message.sender_uid = ?
                        )
                    )
                  )
                ORDER BY bm25(telegram_ai_messages_fts), message.timestamp DESC
                LIMIT 12
                """,
                (fts_query, group_id, owner_uid, owner_uid),
            )
        replied: list[sqlite3.Row] = []
        if reply_to_message_id is not None:
            replied = _rows(
                connection,
                """
                SELECT id, telegram_message_id, sender_name, role, content,
                       timestamp, media_types, reply_to_message_id
                FROM telegram_ai_messages
                WHERE group_id = ? AND telegram_message_id = ? AND (
                    sender_uid = ? OR (
                        role = 'bot' AND EXISTS (
                            SELECT 1 FROM telegram_ai_messages AS owner_message
                            WHERE owner_message.group_id = telegram_ai_messages.group_id
                              AND owner_message.telegram_message_id =
                                  telegram_ai_messages.telegram_reply_to_message_id
                              AND owner_message.sender_uid = ?
                        )
                    )
                )
                LIMIT 1
                """,
                (group_id, reply_to_message_id, owner_uid, owner_uid),
            )
        recent_insights = _rows(
            connection,
            """
            SELECT insight.id, insight.telegram_message_id, source_message.id AS message_id,
                   insight.summary, insight.timestamp
            FROM telegram_ai_insights AS insight
            JOIN telegram_ai_messages AS source_message
              ON source_message.group_id = insight.group_id
             AND source_message.telegram_message_id = insight.telegram_message_id
            WHERE insight.group_id = ? AND insight.owner_uid = ?
            ORDER BY insight.timestamp DESC LIMIT ?
            """,
            (group_id, owner_uid, insight_limit),
        )
        relevant_insights: list[sqlite3.Row] = []
        if fts_query:
            relevant_insights = _rows(
                connection,
                """
                SELECT insight.id, insight.telegram_message_id,
                       source_message.id AS message_id, insight.summary, insight.timestamp
                FROM telegram_ai_insights_fts
                JOIN telegram_ai_insights AS insight
                  ON insight.rowid = telegram_ai_insights_fts.rowid
                JOIN telegram_ai_messages AS source_message
                  ON source_message.group_id = insight.group_id
                 AND source_message.telegram_message_id = insight.telegram_message_id
                WHERE telegram_ai_insights_fts MATCH ?
                  AND insight.group_id = ? AND insight.owner_uid = ?
                ORDER BY bm25(telegram_ai_insights_fts), insight.timestamp DESC
                LIMIT ?
                """,
                (fts_query, group_id, owner_uid, insight_limit),
            )
        replied_insight: list[sqlite3.Row] = []
        if reply_to_message_id is not None:
            replied_insight = _rows(
                connection,
                """
                SELECT insight.id, insight.telegram_message_id,
                       source_message.id AS message_id, insight.summary, insight.timestamp
                FROM telegram_ai_insights AS insight
                JOIN telegram_ai_messages AS source_message
                  ON source_message.group_id = insight.group_id
                 AND source_message.telegram_message_id = insight.telegram_message_id
                WHERE insight.group_id = ? AND insight.owner_uid = ?
                  AND insight.telegram_message_id = ? LIMIT 1
                """,
                (group_id, owner_uid, reply_to_message_id),
            )

    messages_by_id: dict[str, sqlite3.Row] = {}
    for row in [*replied, *relevant, *recent]:
        messages_by_id.setdefault(str(row["id"]), row)
        if len(messages_by_id) >= 24:
            break
    matched_message_ids = {
        str(row["id"]) for row in [*replied, *relevant]
    }
    messages = [
        {
            "id": str(row["id"]),
            "messageId": str(row["id"]),
            "senderName": str(row["sender_name"] or "Group member"),
            "role": str(row["role"]),
            "matched": str(row["id"]) in matched_message_ids,
            "content": str(row["content"] or "")[:1200],
            **_timestamp_fields(str(row["timestamp"])),
            "mediaTypes": [item for item in str(row["media_types"] or "").split(",") if item],
            "replyToMessageId": (
                str(row["reply_to_message_id"])
                if row["reply_to_message_id"] is not None
                else None
            ),
        }
        for row in sorted(messages_by_id.values(), key=lambda item: str(item["timestamp"]))
    ]
    insights_by_id: dict[str, sqlite3.Row] = {}
    for row in [*replied_insight, *relevant_insights, *recent_insights]:
        insights_by_id.setdefault(str(row["id"]), row)
        if len(insights_by_id) >= 16:
            break
    matched_insight_ids = {
        str(row["id"]) for row in [*replied_insight, *relevant_insights]
    }
    memories = [
        {
            "id": str(row["id"]),
            "messageId": str(row["message_id"]),
            "senderName": "Long-term memory",
            "role": "memory",
            "matched": str(row["id"]) in matched_insight_ids,
            "content": str(row["summary"] or "")[:1600],
            **_timestamp_fields(str(row["timestamp"])),
            "mediaTypes": [],
            "replyToMessageId": None,
        }
        for row in insights_by_id.values()
    ]
    return sorted([*messages, *memories], key=lambda item: item["timestampIso"])


def retrieve_owner_memory(owner_uid: int, query: str) -> list[dict[str, Any]]:
    initialize()
    normalized = query.strip()[:1000]
    fts_query = _fts_query(normalized)
    with database() as connection:
        recent_summaries = _rows(
            connection,
            """
            SELECT groups.group_id, groups.group_title, insight.id,
                   source_message.id AS message_id, insight.summary AS content,
                   insight.timestamp
            FROM telegram_ai_groups AS groups
            JOIN telegram_ai_insights AS insight ON insight.group_id = groups.group_id
            JOIN telegram_ai_messages AS source_message
              ON source_message.group_id = insight.group_id
             AND source_message.telegram_message_id = insight.telegram_message_id
            WHERE groups.owner_uid = ? AND insight.owner_uid = ?
            ORDER BY insight.timestamp DESC LIMIT 10
            """,
            (owner_uid, owner_uid),
        )
        recent_replies = _rows(
            connection,
            """
            SELECT groups.group_id, groups.group_title, message.id,
                   message.telegram_message_id,
                   message.content, message.timestamp
            FROM telegram_ai_groups AS groups
            JOIN telegram_ai_messages AS message ON message.group_id = groups.group_id
            WHERE groups.owner_uid = ? AND message.role = 'bot'
              AND EXISTS (
                SELECT 1 FROM telegram_ai_messages AS owner_message
                WHERE owner_message.group_id = message.group_id
                  AND owner_message.telegram_message_id = message.telegram_reply_to_message_id
                  AND owner_message.sender_uid = groups.owner_uid
              )
            ORDER BY message.timestamp DESC LIMIT 8
            """,
            (owner_uid,),
        )
        recent_messages = _rows(
            connection,
            """
            SELECT groups.group_id, groups.group_title, message.id,
                   message.telegram_message_id, message.content, message.timestamp
            FROM telegram_ai_groups AS groups
            JOIN telegram_ai_messages AS message ON message.group_id = groups.group_id
            WHERE groups.owner_uid = ? AND message.sender_uid = ?
            ORDER BY message.timestamp DESC, message.telegram_message_id DESC LIMIT 8
            """,
            (owner_uid, owner_uid),
        )
        matching_summaries: list[sqlite3.Row] = []
        matching_replies: list[sqlite3.Row] = []
        matching_messages: list[sqlite3.Row] = []
        if fts_query:
            matching_summaries = _rows(
                connection,
                """
                SELECT groups.group_id, groups.group_title, insight.id,
                       source_message.id AS message_id, insight.summary AS content,
                       insight.timestamp
                FROM telegram_ai_insights_fts
                JOIN telegram_ai_insights AS insight
                  ON insight.rowid = telegram_ai_insights_fts.rowid
                JOIN telegram_ai_groups AS groups ON groups.group_id = insight.group_id
                JOIN telegram_ai_messages AS source_message
                  ON source_message.group_id = insight.group_id
                 AND source_message.telegram_message_id = insight.telegram_message_id
                WHERE telegram_ai_insights_fts MATCH ?
                  AND groups.owner_uid = ? AND insight.owner_uid = ?
                ORDER BY bm25(telegram_ai_insights_fts), insight.timestamp DESC LIMIT 12
                """,
                (fts_query, owner_uid, owner_uid),
            )
            matching_replies = _rows(
                connection,
                """
                SELECT groups.group_id, groups.group_title, message.id,
                       message.telegram_message_id,
                       message.content, message.timestamp
                FROM telegram_ai_messages_fts
                JOIN telegram_ai_messages AS message
                  ON message.rowid = telegram_ai_messages_fts.rowid
                JOIN telegram_ai_groups AS groups ON groups.group_id = message.group_id
                WHERE telegram_ai_messages_fts MATCH ?
                  AND groups.owner_uid = ? AND message.role = 'bot'
                  AND EXISTS (
                    SELECT 1 FROM telegram_ai_messages AS owner_message
                    WHERE owner_message.group_id = message.group_id
                      AND owner_message.telegram_message_id = message.telegram_reply_to_message_id
                      AND owner_message.sender_uid = groups.owner_uid
                  )
                ORDER BY bm25(telegram_ai_messages_fts), message.timestamp DESC LIMIT 8
                """,
                (fts_query, owner_uid),
            )
            matching_messages = _rows(
                connection,
                """
                SELECT groups.group_id, groups.group_title, message.id,
                       message.telegram_message_id, message.content, message.timestamp
                FROM telegram_ai_messages_fts
                JOIN telegram_ai_messages AS message
                  ON message.rowid = telegram_ai_messages_fts.rowid
                JOIN telegram_ai_groups AS groups ON groups.group_id = message.group_id
                WHERE telegram_ai_messages_fts MATCH ?
                  AND groups.owner_uid = ? AND message.sender_uid = ?
                ORDER BY bm25(telegram_ai_messages_fts), message.timestamp DESC
                LIMIT 12
                """,
                (fts_query, owner_uid, owner_uid),
            )

    entries: dict[str, dict[str, Any]] = {}
    matching_keys: set[str] = set()
    for row in [*recent_messages, *matching_messages]:
        item = {
            "groupId": int(row["group_id"]),
            "groupTitle": str(row["group_title"] or ""),
            "id": str(row["id"]),
            "messageId": str(row["id"]),
            "source": "message",
            "matched": False,
            "content": str(row["content"] or "")[:1200],
            **_timestamp_fields(str(row["timestamp"])),
        }
        key = f'{item["groupId"]}:{row["telegram_message_id"]}:message'
        entries[key] = item
    for row in matching_messages:
        matching_keys.add(f'{row["group_id"]}:{row["telegram_message_id"]}:message')
    for row in [*recent_summaries, *matching_summaries]:
        item = {
            "groupId": int(row["group_id"]),
            "groupTitle": str(row["group_title"] or ""),
            "id": str(row["id"]),
            "messageId": str(row["message_id"]),
            "source": "summary",
            "matched": False,
            "content": str(row["content"] or "")[:800],
            **_timestamp_fields(str(row["timestamp"])),
        }
        key = f'{item["groupId"]}:{item["id"]}:summary'
        entries[key] = item
    for row in matching_summaries:
        matching_keys.add(f'{row["group_id"]}:{row["id"]}:summary')
    for row in [*recent_replies, *matching_replies]:
        item = {
            "groupId": int(row["group_id"]),
            "groupTitle": str(row["group_title"] or ""),
            "id": str(row["id"]),
            "messageId": str(row["id"]),
            "source": "reply",
            "matched": False,
            "content": str(row["content"] or "")[:800],
            **_timestamp_fields(str(row["timestamp"])),
        }
        key = f'{item["groupId"]}:{row["telegram_message_id"]}:reply'
        entries[key] = item
    for row in matching_replies:
        matching_keys.add(f'{row["group_id"]}:{row["telegram_message_id"]}:reply')
    matched = sorted(
        (pair for pair in entries.items() if pair[0] in matching_keys),
        key=lambda pair: pair[1]["timestampIso"],
        reverse=True,
    )
    recent = sorted(
        (pair for pair in entries.items() if pair[0] not in matching_keys),
        key=lambda pair: pair[1]["timestampIso"],
        reverse=True,
    )
    ordered = [*matched, *recent][:24]
    for key, item in ordered:
        item["matched"] = key in matching_keys
    return sorted((item for _, item in ordered), key=lambda item: item["timestampIso"])


def import_rows(
    *,
    groups: list[dict[str, Any]],
    messages: list[dict[str, Any]],
    insights: list[dict[str, Any]],
    path: str | Path | None = None,
) -> None:
    initialize(path)
    with database(path) as connection:
        connection.execute("BEGIN IMMEDIATE")
        connection.executemany(
            """
            INSERT INTO telegram_ai_groups(group_id, owner_uid, group_title, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(group_id) DO UPDATE SET
                owner_uid = excluded.owner_uid, group_title = excluded.group_title,
                updated_at = excluded.updated_at
            """,
            [
                (
                    int(row["group_id"]),
                    int(row["owner_uid"]),
                    str(row.get("group_title") or "")[:200],
                    str(row.get("updated_at") or _timestamp()),
                )
                for row in groups
            ],
        )
        for row in messages:
            telegram_reply_id = row.get(
                "telegram_reply_to_message_id", row.get("reply_to_message_id")
            )
            connection.execute(
                """
                INSERT INTO telegram_ai_messages(
                    id, group_id, telegram_message_id, sender_uid, sender_name, role,
                    content, media_types, reply_to_message_id,
                    telegram_reply_to_message_id, timestamp
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
                ON CONFLICT(group_id, telegram_message_id) DO UPDATE SET
                    sender_uid = excluded.sender_uid, sender_name = excluded.sender_name,
                    role = excluded.role, content = excluded.content,
                    media_types = excluded.media_types,
                    telegram_reply_to_message_id = excluded.telegram_reply_to_message_id,
                    timestamp = excluded.timestamp
                """,
                (
                    _new_public_id(connection, "telegram_ai_messages"),
                    int(row["group_id"]),
                    int(row["telegram_message_id"]),
                    int(row["sender_uid"]) if row.get("sender_uid") is not None else None,
                    str(row["sender_name"]),
                    "admin" if row.get("role", row.get("sender_kind")) == "user"
                    else str(row.get("role", row.get("sender_kind"))),
                    str(row["content"]),
                    ",".join(row["media_types"])
                    if isinstance(row.get("media_types"), list)
                    else str(row.get("media_types") or ""),
                    int(telegram_reply_id) if telegram_reply_id is not None else None,
                    str(row.get("timestamp", row.get("created_at"))),
                ),
            )
        connection.execute(
            """
            UPDATE telegram_ai_messages
            SET reply_to_message_id = (
                SELECT target.id FROM telegram_ai_messages AS target
                WHERE target.group_id = telegram_ai_messages.group_id
                  AND target.telegram_message_id =
                      telegram_ai_messages.telegram_reply_to_message_id
                LIMIT 1
            )
            WHERE telegram_reply_to_message_id IS NOT NULL
            """
        )
        connection.executemany(
            """
            INSERT INTO telegram_ai_insights(
                id, group_id, owner_uid, telegram_message_id, summary, timestamp
            ) VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(group_id, telegram_message_id) DO UPDATE SET
                owner_uid = excluded.owner_uid, summary = excluded.summary,
                timestamp = excluded.timestamp
            """,
            [
                (
                    str(row["id"]),
                    int(row["group_id"]),
                    int(row["owner_uid"]),
                    int(row["telegram_message_id"]),
                    str(row["summary"]),
                    str(row.get("timestamp", row.get("created_at"))),
                )
                for row in insights
            ],
        )
        connection.commit()


def table_counts(path: str | Path | None = None) -> dict[str, int]:
    initialize(path)
    with database(path) as connection:
        return {
            table: int(connection.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0])
            for table in (
                "telegram_ai_groups",
                "telegram_ai_messages",
                "telegram_ai_insights",
                "memory",
            )
        }


def snapshot_rows(path: str | Path | None = None) -> dict[str, list[dict[str, Any]]]:
    initialize(path)
    with database(path) as connection:
        groups = [
            dict(row)
            for row in connection.execute(
                "SELECT group_id, owner_uid, group_title, updated_at "
                "FROM telegram_ai_groups ORDER BY group_id"
            )
        ]
        messages = [
            dict(row)
            for row in connection.execute(
                """
                SELECT id, group_id, sender_name, role, content, media_types,
                       reply_to_message_id, timestamp
                FROM telegram_ai_messages ORDER BY group_id, timestamp, id
                """
            )
        ]
        insights = [
            dict(row)
            for row in connection.execute(
                """
                SELECT insight.id, insight.group_id, source_message.id AS message_id,
                       insight.summary, insight.timestamp
                FROM telegram_ai_insights AS insight
                JOIN telegram_ai_messages AS source_message
                  ON source_message.group_id = insight.group_id
                 AND source_message.telegram_message_id = insight.telegram_message_id
                ORDER BY insight.group_id, insight.timestamp, insight.id
                """
            )
        ]
        personal_memories = [
            {
                "id": str(row["id"]),
                "owner_uid": int(row["owner_uid"]),
                "content": str(row["content"]),
                "tags": json.loads(str(row["tags"])),
                "created_at": str(row["created_at"]),
                "updated_at": str(row["updated_at"]),
                "source": str(row["source"]),
            }
            for row in connection.execute(
                """
                SELECT id, owner_uid, content, tags, created_at, updated_at, source
                FROM memory ORDER BY owner_uid, updated_at, id
                """
            )
        ]
        return {
            "telegram_ai_groups": groups,
            "telegram_ai_messages": [
                {
                    "id": str(row["id"]),
                    "group_id": int(row["group_id"]),
                    "role": str(row["role"]),
                    "sender_name": str(row["sender_name"]),
                    "content": str(row["content"]),
                    "media_types": [
                        item for item in str(row["media_types"] or "").split(",") if item
                    ],
                    "reply_to_message_id": (
                        str(row["reply_to_message_id"])
                        if row["reply_to_message_id"] is not None
                        else None
                    ),
                    **_timestamp_fields(str(row["timestamp"])),
                }
                for row in messages
            ],
            "telegram_ai_insights": [
                {
                    "id": str(row["id"]),
                    "group_id": int(row["group_id"]),
                    "message_id": str(row["message_id"]),
                    "summary": str(row["summary"]),
                    **_timestamp_fields(str(row["timestamp"])),
                }
                for row in insights
            ],
            "memory": personal_memories,
        }


def export_json(path: str | Path, destination: str | Path) -> None:
    target = Path(path)
    backup = Path(destination)
    backup.parent.mkdir(parents=True, exist_ok=True)
    data = snapshot_rows(target)
    backup.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def export_json_files(
    path: str | Path | None,
    output_directory: str | Path,
) -> dict[str, int]:
    destination = Path(output_directory)
    destination.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(destination, 0o700)
    data = snapshot_rows(path)

    output_names = {
        "telegram_ai_groups": "group.json",
        "telegram_ai_messages": "message.json",
        "telegram_ai_insights": "insight.json",
        "memory": "memory.json",
    }
    for table, rows in data.items():
        target = destination / output_names[table]
        temporary_path: str | None = None
        try:
            with tempfile.NamedTemporaryFile(
                mode="w",
                encoding="utf-8",
                dir=destination,
                prefix=f".{target.name}.",
                suffix=".tmp",
                delete=False,
            ) as temporary:
                temporary_path = temporary.name
                json.dump(rows, temporary, ensure_ascii=False, indent=2)
                temporary.write("\n")
                temporary.flush()
                os.fsync(temporary.fileno())
            os.replace(temporary_path, target)
            os.chmod(target, 0o600)
        finally:
            if temporary_path and os.path.exists(temporary_path):
                os.unlink(temporary_path)

    return {
        "memories" if name == "memory" else name.removeprefix("telegram_ai_"): len(rows)
        for name, rows in data.items()
    }
