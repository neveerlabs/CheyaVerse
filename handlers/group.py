import asyncio
import mimetypes
import aiohttp

from aiogram import Bot, F, Router
from aiogram.enums import ChatMemberStatus
from aiogram.exceptions import TelegramAPIError
from aiogram.filters import Command
from aiogram.types import Message

from config import ADMIN_TELEGRAM_IDS, PUBLIC_URL, TELEGRAM_GROUP_AI_SECRET
from logger import logger

router = Router(name="telegram_group_ai")
GROUP_TYPES = {"group", "supergroup"}
class GroupAiApiError(RuntimeError):
    pass


async def _api(action: str, **payload):
    if not PUBLIC_URL or not TELEGRAM_GROUP_AI_SECRET:
        raise GroupAiApiError("PUBLIC_URL or TELEGRAM_GROUP_AI_SECRET is not configured")
    timeout = aiohttp.ClientTimeout(total=70, connect=8)
    url = f"{PUBLIC_URL}/api/internal/telegram/group-ai"
    try:
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(
                url,
                json={"action": action, **payload},
                headers={"Authorization": f"Bearer {TELEGRAM_GROUP_AI_SECRET}"},
            ) as response:
                try:
                    data = await response.json(content_type=None)
                except (aiohttp.ContentTypeError, ValueError) as exc:
                    raise GroupAiApiError("Group AI API returned invalid JSON") from exc
                if not isinstance(data, dict) or not data.get("ok"):
                    message = data.get("message") if isinstance(data, dict) else None
                    error = data.get("error") if isinstance(data, dict) else None
                    raise GroupAiApiError(
                        message
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
        asyncio.create_task(
            _delete_temporary_status(
                message.bot,
                message.chat.id,
                status_message.message_id,
            )
        )
    except TelegramAPIError as exc:
        logger.error(
            f"Could not show group AI status in {message.chat.id}: {exc}"
        )


@router.message(F.chat.type.in_(GROUP_TYPES), Command("send"))
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


@router.message(F.chat.type.in_(GROUP_TYPES), Command("up"))
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


@router.channel_post(Command("send"))
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


@router.channel_post(Command("up"))
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
    if not await _is_group_admin(message):
        return
    await _process_owner_message(message, message.from_user.id)


@router.channel_post()
async def process_channel_post(message: Message) -> None:
    owner_uid = await _channel_owner_uid(message)
    if owner_uid is None:
        return
    await _process_owner_message(message, owner_uid)


@router.edited_channel_post()
async def process_edited_channel_post(message: Message) -> None:
    owner_uid = await _channel_owner_uid(message)
    if owner_uid is None:
        return
    await _process_owner_message(message, owner_uid, edited=True)


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


async def _process_owner_message(
    message: Message,
    owner_uid: int,
    edited: bool = False,
) -> None:
    text = message.text or message.caption or ""
    if text.strip().startswith("/"):
        return
    attachments = _message_attachments(message)
    if not text.strip() and not attachments:
        return

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
        if result.get("summaryStored") is not True:
            logger.warning(
                f"Group AI produced no durable summary for channel {message.chat.id} "
                f"message {message.message_id}."
            )
        memory_action_failures = result.get("memoryActionFailures", 0)
        if (
            isinstance(memory_action_failures, int)
            and not isinstance(memory_action_failures, bool)
            and memory_action_failures > 0
        ):
            await _notify_personal_memory_action_error(message)
            return
        reply = result.get("reply")
        if (
            not result.get("sendEnabled")
            or not isinstance(reply, str)
            or not reply.strip()
        ):
            return
        sent = (
            await message.answer(reply.strip()[:1800], parse_mode=None)
            if message.chat.type == "channel"
            else await message.reply(reply.strip()[:1800], parse_mode=None)
        )
        await _api(
            "record_bot_message",
            groupId=message.chat.id,
            messageId=sent.message_id,
            replyToMessageId=message.message_id,
            text=reply.strip()[:1800],
            timestamp=sent.date.isoformat(),
        )
    except (GroupAiApiError, TelegramAPIError) as exc:
        logger.error(
            f"Group AI processing failed in {message.chat.id} "
            f"for Telegram message {message.message_id}: {exc}"
        )
        if isinstance(exc, GroupAiApiError):
            await _notify_processing_error(message, str(exc))
    except Exception:
        logger.exception(
            f"Unexpected group AI error in {message.chat.id} "
            f"for Telegram message {message.message_id}"
        )
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
            await message.answer(notice, parse_mode=None)
        else:
            await message.reply(notice, parse_mode=None)
    except TelegramAPIError as send_error:
        logger.error(
            f"Failed to show group AI error in Telegram chat {message.chat.id}: "
            f"{send_error}"
        )


async def _notify_personal_memory_action_error(message: Message) -> None:
    notice = (
        "⚠️ Pesan sudah diproses, tetapi perubahan pada memori jangka panjang "
        "tidak berhasil. Aku belum menganggap perubahan itu tersimpan; coba "
        "ulangi dengan menyebut catatan yang dimaksud secara jelas."
    )
    try:
        if message.chat.type == "channel":
            await message.answer(notice, parse_mode=None)
        else:
            await message.reply(notice, parse_mode=None)
    except TelegramAPIError as send_error:
        logger.error(
            f"Failed to show personal-memory action error in Telegram chat "
            f"{message.chat.id}: {send_error}"
        )
