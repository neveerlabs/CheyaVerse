import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import storage
from handlers import unblock


class UnblockStorageTests(unittest.IsolatedAsyncioTestCase):
    async def test_listing_is_scoped_to_uid_and_matching_device_owner(self):
        row = ["1234567890", "desktop", "Linux", "Example", "PC", "Browser", "1"]
        with patch.object(
            storage,
            "_execute",
            new=AsyncMock(
                return_value=(
                    [
                        "device_id",
                        "device_type",
                        "os",
                        "brand",
                        "model",
                        "browser",
                        "browser_version",
                    ],
                    [row],
                )
            ),
        ) as execute:
            devices = await storage.list_blacklisted_devices_for_uid(42)

        self.assertEqual(devices[0]["device_id"], "1234567890")
        query, args = execute.await_args.args
        self.assertIn("WHERE b.uid = ?", query)
        self.assertIn("d.uid = b.uid", query)
        self.assertEqual(args, [42])

    async def test_unblock_deletes_only_the_requested_account_device_pair(self):
        with patch.object(
            storage,
            "_execute",
            new=AsyncMock(return_value=(["device_id"], [["1234567890"]])),
        ) as execute:
            removed = await storage.unblock_device_for_uid(42, "1234567890")

        self.assertTrue(removed)
        query, args = execute.await_args.args
        self.assertIn("blocked.uid = ?", query)
        self.assertIn("blocked.device_id = ?", query)
        self.assertIn("device.uid = blocked.uid", query)
        self.assertEqual(args, [42, "1234567890"])

    async def test_rejects_invalid_device_ids_before_database_access(self):
        with patch.object(storage, "_execute", new=AsyncMock()) as execute:
            with self.assertRaises(ValueError):
                await storage.unblock_device_for_uid(42, "arbitrary")

        execute.assert_not_awaited()


class UnblockHandlerTests(unittest.IsolatedAsyncioTestCase):
    @staticmethod
    def _private_message():
        return SimpleNamespace(
            chat=SimpleNamespace(type="private"),
            answer=AsyncMock(),
            edit_text=AsyncMock(),
        )

    @staticmethod
    def _callback(uid, data):
        return SimpleNamespace(
            from_user=SimpleNamespace(id=uid),
            data=data,
            message=UnblockHandlerTests._private_message(),
            answer=AsyncMock(),
        )

    async def test_command_lists_only_using_requesting_telegram_uid(self):
        message = self._private_message()
        message.from_user = SimpleNamespace(id=42)
        devices = [{"device_id": "1234567890", "model": "My laptop"}]
        with patch.object(
            unblock.storage,
            "list_blacklisted_devices_for_uid",
            new=AsyncMock(return_value=devices),
        ) as list_devices:
            await unblock.cmd_unblock(message)

        list_devices.assert_awaited_once_with(42)
        self.assertEqual(
            message.answer.await_args.kwargs["reply_markup"]
            .inline_keyboard[0][0]
            .callback_data,
            "unblock:select:1234567890",
        )

    async def test_selection_shows_details_and_requires_confirmation(self):
        callback = self._callback(42, "unblock:select:1234567890")
        device = {
            "device_id": "1234567890",
            "device_type": "desktop",
            "model": "<script>",
            "last_seen": "today",
        }
        with patch.object(
            unblock.storage,
            "get_blacklisted_device_for_uid",
            new=AsyncMock(return_value=device),
        ) as get_device:
            await unblock.cb_unblock(callback)

        get_device.assert_awaited_once_with(42, "1234567890")
        text = callback.message.edit_text.await_args.args[0]
        self.assertIn("&lt;script&gt;", text)
        self.assertNotIn("<script>", text)
        keyboard = callback.message.edit_text.await_args.kwargs["reply_markup"]
        self.assertEqual(
            keyboard.inline_keyboard[0][0].callback_data,
            "unblock:confirm:1234567890",
        )

    async def test_confirmation_for_other_account_cannot_unblock_device(self):
        callback = self._callback(99, "unblock:confirm:1234567890")
        with (
            patch.object(
                unblock.storage,
                "get_blacklisted_device_for_uid",
                new=AsyncMock(return_value=None),
            ) as get_device,
            patch.object(
                unblock.storage,
                "unblock_device_for_uid",
                new=AsyncMock(return_value=True),
            ) as remove_device,
        ):
            await unblock.cb_unblock(callback)

        get_device.assert_awaited_once_with(99, "1234567890")
        remove_device.assert_not_awaited()
        callback.answer.assert_awaited_once()

    async def test_confirmation_removes_device_only_after_valid_selection(self):
        callback = self._callback(42, "unblock:confirm:1234567890")
        device = {"device_id": "1234567890", "model": "Laptop"}
        with (
            patch.object(
                unblock.storage,
                "get_blacklisted_device_for_uid",
                new=AsyncMock(return_value=device),
            ) as get_device,
            patch.object(
                unblock.storage,
                "unblock_device_for_uid",
                new=AsyncMock(return_value=True),
            ) as remove_device,
        ):
            await unblock.cb_unblock(callback)

        get_device.assert_awaited_once_with(42, "1234567890")
        remove_device.assert_awaited_once_with(42, "1234567890")


if __name__ == "__main__":
    unittest.main()
