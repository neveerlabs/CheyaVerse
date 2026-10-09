import asyncio
import html
import json
import mimetypes
import re
import time
import aiohttp

from aiogram import Bot, F, Router
from aiogram.enums import ChatMemberStatus
from aiogram.exceptions import TelegramAPIError
from aiogram.filters import Command
from aiogram.types import BufferedInputFile, Message

from config import ADMIN_TELEGRAM_IDS, PUBLIC_URL, TELEGRAM_GROUP_AI_SECRET
from logger import logger
from telegram_tts import MAX_VOICE_REPLY_CHARS, synthesize_voice_note

router = Router(name="telegram_group_ai")
GROUP_TYPES = {"group", "supergroup"}
VOICE_GENERATION_TIMEOUT_SECONDS = 20
GROUP_AI_REQUEST_TIMEOUT_SECONDS = 310
_CHAT_PROCESSING_LOCKS: dict[int, asyncio.Lock] = {}
_BOT_CHANNEL_POSTS: dict[tuple[int, int], float] = {}


def _chat_processing_lock(chat_id: int) -> asyncio.Lock:
    return _CHAT_PROCESSING_LOCKS.setdefault(chat_id, asyncio.Lock())


def _mark_bot_channel_post(message: Message) -> None:
    if message.chat.type != "channel":
        return
    now = time.monotonic()
    expired = [key for key, timestamp in _BOT_CHANNEL_POSTS.items() if now - timestamp > 300]
    for key in expired:
        _BOT_CHANNEL_POSTS.pop(key, None)
    _BOT_CHANNEL_POSTS[(message.chat.id, message.message_id)] = now


class GroupAiApiError(RuntimeError):
    pass


def _response_preview(body: str) -> str:
    preview = html.unescape(re.sub(r"<[^>]*>", " ", body))
    preview = re.sub(
        r"(?i)bearer\s+[A-Za-z0-9._~+/=-]+",
        "Bearer [redacted]",
        preview,
    )
    return " ".join(preview.split())[:240]


async def _api(action: str, **payload):
    if not PUBLIC_URL or not TELEGRAM_GROUP_AI_SECRET:
        raise GroupAiApiError("PUBLIC_URL or TELEGRAM_GROUP_AI_SECRET is not configured")
    timeout = aiohttp.ClientTimeout(
        total=GROUP_AI_REQUEST_TIMEOUT_SECONDS,
        connect=8,
    )
    url = f"{PUBLIC_URL}/api/internal/telegram/group-ai"
    try:
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(
                url,
                json={"action": action, **payload},
                headers={"Authorization": f"Bearer {TELEGRAM_GROUP_AI_SECRET}"},
            ) as response:
                body = await response.text()
                try:
                    data = json.loads(body)
                except ValueError as exc:
                    content_type = response.headers.get("Content-Type", "unknown")
                    preview = _response_preview(body) or "<empty response>"
                    logger.error(
                        f"Group AI API returned non-JSON for {action}: HTTP "
                        f"{response.status}, content-type={content_type}, "
                        f"body-preview={preview!r}"
                    )
                    if response.status == 504 and "FUNCTION_INVOCATION_TIMEOUT" in body:
                        raise GroupAiApiError(
                            "Group AI API timed out in Vercel "
                            "(FUNCTION_INVOCATION_TIMEOUT)."
                        ) from exc
                    raise GroupAiApiError(
                        f"Group AI API returned invalid JSON (HTTP {response.status}, "
                        f"content-type {content_type})."
                    ) from exc
                if not isinstance(data, dict) or not data.get("ok"):
                    message = data.get("message") if isinstance(data, dict) else None
                    error = data.get("error") if isinstance(data, dict) else None
                    raise GroupAiApiError(
                        f"{error}: {message}"
                        if isinstance(error, str) and isinstance(message, str)
                        else message
                        if isinstance(message, str)
                        else f"Group AI API returned HTTP {response.status}: "
                        f"{error if isinstance(error, str) else 'request rejected'}"
                    )
                return data
    except (aiohttp.ClientError, TimeoutError) as exc:
        raise GroupAiApiError(f"Group AI API request failed: {exc}") from exc


def _group_message(message: Message) -> bool:
    return message.chat.type in GROUP_TYPES and message.from_user is not None


