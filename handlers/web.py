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


def _build_web_keyboard(uid: int) -> Optional[InlineKeyboardMarkup]:
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


@router.message(Command("web"))
async def cmd_web(message: Message) -> None:
    user = message.from_user
    label = user.username or user.full_name or str(user.id)
    uid = user.id

    if PUBLIC_URL:
        url = f"{PUBLIC_URL}/{uid}"
    else:
        url = f"/{uid}"

    text = (
        "Webapp CheyaVerse kamu\n"
        "──────────────────────────\n"
        f"```\n{url}\n```\n"
        "_Buka link di atas untuk melihat dashboard personalmu\\._"
    )

    try:
        await message.answer(
            text,
            parse_mode="MarkdownV2",
            reply_markup=_build_web_keyboard(uid),
            reply_parameters=ReplyParameters(message_id=message.message_id),
        )
        logger.info(f"/web from {label} (ID: {uid})")
    except Exception as exc:
        logger.error(f"/web failed for {label}: {exc}")
        try:
            await message.answer(f"Dashboard kamu: {url}", parse_mode=None)
        except Exception as e:
            logger.error(f"/web fallback failed: {e}")
