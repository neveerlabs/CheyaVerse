from typing import Optional

from aiogram import Router
from aiogram.filters import Command
from aiogram.types import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    Message,
    ReplyParameters,
)

from config import PUBLIC_URL
from logger import logger

router = Router(name="web")


def _build_web_keyboard() -> Optional[InlineKeyboardMarkup]:
    if not PUBLIC_URL:
        return None
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="Login / Register",
                    url=f"{PUBLIC_URL}/login",
                ),
            ],
        ]
    )


@router.message(Command("web"))
async def cmd_web(message: Message) -> None:
    user = message.from_user
    label = user.username or user.full_name or str(user.id)
    uid = user.id

    text = (
        "Login ke Webapp CheyaVerse\n"
        "──────────────────────────\n"
        "1\\. Tekan tombol *Login / Register* di bawah\\.\n"
        "2\\. Pilih akun Telegram yang ingin digunakan\\.\n"
        "3\\. Konfirmasi login lewat Telegram Login Widget\\.\n\n"
        "ID Telegram terverifikasi akan menjadi akun web kamu\\. "
        "Jangan bagikan kode atau sesi login kepada siapa pun\\."
    )

    try:
        await message.answer(
            text,
            parse_mode="MarkdownV2",
            reply_markup=_build_web_keyboard(),
            reply_parameters=ReplyParameters(message_id=message.message_id),
        )
        logger.info(f"/web login link sent to {label} (ID: {uid})")
    except Exception as exc:
        logger.error(f"/web failed for {label}: {exc}")
        try:
            await message.answer(
                "Buka halaman web CheyaVerse untuk login dengan Telegram.",
                parse_mode=None,
            )
        except Exception as e:
            logger.error(f"/web fallback failed: {e}")
