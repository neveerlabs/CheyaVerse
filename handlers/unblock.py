import html
import re

from aiogram import F, Router
from aiogram.enums import ParseMode
from aiogram.filters import Command
from aiogram.types import (
    CallbackQuery,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    Message,
)

import storage
from logger import logger

router = Router(name="unblock")


def _device_label(device: dict) -> str:
    details = [
        device.get("device_type"),
        device.get("brand"),
        device.get("model"),
        device.get("os"),
    ]
    label = " · ".join(str(value) for value in details if value)
    return label or "Unknown device"


def _device_details(device: dict) -> str:
    fields = [
        ("Device", _device_label(device)),
        (
            "Browser",
            " ".join(
                str(value)
                for value in (
                    device.get("browser"),
                    device.get("browser_version"),
                )
                if value
            ),
        ),
        ("Language", device.get("language")),
        ("Timezone", device.get("timezone")),
        (
            "Screen",
            f'{device["screen_w"]} × {device["screen_h"]}'
            if device.get("screen_w") and device.get("screen_h")
            else None,
        ),
        ("Last seen", device.get("last_seen")),
        ("Blocked", device.get("blocked_at")),
    ]
    lines = [
        f"<b>{name}:</b> {html.escape(str(value))}"
        for name, value in fields
        if value
    ]
    lines.insert(
        0,
        f"<b>DeviceID:</b> <code>{html.escape(str(device['device_id']))}</code>",
    )
    return "\n".join(lines)


def _device_list_keyboard(devices: list[dict]) -> InlineKeyboardMarkup:
    rows = []
    for device in devices:
        label = _device_label(device)
        if len(label) > 55:
            label = f"{label[:52]}..."
        rows.append(
            [
                InlineKeyboardButton(
                    text=label,
                    callback_data=f"unblock:select:{device['device_id']}",
                )
            ]
        )
    return InlineKeyboardMarkup(inline_keyboard=rows)


def _confirm_keyboard(device_id: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="Unblock device",
                    callback_data=f"unblock:confirm:{device_id}",
                ),
                InlineKeyboardButton(
                    text="Cancel",
                    callback_data="unblock:cancel",
                ),
            ]
        ]
    )


def _is_private_message(message: object) -> bool:
    chat = getattr(message, "chat", None)
    return getattr(chat, "type", None) == "private"


async def _edit_or_reply(callback: CallbackQuery, text: str, markup=None) -> None:
    message = callback.message
    if message is None:
        return
    try:
        await message.edit_text(
            text,
            parse_mode=ParseMode.HTML,
            reply_markup=markup,
        )
    except Exception:
        await message.answer(text, parse_mode=ParseMode.HTML, reply_markup=markup)


@router.message(Command("unblock"))
async def cmd_unblock(message: Message) -> None:
    user = message.from_user
    if user is None:
        return
    if not _is_private_message(message):
        await message.answer(
            "Use /unblock in a private chat with the bot.",
            parse_mode=None,
        )
        return

    try:
        devices = await storage.list_blacklisted_devices_for_uid(user.id)
    except Exception as exc:
        logger.error(
            f"Failed to list blocked devices for Telegram user {user.id}: {exc}"
        )
        await message.answer(
            "Blocked devices are temporarily unavailable. Please try again later.",
            parse_mode=None,
        )
        return

    if not devices:
        await message.answer("You have no blocked devices.", parse_mode=None)
        return

    await message.answer(
        "Select a blocked device to review before unblocking:",
        parse_mode=None,
        reply_markup=_device_list_keyboard(devices),
    )


@router.callback_query(F.data.startswith("unblock:"))
async def cb_unblock(callback: CallbackQuery) -> None:
    data = callback.data or ""
    user = callback.from_user
    message = callback.message

    if not _is_private_message(message):
        await callback.answer(
            "Manage blocked devices in a private chat with the bot.",
            show_alert=True,
        )
        return

    if data == "unblock:cancel":
        await callback.answer("Cancelled.")
        await _edit_or_reply(callback, "Unblocking cancelled.")
        return

    match = re.fullmatch(r"unblock:(select|confirm):([0-9]{10})", data)
    if not match:
        await callback.answer("Invalid device selection.", show_alert=True)
        return

    action, device_id = match.groups()
    try:
        device = await storage.get_blacklisted_device_for_uid(user.id, device_id)
    except Exception as exc:
        logger.error(
            f"Failed to validate blocked device for Telegram user {user.id}: {exc}"
        )
        await callback.answer(
            "Device status is unavailable. Try again later.",
            show_alert=True,
        )
        return

    if device is None:
        await callback.answer(
            "This device is not blocked on your account.",
            show_alert=True,
        )
        return

    if action == "select":
        await callback.answer("Review this device.")
        await _edit_or_reply(
            callback,
            f"{_device_details(device)}\n\nUnblock this device?",
            _confirm_keyboard(device_id),
        )
        return

    try:
        removed = await storage.unblock_device_for_uid(user.id, device_id)
    except Exception as exc:
        logger.error(
            f"Failed to unblock device for Telegram user {user.id}: {exc}"
        )
        await callback.answer(
            "Could not unblock this device. Try again later.",
            show_alert=True,
        )
        return

    if not removed:
        await callback.answer("This device is no longer blocked.", show_alert=True)
        return

    await callback.answer("Device unblocked.")
    await _edit_or_reply(
        callback,
        f"{_device_details(device)}\n\n<b>This device has been unblocked.</b>",
    )