async def _is_group_admin(message: Message) -> bool:
    if not _group_message(message) or message.from_user is None:
        return False
    if not message.bot:
        return False
    try:
        member = await message.bot.get_chat_member(
            message.chat.id,
            message.from_user.id,
        )
    except TelegramAPIError as exc:
        logger.warning(f"Could not verify group admin for {message.chat.id}: {exc}")
        return False
    return member.status in {ChatMemberStatus.CREATOR, ChatMemberStatus.ADMINISTRATOR}


async def _channel_owner_uid(message: Message) -> int | None:
    if message.chat.type != "channel" or message.bot is None:
        return None
    if message.from_user is not None and (
        message.from_user.is_bot or message.from_user.id not in ADMIN_TELEGRAM_IDS
    ):
        return None
    if _BOT_CHANNEL_POSTS.pop((message.chat.id, message.message_id), None) is not None:
        return None
    try:
        admins = await message.bot.get_chat_administrators(message.chat.id)
    except TelegramAPIError as exc:
        logger.warning(f"Could not verify channel admins for {message.chat.id}: {exc}")
        return None
    configured_human_admins = {
        item.user.id
        for item in admins
        if not item.user.is_bot and item.user.id in ADMIN_TELEGRAM_IDS
    }
    if len(configured_human_admins) != 1:
        logger.warning(
            f"Ignored channel AI message for {message.chat.id}: expected exactly one "
            "channel admin whose Telegram ID is configured in ADMIN_TELEGRAM_IDS."
        )
        return None
    return next(iter(configured_human_admins))


async def _set_send_permission(
    message: Message,
    owner_uid: int,
    enabled: bool,
) -> tuple[bool, bool]:
    try:
        result = await _api(
            "send_permission",
            groupId=message.chat.id,
            ownerUid=owner_uid,
            groupTitle=message.chat.title or "",
            enabled=enabled,
        )
        send_enabled = result.get("sendEnabled") is True
        connected = result.get("connected") is True
        if enabled and not send_enabled and result.get("connected") is False:
            return True, False
        if send_enabled != enabled:
            logger.error(
                f"Unexpected send-permission state for Telegram chat {message.chat.id}"
            )
            return False, False
        return True, connected
    except (GroupAiApiError, TelegramAPIError) as exc:
        logger.error(
            f"Could not change group AI send permission for {message.chat.id}: {exc}"
        )
        return False, False


async def _delete_temporary_status(bot: Bot, chat_id: int, message_id: int) -> None:
    await asyncio.sleep(5)
    try:
        await bot.delete_message(chat_id=chat_id, message_id=message_id)
    except TelegramAPIError as exc:
        logger.warning(
            f"Could not remove temporary group AI status from {chat_id}: {exc}"
        )


async def _show_connection_status(message: Message, text: str) -> None:
    if message.bot is None:
        return
    try:
        status_message = await message.answer(text, parse_mode=None)
        _mark_bot_channel_post(status_message)
        asyncio.create_task(
            _delete_temporary_status(
                message.bot,
                message.chat.id,
                status_message.message_id,
            )
        )
    except Exception as exc:
        logger.error(
            f"Could not show group AI status in {message.chat.id}: {exc}"
        )


@router.message(F.chat.type.in_(GROUP_TYPES), F.text, Command("send"))
async def allow_group_ai_sending(message: Message) -> None:
    if message.from_user is None:
        return
    if message.from_user.id not in ADMIN_TELEGRAM_IDS or not await _is_group_admin(message):
        logger.warning(
            f"Ignored unauthorized /send command in Telegram chat {message.chat.id}"
        )
        return
    updated, connected = await _set_send_permission(
        message,
        message.from_user.id,
        True,
    )
    await _show_connection_status(
        message,
        "CheyaVerse connected"
        if updated and connected
        else "CheyaVerse disconnected"
        if updated
        else "CheyaVerse status unavailable",
    )


@router.message(F.chat.type.in_(GROUP_TYPES), F.text, Command("up"))
async def stop_group_ai_sending(message: Message) -> None:
    if message.from_user is None:
        return
    if message.from_user.id not in ADMIN_TELEGRAM_IDS or not await _is_group_admin(message):
        logger.warning(
            f"Ignored unauthorized /up command in Telegram chat {message.chat.id}"
        )
        return
    updated, _ = await _set_send_permission(
        message,
        message.from_user.id,
        False,
    )
    await _show_connection_status(
        message,
        "CheyaVerse disconnected"
        if updated
        else "CheyaVerse status unavailable",
    )


