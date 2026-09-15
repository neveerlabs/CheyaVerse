from aiogram import Router
from aiogram.enums import ParseMode
from aiogram.filters import CommandStart
from aiogram.types import Message, ReplyParameters

from logger import logger

router = Router(name="start")

START_TEXT = (
    "```\n"
    "Name      : CheyaVerse\n"
    "Developer : M. Syalman Al Farizi\n"
    "Version   : v1.1.7\n"
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