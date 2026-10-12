import os
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from aiohttp.test_utils import TestClient, TestServer

import memory_server


class TelegramMemoryServiceTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        database_path = Path(self.temp_dir.name) / "telegram-memory.sqlite3"
        self.environment = patch.dict(
            os.environ,
            {"TELEGRAM_AI_MEMORY_DB_PATH": str(database_path)},
        )
        self.environment.start()
        self.secret = patch.object(
            memory_server,
            "TELEGRAM_AI_MEMORY_SECRET",
            "test-memory-secret",
        )
        self.secret.start()
        self.admins = patch.object(
            memory_server,
            "ADMIN_TELEGRAM_IDS",
            frozenset({123}),
        )
        self.admins.start()
        self.client = TestClient(TestServer(memory_server.create_app()))
        await self.client.start_server()

    async def asyncTearDown(self) -> None:
        await self.client.close()
        self.admins.stop()
        self.secret.stop()
        self.environment.stop()
        self.temp_dir.cleanup()

    async def _post(self, action: str, **payload: object) -> dict[str, object]:
        response = await self.client.post(
            "/internal/telegram-group-ai",
            json={"action": action, "ownerUid": 123, **payload},
            headers={"Authorization": "Bearer test-memory-secret"},
        )
        self.assertEqual(response.status, 200, await response.text())
        return await response.json()

    async def test_channel_message_insight_search_and_personal_memory_crud(self) -> None:
        group_id = -100123
        message_id = 6001
        timestamp = "2026-10-12T12:00:00Z"

        health = await self._post("health")
        self.assertTrue(health["ok"])

        staged = await self._post(
            "stage_owner_message",
            groupId=group_id,
            groupTitle="Memory service integration",
            messageId=message_id,
            senderName="Owner",
            content="The violet lighthouse stands near the harbor.",
            mediaTypes=[],
            replyToMessageId=None,
            timestamp=timestamp,
            edited=False,
        )
        self.assertEqual(staged["reason"], "staged")

        finalized = await self._post(
            "finalize_owner_message",
            groupId=group_id,
            groupTitle="Memory service integration",
            ownerMessageId=message_id,
            summary="Owner mentioned the violet lighthouse near the harbor.",
            botMessages=[{
                "messageId": message_id + 1,
                "content": "I'll remember the lighthouse detail.",
                "timestamp": timestamp,
                "mediaTypes": [],
            }],
        )
        self.assertTrue(finalized["ok"])

        history = await self._post(
            "retrieve_group_memory",
            groupId=group_id,
            query="violet lighthouse",
            replyToMessageId=None,
        )
        self.assertTrue(any("violet lighthouse" in row["content"] for row in history["memory"]))
        self.assertTrue(any(row["role"] == "bot" for row in history["memory"]))

        created = await self._post(
            "personal_memory_create",
            content="Owner prefers harbor walks.",
            tags=["preference"],
            source="telegram",
        )
        memory_id = created["memory"]["id"]
        self.assertEqual(created["memory"]["source"], "telegram")

        search = await self._post(
            "personal_memory_search",
            query="harbor walks",
            limit=20,
        )
        self.assertEqual(search["memories"][0]["id"], memory_id)

        updated = await self._post(
            "personal_memory_update",
            memoryId=memory_id,
            content="Owner prefers quiet harbor walks.",
            source="telegram",
        )
        self.assertTrue(updated["updated"])
        deleted = await self._post(
            "personal_memory_delete",
            memoryId=memory_id,
        )
        self.assertTrue(deleted["deleted"])

    async def test_sqlite_health_failure_returns_error_without_stopping_service(self) -> None:
        with patch.object(
            memory_server.memory,
            "health_check",
            side_effect=sqlite3.OperationalError("database is locked"),
        ):
            response = await self.client.post(
                "/internal/telegram-group-ai",
                json={"action": "health", "ownerUid": 123},
                headers={"Authorization": "Bearer test-memory-secret"},
            )
            self.assertEqual(response.status, 500)

        recovered = await self._post("health")
        self.assertTrue(recovered["ok"])


if __name__ == "__main__":
    unittest.main()