@router.channel_post(F.text, Command("send"))
async def allow_channel_ai_sending(message: Message) -> None:
    owner_uid = await _channel_owner_uid(message)
    if owner_uid is not None:
        updated, connected = await _set_send_permission(message, owner_uid, True)
        await _show_connection_status(
            message,
            "CheyaVerse connected"
            if updated and connected
            else "CheyaVerse disconnected"
            if updated
            else "CheyaVerse status unavailable",
        )


@router.channel_post(F.text, Command("up"))
async def stop_channel_ai_sending(message: Message) -> None:
    owner_uid = await _channel_owner_uid(message)
    if owner_uid is not None:
        updated, _ = await _set_send_permission(message, owner_uid, False)
        await _show_connection_status(
            message,
            "CheyaVerse disconnected"
            if updated
            else "CheyaVerse status unavailable",
        )


@router.message(F.chat.type.in_(GROUP_TYPES))
async def process_group_message(message: Message) -> None:
    if not _group_message(message) or message.from_user is None:
        return
    if message.from_user.is_bot:
        return
    if message.from_user.id not in ADMIN_TELEGRAM_IDS:
        return
    async with _chat_processing_lock(message.chat.id):
        if not await _is_group_admin(message):
            return
        await _process_owner_message_locked(message, message.from_user.id)


@router.channel_post()
async def process_channel_post(message: Message) -> None:
    async with _chat_processing_lock(message.chat.id):
        owner_uid = await _channel_owner_uid(message)
        if owner_uid is None:
            return
        await _process_owner_message_locked(message, owner_uid)


@router.edited_channel_post()
async def process_edited_channel_post(message: Message) -> None:
    async with _chat_processing_lock(message.chat.id):
        owner_uid = await _channel_owner_uid(message)
        if owner_uid is None:
            return
        await _process_owner_message_locked(message, owner_uid, edited=True)


def _message_attachments(message: Message) -> list[dict[str, object]]:
    media = (
        ("photo", message.photo[-1] if message.photo else None, "image/jpeg", None),
        ("video", message.video, message.video.mime_type if message.video else None, message.video.file_name if message.video else None),
        ("animation", message.animation, "video/mp4", message.animation.file_name if message.animation else None),
        ("document", message.document, message.document.mime_type if message.document else None, message.document.file_name if message.document else None),
        ("audio", message.audio, message.audio.mime_type if message.audio else None, message.audio.file_name if message.audio else None),
        ("voice", message.voice, message.voice.mime_type if message.voice else "audio/ogg", None),
        ("video_note", message.video_note, "video/mp4", None),
        ("sticker", message.sticker, message.sticker.mime_type if message.sticker else "image/webp", None),
    )
    attachments: list[dict[str, object]] = []
    for media_type, item, mime_type, file_name in media:
        if item is None:
            continue
        resolved_mime_type = mime_type or (
            mimetypes.guess_type(file_name)[0] if file_name else None
        )
        if resolved_mime_type == "application/octet-stream" and file_name:
            resolved_mime_type = mimetypes.guess_type(file_name)[0] or resolved_mime_type
        attachments.append(
            {
                "type": media_type,
                "fileId": item.file_id,
                "mimeType": resolved_mime_type or "application/octet-stream",
                "fileSize": item.file_size or 0,
                "fileName": file_name or "",
            }
        )
    return attachments


async def _rollback_staged_message(message: Message, owner_uid: int) -> None:
    try:
        await _api(
            "rollback_owner_message",
            groupId=message.chat.id,
            ownerUid=owner_uid,
            messageId=message.message_id,
        )
    except (GroupAiApiError, TelegramAPIError) as exc:
        logger.error(
            f"Could not roll back unresponded Telegram message {message.message_id} "
            f"in {message.chat.id}: {exc}"
        )


async def _finalize_failed_observation(
    message: Message,
    owner_uid: int,
    text: str,
    attachments: list[dict[str, object]],
) -> bool:
    media_types = ", ".join(str(item["type"]) for item in attachments) or "media"
    if text.strip():
        summary = (
            "Observasi faktual cadangan karena analisis AI gagal: owner menyampaikan "
            f'"{text.strip()[:900]}". Tidak ada inferensi tambahan.'
        )
    else:
        summary = (
            "Observasi faktual cadangan karena analisis AI gagal: owner mengirim "
            f"{media_types}. Isi media tidak disimpulkan."
        )
    try:
        finalized = await _api(
            "finalize_owner_message",
            groupId=message.chat.id,
            ownerUid=owner_uid,
            groupTitle=message.chat.title or "",
            ownerMessageId=message.message_id,
            summary=summary,
        )
    except (GroupAiApiError, TelegramAPIError) as exc:
        logger.error(
            f"Could not retain observation-only Telegram message "
            f"{message.message_id} in {message.chat.id}: {exc}"
        )
        return False
    if finalized.get("stored") is not True:
        logger.error(
            f"Observation-only Telegram message {message.message_id} "
            f"in {message.chat.id} was not finalized."
        )
        return False
    logger.warning(
        f"AI analysis failed for observation-only Telegram message "
        f"{message.message_id} in {message.chat.id}; stored a factual fallback insight."
    )
    return True


