import asyncio
import unittest
from unittest.mock import patch

import telegram_tts


class FakeCommunicate:
    instance = None

    def __init__(self, text: str, voice: str) -> None:
        self.text = text
        self.voice = voice
        FakeCommunicate.instance = self

    async def stream(self):
        yield {"type": "audio", "data": b"voice-audio"}
        yield {"type": "WordBoundary", "data": b"ignored"}


class TelegramTtsTests(unittest.TestCase):
    def test_synthesizes_audio_with_female_indonesian_voice(self) -> None:
        with patch.object(telegram_tts, "Communicate", FakeCommunicate):
            audio = asyncio.run(telegram_tts.synthesize_voice_note(" Hai! "))

        self.assertEqual(audio, b"voice-audio")
        self.assertEqual(FakeCommunicate.instance.text, "Hai!")
        self.assertEqual(FakeCommunicate.instance.voice, "id-ID-GadisNeural")

    def test_rejects_empty_text(self) -> None:
        with self.assertRaisesRegex(ValueError, "must not be empty"):
            asyncio.run(telegram_tts.synthesize_voice_note("  "))

    def test_rejects_replies_over_voice_limit(self) -> None:
        text = "a" * (telegram_tts.MAX_VOICE_REPLY_CHARS + 1)
        with self.assertRaisesRegex(ValueError, "exceeds"):
            asyncio.run(telegram_tts.synthesize_voice_note(text))

    def test_rejects_empty_synthesis_result(self) -> None:
        class SilentCommunicate:
            def __init__(self, text: str, voice: str) -> None:
                pass

            async def stream(self):
                yield {"type": "WordBoundary", "data": b"ignored"}

        with patch.object(telegram_tts, "Communicate", SilentCommunicate):
            with self.assertRaisesRegex(RuntimeError, "no audio data"):
                asyncio.run(telegram_tts.synthesize_voice_note("Hello"))


if __name__ == "__main__":
    unittest.main()
