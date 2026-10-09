from datetime import datetime, timezone
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch

from handlers import group


class GroupAiRecoveryTests(unittest.IsolatedAsyncioTestCase):
    def test_non_json_response_preview_is_bounded_and_redacts_bearer_tokens(self) -> None:
        preview = group._response_preview(
            "<html><title>Gateway Error</title>"
            "<p>Bearer super-secret-token upstream timeout</p></html>"
        )

        self.assertEqual(
            preview,
            "Gateway Error Bearer [redacted] upstream timeout",
        )
        self.assertLessEqual(len(group._response_preview("x" * 500)), 240)

    async def test_memory_action_failure_does_not_discard_message_or_reply(self) -> None:
        events: list[str] = []

        async def api(action: str, **_payload: object) -> dict[str, object]:
            events.append(action)
            if action == "auto_enable":
                return {"enabled": True, "sendEnabled": True}
            if action == "auto_process":
                return {
                    "stored": True,
                    "sendEnabled": True,
                    "reply": "Aku paham, akan kuingat.",
                    "replyMode": "text",
                    "replyLinks": "",
                    "summary": "Owner meminta preferensi dicatat.",
                    "summaryPending": True,
                    "memoryActionFailures": 1,
                    "memoryActionFailureReasons": ["memory_service_unavailable"],
                    "memoryChanges": 0,
                }
            if action == "finalize_owner_message":
                return {"stored": True}
            self.fail(f"Unexpected API action: {action}")

        message = SimpleNamespace(
            text="Ingat preferensi ini",
            caption=None,
            chat=SimpleNamespace(id=-100123, title="Stories", type="channel"),
            message_id=45,
            reply_to_message=None,
            from_user=None,
            date=datetime.now(timezone.utc),
        )
        with (
            patch.object(group, "_api", new=AsyncMock(side_effect=api)),
            patch.object(group, "_message_attachments", return_value=[]),
            patch.object(
                group,
                "_send_ai_reply",
                new=AsyncMock(
                    side_effect=lambda *_args, **_kwargs: events.append("reply")
                    or [{"messageId": 46, "content": "Aku paham.", "timestamp": "now"}]
                ),
            ),
            patch.object(group, "_rollback_staged_message", new=AsyncMock()) as rollback,
            patch.object(
                group,
                "_notify_personal_memory_action_error",
                new=AsyncMock(side_effect=lambda *_args: events.append("notice")),
            ) as notify,
        ):
            await group._process_owner_message_locked(message, owner_uid=123)

        self.assertIn("reply", events)
        self.assertIn("finalize_owner_message", events)
        self.assertEqual(events[-1], "notice")
        rollback.assert_not_awaited()
        notify.assert_awaited_once()


if __name__ == "__main__":
    unittest.main()
