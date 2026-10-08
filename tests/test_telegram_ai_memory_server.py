import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

import telegram_ai_memory_server as api


class TelegramAiMemoryApiTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp_dir = TemporaryDirectory()
        self.database_path = Path(self.temp_dir.name) / "memory.sqlite3"
        self.path_patch = patch(
            "telegram_ai_memory.database_path",
            return_value=self.database_path,
        )
        self.path_patch.start()
        self.secret_patch = patch.object(api, "TELEGRAM_AI_MEMORY_SECRET", "test-secret")
        self.secret_patch.start()
        self.admin_patch = patch.object(api, "ADMIN_TELEGRAM_IDS", frozenset({42}))
        self.admin_patch.start()
        app = web.Application(client_max_size=2 * 1024 * 1024)
        app.router.add_post("/internal/telegram-group-ai", api._handle)
        self.client = TestClient(TestServer(app))
        await self.client.start_server()

    async def asyncTearDown(self):
        await self.client.close()
        self.admin_patch.stop()
        self.secret_patch.stop()
        self.path_patch.stop()
        self.temp_dir.cleanup()

    async def _post(self, body, authorized=True):
        headers = {"Content-Type": "application/json"}
        if authorized:
            headers["Authorization"] = "Bearer test-secret"
        return await self.client.post(
            "/internal/telegram-group-ai",
            json=body,
            headers=headers,
        )

    async def test_requires_secret_and_configured_admin(self):
        unauthorized = await self._post(
            {"action": "retrieve_owner_memory", "ownerUid": 42, "query": "test"},
            authorized=False,
        )
        denied_admin = await self._post(
            {"action": "retrieve_owner_memory", "ownerUid": 99, "query": "test"}
        )

        self.assertEqual(unauthorized.status, 401)
        self.assertEqual(denied_admin.status, 400)

    async def test_memory_write_and_search_round_trip(self):
        write = await self._post(
            {
                "action": "store_owner_message",
                "ownerUid": 42,
                "groupId": -100123,
                "groupTitle": "Channel",
                "messageId": 5,
                "senderName": "Owner",
                "content": "I started a new role at work.",
                "mediaTypes": [],
                "replyToMessageId": None,
                "timestamp": "2024-01-01T02:03:04Z",
                "edited": False,
            }
        )
        search = await self._post(
            {
                "action": "retrieve_group_memory",
                "ownerUid": 42,
                "groupId": -100123,
                "query": "new role",
                "replyToMessageId": None,
            }
        )
        search_data = await search.json()

        self.assertEqual(write.status, 200)
        self.assertTrue((await write.json())["stored"])
        self.assertEqual(search.status, 200)
        self.assertTrue(
            any("new role" in item["content"] for item in search_data["memory"])
        )
        entry = search_data["memory"][0]
        self.assertEqual(entry["role"], "admin")
        self.assertRegex(entry["id"], r"^\d{40}$")
        self.assertEqual(entry["timestamp"], "Senin, 1 Januari 2024 09:03 WIB")
        self.assertNotIn("telegram_message_id", entry)

    async def test_rejects_non_string_media_types_without_server_error(self):
        response = await self._post(
            {
                "action": "store_owner_message",
                "ownerUid": 42,
                "groupId": -100123,
                "messageId": 6,
                "senderName": "Owner",
                "content": "Invalid media payload",
                "mediaTypes": [{}],
                "replyToMessageId": None,
                "edited": False,
            }
        )

        self.assertEqual(response.status, 400)


if __name__ == "__main__":
    unittest.main()
