import asyncio
import io
import time
from functools import lru_cache
from pathlib import Path
from urllib.parse import quote

import aiohttp
import qrcode
from aiogram import F, Router
from aiogram.filters import Command, CommandObject
from aiogram.types import BufferedInputFile, Message, ReplyParameters
from PIL import Image, ImageDraw

from config import PUBLIC_URL
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

MAX_FILE_BYTES = 10 * 1024 * 1024

LITTERBOX_API = "https://litterbox.catbox.moe/resources/internals/api.php"
LITTERBOX_EXPIRY = "24h"
LITTERBOX_TIMEOUT = 120

OUTPUT_FILENAME = "barcode.png"

USAGE_TEXT = "Usage: /qr <text> or send a photo/video with caption /qr"

_GROUP_CACHE: dict[str, list[Message]] = {}
_GROUP_TASKS: dict[str, asyncio.Task] = {}
_GROUP_DELAY = 1.5


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
    finders = [(b, b), (b, b + inner - 7), (b + inner - 7, b)]

    def in_finder(r: int, c: int) -> bool:
        return any(fr <= r < fr + 7 and fc <= c < fc + 7 for fr, fc in finders)

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
                draw.ellipse((cx - radius, cy - radius, cx + radius, cy + radius), fill=QR_FRONT_COLOR)

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
    qr_resized.paste(logo, (center - logo_size // 2, center - logo_size // 2), logo)
    bg.paste(qr_resized, (qr_x, qr_y))
    return bg


async def _upload_to_litterbox(file_bytes: bytes, filename: str) -> str:
    form = aiohttp.FormData()
    form.add_field("reqtype", "fileupload")
    form.add_field("time", LITTERBOX_EXPIRY)
    form.add_field(
        "fileToUpload",
        file_bytes,
        filename=filename,
        content_type="application/octet-stream",
    )

    timeout = aiohttp.ClientTimeout(total=LITTERBOX_TIMEOUT)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.post(LITTERBOX_API, data=form) as resp:
            if resp.status != 200:
                raise RuntimeError(f"Litterbox HTTP {resp.status}")
            url = (await resp.text()).strip()
            if not url.startswith("https://litter.catbox.moe/"):
                raise RuntimeError(f"Unexpected Litterbox response: {url[:80]}")
            return url


def _derive_filename(message: Message, kind: str, ext: str) -> str:
    if kind == "video" and message.video and message.video.file_name:
        return message.video.file_name
    return f"cheyaverse_{kind}_{int(time.time() * 1000)}.{ext}"


def _build_viewer_url(litterbox_url: str, filename: str) -> str:
    if not PUBLIC_URL:
        return litterbox_url
    media = litterbox_url.rstrip("/").rsplit("/", 1)[-1]
    return f"{PUBLIC_URL}/m/{quote(media)}/{quote(filename)}"


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
            await message.answer("Required asset is missing on the server.", parse_mode=None)
        except Exception as e:
            logger.error(f"Fallback asset failed: {e}")
    except Exception as exc:
        logger.error(f"QR generation failed for {label}: {exc}")
        try:
            await message.answer("Cheya is having trouble, please try again shortly.", parse_mode=None)
        except Exception as e:
            logger.error(f"Fallback QR failed: {e}")


@router.message(F.text, Command("qr"))
async def cmd_qr(message: Message, command: CommandObject) -> None:
    payload = (command.args or "").strip()
    if not payload:
        try:
            await message.answer(USAGE_TEXT, parse_mode=None, reply_parameters=ReplyParameters(message_id=message.message_id))
        except Exception as exc:
            logger.error(f"Failed to send QR usage hint: {exc}")
        return
    await _send_qr(message, payload, "text")


@router.message(F.photo, F.caption.regexp(r"^/qr(\s|$)"), ~F.media_group_id)
async def qr_single_photo(message: Message) -> None:
    if not message.photo:
        return
    await _handle_media(message, message.photo[-1].file_id, "photo", "jpg")


@router.message(F.video, F.caption.regexp(r"^/qr(\s|$)"), ~F.media_group_id)
async def qr_single_video(message: Message) -> None:
    if message.video is None:
        return
    await _handle_media(message, message.video.file_id, "video", "mp4")


@router.message(F.media_group_id, F.photo | F.video)
async def qr_media_group(message: Message) -> None:
    gid = message.media_group_id
    if not gid:
        return

    if gid not in _GROUP_CACHE:
        _GROUP_CACHE[gid] = []

    _GROUP_CACHE[gid].append(message)

    if gid in _GROUP_TASKS:
        _GROUP_TASKS[gid].cancel()

    _GROUP_TASKS[gid] = asyncio.create_task(_finalize_group(gid))


async def _finalize_group(group_id: str) -> None:
    try:
        await asyncio.sleep(_GROUP_DELAY)
    except asyncio.CancelledError:
        return

    messages = _GROUP_CACHE.pop(group_id, [])
    _GROUP_TASKS.pop(group_id, None)

    if not messages:
        return

    has_qr = any((m.caption or "").strip().startswith("/qr") for m in messages)
    if not has_qr:
        return

    logger.info(f"Media group {group_id}: processing {len(messages)} item(s)")

    for msg in messages:
        try:
            if msg.photo:
                await _handle_media(msg, msg.photo[-1].file_id, "photo", "jpg")
            elif msg.video:
                await _handle_media(msg, msg.video.file_id, "video", "mp4")
        except Exception as exc:
            logger.error(f"Group item failed: {exc}")


async def _handle_media(message: Message, file_id: str, kind: str, ext: str) -> None:
    user = message.from_user
    label = user.username or user.full_name or str(user.id)

    try:
        tg_file = await message.bot.get_file(file_id)
        if tg_file.file_size and tg_file.file_size > MAX_FILE_BYTES:
            raise ValueError(f"File too large: {tg_file.file_size} bytes")
        if not tg_file.file_path:
            raise ValueError("Telegram returned empty file_path")

        file_io = await message.bot.download_file(tg_file.file_path)
        file_bytes = file_io.read()

        filename = _derive_filename(message, kind, ext)
        litterbox_url = await _upload_to_litterbox(file_bytes, filename)
        qr_payload = _build_viewer_url(litterbox_url, filename)
    except ValueError as exc:
        logger.error(f"Media ({kind}) validation failed for {label}: {exc}")
        try:
            await message.answer("File too large. Maximum size is 10 MB.", parse_mode=None, reply_parameters=ReplyParameters(message_id=message.message_id))
        except Exception as e:
            logger.error(f"Fallback ({kind}) failed: {e}")
        return
    except Exception as exc:
        logger.error(f"Failed to upload {kind} for {label}: {exc}")
        try:
            await message.answer("Unable to upload this file, please try again later.", parse_mode=None, reply_parameters=ReplyParameters(message_id=message.message_id))
        except Exception as e:
            logger.error(f"Fallback ({kind}) failed: {e}")
        return

    await _send_qr(message, qr_payload, kind)