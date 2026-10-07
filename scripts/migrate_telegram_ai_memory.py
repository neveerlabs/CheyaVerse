import argparse
import asyncio
import hashlib
import json
import os
from pathlib import Path
from typing import Any

import asyncpg

import telegram_ai_memory as local_memory
from config import SUPABASE_DB_URL


def _normalized(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: _normalized(item) for key, item in sorted(value.items())}
    if isinstance(value, (list, tuple)):
        return [_normalized(item) for item in value]
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    return str(value)


def _checksum(rows: Any) -> str:
    normalized = _normalized(rows)
    if isinstance(normalized, list):
        normalized = sorted(
            normalized,
            key=lambda item: json.dumps(
                item,
                ensure_ascii=False,
                sort_keys=True,
                separators=(",", ":"),
            ),
        )
    payload = json.dumps(
        normalized,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


async def migrate(
    database_path: Path,
    *,
    delete_source: bool,
) -> dict[str, int]:
    if not SUPABASE_DB_URL:
        raise RuntimeError("SUPABASE_DB_URL must be configured in the repository .env.")

    connection = await asyncpg.connect(
        SUPABASE_DB_URL,
        command_timeout=120,
        statement_cache_size=0,
    )
    try:
        async with connection.transaction():
            await connection.execute(
                """
                LOCK TABLE public.telegram_group_ai_settings,
                            public.telegram_group_ai_messages,
                            public.telegram_group_ai_insights
                IN ACCESS EXCLUSIVE MODE
                """
            )
            groups = [
                dict(row)
                for row in await connection.fetch(
                    """
                    SELECT group_id, owner_uid, group_title, updated_at
                    FROM public.telegram_group_ai_settings
                    ORDER BY group_id
                    """
                )
            ]
            messages = [
                dict(row)
                for row in await connection.fetch(
                    """
                    SELECT message.id, message.group_id, message.telegram_message_id,
                           message.sender_uid, message.sender_name, message.sender_kind,
                           message.content, message.media_types,
                           message.reply_to_message_id, message.created_at
                    FROM public.telegram_group_ai_messages message
                    JOIN public.telegram_group_ai_settings settings
                      ON settings.group_id = message.group_id
                    WHERE message.sender_uid = settings.owner_uid
                       OR (
                         message.sender_kind = 'bot'
                         AND EXISTS (
                           SELECT 1
                           FROM public.telegram_group_ai_messages owner_message
                           WHERE owner_message.group_id = message.group_id
                             AND owner_message.telegram_message_id =
                                 message.reply_to_message_id
                             AND owner_message.sender_uid = settings.owner_uid
                         )
                       )
                    ORDER BY message.group_id, message.telegram_message_id
                    """
                )
            ]
            insights = [
                dict(row)
                for row in await connection.fetch(
                    """
                    SELECT insight.id, insight.group_id, insight.owner_uid,
                           insight.telegram_message_id, insight.summary, insight.created_at
                    FROM public.telegram_group_ai_insights insight
                    JOIN public.telegram_group_ai_settings settings
                      ON settings.group_id = insight.group_id
                     AND settings.owner_uid = insight.owner_uid
                    ORDER BY insight.group_id, insight.telegram_message_id
                    """
                )
            ]

            local_memory.import_rows(
                groups=groups,
                messages=messages,
                insights=insights,
                path=database_path,
            )
            backup = local_memory.snapshot_rows(database_path)
            expected = {
                "telegram_ai_groups": [
                    {
                        "group_id": int(row["group_id"]),
                        "owner_uid": int(row["owner_uid"]),
                        "group_title": str(row.get("group_title") or ""),
                        "updated_at": str(row.get("updated_at") or ""),
                    }
                    for row in groups
                ],
                "telegram_ai_messages": [
                    {
                        "id": str(row["id"]),
                        "group_id": int(row["group_id"]),
                        "telegram_message_id": int(row["telegram_message_id"]),
                        "sender_uid": int(row["sender_uid"])
                        if row["sender_uid"] is not None
                        else None,
                        "sender_name": str(row["sender_name"]),
                        "sender_kind": str(row["sender_kind"]),
                        "content": str(row["content"]),
                        "media_types": str(row.get("media_types") or ""),
                        "reply_to_message_id": int(row["reply_to_message_id"])
                        if row["reply_to_message_id"] is not None
                        else None,
                        "created_at": str(row["created_at"]),
                    }
                    for row in messages
                ],
                "telegram_ai_insights": [
                    {
                        "id": str(row["id"]),
                        "group_id": int(row["group_id"]),
                        "owner_uid": int(row["owner_uid"]),
                        "telegram_message_id": int(row["telegram_message_id"]),
                        "summary": str(row["summary"]),
                        "created_at": str(row["created_at"]),
                    }
                    for row in insights
                ],
            }
            for table, rows in expected.items():
                if _checksum(backup[table]) != _checksum(rows):
                    raise RuntimeError(
                        f"Local verification failed for {table}; Supabase rows were not deleted."
                    )

            if delete_source:
                await connection.execute(
                    """
                    DELETE FROM public.telegram_group_ai_insights AS insight
                    USING public.telegram_group_ai_settings AS settings
                    WHERE settings.group_id = insight.group_id
                      AND settings.owner_uid = insight.owner_uid
                    """
                )
                await connection.execute(
                    """
                    DELETE FROM public.telegram_group_ai_messages AS message
                    USING public.telegram_group_ai_settings AS settings
                    WHERE settings.group_id = message.group_id
                      AND (
                        message.sender_uid = settings.owner_uid
                        OR (
                          message.sender_kind = 'bot'
                          AND EXISTS (
                            SELECT 1
                            FROM public.telegram_group_ai_messages owner_message
                            WHERE owner_message.group_id = message.group_id
                              AND owner_message.telegram_message_id =
                                  message.reply_to_message_id
                              AND owner_message.sender_uid = settings.owner_uid
                          )
                        )
                      )
                    """
                )

        return {
            "groups": len(groups),
            "messages": len(messages),
            "insights": len(insights),
            "source_deleted": int(delete_source),
        }
    finally:
        await connection.close()


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Copy Telegram AI group/channel history to local SQLite and verify it. "
            "Supabase history is retained unless --delete-source is provided."
        )
    )
    parser.add_argument(
        "--database-path",
        default=os.getenv("TELEGRAM_AI_MEMORY_DB_PATH")
        or str(local_memory.DEFAULT_DATABASE_PATH),
        help="Target SQLite file (default: data/telegram-ai-memory.sqlite3).",
    )
    parser.add_argument(
        "--delete-source",
        action="store_true",
        help="Delete only message and insight rows from Supabase after verified copy.",
    )
    args = parser.parse_args()
    path = Path(args.database_path).expanduser().resolve()
    result = asyncio.run(migrate(path, delete_source=args.delete_source))
    print(
        "Telegram AI memory migration verified: "
        f"{result['groups']} groups, {result['messages']} messages, "
        f"{result['insights']} insights copied to {path}."
    )
    if result["source_deleted"]:
        print("Supabase message and insight rows were deleted after verification.")
    else:
        print("Supabase source rows were retained; rerun with --delete-source to remove them.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
