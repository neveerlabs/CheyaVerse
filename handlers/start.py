import asyncio
import html
import json

from aiogram import F, Router
from aiogram.types import BufferedInputFile
from aiogram.dispatcher.event.bases import SkipHandler
from aiogram.enums import ParseMode
from aiogram.filters import CommandStart
from aiogram.types import (
    CallbackQuery,
    ForceReply,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    Message,
    ReplyParameters,
    Update,
)

from logger import logger
from storage import (
    attach_chat_reply_prompt,
    is_telegram_login_challenge_pending,
    respond_to_chat_notification,
    respond_to_telegram_login_challenge,
    send_telegram_chat_reply,
)

router = Router(name="start")

START_TEXT = (
    "```\n"
    "Name      : CheyaVerse\n"
    "Developer : M. Syalman Al Farizi\n"
    "Version   : v1.7.3-release\n"
    "Platform  : Telegram\n"
    "Purpose   : Virtual assistant\n"
    "Status    : Running\n"
    "```"
    "──────────────────────────\n"
    "*Cheya running successfully\\!*\n"
    "_Type /help to view available commands_"
)
MAX_FORWARD_UPDATE_BYTES = 8 * 1024 * 1024
MAX_FORWARD_UPDATE_MESSAGE_CHARS = 3500


async def _delete_start_message(message: Message, label: str) -> None:
    await asyncio.sleep(0.2)
    try:
        await message.delete()
    except Exception as exc:
        logger.warning(f"Failed to delete /start message for {label}: {exc}")


@router.message(CommandStart())
async def cmd_start(message: Message) -> None:
    user = message.from_user
    label = user.username or user.full_name or str(user.id)
    asyncio.create_task(_delete_start_message(message, label))

    parts = (message.text or "").split(maxsplit=1)
    payload = parts[1].strip() if len(parts) > 1 else ""
    if payload.startswith("auth_"):
        challenge = payload.removeprefix("auth_")
        if message.chat.type != "private":
            await message.answer(
                "Login harus disetujui lewat chat pribadi dengan bot!",
                parse_mode=None,
            )
            return
        try:
            pending = await is_telegram_login_challenge_pending(challenge)
        except Exception as exc:
            logger.error(f"Telegram web login challenge lookup failed for {label}: {exc}")
            await message.answer(
                "Login belum dapat diproses. Coba lagi atau buat permintaan login baru didalam web.",
                parse_mode=None,
            )
            return
        if pending:
            username = f"@{html.escape(user.username)}" if user.username else "tidak ada"
            await message.answer(
                "Permintaan login CheyaVerse\n"
                f"Akun: <b>{html.escape(user.full_name)}</b>\n"
                f"Username: {username}\n\n"
                "Jika kamu menyetujui, akun Telegram ini akan masuk ke browser "
                "yang meminta login. Jangan setujui jika ini memang bukan anda.",
                parse_mode=ParseMode.HTML,
                reply_markup=InlineKeyboardMarkup(
                    inline_keyboard=[
                        [
                            InlineKeyboardButton(
                                text="Setujui",
                                callback_data=f"login:approve:{challenge}",
                            ),
                            InlineKeyboardButton(
                                text="Tolak",
                                callback_data=f"login:deny:{challenge}",
                            ),
                        ]
                    ]
                ),
            )
        else:
            await message.answer(
                "Permintaan login tidak ditemukan atau sudah kedaluwarsa!"
                "Buat permintaan login yg baru dari halaman login CheyaVerse.",
                parse_mode=None,
            )
        return

    try:
        await message.answer(
            START_TEXT,
            parse_mode=ParseMode.MARKDOWN_V2,
            reply_parameters=ReplyParameters(message_id=message.message_id),
        )
        logger.info(f"/start from {label} (ID: {user.id})")
    except Exception as exc:
        logger.error(f"Failed to send /start to {label}: {exc}")
        try:
            await message.answer(
                "Cheya is having trouble, please try again shortly.",
                parse_mode=None,
            )
        except Exception as fallback_exc:
            logger.error(f"Fallback /start failed: {fallback_exc}")


@router.callback_query(F.data.startswith("login:"))
async def handle_login_challenge_callback(callback: CallbackQuery) -> None:
    data = callback.data or ""
    parts = data.split(":", maxsplit=2)
    if len(parts) != 3 or parts[1] not in {"approve", "deny"}:
        await callback.answer("Permintaan tidak valid!", show_alert=True)
        return
    if not isinstance(callback.message, Message) or callback.message.chat.type != "private":
        await callback.answer("Login hanya dapat diproses di chat pribadi!", show_alert=True)
        return

    approve = parts[1] == "approve"
    user = callback.from_user
    label = user.username or user.full_name or str(user.id)
    try:
        updated = await respond_to_telegram_login_challenge(
            parts[2],
            user,
            approve,
        )
    except Exception as exc:
        logger.error(f"Telegram web login decision failed for {label}: {exc}")
        await callback.answer("Login belum dapat diproses. Silakan coba lagi", show_alert=True)
        return

    if not updated:
        await callback.answer(
            "Permintaan login sudah kedaluwarsa atau telah digunakan.",
            show_alert=True,
        )
        return

    await callback.answer("permintaan disetujui" if approve else "Login ditolak!")
    if approve:
        try:
            await callback.message.delete()
        except Exception as exc:
            logger.warning(f"Failed to delete approved login message for {label}: {exc}")
    else:
        await callback.message.edit_text(
            "Permintaan login ditolak!",
            parse_mode=None,
            reply_markup=None,
        )
    logger.info(
        f"Web login {'approved' if approve else 'denied'} for {label} (ID: {user.id})"
    )


