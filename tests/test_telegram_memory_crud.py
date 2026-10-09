import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import memory
import memory_telegram


class TelegramMemoryCrudTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.database_file = Path(self.temp_dir.name) / "memory.sqlite3"
        self.database_path_patch = patch.object(
            memory_telegram,
            "database_path",
            return_value=self.database_file,
        )
        self.database_path_patch.start()
        memory._initialized_paths.clear()
        memory_telegram.initialize()
        self.owner_uid = 987654321
        self.group_id = -1001234567890

    def tearDown(self) -> None:
        memory._initialized_paths.clear()
        self.database_path_patch.stop()
        self.temp_dir.cleanup()

    def _store_owner_message(self, message_id: int = 101) -> str:
        result = memory_telegram.store_owner_message(
            group_id=self.group_id,
            owner_uid=self.owner_uid,
            group_title="CRUD test",
            message_id=message_id,
            sender_name="Owner",
            content="Original Telegram message about a useful topic.",
            media_types=[],
            reply_to_message_id=None,
            edited=False,
            timestamp="2026-10-09T10:00:00Z",
        )
        self.assertEqual(result, "stored")
        row = next(
            item
            for item in memory_telegram.retrieve_group_memory(
                self.group_id, self.owner_uid, "", None
            )
            if item["role"] == "admin" and item["messageId"]
        )
        return row["id"]

    def test_message_and_insight_crud(self) -> None:
        message_record_id = self._store_owner_message()

        self.assertTrue(
            memory_telegram.apply_owner_data_operation(
                self.group_id,
                self.owner_uid,
                "update_message",
                record_id=message_record_id,
                content="Corrected Telegram message with the final detail.",
            )
        )
        messages = memory_telegram.retrieve_group_memory(
            self.group_id, self.owner_uid, "Corrected", None
        )
        self.assertIn(
            "Corrected Telegram message with the final detail.",
            [item["content"] for item in messages],
        )

        self.assertTrue(
            memory_telegram.apply_owner_data_operation(
                self.group_id,
                self.owner_uid,
                "create_insight",
                message_id=message_record_id,
                summary="Insight summary that can be searched.",
            )
        )
        insight = next(
            item
            for item in memory_telegram.retrieve_group_memory(
                self.group_id, self.owner_uid, "Insight", None
            )
            if item["role"] == "memory"
        )
        self.assertTrue(
            memory_telegram.apply_owner_data_operation(
                self.group_id,
                self.owner_uid,
                "update_insight",
                record_id=insight["id"],
                summary="Updated insight summary.",
            )
        )
        self.assertEqual(
            memory_telegram.get_insight(self.group_id, self.owner_uid, 101),
            "Updated insight summary.",
        )
        self.assertIn(
            "Updated insight summary.",
            [
                item["content"]
                for item in memory_telegram.retrieve_group_memory(
                    self.group_id, self.owner_uid, "Updated insight", None
                )
            ],
        )
        self.assertTrue(
            memory_telegram.apply_owner_data_operation(
                self.group_id,
                self.owner_uid,
                "delete_insight",
                record_id=insight["id"],
            )
        )
        self.assertIsNone(
            memory_telegram.get_insight(self.group_id, self.owner_uid, 101)
        )

        self.assertTrue(
            memory_telegram.apply_owner_data_operation(
                self.group_id,
                self.owner_uid,
                "create_insight",
                message_id=message_record_id,
                summary="Insight to remove with its source message.",
            )
        )
        memory_telegram.store_bot_message(
            group_id=self.group_id,
            message_id=102,
            content="Bot reply connected to the owner's message.",
            reply_to_message_id=101,
            timestamp="2026-10-09T10:01:00Z",
        )
        self.assertTrue(
            memory_telegram.apply_owner_data_operation(
                self.group_id,
                self.owner_uid,
                "delete_message",
                record_id=message_record_id,
            )
        )
        self.assertEqual(
            memory_telegram.retrieve_group_memory(
                self.group_id, self.owner_uid, "", None
            ),
            [],
        )
        self.assertIsNone(
            memory_telegram.get_insight(self.group_id, self.owner_uid, 101)
        )

    def test_message_operations_are_scoped_to_owner_and_group(self) -> None:
        message_record_id = self._store_owner_message()
        self.assertFalse(
            memory_telegram.apply_owner_data_operation(
                self.group_id,
                self.owner_uid + 1,
                "delete_message",
                record_id=message_record_id,
            )
        )
        self.assertFalse(
            memory_telegram.apply_owner_data_operation(
                self.group_id - 1,
                self.owner_uid,
                "update_message",
                record_id=message_record_id,
                content="Should not update.",
            )
        )

    def test_personal_memory_create_read_update_delete(self) -> None:
        created = memory.create(
            self.owner_uid,
            "Owner prefers concise technical explanations.",
            ["preference"],
            "telegram",
        )
        entry = created["memory"]
        self.assertTrue(created["created"])
        self.assertEqual(
            memory.search(
                self.owner_uid,
                "concise technical",
                10,
            )[0]["id"],
            entry["id"],
        )

        updated = memory.update(
            self.owner_uid,
            entry["id"],
            "Owner prefers concise, direct technical explanations.",
            ["preference", "communication"],
            "telegram",
        )
        self.assertIsNotNone(updated)
        self.assertEqual(
            memory.search(self.owner_uid, "direct", 10)[0]["content"],
            "Owner prefers concise, direct technical explanations.",
        )
        self.assertTrue(memory.delete(self.owner_uid, entry["id"]))
        self.assertEqual(memory.search(self.owner_uid, "direct", 10), [])

    def test_finalize_without_insight_stores_message_and_reply_only(self) -> None:
        staged = memory_telegram.stage_owner_message(
            group_id=self.group_id,
            owner_uid=self.owner_uid,
            group_title="CRUD test",
            message_id=201,
            sender_name="Owner",
            content="Just a casual update.",
            media_types=[],
            reply_to_message_id=None,
            edited=False,
            timestamp="2026-10-09T10:00:00Z",
        )
        self.assertEqual(staged, "staged")

        memory_telegram.finalize_owner_message(
            group_id=self.group_id,
            owner_uid=self.owner_uid,
            group_title="CRUD test",
            owner_message_id=201,
            summary="",
            bot_message_id=202,
            bot_content="Got it.",
            timestamp="2026-10-09T10:01:00Z",
        )

        self.assertIsNone(
            memory_telegram.get_insight(self.group_id, self.owner_uid, 201)
        )
        self.assertEqual(
            {
                item["role"]
                for item in memory_telegram.retrieve_group_memory(
                    self.group_id, self.owner_uid, "", None, exclude_message_id=999
                )
            },
            {"admin", "bot"},
        )

    def test_finalize_observation_only_stores_message_and_insight_without_bot(self) -> None:
        staged = memory_telegram.stage_owner_message(
            group_id=self.group_id,
            owner_uid=self.owner_uid,
            group_title="Observation-only test",
            message_id=301,
            sender_name="Owner",
            content="Had a difficult day but finished the project.",
            media_types=[],
            reply_to_message_id=None,
            edited=False,
            timestamp="2026-10-09T10:00:00Z",
        )
        self.assertEqual(staged, "staged")

        memory_telegram.finalize_owner_message(
            group_id=self.group_id,
            owner_uid=self.owner_uid,
            group_title="Observation-only test",
            owner_message_id=301,
            summary="Owner reports a difficult day and completing a project.",
        )

        self.assertEqual(
            memory_telegram.get_insight(self.group_id, self.owner_uid, 301),
            "Owner reports a difficult day and completing a project.",
        )
        records = memory_telegram.retrieve_group_memory(
            self.group_id, self.owner_uid, "", None
        )
        self.assertEqual({item["role"] for item in records}, {"admin", "memory"})
        self.assertFalse(any(item["role"] == "bot" for item in records))
        with memory_telegram.database() as connection:
            pending = connection.execute(
                """
                SELECT COUNT(*) FROM telegram_ai_pending_messages
                WHERE group_id = ? AND owner_uid = ? AND telegram_message_id = ?
                """,
                (self.group_id, self.owner_uid, 301),
            ).fetchone()[0]
        self.assertEqual(pending, 0)

    def test_voice_transcript_and_multiple_replies_are_persisted(self) -> None:
        staged = memory_telegram.stage_owner_message(
            group_id=self.group_id,
            owner_uid=self.owner_uid,
            group_title="Voice test",
            message_id=401,
            sender_name="Owner",
            content="[Media attached: voice]",
            media_types=["voice"],
            reply_to_message_id=None,
            edited=False,
            timestamp="2026-10-09T10:00:00Z",
        )
        self.assertEqual(staged, "staged")
        self.assertTrue(
            memory_telegram.update_staged_owner_message(
                self.group_id,
                self.owner_uid,
                401,
                "Voice note transcript: Besok aku rapat dengan tim.",
            )
        )

        memory_telegram.finalize_owner_message(
            group_id=self.group_id,
            owner_uid=self.owner_uid,
            group_title="Voice test",
            owner_message_id=401,
            summary="Owner mentions a meeting tomorrow.",
            bot_messages=[
                {
                    "message_id": 402,
                    "content": "Oke, semoga lancar.",
                    "timestamp": "2026-10-09T10:01:00Z",
                    "media_types": ["voice"],
                },
                {
                    "message_id": 403,
                    "content": "https://example.com",
                    "timestamp": "2026-10-09T10:02:00Z",
                    "media_types": [],
                },
            ],
        )

        matching = memory_telegram.retrieve_group_memory(
            self.group_id, self.owner_uid, "rapat tim", None
        )
        self.assertIn(
            "Voice note transcript: Besok aku rapat dengan tim.",
            [item["content"] for item in matching],
        )
        with memory_telegram.database() as connection:
            rows = connection.execute(
                """
                SELECT telegram_message_id, content, media_types
                FROM telegram_ai_messages
                WHERE group_id = ? AND telegram_message_id IN (401, 402, 403)
                ORDER BY telegram_message_id
                """,
                (self.group_id,),
            ).fetchall()
        self.assertEqual(
            [(row["telegram_message_id"], row["content"], row["media_types"]) for row in rows],
            [
                (401, "Voice note transcript: Besok aku rapat dengan tim.", "voice"),
                (402, "Oke, semoga lancar.", "voice"),
                (403, "https://example.com", ""),
            ],
        )
        self.assertEqual(
            memory_telegram.get_insight(self.group_id, self.owner_uid, 401),
            "Owner mentions a meeting tomorrow.",
        )


if __name__ == "__main__":
    unittest.main()
