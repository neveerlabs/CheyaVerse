import asyncio
import socket
import unittest
from unittest.mock import AsyncMock, Mock, patch

from telegram_retry import is_transient_network_error, with_telegram_retry


class TelegramRetryTests(unittest.TestCase):
    def test_transient_connection_and_dns_errors_are_recognized(self):
        self.assertTrue(is_transient_network_error(ConnectionResetError()))
        self.assertTrue(
            is_transient_network_error(
                socket.gaierror(socket.EAI_AGAIN, "temporary DNS failure")
            )
        )
        self.assertFalse(is_transient_network_error(ValueError("bad request")))

    def test_transient_error_is_retried_and_succeeds(self):
        async def run():
            operation = AsyncMock(
                side_effect=[ConnectionResetError("reset"), "ok"]
            )
            logger = Mock()
            with patch("telegram_retry.asyncio.sleep", new_callable=AsyncMock):
                result = await with_telegram_retry(
                    operation,
                    label="test",
                    logger=logger,
                )
            self.assertEqual(result, "ok")
            self.assertEqual(operation.await_count, 2)
            logger.warning.assert_called_once()

        asyncio.run(run())

    def test_persistent_transient_error_is_raised_after_bounded_attempts(self):
        async def run():
            error = ConnectionResetError("still down")
            operation = AsyncMock(side_effect=error)
            with patch("telegram_retry.asyncio.sleep", new_callable=AsyncMock):
                with self.assertRaises(ConnectionResetError) as raised:
                    await with_telegram_retry(
                        operation,
                        label="test",
                        logger=Mock(),
                    )
            self.assertIs(raised.exception, error)
            self.assertEqual(operation.await_count, 3)

        asyncio.run(run())


if __name__ == "__main__":
    unittest.main()