def _normalized_message_text(value: str) -> str:
    return " ".join(value.casefold().split())


async def _send_ai_reply(
    message: Message,
    reply: str,
    reply_mode: object,
    reply_links: str,
) -> list[dict[str, object]]:
    async def send_text(text: str) -> Message:
        sent = (
            await message.answer(text, parse_mode=None)
            if message.chat.type == "channel"
            else await message.reply(text, parse_mode=None)
        )
        _mark_bot_channel_post(sent)
        return sent

    if reply_mode == "voice":
        if len(reply) <= MAX_VOICE_REPLY_CHARS:
            try:
                audio = await asyncio.wait_for(
                    synthesize_voice_note(reply),
                    timeout=VOICE_GENERATION_TIMEOUT_SECONDS,
                )
                voice = BufferedInputFile(audio, filename="cheya-voice.mp3")
                sent = (
                    await message.answer_voice(voice=voice)
                    if message.chat.type == "channel"
                    else await message.reply_voice(voice=voice)
                )
                _mark_bot_channel_post(sent)
                messages: list[dict[str, object]] = [{
                    "messageId": sent.message_id,
                    "content": reply,
                    "timestamp": sent.date.isoformat(),
                    "mediaTypes": ["voice"],
                }]
                if reply_links.strip():
                    try:
                        links_sent = await send_text(reply_links.strip()[:1800])
                    except TelegramAPIError as exc:
                        logger.error(
                            f"Could not send text links after Telegram voice reply "
                            f"{sent.message_id} in {message.chat.id}: {exc}"
                        )
                    else:
                        messages.append({
                            "messageId": links_sent.message_id,
                            "content": reply_links.strip()[:1800],
                            "timestamp": links_sent.date.isoformat(),
                        })
                return messages
            except Exception as exc:
                logger.warning(
                    f"Voice reply failed for Telegram message {message.message_id} "
                    f"in {message.chat.id}; falling back to text: "
                    f"{type(exc).__name__}: {exc}"
                )
        else:
            logger.warning(
                f"Voice reply exceeded {MAX_VOICE_REPLY_CHARS} characters for "
                f"Telegram message {message.message_id} in {message.chat.id}; "
                "falling back to text."
            )

    text_reply = reply.strip()
    if reply_links.strip():
        text_reply = f"{text_reply}\n\n{reply_links.strip()}".strip()
    sent = await send_text(text_reply[:4000])
    return [{
        "messageId": sent.message_id,
        "content": text_reply[:4000],
        "timestamp": sent.date.isoformat(),
    }]


