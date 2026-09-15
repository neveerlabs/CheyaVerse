import io
from functools import lru_cache
from pathlib import Path

import qrcode
from aiogram import F, Router
from aiogram.filters import Command, CommandObject
from aiogram.types import BufferedInputFile, Message, ReplyParameters
from PIL import Image, ImageDraw

from config import BOT_TOKEN
from logger import logger

router = Router(name="qr")

BASE_DIR = Path(__file__).resolve().parent.parent
ASSETS_DIR = BASE_DIR / "assets"
BACKGROUND_PATH = ASSETS_DIR / "background.png"
LOGO_PATH = ASSETS_DIR / "cheyaverse.jpg"

QR_X_RATIO = 0.25
QR_Y_RATIO = 0.35
QR_SIZE_RATIO = 0.50

QR_FRONT_COLOR = (74, 34, 22, 255)
QR_BACK_COLOR = (250, 240, 228, 255)

QR_BOX_SIZE = 14
QR_BORDER = 4
QR_DOT_RATIO = 0.90

LOGO_SCALE = 0.20
LOGO_PADDING = 8

MAX_FILE_BYTES = 20 * 1024 * 1024

OUTPUT_FILENAME = "barcode.png"

USAGE_TEXT = "Usage: /qr <text> or send a photo/video with caption /qr"


def required_assets() -> list[Path]:
    return [BACKGROUND_PATH, LOGO_PATH]


@lru_cache(maxsize=1)
def _load_background() -> Image.Image:
    if not BACKGROUND_PATH.exists():
        raise FileNotFoundError(BACKGROUND_PATH)
    return Image.open(BACKGROUND_PATH).convert("RGBA")


@lru_cache(maxsize=1)
def _load_logo_source() -> Image.Image:
    if not LOGO_PATH.exists():
        raise FileNotFoundError(LOGO_PATH)
    return Image.open(LOGO_PATH).convert("RGBA")


def _generate_qr(data: str) -> Image.Image:
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_H,
        box_size=QR_BOX_SIZE,
        border=QR_BORDER,
    )
    qr.add_data(data)
    qr.make(fit=True)

    matrix = qr.get_matrix()
    count = len(matrix)
    px = count * QR_BOX_SIZE

    img = Image.new("RGBA", (px, px), QR_BACK_COLOR)
    draw = ImageDraw.Draw(img)

    b = QR_BORDER
    inner = count - 2 * b
    finders = [
        (b, b),
        (b, b + inner - 7),
        (b + inner - 7, b),
    ]

    def in_finder(r: int, c: int) -> bool:
        return any(
            fr <= r < fr + 7 and fc <= c < fc + 7
            for fr, fc in finders
        )

    radius = (QR_BOX_SIZE * QR_DOT_RATIO) / 2

    for row_idx, row in enumerate(matrix):
        for col_idx, dark in enumerate(row):
            if not dark:
                continue

            x0 = col_idx * QR_BOX_SIZE
            y0 = row_idx * QR_BOX_SIZE
            x1 = x0 + QR_BOX_SIZE
            y1 = y0 + QR_BOX_SIZE

            if in_finder(row_idx, col_idx):
                draw.rectangle((x0, y0, x1 - 1, y1 - 1), fill=QR_FRONT_COLOR)
            else:
                cx = x0 + QR_BOX_SIZE / 2
                cy = y0 + QR_BOX_SIZE / 2
                draw.ellipse(
                    (cx - radius, cy - radius, cx + radius, cy + radius),
                    fill=QR_FRONT_COLOR,
                )

    return img


def _circular_logo(size: int) -> Image.Image:
    logo = _load_logo_source().resize((size, size), Image.LANCZOS)

    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size, size), fill=255)

    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(logo, (0, 0), mask)
    return out


