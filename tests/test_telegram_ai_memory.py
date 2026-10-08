import json
import re
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import telegram_ai_memory as memory


class TelegramAiMemoryTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.database_path = Path(self.temp_dir.name) / "memory.sqlite3"
        self.path_patch = patch(
            "telegram_ai_memory.database_path",
            return_value=self.database_path,
        )
        self.path_patch.start()
        memory.initialize()

    def tearDown(self):
        self.path_patch.stop()
        self.temp_dir.cleanup()

    def test_owner_message_and_insight_are_searchable_from_local_database(self):
        stored = memory.store_owner_message(
            group_id=-100123,
            owner_uid=42,
            group_title="Cheya journal",
            message_id=7,
            sender_name="Owner",
            content="*I prefer quiet mornings and black coffee.*  ",
            media_types=[],
            reply_to_message_id=None,
            edited=False,
            timestamp="2024-05-10T02:05:00Z",
        )
        memory.store_insight(
            group_id=-100123,
            owner_uid=42,
            group_title="Cheya journal",
            message_id=7,
            summary="Owner prefers quiet mornings and black coffee.",
            replace=False,
        )

        self.assertEqual(stored, "stored")
        group_memory = memory.retrieve_group_memory(
            -100123, 42, "black coffee", None
        )
        self.assertTrue(any("black coffee" in row["content"] for row in group_memory))
        entry = next(row for row in group_memory if row["role"] == "admin")
        self.assertRegex(entry["id"], r"^\d{40}$")
        self.assertEqual(entry["timestamp"], "Jumat, 10 Mei 2024 09:05 WIB")
        self.assertEqual(entry["timestampIso"], "2024-05-10T09:05:00.000+07:00")
        self.assertEqual(entry["content"], "*I prefer quiet mornings and black coffee.*  ")
        owner_memory = memory.retrieve_owner_memory(42, "quiet mornings")
        self.assertEqual(len(owner_memory), 1)
        self.assertEqual(owner_memory[0]["source"], "summary")
        self.assertEqual(owner_memory[0]["groupTitle"], "Cheya journal")

    def test_duplicate_delivery_is_idempotent_and_edited_message_updates_in_place(self):
        args = {
            "group_id": -100123,
            "owner_uid": 42,
            "group_title": "Channel",
            "message_id": 19,
            "sender_name": "Owner",
            "content": "first version",
            "media_types": [],
            "reply_to_message_id": None,
        }
        self.assertEqual(memory.store_owner_message(**args, edited=False), "stored")
        with memory.database(self.database_path) as connection:
            original_id = connection.execute(
                "SELECT id FROM telegram_ai_messages WHERE telegram_message_id = 19"
            ).fetchone()["id"]
        self.assertEqual(memory.store_owner_message(**args, edited=False), "duplicate")
        self.assertEqual(
            memory.store_owner_message(
                **{**args, "content": "corrected version"},
                edited=True,
            ),
            "stored",
        )
        rows = memory.retrieve_group_memory(-100123, 42, "corrected", None)
        self.assertEqual([row["content"] for row in rows], ["corrected version"])
        self.assertEqual(rows[0]["role"], "admin")
        self.assertEqual(rows[0]["id"], original_id)
        with memory.database(self.database_path) as connection:
            public_ids = [
                str(row["id"])
                for row in connection.execute(
                    "SELECT id FROM telegram_ai_messages ORDER BY telegram_message_id"
                )
            ]
        self.assertEqual(len(public_ids), len(set(public_ids)))
        self.assertTrue(all(re.fullmatch(r"\d{40}", value) for value in public_ids))

    def test_ai_reply_and_insight_update_are_kept_as_separate_records(self):
        memory.store_owner_message(
            group_id=-100123,
            owner_uid=42,
            group_title="Channel",
            message_id=21,
            sender_name="Owner",
            content="I changed jobs this month.",
            media_types=[],
            reply_to_message_id=None,
            edited=False,
        )
        memory.store_bot_message(
            group_id=-100123,
            message_id=22,
            content="I will remember that.",
            reply_to_message_id=21,
        )
        memory.store_insight(
            group_id=-100123,
            owner_uid=42,
            group_title="Channel",
            message_id=21,
            summary="Owner changed jobs this month.",
            replace=False,
        )
        memory.store_insight(
            group_id=-100123,
            owner_uid=42,
            group_title="Channel",
            message_id=21,
            summary="Owner started a new job this month.",
            replace=True,
        )

        owner_memory = memory.retrieve_owner_memory(42, "new job")
        self.assertEqual(
            {row["source"] for row in owner_memory},
            {"summary", "reply"},
        )
        self.assertTrue(all(re.fullmatch(r"\d{40}", row["id"]) for row in owner_memory))
        self.assertTrue(all(re.fullmatch(r"\d{40}", row["messageId"]) for row in owner_memory))
        group_memory = memory.retrieve_group_memory(-100123, 42, "new job", None)
        self.assertEqual(
            {row["role"] for row in group_memory},
            {"admin", "bot", "memory"},
        )
        with memory.database(self.database_path) as connection:
            admin = connection.execute(
                "SELECT id FROM telegram_ai_messages WHERE telegram_message_id = 21"
            ).fetchone()
            bot = connection.execute(
                "SELECT id, reply_to_message_id FROM telegram_ai_messages "
                "WHERE telegram_message_id = 22"
            ).fetchone()
            insight = connection.execute(
                "SELECT id FROM telegram_ai_insights WHERE telegram_message_id = 21"
            ).fetchone()
        self.assertEqual(str(bot["reply_to_message_id"]), str(admin["id"]))
        self.assertEqual(str(bot["id"]), next(
            row["id"] for row in owner_memory if row["source"] == "reply"
        ))
        self.assertEqual(str(bot["id"]), next(
            row["messageId"] for row in owner_memory if row["source"] == "reply"
        ))
        self.assertEqual(str(admin["id"]), next(
            row["messageId"] for row in owner_memory if row["source"] == "summary"
        ))
        self.assertEqual(str(insight["id"]), next(
            row["id"] for row in owner_memory if row["source"] == "summary"
        ))
        self.assertEqual(
            memory.get_insight(-100123, 42, 21),
            "Owner started a new job this month.",
        )

    def test_json_export_writes_separate_private_files(self):
        memory.store_owner_message(
            group_id=-100123,
            owner_uid=42,
            group_title="Channel",
            message_id=31,
            sender_name="Owner",
            content="A readable message",
            media_types=["photo", "video"],
            reply_to_message_id=None,
            edited=False,
        )
        memory.store_insight(
            group_id=-100123,
            owner_uid=42,
            group_title="Channel",
            message_id=31,
            summary="A separate readable insight",
            replace=False,
        )
        output_directory = Path(self.temp_dir.name) / "exports"

        counts = memory.export_json_files(self.database_path, output_directory)

        self.assertEqual(counts, {"groups": 1, "messages": 1, "insights": 1})
        self.assertEqual(
            json.loads((output_directory / "messages.json").read_text())[0]["content"],
            "A readable message",
        )
        message_export = json.loads((output_directory / "messages.json").read_text())[0]
        insight_export = json.loads((output_directory / "insights.json").read_text())[0]
        self.assertEqual(message_export["role"], "admin")
        self.assertEqual(message_export["media_types"], ["photo", "video"])
        self.assertRegex(message_export["id"], r"^\d{40}$")
        self.assertNotIn("telegram_message_id", message_export)
        self.assertNotIn("sender_uid", message_export)
        self.assertEqual(insight_export["summary"], "A separate readable insight")
        self.assertRegex(insight_export["id"], r"^\d{40}$")
        self.assertRegex(insight_export["message_id"], r"^\d{40}$")
        self.assertNotIn("telegram_message_id", insight_export)
        self.assertFalse((output_directory / "telegram_ai_memory.json").exists())
        self.assertEqual(output_directory.stat().st_mode & 0o777, 0o700)
        self.assertEqual((output_directory / "messages.json").stat().st_mode & 0o777, 0o600)

    def test_legacy_schema_migrates_ids_role_and_reply_links(self):
        legacy_path = Path(self.temp_dir.name) / "legacy.sqlite3"
        connection = sqlite3.connect(legacy_path)
        try:
            connection.executescript(
                """
                CREATE TABLE telegram_ai_groups (
                    group_id INTEGER PRIMARY KEY, owner_uid INTEGER NOT NULL,
                    group_title TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL
                );
                CREATE TABLE telegram_ai_messages (
                    id TEXT PRIMARY KEY, group_id INTEGER NOT NULL,
                    telegram_message_id INTEGER NOT NULL, sender_uid INTEGER,
                    sender_name TEXT NOT NULL, sender_kind TEXT NOT NULL,
                    content TEXT NOT NULL, media_types TEXT NOT NULL DEFAULT '',
                    reply_to_message_id INTEGER, created_at TEXT NOT NULL,
                    UNIQUE(group_id, telegram_message_id)
                );
                CREATE TABLE telegram_ai_insights (
                    id TEXT PRIMARY KEY, group_id INTEGER NOT NULL,
                    owner_uid INTEGER NOT NULL, telegram_message_id INTEGER NOT NULL,
                    summary TEXT NOT NULL, created_at TEXT NOT NULL,
                    UNIQUE(group_id, telegram_message_id)
                );
                INSERT INTO telegram_ai_groups VALUES (-1001, 42, 'Legacy', '2024-01-01T00:00:00Z');
                INSERT INTO telegram_ai_messages VALUES
                    ('tg--1001-4', -1001, 4, 42, 'Owner', 'user', 'first', '', NULL, '2024-01-01T01:00:00Z'),
                    ('tg--1001-5', -1001, 5, 42, 'Owner', 'user', '*markdown*', '', 4, '2024-01-01T02:00:00Z');
                INSERT INTO telegram_ai_insights VALUES
                    ('tgi--1001-4', -1001, 42, 4, 'Legacy insight', '2024-01-01T01:00:00Z');
                """
            )
        finally:
            connection.close()

        memory.initialize(legacy_path)
        with memory.database(legacy_path) as connection:
            columns = {
                row["name"]
                for row in connection.execute(
                    "PRAGMA table_info(telegram_ai_messages)"
                )
            }
            reply_column_type = next(
                row["type"]
                for row in connection.execute(
                    "PRAGMA table_info(telegram_ai_messages)"
                )
                if row["name"] == "reply_to_message_id"
            )
            first = connection.execute(
                "SELECT id, role FROM telegram_ai_messages WHERE telegram_message_id = 4"
            ).fetchone()
            second = connection.execute(
                "SELECT id, role, content, reply_to_message_id "
                "FROM telegram_ai_messages WHERE telegram_message_id = 5"
            ).fetchone()
            insight = connection.execute(
                "SELECT id, timestamp FROM telegram_ai_insights"
            ).fetchone()
            insight_columns = {
                row["name"]
                for row in connection.execute(
                    "PRAGMA table_info(telegram_ai_insights)"
                )
            }
        self.assertIn("role", columns)
        self.assertNotIn("sender_kind", columns)
        self.assertIn("timestamp", columns)
        self.assertNotIn("created_at", columns)
        self.assertEqual(reply_column_type.upper(), "TEXT")
        self.assertIn("timestamp", insight_columns)
        self.assertNotIn("created_at", insight_columns)
        self.assertEqual(first["role"], "admin")
        self.assertEqual(second["role"], "admin")
        self.assertEqual(second["content"], "*markdown*")
        self.assertEqual(str(second["reply_to_message_id"]), str(first["id"]))
        self.assertTrue(re.fullmatch(r"\d{40}", str(first["id"])))
        self.assertTrue(re.fullmatch(r"\d{40}", str(insight["id"])))
        self.assertNotEqual(str(first["id"]), str(insight["id"]))
        self.assertTrue(str(insight["timestamp"]).endswith("+07:00"))


if __name__ == "__main__":
    unittest.main()
