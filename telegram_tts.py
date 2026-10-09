from edge_tts import Communicate


VOICE = "id-ID-GadisNeural"
MAX_VOICE_REPLY_CHARS = 700


async def synthesize_voice_note(text: str) -> bytes:
    normalized_text = text.strip()
    if not normalized_text:
        raise ValueError("Voice note text must not be empty.")
    if len(normalized_text) > MAX_VOICE_REPLY_CHARS:
        raise ValueError(
            f"Voice note text exceeds {MAX_VOICE_REPLY_CHARS} characters."
        )

    audio = bytearray()
    communicate = Communicate(normalized_text, VOICE)
    async for chunk in communicate.stream():
        if chunk.get("type") == "audio":
            audio.extend(chunk["data"])
    if not audio:
        raise RuntimeError("Text-to-speech returned no audio data.")
    return bytes(audio)
