import json
import os
import re
import sqlite3
import tempfile
import threading
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from collections.abc import Iterator


DEFAULT_DATABASE_PATH = Path(__file__).resolve().parent / "data" / "telegram-ai-memory.sqlite3"
_schema_lock = threading.Lock()


def database_path() -> Path:
    configured = os.getenv("TELEGRAM_AI_MEMORY_DB_PATH", "").strip()
    return Path(configured).expanduser() if configured else DEFAULT_DATABASE_PATH


def connect(path: str | Path | None = None) -> sqlite3.Connection:
    target = Path(path) if path is not None else database_path()
    target.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(target, timeout=10, isolation_level=None)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA busy_timeout = 10000")
    connection.execute("PRAGMA foreign_keys = ON")
    connection.execute("PRAGMA journal_mode = WAL")
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
                sender_kind TEXT NOT NULL,
                content TEXT NOT NULL,
                media_types TEXT NOT NULL DEFAULT '',
                reply_to_message_id INTEGER,
                created_at TEXT NOT NULL,
                UNIQUE(group_id, telegram_message_id)
            );
            CREATE INDEX IF NOT EXISTS telegram_ai_messages_time
                ON telegram_ai_messages(group_id, created_at DESC);

            CREATE TABLE IF NOT EXISTS telegram_ai_insights (
                id TEXT PRIMARY KEY,
                group_id INTEGER NOT NULL,
                owner_uid INTEGER NOT NULL,
                telegram_message_id INTEGER NOT NULL,
                summary TEXT NOT NULL,
                created_at TEXT NOT NULL,
                UNIQUE(group_id, telegram_message_id)
            );
            CREATE INDEX IF NOT EXISTS telegram_ai_insights_time
                ON telegram_ai_insights(group_id, owner_uid, created_at DESC);

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


def _timestamp() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


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
) -> str:
    initialize()
    with database() as connection:
        connection.execute("BEGIN IMMEDIATE")
        _group_metadata(connection, group_id, owner_uid, group_title)
        cursor = connection.execute(
            """
            INSERT INTO telegram_ai_messages(
                id, group_id, telegram_message_id, sender_uid, sender_name,
                sender_kind, content, media_types, reply_to_message_id, created_at
            )
            VALUES (?, ?, ?, ?, ?, 'user', ?, ?, ?, ?)
            ON CONFLICT(group_id, telegram_message_id) DO UPDATE SET
                sender_uid = excluded.sender_uid,
                sender_name = excluded.sender_name,
                content = excluded.content,
                media_types = excluded.media_types,
                reply_to_message_id = excluded.reply_to_message_id,
                created_at = excluded.created_at
            WHERE ?
            """,
            (
                f"tg-{group_id}-{message_id}",
                group_id,
                message_id,
                owner_uid,
                sender_name[:120],
                content[:4000],
                ",".join(media_types[:8]),
                reply_to_message_id,
                _timestamp(),
                int(edited),
            ),
        )
        connection.commit()
        return "stored" if cursor.rowcount else "duplicate"


