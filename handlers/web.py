from aiogram import Router
from aiogram.filters import Command
from aiogram.types import Message, ReplyParameters

from config import PUBLIC_URL
from logger import logger

router = Router(name="web")


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
        "_Buka link di atas untuk melihat dashboard personal kamu\\._"
    )

    try:
        await message.answer(
            text,
            parse_mode="MarkdownV2",
            reply_parameters=ReplyParameters(message_id=message.message_id),
        )
        logger.info(f"/web from {label} (ID: {uid})")
    except Exception as exc:
        logger.error(f"/web failed for {label}: {exc}")
        try:
            await message.answer(f"Dashboard kamu: {url}", parse_mode=None)
        except Exception as e:
            logger.error(f"/web fallback failed: {e}")
