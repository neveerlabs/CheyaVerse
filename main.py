import asyncio
import sys

from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.exceptions import TelegramAPIError
from aiogram.types import ErrorEvent

from config import BOT_TOKEN, WEB_HOST, WEB_PORT, PUBLIC_URL
from handlers import help as help_handler
from handlers import qr as qr_handler
from handlers import start
from logger import logger
from web import start_web

bot = Bot(token=BOT_TOKEN, default=DefaultBotProperties(parse_mode=ParseMode.MARKDOWN_V2))

dp = Dispatcher()
dp.include_router(start.router)
dp.include_router(help_handler.router)
dp.include_router(qr_handler.router)


@dp.errors()
async def on_error(event: ErrorEvent) -> None:
    exc = event.exception
    logger.error(f"Unhandled error: {type(exc).__name__} - {exc}")
    update = event.update
    try:
        msg = getattr(update, "message", None)
        cbq = getattr(update, "callback_query", None)
        if msg is not None:
            await msg.answer("An internal error occurred, please try again later.", parse_mode=None)
        elif cbq is not None:
            await cbq.answer("An internal error occurred.", show_alert=True)
    except TelegramAPIError as tg_exc:
        logger.error(f"Failed to send error notification: {tg_exc}")
    except Exception as send_exc:
        logger.error(f"Error handler failed completely: {send_exc}")


async def _verify_bot() -> bool:
    try:
        me = await bot.get_me()
        logger.info(f"Bot active: @{me.username} | {me.full_name} | ID: {me.id}")
        return True
    except TelegramAPIError as exc:
        logger.error(f"Bot verification failed: {exc}")
        return False
    except Exception as exc:
        logger.error(f"Unexpected error during bot verification: {exc}")
        return False


def _verify_assets() -> bool:
    missing = [str(p) for p in qr_handler.required_assets() if not p.exists()]
    if missing:
        for path in missing:
            logger.warning(f"Missing asset: {path}")
        logger.warning("QR feature will report missing assets at runtime.")
        return False
    logger.info("QR assets verified.")
    return True


async def main() -> None:
    logger.info("CheyaVerse is running...")

    _verify_assets()

    if not PUBLIC_URL:
        logger.warning("PUBLIC_URL is empty. QR media will use raw Litterbox URLs.")
    else:
        logger.info(f"Public viewer base: {PUBLIC_URL}")

    if not await _verify_bot():
        logger.error("Bot failed to start. Check token and network connection.")
        await bot.session.close()
        return

    web_runner = None
    try:
        web_runner = await start_web(WEB_HOST, WEB_PORT)
    except Exception as exc:
        logger.error(f"Failed to start web viewer: {exc}")

    try:
        await bot.delete_webhook(drop_pending_updates=True)
        logger.info("Polling engaged. Press CTRL+C to stop.")
        await dp.start_polling(bot, allowed_updates=dp.resolve_used_update_types())
    except TelegramAPIError as exc:
        logger.error(f"Polling error: {exc}")
    except Exception as exc:
        logger.error(f"Fatal error during polling: {exc}")
    finally:
        if web_runner is not None:
            try:
                await web_runner.cleanup()
            except Exception as exc:
                logger.error(f"Web runner cleanup failed: {exc}")
        await bot.session.close()
        logger.info("CheyaVerse has shut down.")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Manual shutdown (CTRL+C).")
        sys.exit(0)
    except Exception as exc:
        logger.error(f"Crash at entry point: {exc}")
        sys.exit(1)