def store_bot_message(
    *, group_id: int, message_id: int, content: str, reply_to_message_id: int
) -> None:
    initialize()
    with database() as connection:
        connection.execute(
            """
            INSERT INTO telegram_ai_messages(
                id, group_id, telegram_message_id, sender_uid, sender_name,
                sender_kind, content, media_types, reply_to_message_id, created_at
            )
            VALUES (?, ?, ?, NULL, 'Cheya', 'bot', ?, '', ?, ?)
            ON CONFLICT(group_id, telegram_message_id) DO NOTHING
            """,
            (
                f"tg-{group_id}-{message_id}",
                group_id,
                message_id,
                content[:4000],
                reply_to_message_id,
                _timestamp(),
            ),
        )


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
        _group_metadata(connection, group_id, owner_uid, group_title)
        if not summary.strip():
            if replace:
                connection.execute(
                    """
                    DELETE FROM telegram_ai_insights
                    WHERE group_id = ? AND owner_uid = ? AND telegram_message_id = ?
                    """,
                    (group_id, owner_uid, message_id),
                )
            connection.commit()
            return
        connection.execute(
            """
            INSERT INTO telegram_ai_insights(
                id, group_id, owner_uid, telegram_message_id, summary, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(group_id, telegram_message_id) DO UPDATE SET
                owner_uid = excluded.owner_uid,
                summary = excluded.summary,
                created_at = excluded.created_at
            """,
            (
                f"tgi-{group_id}-{message_id}",
                group_id,
                owner_uid,
                message_id,
                summary.strip()[:1600],
                _timestamp(),
            ),
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
        r"\b(kebiasaan|habit|pola|rutinitas|biasanya|sering|selalu|preferensi|suka)\b",
        normalized,
        re.IGNORECASE,
    ) else 8
    with database() as connection:
        recent = _rows(
            connection,
            """
            SELECT telegram_message_id, sender_name, sender_kind, content, created_at, media_types
            FROM telegram_ai_messages
            WHERE group_id = ? AND (
                sender_uid = ? OR (
                    sender_kind = 'bot' AND EXISTS (
                        SELECT 1 FROM telegram_ai_messages AS owner_message
                        WHERE owner_message.group_id = telegram_ai_messages.group_id
                          AND owner_message.telegram_message_id =
                              telegram_ai_messages.reply_to_message_id
                          AND owner_message.sender_uid = ?
                    )
                )
            )
            ORDER BY created_at DESC, telegram_message_id DESC LIMIT 12
            """,
            (group_id, owner_uid, owner_uid),
        )
        relevant: list[sqlite3.Row] = []
        if fts_query:
            relevant = _rows(
                connection,
                """
                SELECT message.telegram_message_id, message.sender_name, message.sender_kind,
                       message.content, message.created_at, message.media_types
                FROM telegram_ai_messages_fts
                JOIN telegram_ai_messages AS message
                  ON message.rowid = telegram_ai_messages_fts.rowid
                WHERE telegram_ai_messages_fts MATCH ?
                  AND message.group_id = ? AND (
                    message.sender_uid = ? OR (
                        message.sender_kind = 'bot' AND EXISTS (
                            SELECT 1 FROM telegram_ai_messages AS owner_message
                            WHERE owner_message.group_id = message.group_id
                              AND owner_message.telegram_message_id =
                                  message.reply_to_message_id
                              AND owner_message.sender_uid = ?
                        )
                    )
                  )
                ORDER BY bm25(telegram_ai_messages_fts), message.created_at DESC
                LIMIT 12
                """,
                (fts_query, group_id, owner_uid, owner_uid),
            )
        replied: list[sqlite3.Row] = []
        if reply_to_message_id is not None:
            replied = _rows(
                connection,
                """
                SELECT telegram_message_id, sender_name, sender_kind, content, created_at, media_types
                FROM telegram_ai_messages
                WHERE group_id = ? AND telegram_message_id = ? AND (
                    sender_uid = ? OR (
                        sender_kind = 'bot' AND EXISTS (
                            SELECT 1 FROM telegram_ai_messages AS owner_message
                            WHERE owner_message.group_id = telegram_ai_messages.group_id
                              AND owner_message.telegram_message_id =
                                  telegram_ai_messages.reply_to_message_id
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
            SELECT telegram_message_id, summary, created_at FROM telegram_ai_insights
            WHERE group_id = ? AND owner_uid = ? ORDER BY created_at DESC LIMIT ?
            """,
            (group_id, owner_uid, insight_limit),
        )
        relevant_insights: list[sqlite3.Row] = []
        if fts_query:
            relevant_insights = _rows(
                connection,
                """
                SELECT insight.telegram_message_id, insight.summary, insight.created_at
                FROM telegram_ai_insights_fts
                JOIN telegram_ai_insights AS insight
                  ON insight.rowid = telegram_ai_insights_fts.rowid
                WHERE telegram_ai_insights_fts MATCH ?
                  AND insight.group_id = ? AND insight.owner_uid = ?
                ORDER BY bm25(telegram_ai_insights_fts), insight.created_at DESC
                LIMIT ?
                """,
                (fts_query, group_id, owner_uid, insight_limit),
            )
        replied_insight: list[sqlite3.Row] = []
        if reply_to_message_id is not None:
            replied_insight = _rows(
                connection,
                """
                SELECT telegram_message_id, summary, created_at FROM telegram_ai_insights
                WHERE group_id = ? AND owner_uid = ? AND telegram_message_id = ? LIMIT 1
                """,
                (group_id, owner_uid, reply_to_message_id),
            )

    messages_by_id: dict[str, sqlite3.Row] = {}
    for row in [*recent, *relevant, *replied]:
        messages_by_id[str(row["telegram_message_id"])] = row
    messages = [
        {
            "messageId": int(row["telegram_message_id"]),
            "senderName": str(row["sender_name"] or "Group member"),
            "senderKind": str(row["sender_kind"] or "user"),
            "content": str(row["content"] or "")[:1200],
            "createdAt": str(row["created_at"] or ""),
            "mediaTypes": [item for item in str(row["media_types"] or "").split(",") if item],
        }
        for row in sorted(messages_by_id.values(), key=lambda item: str(item["created_at"]))[-24:]
    ]
    insights_by_id: dict[str, sqlite3.Row] = {}
    for row in [*recent_insights, *relevant_insights, *replied_insight]:
        insights_by_id[str(row["telegram_message_id"])] = row
    memories = [
        {
            "messageId": int(row["telegram_message_id"]),
            "senderName": "Long-term memory",
            "senderKind": "memory",
            "content": str(row["summary"] or "")[:1600],
            "createdAt": str(row["created_at"] or ""),
            "mediaTypes": [],
        }
        for row in insights_by_id.values()
    ]
    return sorted([*messages, *memories], key=lambda item: item["createdAt"])


