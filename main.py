import asyncio
import sys

from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.exceptions import TelegramAPIError
from aiogram.types import ErrorEvent

from config import BOT_TOKEN, PUBLIC_URL
from handlers import help as help_handler
from handlers import qr as qr_handler
from handlers import start
from logger import logger


def _verify_assets() -> bool:
    try:
        missing = [str(p) for p in qr_handler.required_assets() if not p.exists()]
    except Exception as exc:
        logger.error(f"Asset verification failed: {exc}")
        return False

    if missing:
        for path in missing:
            logger.warning(f"Missing asset: {path}")
        logger.warning("QR feature will report missing assets at runtime.")
        return False
    logger.info("QR assets verified.")
    return True


async def _verify_bot(bot: Bot) -> bool:
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


async def _run() -> int:
    if not BOT_TOKEN:
        logger.error("BOT_TOKEN not found. Please populate the .env file first.")
        return 1

    try:
        bot = Bot(
            token=BOT_TOKEN,
            default=DefaultBotProperties(parse_mode=ParseMode.MARKDOWN_V2),
        )
    except Exception as exc:
        logger.error(f"Failed to initialize bot: {exc}")
        return 1

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
                await msg.answer(
                    "An internal error occurred, please try again later.",
                    parse_mode=None,
                )
            elif cbq is not None:
                await cbq.answer("An internal error occurred.", show_alert=True)
        except TelegramAPIError as tg_exc:
            logger.error(f"Failed to send error notification: {tg_exc}")
        except Exception as send_exc:
            logger.error(f"Error handler failed completely: {send_exc}")

    logger.info("CheyaVerse bot is starting...")

    _verify_assets()

    if not PUBLIC_URL:
        logger.warning("PUBLIC_URL is empty. QR media will use raw Litterbox URLs.")
    else:
        logger.info(f"Public viewer base: {PUBLIC_URL}")

    if not await _verify_bot(bot):
        logger.error("Bot failed to start. Check token and network connection.")
        try:
            await bot.session.close()
        except Exception:
            pass
        return 1

    exit_code = 0
    try:
        await bot.delete_webhook(drop_pending_updates=True)
        logger.info("Polling engaged. Press CTRL+C to stop.")
        await dp.start_polling(bot, allowed_updates=dp.resolve_used_update_types())
    except TelegramAPIError as exc:
        logger.error(f"Polling error: {exc}")
        exit_code = 1
    except Exception as exc:
        logger.error(f"Fatal error during polling: {exc}")
        exit_code = 1
    finally:
        try:
            await bot.session.close()
        except Exception as exc:
            logger.error(f"Session cleanup failed: {exc}")
        logger.info("CheyaVerse bot has shut down.")

    return exit_code


def main() -> int:
    try:
        return asyncio.run(_run())
    except KeyboardInterrupt:
        logger.info("Manual shutdown (CTRL+C).")
        return 0
    except Exception as exc:
        logger.error(f"Crash at entry point: {exc}")
        return 1


if __name__ == "__main__":
    sys.exit(main())