def _compose(data: str) -> Image.Image:
    qr_img = _generate_qr(data)
    bg = _load_background().copy()
    bg_w, bg_h = bg.size

    qr_size = int(bg_w * QR_SIZE_RATIO)
    qr_x = int(bg_w * QR_X_RATIO)
    qr_y = int(bg_h * QR_Y_RATIO)

    qr_resized = qr_img.resize((qr_size, qr_size), Image.LANCZOS)

    logo_size = int(qr_size * LOGO_SCALE)
    logo = _circular_logo(logo_size)

    center = qr_size // 2
    qr_resized.paste(
        logo,
        (center - logo_size // 2, center - logo_size // 2),
        logo,
    )

    bg.paste(qr_resized, (qr_x, qr_y))
    return bg


async def _send_qr(message: Message, data: str, source: str) -> None:
    user = message.from_user
    label = user.username or user.full_name or str(user.id)

    try:
        image = _compose(data)
        buf = io.BytesIO()
        image.save(buf, format="PNG", optimize=True)
        buf.seek(0)

        await message.answer_photo(
            photo=BufferedInputFile(buf.read(), filename=OUTPUT_FILENAME),
            reply_parameters=ReplyParameters(message_id=message.message_id),
        )
        logger.info(f"QR generated ({source}) for {label} (ID: {user.id})")
    except FileNotFoundError as exc:
        logger.error(f"Missing asset for {label}: {exc}")
        try:
            await message.answer(
                "Required asset is missing on the server, please contact the admin.",
                parse_mode=None,
            )
        except Exception as fallback_exc:
            logger.error(f"Fallback (asset) failed: {fallback_exc}")
    except Exception as exc:
        logger.error(f"QR generation failed for {label}: {exc}")
        try:
            await message.answer(
                "Cheya is having trouble, please try again shortly.",
                parse_mode=None,
            )
        except Exception as fallback_exc:
            logger.error(f"Fallback QR failed: {fallback_exc}")


@router.message(F.text, Command("qr"))
async def cmd_qr(message: Message, command: CommandObject) -> None:
    payload = (command.args or "").strip()
    if not payload:
        try:
            await message.answer(
                USAGE_TEXT,
                parse_mode=None,
                reply_parameters=ReplyParameters(message_id=message.message_id),
            )
        except Exception as exc:
            logger.error(f"Failed to send QR usage hint: {exc}")
        return
    await _send_qr(message, payload, "text")


@router.message(F.photo, F.caption.regexp(r"^/qr(\s|$)"))
async def qr_from_photo(message: Message) -> None:
    if not message.photo:
        return
    await _handle_media(message, message.photo[-1].file_id, "photo")


@router.message(F.video, F.caption.regexp(r"^/qr(\s|$)"))
async def qr_from_video(message: Message) -> None:
    if message.video is None:
        return
    await _handle_media(message, message.video.file_id, "video")


async def _handle_media(message: Message, file_id: str, kind: str) -> None:
    user = message.from_user
    label = user.username or user.full_name or str(user.id)

    try:
        file = await message.bot.get_file(file_id)
        if file.file_size and file.file_size > MAX_FILE_BYTES:
            raise ValueError(f"File too large: {file.file_size} bytes")
        if not file.file_path:
            raise ValueError("Telegram returned empty file_path")
        url = f"https://api.telegram.org/bot{BOT_TOKEN}/{file.file_path}".replace(
            "/bot" + BOT_TOKEN, "/file/bot" + BOT_TOKEN
        )
        url = f"https://api.telegram.org/file/bot{BOT_TOKEN}/{file.file_path}"
    except Exception as exc:
        logger.error(f"Failed to resolve {kind} URL for {label}: {exc}")
        try:
            await message.answer(
                "Unable to process this file, it may be too large.",
                parse_mode=None,
                reply_parameters=ReplyParameters(message_id=message.message_id),
            )
        except Exception as fallback_exc:
            logger.error(f"Fallback ({kind}) failed: {fallback_exc}")
        return

    await _send_qr(message, url, kind)