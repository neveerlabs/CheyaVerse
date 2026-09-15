from aiogram import F, Router
from aiogram.enums import ParseMode
from aiogram.exceptions import TelegramBadRequest
from aiogram.filters import Command
from aiogram.types import (
    CallbackQuery,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    Message,
    ReplyParameters,
)

from handlers.qr import USAGE_TEXT
from handlers.start import START_TEXT
from logger import logger

router = Router(name="help")

HELP_TEXT = (
    "Available commands and quick actions\n"
    "──────────────────────────\n"
    "```\n"
    "• /start — Start Cheya\n"
    "• /help — Command help\n"
    "• /qr <text> — Generate QR code from text\n"
    "```\n"
)


def build_menu() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(text="Start", callback_data="menu:start"),
                InlineKeyboardButton(text="Help", callback_data="menu:help"),
            ],
            [
                InlineKeyboardButton(text="QR", callback_data="menu:qr"),
            ],
        ]
    )


@router.message(Command("help"))
async def cmd_help(message: Message) -> None:
    user = message.from_user
    label = user.username or user.full_name or str(user.id)

    try:
        await message.answer(
            HELP_TEXT,
            parse_mode=ParseMode.MARKDOWN_V2,
            reply_markup=build_menu(),
            reply_parameters=ReplyParameters(message_id=message.message_id),
        )
        logger.info(f"/help from {label} (ID: {user.id})")
    except Exception as exc:
        logger.error(f"Failed to send /help to {label}: {exc}")
        try:
            await message.answer(
                "Cheya is having trouble, please try again shortly.",
                parse_mode=None,
            )
        except Exception as fallback_exc:
            logger.error(f"Fallback /help failed: {fallback_exc}")


@router.callback_query(F.data == "menu:start")
async def cb_menu_start(callback: CallbackQuery) -> None:
    await _dispatch_panel(
        callback,
        text=START_TEXT,
        panel="Start",
        toast="Starting Cheya...",
        keep_menu=False,
        clear_origin_menu=True,
    )


@router.callback_query(F.data == "menu:help")
async def cb_menu_help(callback: CallbackQuery) -> None:
    await _dispatch_panel(
        callback,
        text=HELP_TEXT,
        panel="Help",
        toast="Command help...",
        keep_menu=True,
        clear_origin_menu=False,
    )


@router.callback_query(F.data == "menu:qr")
async def cb_menu_qr(callback: CallbackQuery) -> None:
    user = callback.from_user
    label = user.username or user.full_name or str(user.id)

    try:
        await callback.answer("QR builder...")
    except TelegramBadRequest as exc:
        logger.error(f"Callback answer failed for {label}: {exc}")
    except Exception as exc:
        logger.error(f"Callback answer error for {label}: {exc}")

    try:
        await callback.message.answer(
            USAGE_TEXT,
            parse_mode=None,
            reply_parameters=ReplyParameters(
                message_id=callback.message.message_id
            ),
        )
        logger.info(f"Panel 'QR' dispatched for {label} (ID: {user.id})")
    except Exception as exc:
        logger.error(f"Panel 'QR' dispatch failed for {label}: {exc}")
        try:
            await callback.message.answer(
                "Cheya is having trouble, please try again shortly.",
                parse_mode=None,
            )
        except Exception as fallback_exc:
            logger.error(f"Fallback dispatch failed: {fallback_exc}")


async def _dispatch_panel(
    callback: CallbackQuery,
    text: str,
    panel: str,
    toast: str,
    keep_menu: bool,
    clear_origin_menu: bool,
) -> None:
    user = callback.from_user
    label = user.username or user.full_name or str(user.id)

    try:
        await callback.answer(toast)
    except TelegramBadRequest as exc:
        logger.error(f"Callback answer failed for {label}: {exc}")
    except Exception as exc:
        logger.error(f"Callback answer error for {label}: {exc}")

    if clear_origin_menu:
        try:
            await callback.message.edit_reply_markup(reply_markup=None)
        except TelegramBadRequest as exc:
            if "message is not modified" not in str(exc).lower():
                logger.error(f"Failed to clear menu for {label}: {exc}")
        except Exception as exc:
            logger.error(f"Clear menu error for {label}: {exc}")

    try:
        await callback.message.answer(
            text,
            parse_mode=ParseMode.MARKDOWN_V2,
            reply_markup=build_menu() if keep_menu else None,
            reply_parameters=ReplyParameters(
                message_id=callback.message.message_id
            ),
        )
        logger.info(f"Panel '{panel}' dispatched for {label} (ID: {user.id})")
    except Exception as exc:
        logger.error(f"Panel '{panel}' dispatch failed for {label}: {exc}")
        try:
            await callback.message.answer(
                "Cheya is having trouble, please try again shortly.",
                parse_mode=None,
            )
        except Exception as fallback_exc:
            logger.error(f"Fallback dispatch failed: {fallback_exc}")