async def _process_owner_message_locked(
    message: Message,
    owner_uid: int,
    edited: bool = False,
) -> None:
    text = message.text or message.caption or ""
    if message.text and message.text.strip().startswith("/"):
        return
    attachments = _message_attachments(message)
    if not text.strip() and not attachments:
        return

    processing_started = False
    reply_sent = False
    observation_only = False
    try:
        status = await _api(
            "auto_enable",
            groupId=message.chat.id,
            groupTitle=message.chat.title or "",
            ownerUid=owner_uid,
        )
        if not status.get("enabled"):
            logger.warning(
                f"Group AI did not enable channel {message.chat.id}; "
                "the owner message was not sent for digestion."
            )
            return
        observation_only = status.get("sendEnabled") is False
        processing_started = True
        result = await _api(
            "auto_process",
            groupId=message.chat.id,
            groupTitle=message.chat.title or "",
            ownerUid=owner_uid,
            telegramUid=owner_uid,
            messageId=message.message_id,
            replyToMessageId=(
                message.reply_to_message.message_id
                if message.reply_to_message
                else None
            ),
            displayName=(
                message.from_user.full_name
                if message.from_user
                else message.chat.title or "Channel owner"
            ),
            text=text,
            mediaTypes=[str(item["type"]) for item in attachments],
            attachments=attachments,
            edited=edited,
            timestamp=message.date.isoformat(),
        )
        if result.get("stored") is not True:
            logger.warning(
                f"Group AI did not store channel {message.chat.id} message "
                f"{message.message_id}: {result.get('reason', 'not_stored')}."
            )
            return
        if (
            result.get("summaryStored") is not True
            and result.get("summaryPending") is not True
            and result.get("summarySkipped") is not True
        ):
            logger.warning(
                f"Group AI did not store an expected summary for channel {message.chat.id} "
                f"message {message.message_id}."
            )
        memory_action_failures = result.get("memoryActionFailures", 0)
        observation_only = result.get("observationOnly") is True
        memory_action_failure_reasons = result.get(
            "memoryActionFailureReasons"
        )
        if (
            isinstance(memory_action_failures, int)
            and not isinstance(memory_action_failures, bool)
            and memory_action_failures > 0
        ):
            if observation_only:
                logger.warning(
                    f"Some memory operations failed while observing Telegram message "
                    f"{message.message_id} in {message.chat.id}; retaining the message "
                    f"and its insight. Reasons: {memory_action_failure_reasons}."
                )
            else:
                logger.warning(
                    f"Some memory operations failed for Telegram message "
                    f"{message.message_id} in {message.chat.id}; continuing with the "
                    f"AI reply and message finalization. Reasons: "
                    f"{memory_action_failure_reasons}."
                )
        if observation_only:
            summary = result.get("summary")
            if not isinstance(summary, str) or not summary.strip():
                raise GroupAiApiError(
                    "Observation-only mode returned without a Telegram insight."
                )
            finalized = await _api(
                "finalize_owner_message",
                groupId=message.chat.id,
                ownerUid=owner_uid,
                groupTitle=message.chat.title or "",
                ownerMessageId=message.message_id,
                summary=summary,
            )
            if finalized.get("stored") is not True:
                raise GroupAiApiError(
                    "Observation-only Telegram message was not finalized."
                )
            return
        reply = result.get("reply")
        if (
            not result.get("sendEnabled")
            or not isinstance(reply, str)
            or not reply.strip()
        ):
            await _rollback_staged_message(message, owner_uid)
            return
        if _normalized_message_text(reply) == _normalized_message_text(text):
            logger.warning(
                f"Suppressed Telegram AI reply that repeated owner message "
                f"{message.message_id} in {message.chat.id}."
            )
            await _rollback_staged_message(message, owner_uid)
            return
        normalized_reply = reply.strip()[:1800]
        sent_messages = await _send_ai_reply(
            message,
            normalized_reply,
            result.get("replyMode"),
            result.get("replyLinks")
            if isinstance(result.get("replyLinks"), str)
            else "",
        )
        reply_sent = True
        finalized = await _api(
            "finalize_owner_message",
            groupId=message.chat.id,
            ownerUid=owner_uid,
            groupTitle=message.chat.title or "",
            ownerMessageId=message.message_id,
            botMessages=sent_messages,
            summary=result.get("summary"),
        )
        if finalized.get("stored") is not True:
            raise GroupAiApiError(
                "Telegram reply was sent, but its message memory was not finalized."
            )
        if (
            isinstance(memory_action_failures, int)
            and not isinstance(memory_action_failures, bool)
            and memory_action_failures > 0
        ):
            await _notify_personal_memory_action_error(
                message,
                memory_action_failure_reasons,
                result.get("memoryChanges"),
            )
    except (GroupAiApiError, TelegramAPIError) as exc:
        if observation_only and processing_started and not reply_sent:
            await _finalize_failed_observation(
                message, owner_uid, text, attachments
            )
            logger.error(
                f"Group AI processing failed in observation-only mode for "
                f"{message.chat.id} message {message.message_id}: {exc}"
            )
            return
        if processing_started and not reply_sent:
            await _rollback_staged_message(message, owner_uid)
        logger.error(
            f"Group AI processing failed in {message.chat.id} "
            f"for Telegram message {message.message_id}: {exc}"
        )
        if isinstance(exc, GroupAiApiError) and not reply_sent:
            await _notify_processing_error(message, str(exc))
    except Exception:
        if observation_only and processing_started and not reply_sent:
            await _finalize_failed_observation(
                message, owner_uid, text, attachments
            )
            logger.exception(
                f"Unexpected group AI error in observation-only mode for "
                f"{message.chat.id} message {message.message_id}"
            )
            return
        if processing_started and not reply_sent:
            await _rollback_staged_message(message, owner_uid)
        logger.exception(
            f"Unexpected group AI error in {message.chat.id} "
            f"for Telegram message {message.message_id}"
        )
        if not reply_sent:
            await _notify_processing_error(
                message,
                "Terjadi kesalahan internal saat mencerna pesan. Ringkasan belum tersimpan.",
            )


