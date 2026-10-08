import asyncio
import html

from aiogram import Router
from aiogram.enums import ParseMode
from aiogram.exceptions import TelegramAPIError
from aiogram.filters import Command
from aiogram.types import Message

from config import ADMIN_TELEGRAM_IDS
from handlers.group import GroupAiApiError, _api
from logger import logger

router = Router(name="status")


def _state(value: object) -> str:
    return "ONLINE" if value is True else "OFFLINE"


def _safe_value(value: object, fallback: str = "unknown") -> str:
    return html.escape(str(value) if value else fallback, quote=False)[:160]


@router.message(Command("status"))
async def cmd_status(message: Message) -> None:
    user = message.from_user
    if user is None or user.id not in ADMIN_TELEGRAM_IDS:
        return

    bot_check = asyncio.create_task(message.bot.get_me()) if message.bot else None
    try:
        status = await _api("status", ownerUid=user.id)
    except GroupAiApiError as exc:
        if bot_check:
            try:
                await bot_check
            except TelegramAPIError as telegram_error:
                logger.error(f"/status Telegram API check failed: {telegram_error}")
        logger.error(f"/status Vercel API check failed for admin {user.id}: {exc}")
        output = (
            "CheyaVerse STATUS\n"
            "Bot -> Vercel API: OFFLINE\n"
            f"Detail: {_safe_value(str(exc))}"
        )
        try:
            await message.answer(
                f"<pre>{output}</pre>",
                parse_mode=ParseMode.HTML,
                reply_to_message_id=message.message_id,
            )
        except TelegramAPIError as send_error:
            logger.error(f"Could not send /status response in chat {message.chat.id}: {send_error}")
        return

    telegram_online = False
    if bot_check:
        try:
            await bot_check
            telegram_online = True
        except TelegramAPIError as exc:
            logger.error(f"/status Telegram API check failed: {exc}")

    ai = status.get("ai") if isinstance(status.get("ai"), dict) else {}
    tunnel = status.get("tunnel") if isinstance(status.get("tunnel"), dict) else {}
    supabase = status.get("supabase") if isinstance(status.get("supabase"), dict) else {}
    provider = ai.get("provider")
    model = ai.get("model")
    ai_detail = (
        f"{_safe_value(provider)} / {_safe_value(model)}"
        if ai.get("connected") is True
        else "no provider responded"
    )
    pair_index = ai.get("pairIndex")
    pair_detail = f" (pair {pair_index + 1})" if isinstance(pair_index, int) else ""
    keepalive_detail = (
        "configured" if supabase.get("cronConfigured") is True else "CRON_SECRET missing"
    )
    last_check = _safe_value(supabase.get("lastKeepaliveCheckAt"))
    last_activity = _safe_value(supabase.get("lastUserActivityAt"))
    last_heartbeat = _safe_value(
        supabase.get("lastHeartbeatAt"),
        "not needed yet",
    )
    output = "\n".join(
        [
            "CheyaVerse STATUS",
            f"Telegram API: {_state(telegram_online)}",
            f"Bot -> Vercel API: {_state(tunnel.get('botToVercel'))}",
            f"Vercel -> local memory: {_state(tunnel.get('vercelToLocalMemory'))}",
            f"AI: {_state(ai.get('connected'))}{pair_detail} | {ai_detail}",
            f"Supabase: {_state(supabase.get('connected'))}",
            f"Keepalive cron: {keepalive_detail}",
            f"Keepalive last checked: {last_check}",
            f"Last DB user activity: {last_activity}",
            f"Last dummy heartbeat: {last_heartbeat}",
        ]
    )
    try:
        await message.answer(
            f"<pre>{output}</pre>",
            parse_mode=ParseMode.HTML,
            reply_to_message_id=message.message_id,
        )
    except TelegramAPIError as exc:
        logger.error(f"Could not send /status response in chat {message.chat.id}: {exc}")
