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
            content="I prefer quiet mornings and black coffee.",
            media_types=[],
            reply_to_message_id=None,
            edited=False,
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
            {(row["messageId"], row["source"]) for row in owner_memory},
            {(21, "summary"), (22, "reply")},
        )
        self.assertEqual(
            memory.get_insight(-100123, 42, 21),
            "Owner started a new job this month.",
        )


if __name__ == "__main__":
    unittest.main()