def _user_facing_error(detail: str) -> str:
    normalized = detail.lower()
    if any(token in normalized for token in ("rate limit", "rate_limit", "quota", "429", "resource_exhausted")):
        return "⚠️ Cheya gagal mencerna pesan: provider AI sedang kena rate limit/kuota. Ringkasan pesan ini belum tersimpan."
    if any(token in normalized for token in ("database", "postgres", "supabase", "query", "sql", "pool")):
        return "⚠️ Cheya gagal mencerna pesan: database/koneksi query bermasalah. Ringkasan pesan ini belum tersimpan."
    if any(token in normalized for token in ("connection", "cannot connect", "connector", "name resolution", "dns", "timeout", "timed out", "fetch failed", "econn", "enotfound", "network")):
        return "⚠️ Cheya gagal mencerna pesan: koneksi ke Telegram, dashboard, atau provider AI bermasalah."
    if any(token in normalized for token in ("api key", "credential", "unauthorized", "401", "403")):
        return "⚠️ Cheya gagal mencerna pesan: API key/provider menolak akses. Periksa pengaturan provider AI."
    if any(token in normalized for token in ("media", "gemini")):
        return "⚠️ Cheya gagal mencerna media: format tidak didukung, file terlalu besar, atau Gemini multimodal belum aktif."
    return "⚠️ Cheya gagal mencerna pesan karena error internal. Pesan ini belum masuk ke memori."


async def _notify_processing_error(message: Message, detail: str) -> None:
    notice = _user_facing_error(detail)
    try:
        if message.chat.type == "channel":
            sent = await message.answer(notice, parse_mode=None)
            _mark_bot_channel_post(sent)
        else:
            await message.reply(notice, parse_mode=None)
    except TelegramAPIError as send_error:
        logger.error(
            f"Failed to show group AI error in Telegram chat {message.chat.id}: "
            f"{send_error}"
        )


async def _notify_personal_memory_action_error(
    message: Message,
    reasons: object,
    successful_actions: object,
) -> None:
    reason_codes = set(reasons) if isinstance(reasons, list) else set()
    if (
        isinstance(successful_actions, int)
        and not isinstance(successful_actions, bool)
        and successful_actions > 0
    ):
        notice = (
            "⚠️ Pesan dan balasanku sudah diproses dan disimpan. Sebagian perubahan "
            "catatan berhasil, tetapi ada operasi memori lain yang gagal. Jangan "
            "kirim ulang pesan awal; minta aku memeriksa catatan yang tersimpan."
        )
    elif {"memory_target_not_found", "memory_target_not_retrieved"} & reason_codes:
        notice = (
            "⚠️ Pesan dan balasanku sudah diproses dan disimpan. Aku tidak menemukan "
            "catatan yang dimaksud, jadi perubahan/penghapusan itu belum dilakukan. "
            "Jangan kirim ulang pesan awal; minta aku memeriksa catatan yang tersimpan."
        )
    elif {"memory_operation_rejected", "telegram_operation_rejected"} & reason_codes:
        notice = (
            "⚠️ Pesan dan balasanku sudah diproses dan disimpan, tetapi perubahan "
            "catatan ditolak karena isinya tidak valid atau melewati batas "
            "penyimpanan. Jangan kirim ulang pesan awal; periksa catatannya dulu."
        )
    elif {"memory_service_unavailable", "telegram_service_unavailable"} & reason_codes:
        notice = (
            "⚠️ Pesan dan balasanku sudah diproses dan disimpan. Layanan memori "
            "sempat tidak tersedia sehingga sebagian perubahan catatan mungkin "
            "belum diterapkan. Jangan kirim ulang pesan awal."
        )
    else:
        notice = (
            "⚠️ Pesan dan balasanku sudah diproses dan disimpan, tetapi ada "
            "perubahan catatan yang gagal diterapkan. Jangan kirim ulang pesan "
            "awal; minta aku memeriksa catatan yang tersimpan."
        )
    try:
        if message.chat.type == "channel":
            sent = await message.answer(notice, parse_mode=None)
            _mark_bot_channel_post(sent)
        else:
            await message.reply(notice, parse_mode=None)
    except TelegramAPIError as send_error:
        logger.error(
            f"Failed to show personal-memory action error in Telegram chat "
            f"{message.chat.id}: {send_error}"
        )
