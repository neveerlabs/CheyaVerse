from typing import Optional

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

from config import PUBLIC_URL
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
    "• /web — Dapatkan URL dashboard personal\n"
    "```\n"
)


def _web_url(uid: int) -> str:
    if PUBLIC_URL:
        return f"{PUBLIC_URL}/{uid}"
    return f"/{uid}"


def _web_text(uid: int) -> str:
    return (
        "Webapp CheyaVerse kamu\n"
        "──────────────────────────\n"
        f"```\n{_web_url(uid)}\n```\n"
        "_Buka link di atas untuk melihat dashboard personalmu\\._"
    )


def _web_keyboard(uid: int) -> Optional[InlineKeyboardMarkup]:
    if not PUBLIC_URL:
        return None
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="Visit site",
                    url=f"{PUBLIC_URL}/{uid}",
                ),
            ],
        ]
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
            [
                InlineKeyboardButton(text="Web", callback_data="menu:web"),
                InlineKeyboardButton(text="Info", callback_data="menu:info"),
            ],
        ]
    )


def build_info_menu() -> InlineKeyboardMarkup:
    if PUBLIC_URL:
        base = PUBLIC_URL.rstrip("/")
        rows = [
            [
                InlineKeyboardButton(
                    text="Tech Support",
                    url=f"{base}/support",
                ),
                InlineKeyboardButton(
                    text="Privacy Policy",
                    url=f"{base}/privacy-policy",
                ),
            ],
            [
                InlineKeyboardButton(
                    text="User Agreement",
                    url=f"{base}/agreement",
                ),
            ],
        ]
    else:
        rows = [
            [
                InlineKeyboardButton(
                    text="Tech Support",
                    callback_data="info:no_url",
                ),
                InlineKeyboardButton(
                    text="Privacy Policy",
                    callback_data="info:no_url",
                ),
            ],
            [
                InlineKeyboardButton(
                    text="User Agreement",
                    callback_data="info:no_url",
                ),
            ],
        ]
    rows.append(
        [
            InlineKeyboardButton(text="Back", callback_data="menu:back"),
        ]
    )
    return InlineKeyboardMarkup(inline_keyboard=rows)


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


@router.callback_query(F.data == "menu:web")
async def cb_menu_web(callback: CallbackQuery) -> None:
    user = callback.from_user
    uid = user.id
    label = user.username or user.full_name or str(user.id)

    try:
        await callback.answer("Dashboard...")
    except TelegramBadRequest as exc:
        logger.error(f"Callback answer failed for {label}: {exc}")
    except Exception as exc:
        logger.error(f"Callback answer error for {label}: {exc}")

    try:
        await callback.message.answer(
            _web_text(uid),
            parse_mode=ParseMode.MARKDOWN_V2,
            reply_markup=_web_keyboard(uid),
            reply_parameters=ReplyParameters(
                message_id=callback.message.message_id
            ),
        )
        logger.info(f"Panel 'Web' dispatched for {label} (ID: {uid})")
    except Exception as exc:
        logger.error(f"Panel 'Web' dispatch failed for {label}: {exc}")
        try:
            await callback.message.answer(
                f"Dashboard kamu: {_web_url(uid)}",
                parse_mode=None,
            )
        except Exception as fallback_exc:
            logger.error(f"Fallback Web failed: {fallback_exc}")


@router.callback_query(F.data == "menu:info")
async def cb_menu_info(callback: CallbackQuery) -> None:
    await _edit_panel(
        callback,
        text=HELP_TEXT,
        panel="Info",
        toast="Info...",
        markup=build_info_menu(),
    )


@router.callback_query(F.data == "menu:back")
async def cb_menu_back(callback: CallbackQuery) -> None:
    await _edit_panel(
        callback,
        text=HELP_TEXT,
        panel="Back",
        toast="Kembali...",
        markup=build_menu(),
    )


@router.callback_query(F.data == "info:no_url")
async def cb_info_no_url(callback: CallbackQuery) -> None:
    try:
        await callback.answer(
            "PUBLIC_URL belum diatur di server.",
            show_alert=True,
        )
    except TelegramBadRequest as exc:
        logger.error(f"Callback answer failed: {exc}")
    except Exception as exc:
        logger.error(f"Callback answer error: {exc}")


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


async def _edit_panel(
    callback: CallbackQuery,
    text: str,
    panel: str,
    toast: str,
    markup: InlineKeyboardMarkup,
) -> None:
    user = callback.from_user
    label = user.username or user.full_name or str(user.id)

    try:
        await callback.answer(toast)
    except TelegramBadRequest as exc:
        logger.error(f"Callback answer failed for {label}: {exc}")
    except Exception as exc:
        logger.error(f"Callback answer error for {label}: {exc}")

    try:
        await callback.message.edit_text(
            text,
            parse_mode=ParseMode.MARKDOWN_V2,
            reply_markup=markup,
        )
        logger.info(f"Panel '{panel}' edited for {label} (ID: {user.id})")
    except TelegramBadRequest as exc:
        if "message is not modified" in str(exc).lower():
            return
        logger.error(f"Edit panel '{panel}' failed for {label}: {exc}")
        try:
            await callback.message.answer(
                text,
                parse_mode=ParseMode.MARKDOWN_V2,
                reply_markup=markup,
            )
        except Exception as fallback_exc:
            logger.error(f"Fallback edit panel failed: {fallback_exc}")
    except Exception as exc:
        logger.error(f"Edit panel '{panel}' failed for {label}: {exc}")
        try:
            await callback.message.answer(
                text,
                parse_mode=ParseMode.MARKDOWN_V2,
                reply_markup=markup,
            )
        except Exception as fallback_exc:
            logger.error(f"Fallback edit panel failed: {fallback_exc}")
