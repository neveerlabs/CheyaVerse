import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from handlers.group_ai import _channel_owner_uid


class ChannelOwnerTests(unittest.IsolatedAsyncioTestCase):
    @staticmethod
    def _message(admin_ids):
        admins = [
            SimpleNamespace(user=SimpleNamespace(id=uid, is_bot=False))
            for uid in admin_ids
        ]
        bot = SimpleNamespace(
            get_chat_administrators=AsyncMock(return_value=admins),
        )
        return SimpleNamespace(
            chat=SimpleNamespace(type="channel", id=-100123),
            bot=bot,
        )

    async def test_uses_configured_owner_when_channel_has_other_human_admins(self):
        message = self._message([42, 77, 88])
        with patch("handlers.group_ai.ADMIN_TELEGRAM_IDS", frozenset({42})):
            owner_uid = await _channel_owner_uid(message)

        self.assertEqual(owner_uid, 42)

    async def test_ignores_channel_without_configured_human_admin(self):
        message = self._message([77, 88])
        with patch("handlers.group_ai.ADMIN_TELEGRAM_IDS", frozenset({42})):
            owner_uid = await _channel_owner_uid(message)

        self.assertIsNone(owner_uid)

    async def test_ignores_channel_with_multiple_configured_human_admins(self):
        message = self._message([42, 77])
        with patch("handlers.group_ai.ADMIN_TELEGRAM_IDS", frozenset({42, 77})):
            owner_uid = await _channel_owner_uid(message)

        self.assertIsNone(owner_uid)


if __name__ == "__main__":
    unittest.main()