def retrieve_owner_memory(owner_uid: int, query: str) -> list[dict[str, Any]]:
    initialize()
    normalized = query.strip()[:1000]
    fts_query = _fts_query(normalized)
    with database() as connection:
        recent_summaries = _rows(
            connection,
            """
            SELECT groups.group_id, groups.group_title, insight.telegram_message_id,
                   insight.summary AS content, insight.created_at
            FROM telegram_ai_groups AS groups
            JOIN telegram_ai_insights AS insight ON insight.group_id = groups.group_id
            WHERE groups.owner_uid = ? AND insight.owner_uid = ?
            ORDER BY insight.created_at DESC LIMIT 10
            """,
            (owner_uid, owner_uid),
        )
        recent_replies = _rows(
            connection,
            """
            SELECT groups.group_id, groups.group_title, message.telegram_message_id,
                   message.content, message.created_at
            FROM telegram_ai_groups AS groups
            JOIN telegram_ai_messages AS message ON message.group_id = groups.group_id
            WHERE groups.owner_uid = ? AND message.sender_kind = 'bot'
              AND EXISTS (
                SELECT 1 FROM telegram_ai_messages AS owner_message
                WHERE owner_message.group_id = message.group_id
                  AND owner_message.telegram_message_id = message.reply_to_message_id
                  AND owner_message.sender_uid = groups.owner_uid
              )
            ORDER BY message.created_at DESC LIMIT 8
            """,
            (owner_uid,),
        )
        matching_summaries: list[sqlite3.Row] = []
        matching_replies: list[sqlite3.Row] = []
        if fts_query:
            matching_summaries = _rows(
                connection,
                """
                SELECT groups.group_id, groups.group_title, insight.telegram_message_id,
                       insight.summary AS content, insight.created_at
                FROM telegram_ai_insights_fts
                JOIN telegram_ai_insights AS insight
                  ON insight.rowid = telegram_ai_insights_fts.rowid
                JOIN telegram_ai_groups AS groups ON groups.group_id = insight.group_id
                WHERE telegram_ai_insights_fts MATCH ?
                  AND groups.owner_uid = ? AND insight.owner_uid = ?
                ORDER BY bm25(telegram_ai_insights_fts), insight.created_at DESC LIMIT 12
                """,
                (fts_query, owner_uid, owner_uid),
            )
            matching_replies = _rows(
                connection,
                """
                SELECT groups.group_id, groups.group_title, message.telegram_message_id,
                       message.content, message.created_at
                FROM telegram_ai_messages_fts
                JOIN telegram_ai_messages AS message
                  ON message.rowid = telegram_ai_messages_fts.rowid
                JOIN telegram_ai_groups AS groups ON groups.group_id = message.group_id
                WHERE telegram_ai_messages_fts MATCH ?
                  AND groups.owner_uid = ? AND message.sender_kind = 'bot'
                  AND EXISTS (
                    SELECT 1 FROM telegram_ai_messages AS owner_message
                    WHERE owner_message.group_id = message.group_id
                      AND owner_message.telegram_message_id = message.reply_to_message_id
                      AND owner_message.sender_uid = groups.owner_uid
                  )
                ORDER BY bm25(telegram_ai_messages_fts), message.created_at DESC LIMIT 8
                """,
                (fts_query, owner_uid),
            )

    entries: dict[str, dict[str, Any]] = {}
    matching_keys: set[str] = set()
    for row in [*recent_summaries, *matching_summaries]:
        item = {
            "groupId": int(row["group_id"]),
            "groupTitle": str(row["group_title"] or ""),
            "messageId": int(row["telegram_message_id"]),
            "source": "summary",
            "content": str(row["content"] or "")[:800],
            "createdAt": str(row["created_at"] or ""),
        }
        key = f'{item["groupId"]}:{item["messageId"]}:summary'
        entries[key] = item
    for row in matching_summaries:
        matching_keys.add(f'{row["group_id"]}:{row["telegram_message_id"]}:summary')
    for row in [*recent_replies, *matching_replies]:
        item = {
            "groupId": int(row["group_id"]),
            "groupTitle": str(row["group_title"] or ""),
            "messageId": int(row["telegram_message_id"]),
            "source": "reply",
            "content": str(row["content"] or "")[:800],
            "createdAt": str(row["created_at"] or ""),
        }
        key = f'{item["groupId"]}:{item["messageId"]}:reply'
        entries[key] = item
    for row in matching_replies:
        matching_keys.add(f'{row["group_id"]}:{row["telegram_message_id"]}:reply')
    matched = sorted(
        (pair for pair in entries.items() if pair[0] in matching_keys),
        key=lambda pair: pair[1]["createdAt"],
        reverse=True,
    )
    recent = sorted(
        (pair for pair in entries.items() if pair[0] not in matching_keys),
        key=lambda pair: pair[1]["createdAt"],
        reverse=True,
    )
    ordered = [*matched, *recent][:20]
    return sorted((item for _, item in ordered), key=lambda item: item["createdAt"])


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
        connection.executemany(
            """
            INSERT INTO telegram_ai_messages(
                id, group_id, telegram_message_id, sender_uid, sender_name, sender_kind,
                content, media_types, reply_to_message_id, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(group_id, telegram_message_id) DO UPDATE SET
                sender_uid = excluded.sender_uid, sender_name = excluded.sender_name,
                sender_kind = excluded.sender_kind, content = excluded.content,
                media_types = excluded.media_types,
                reply_to_message_id = excluded.reply_to_message_id,
                created_at = excluded.created_at
            """,
            [
                (
                    str(row["id"]),
                    int(row["group_id"]),
                    int(row["telegram_message_id"]),
                    int(row["sender_uid"]) if row.get("sender_uid") is not None else None,
                    str(row["sender_name"]),
                    str(row["sender_kind"]),
                    str(row["content"]),
                    str(row.get("media_types") or ""),
                    int(row["reply_to_message_id"])
                    if row.get("reply_to_message_id") is not None
                    else None,
                    str(row["created_at"]),
                )
                for row in messages
            ],
        )
        connection.executemany(
            """
            INSERT INTO telegram_ai_insights(
                id, group_id, owner_uid, telegram_message_id, summary, created_at
            ) VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(group_id, telegram_message_id) DO UPDATE SET
                owner_uid = excluded.owner_uid, summary = excluded.summary,
                created_at = excluded.created_at
            """,
            [
                (
                    str(row["id"]),
                    int(row["group_id"]),
                    int(row["owner_uid"]),
                    int(row["telegram_message_id"]),
                    str(row["summary"]),
                    str(row["created_at"]),
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
            )
        }


def snapshot_rows(path: str | Path | None = None) -> dict[str, list[dict[str, Any]]]:
    initialize(path)
    with database(path) as connection:
        result: dict[str, list[dict[str, Any]]] = {}
        for table in (
            "telegram_ai_groups",
            "telegram_ai_messages",
            "telegram_ai_insights",
        ):
            result[table] = [
                dict(row)
                for row in connection.execute(f"SELECT * FROM {table} ORDER BY 1")
            ]
        return result


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

    for table, rows in data.items():
        target = destination / f"{table.removeprefix('telegram_ai_')}.json"
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

    return {name.removeprefix("telegram_ai_"): len(rows) for name, rows in data.items()}
