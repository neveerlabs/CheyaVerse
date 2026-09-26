import html

from aiogram import F, Router
from aiogram.dispatcher.event.bases import SkipHandler
from aiogram.enums import ParseMode
from aiogram.filters import CommandStart
from aiogram.types import (
    CallbackQuery,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    Message,
    ReplyParameters,
)

from logger import logger
from storage import (
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


@router.message(CommandStart())
async def cmd_start(message: Message) -> None:
    user = message.from_user
    label = user.username or user.full_name or str(user.id)

    parts = (message.text or "").split(maxsplit=1)
    payload = parts[1].strip() if len(parts) > 1 else ""
    if payload.startswith("auth_"):
        challenge = payload.removeprefix("auth_")
        if message.chat.type != "private":
            await message.answer(
                "Login harus disetujui lewat chat pribadi dengan bot.",
                parse_mode=None,
            )
            return
        try:
            pending = await is_telegram_login_challenge_pending(challenge)
        except Exception as exc:
            logger.error(f"Telegram web login challenge lookup failed for {label}: {exc}")
            await message.answer(
                "Login belum dapat diproses. Coba lagi atau buat permintaan login baru di web.",
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
                "yang meminta login. Jangan setujui jika kamu tidak memulainya.",
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
                "Permintaan login tidak ditemukan atau sudah kedaluwarsa. "
                "Buat permintaan baru dari halaman login CheyaVerse.",
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
        await callback.answer("Permintaan tidak valid.", show_alert=True)
        return
    if not isinstance(callback.message, Message) or callback.message.chat.type != "private":
        await callback.answer("Login hanya dapat diproses di chat pribadi.", show_alert=True)
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
        await callback.answer("Login belum dapat diproses. Coba lagi.", show_alert=True)
        return

    if not updated:
        await callback.answer(
            "Permintaan login sudah kedaluwarsa atau telah digunakan.",
            show_alert=True,
        )
        return

    await callback.answer("Login disetujui." if approve else "Login ditolak.")
    await callback.message.edit_text(
        "Login CheyaVerse disetujui. Kembali ke browser untuk melanjutkan."
        if approve
        else "Permintaan login ditolak. Browser tidak akan masuk.",
        parse_mode=None,
        reply_markup=None,
    )
    logger.info(
        f"Web login {'approved' if approve else 'denied'} for {label} (ID: {user.id})"
    )


@router.callback_query(F.data.startswith("dm:"))
async def handle_chat_notification_callback(callback: CallbackQuery) -> None:
    data = callback.data or ""
    parts = data.split(":", maxsplit=2)
    if len(parts) != 3 or parts[1] not in {"read", "reply"}:
        await callback.answer("Aksi tidak valid.", show_alert=True)
        return
    if not isinstance(callback.message, Message) or callback.message.chat.type != "private":
        await callback.answer("Aksi ini hanya tersedia di chat pribadi.", show_alert=True)
        return
    try:
        peer_uid = int(parts[2])
        if peer_uid <= 0 or peer_uid == callback.from_user.id:
            raise ValueError("invalid peer")
        completed = await respond_to_chat_notification(
            callback.from_user.id,
            peer_uid,
            parts[1],
        )
    except Exception as exc:
        logger.error(f"Telegram chat notification action failed: {exc}")
        await callback.answer("Aksi gagal diproses.", show_alert=True)
        return
    if not completed:
        await callback.answer("Aksi tidak valid.", show_alert=True)
        return
    if parts[1] == "read":
        await callback.answer("Pesan ditandai dibaca.")
    else:
        await callback.answer("Kirim balasan sebagai pesan berikutnya.")
        await callback.message.answer(
            "Ketik balasan untuk melanjutkan percakapan. Permintaan ini berlaku 10 menit.",
            parse_mode=None,
        )


@router.message(F.text & ~F.text.startswith("/"))
async def handle_telegram_chat_reply(message: Message) -> None:
    if message.chat.type != "private" or not message.from_user or not message.text:
        raise SkipHandler
    try:
        peer_uid = await send_telegram_chat_reply(message.from_user.id, message.text)
    except Exception as exc:
        logger.error(f"Failed to store Telegram chat reply: {exc}")
        await message.answer("Balasan gagal dikirim. Coba lagi nanti.", parse_mode=None)
        return
    if peer_uid is None:
        raise SkipHandler
    await message.answer("Balasan terkirim ke chat CheyaVerse.", parse_mode=None)