@router.message(F.forward_origin)
async def handle_forwarded_update(message: Message, event_update: Update) -> None:
    if message.chat.type != "private" or not message.from_user:
        return

    message_text = message.text or message.caption or ""
    if message_text.lstrip().startswith("/"):
        return

    origin = message.forward_origin
    forwarded_user = getattr(origin, "sender_user", None)
    if forwarded_user and forwarded_user.id == message.from_user.id:
        return

    label = message.from_user.username or message.from_user.full_name or str(message.from_user.id)
    try:
        update_json = json.dumps(
            event_update.model_dump(
                by_alias=True,
                exclude_none=True,
                mode="json",
            ),
            ensure_ascii=False,
            indent=2,
        )
        encoded = update_json.encode("utf-8")
        if len(encoded) > MAX_FORWARD_UPDATE_BYTES:
            await message.answer(
                "Forwarded update terlalu besar untuk ditampilkan dengan aman.",
                parse_mode=None,
            )
            return

        telegram_text_length = len(update_json.encode("utf-16-le")) // 2
        if telegram_text_length <= MAX_FORWARD_UPDATE_MESSAGE_CHARS:
            await message.answer(
                f"<pre><code class=\"language-json\">{html.escape(update_json)}</code></pre>",
                parse_mode=ParseMode.HTML,
            )
        else:
            await message.answer_document(
                BufferedInputFile(encoded, filename="forwarded-update.json"),
                caption="Forwarded Telegram update · JSON",
                parse_mode=None,
            )
    except Exception as exc:
        logger.error(f"Failed to return forwarded update JSON for {label}: {exc}")
        try:
            await message.answer(
                "Data forward belum dapat ditampilkan. Silakan coba lagi.",
                parse_mode=None,
            )
        except Exception as fallback_exc:
            logger.error(f"Failed to notify about forwarded update for {label}: {fallback_exc}")


@router.callback_query(F.data.startswith("dm:"))
async def handle_chat_notification_callback(callback: CallbackQuery) -> None:
    data = callback.data or ""
    parts = data.split(":", maxsplit=2)
    if len(parts) != 3 or parts[1] not in {"read", "reply"}:
        await callback.answer("Aksi tidak valid!", show_alert=True)
        return
    if not isinstance(callback.message, Message) or callback.message.chat.type != "private":
        await callback.answer("Aksi ini hanya tersedia di chat pribadi!", show_alert=True)
        return

    notification_message = callback.message
    action = parts[1]
    user = callback.from_user
    label = user.username or user.full_name or str(user.id)

    try:
        peer_uid = int(parts[2])
        if peer_uid <= 0 or peer_uid == user.id:
            raise ValueError("invalid peer")
        completed = await respond_to_chat_notification(
            user.id,
            peer_uid,
            action,
        )
    except Exception as exc:
        logger.error(f"Telegram chat notification action failed for {label}: {exc}")
        await callback.answer("Aksi gagal diproses.", show_alert=True)
        return
    if not completed:
        await callback.answer("Aksi tidak valid!", show_alert=True)
        return

    try:
        await notification_message.delete()
    except Exception as exc:
        logger.warning(f"Failed to delete notification message for {label}: {exc}")

    if action == "read":
        await callback.answer("Pesan ditandai dibaca.")
        return

    await callback.answer("Kirim balasan pesan berikutnya.")
    try:
        prompt = await callback.bot.send_message(
            chat_id=user.id,
            text=(
                "Ketik balasan untuk melanjutkan percakapan."
                "Permintaan ini berlaku 10 menit."
            ),
            parse_mode=None,
            reply_markup=ForceReply(selective=True),
        )
        await attach_chat_reply_prompt(user.id, prompt.message_id)
    except Exception as exc:
        logger.error(f"Failed to send reply prompt to {label}: {exc}")


@router.message(F.text & ~F.text.startswith("/"))
async def handle_telegram_chat_reply(message: Message) -> None:
    if message.chat.type != "private" or not message.from_user or not message.text:
        raise SkipHandler
    label = message.from_user.username or message.from_user.full_name or str(message.from_user.id)
    try:
        result = await send_telegram_chat_reply(message.from_user.id, message.text)
    except Exception as exc:
        logger.error(f"Failed to store Telegram chat reply for {label}: {exc}")
        await message.answer("Balasan gagal dikirim. Coba lagi nanti!", parse_mode=None)
        return
    if result is None:
        raise SkipHandler

    prompt_message_id = result.get("prompt_message_id")
    if prompt_message_id:
        try:
            await message.bot.delete_message(
                chat_id=message.from_user.id,
                message_id=int(prompt_message_id),
            )
        except Exception as exc:
            logger.warning(f"Failed to delete reply prompt for {label}: {exc}")

    await message.answer("Balasan terkirim", parse_mode=None)