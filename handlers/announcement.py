import asyncio
import html
import re
import uuid
from typing import Awaitable, Callable

import aiohttp
from aiogram import Bot, Router
from aiogram.enums import ParseMode
from aiogram.exceptions import TelegramRetryAfter
from aiogram.filters import Command, CommandObject
from aiogram.types import Message

from config import ADMIN_TELEGRAM_IDS, BROADCAST_WEB_SECRET, PUBLIC_URL
from logger import logger
from storage import list_telegram_bot_user_ids

router = Router(name="announcement")

DIVIDER = "─" * 23
MAX_CONCURRENT_DELIVERIES = 10


def _announcement_body(message: Message, args: str | None) -> str:
    source = message.caption or message.text or ""
    match = re.match(r"^/pesan(?:@\w+)?(?:\s+|$)", source)
    text = source[match.end() :] if match else (args or "")
    if not text.strip():
        return ""

    entities = message.caption_entities if message.caption else message.entities
    if not entities or not match:
        return text

    body_start = len(source[: match.end()].encode("utf-16-le")) // 2
    source_offsets = [0]
    for character in source:
        source_offsets.append(
            source_offsets[-1] + len(character.encode("utf-16-le")) // 2
        )
    python_start = match.end()
    body_end = source_offsets[-1]
    open_events: dict[int, list[tuple[int, str]]] = {}
    close_events: dict[int, list[tuple[int, str]]] = {}

    for entity in entities:
        entity_type = entity.type
        if entity_type == "bold":
            opening, closing = "<b>", "</b>"
        elif entity_type == "italic":
            opening, closing = "<i>", "</i>"
        elif entity_type == "pre":
            language = re.sub(
                r"[^A-Za-z0-9_+-]", "", getattr(entity, "language", "") or ""
            )
            code_class = f' class="language-{language}"' if language else ""
            opening, closing = f"<pre><code{code_class}>", "</code></pre>"
        elif entity_type == "code":
            opening, closing = "<code>", "</code>"
        else:
            continue

        start = max(entity.offset, body_start)
        end = min(entity.offset + entity.length, body_end)
        if start >= end:
            continue
        start_index = next(
            (
                index
                for index, offset in enumerate(source_offsets)
                if offset == start
            ),
            None,
        )
        end_index = next(
            (
                index
                for index, offset in enumerate(source_offsets)
                if offset == end
            ),
            None,
        )
        if start_index is None or end_index is None:
            continue
        start_index -= python_start
        end_index -= python_start
        open_events.setdefault(start_index, []).append((end_index, opening))
        close_events.setdefault(end_index, []).append((start_index, closing))

    if not open_events:
        return text

    rendered: list[str] = []
    tag_order = {
        "<b>": 0,
        "</b>": 0,
        "<i>": 1,
        "</i>": 1,
        "<code>": 2,
        "</code>": 2,
        "<pre>": 3,
        "</pre>": 3,
    }
    for index in range(len(text) + 1):
        for _, tag in sorted(
            close_events.get(index, []),
            key=lambda event: (-event[0], -tag_order.get(event[1], 0)),
        ):
            rendered.append(tag)
        for end_index, tag in sorted(
            open_events.get(index, []),
            key=lambda event: (-event[0], tag_order.get(event[1], 0)),
        ):
            if end_index <= len(text):
                rendered.append(tag)
        if index < len(text):
            rendered.append(text[index])
    return "".join(rendered)


def _announcement_plain_text(text: str) -> str:
    text = re.sub(
        r"</?(?:b|strong|i|em|code|pre)>|"
        r"<code\s+class=[\"']language-[A-Za-z0-9_+-]+[\"']>",
        "",
        text,
        flags=re.IGNORECASE,
    )
    return text.replace("&nbsp;", "\u00a0")


def _announcement_text(text: str) -> str:
    formatted = _render_markdown(text)
    return (
        "📢 <b>Announcement</b>\n"
        f"{DIVIDER}\n"
        f"{formatted}\n"
        f"{DIVIDER}\n"
        f"<i>Regards, neverlabs</i>"
    )


def _render_markdown_inline(text: str) -> str:
    text = text.replace("&nbsp;", "\u00a0")
    protected: list[str] = []

    def stash(value: str) -> str:
        protected.append(value)
        return f"\x00MARKDOWN{len(protected) - 1}\x00"

    text = re.sub(
        r"</?(?:b|strong|i|em|code)>",
        lambda match: stash(match.group(0).lower()),
        text,
    )
    escaped = html.escape(text, quote=False)

    for pattern, tag in (
        (r"\*\*([^\n]+?)\*\*", "b"),
        (r"(?<!\*)\*([^*\n]+)\*(?!\*)", "b"),
        (r"(?<![\w_])_([^_\n]+)_(?![\w_])", "i"),
    ):
        escaped = re.sub(
            pattern,
            lambda match, name=tag: stash(f"<{name}>{match.group(1)}</{name}>"),
            escaped,
        )

    return re.sub(
        r"\x00MARKDOWN(\d+)\x00",
        lambda match: protected[int(match.group(1))],
        escaped,
    )


def _render_markdown(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n").replace("&nbsp;", "\u00a0")
    protected: list[str] = []

    def stash(value: str) -> str:
        protected.append(value)
        return f"\x00BLOCK{len(protected) - 1}\x00"

    def code_block(match: re.Match[str]) -> str:
        language = match.group(1).strip()
        safe_language = re.sub(r"[^A-Za-z0-9_+-]", "", language)
        code = html.escape(match.group(2).rstrip("\n"), quote=False)
        code_class = f' class="language-{safe_language}"' if safe_language else ""
        return stash(f"<pre><code{code_class}>{code}</code></pre>")

    def html_code_block(match: re.Match[str]) -> str:
        language = re.search(
            r'class=["\']language-([A-Za-z0-9_+-]+)["\']', match.group(1)
        )
        safe_language = language.group(1) if language else ""
        code = html.escape(match.group(2), quote=False)
        code_class = (
            f' class="language-{safe_language}"' if safe_language else ""
        )
        return stash(f"<pre><code{code_class}>{code}</code></pre>")

    text = re.sub(
        r"<pre><code([^>]*)>([\s\S]*?)</code></pre>",
        html_code_block,
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(
        r"(?m)^```([\w+-]*)[ \t]*\n([\s\S]*?)^```[ \t]*$",
        code_block,
        text,
    )

    rendered_lines: list[str] = []
    for line in text.split("\n"):
        if "\x00BLOCK" in line:
            rendered_lines.append(line)
        elif line.startswith(">"):
            rendered_lines.append(
                "<blockquote>"
                + _render_markdown_inline(line[1:].lstrip())
                + "</blockquote>"
            )
        elif re.match(r"^\s*-\s+", line):
            item = re.sub(r"^\s*-\s+", "", line, count=1)
            rendered_lines.append(f"• {_render_markdown_inline(item)}")
        else:
            rendered_lines.append(_render_markdown_inline(line))

    rendered = "\n".join(rendered_lines)
    return re.sub(
        r"\x00BLOCK(\d+)\x00",
        lambda match: protected[int(match.group(1))],
        rendered,
    )


async def _send_web_announcement(
    broadcast_id: str,
    content: str,
    plain_text: str,
) -> tuple[int, int, str | None]:
    if not PUBLIC_URL:
        return 0, 0, "PUBLIC_URL is not configured"
    if not BROADCAST_WEB_SECRET:
        return 0, 0, "BROADCAST_WEB_SECRET is not configured"

    timeout = aiohttp.ClientTimeout(total=120)
    try:
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(
                f"{PUBLIC_URL}/api/internal/announcements",
                headers={"Authorization": f"Bearer {BROADCAST_WEB_SECRET}"},
                json={
                    "broadcastId": broadcast_id,
                    "contentHtml": content,
                    "plainText": plain_text,
                    "excludedUserIds": sorted(ADMIN_TELEGRAM_IDS),
                },
            ) as response:
                result = await response.json(content_type=None)
                if response.status != 200 or not isinstance(result, dict):
                    return 0, 0, f"web endpoint returned HTTP {response.status}"
                return (
                    int(result.get("delivered", 0)),
                    int(result.get("failed", 0)),
                    None,
                )
    except (aiohttp.ClientError, asyncio.TimeoutError, ValueError) as exc:
        logger.error(f"Web announcement request failed: {exc}")
        return 0, 0, "could not reach the web announcement endpoint"


def _has_media(message: Message) -> bool:
    return any(
        (
            message.animation,
            message.audio,
            message.document,
            message.photo,
            message.video,
            message.video_note,
            message.voice,
        )
    )


async def _send_with_retry(send: Callable[[], Awaitable[object]]) -> None:
    for attempt in range(2):
        try:
            await send()
            return
        except TelegramRetryAfter as exc:
            if attempt:
                raise
            await asyncio.sleep(exc.retry_after)


async def _notify_admins(bot: Bot, text: str) -> None:
    for admin_id in ADMIN_TELEGRAM_IDS:
        try:
            await bot.send_message(
                chat_id=admin_id,
                text=text,
                parse_mode=None,
                disable_web_page_preview=True,
            )
        except Exception as exc:
            logger.error(
                f"Failed to send broadcast error report to admin {admin_id}: {exc}"
            )


@router.message(Command("pesan"))
async def cmd_announcement(message: Message, command: CommandObject) -> None:
    admin = message.from_user
    if (
        not admin
        or admin.id not in ADMIN_TELEGRAM_IDS
        or message.chat.type != "private"
    ):
        return

    body = _announcement_body(message, command.args)
    if not body:
        await _notify_admins(
            message.bot,
            "Broadcast gagal: isi pesan kosong. Gunakan /pesan isi pengumuman "
            "atau lampirkan media dengan caption /pesan isi pengumuman.",
        )
        return
    if len(body) > 3900:
        await _notify_admins(
            message.bot,
            "Broadcast gagal: isi pengumuman melebihi batas 3900 karakter.",
        )
        return

    try:
        known_ids = await list_telegram_bot_user_ids()
    except Exception as exc:
        logger.error(f"Failed to load Telegram broadcast recipients: {exc}")
        await _notify_admins(
            message.bot,
            "Broadcast gagal: daftar penerima tidak dapat dimuat. "
            "Periksa koneksi database Turso.",
        )
        return

    recipient_ids = [
        recipient_id
        for recipient_id in known_ids
        if recipient_id not in ADMIN_TELEGRAM_IDS
    ]
    payload = _announcement_text(body)
    semaphore = asyncio.Semaphore(MAX_CONCURRENT_DELIVERIES)

    async def deliver(recipient_id: int) -> bool:
        async with semaphore:
            try:
                if _has_media(message):
                    if len(payload) <= 1024:
                        await _send_with_retry(
                            lambda: message.bot.copy_message(
                                chat_id=recipient_id,
                                from_chat_id=message.chat.id,
                                message_id=message.message_id,
                                caption=payload,
                                parse_mode=ParseMode.HTML,
                            )
                        )
                    else:
                        await _send_with_retry(
                            lambda: message.bot.copy_message(
                                chat_id=recipient_id,
                                from_chat_id=message.chat.id,
                                message_id=message.message_id,
                            )
                        )
                        await _send_with_retry(
                            lambda: message.bot.send_message(
                                chat_id=recipient_id,
                                text=payload,
                                parse_mode=ParseMode.HTML,
                                disable_web_page_preview=True,
                            )
                        )
                else:
                    await _send_with_retry(
                        lambda: message.bot.send_message(
                            chat_id=recipient_id,
                            text=payload,
                            parse_mode=ParseMode.HTML,
                            disable_web_page_preview=True,
                        )
                    )
                return True
            except TelegramRetryAfter:
                logger.warning(
                    f"Broadcast rate limit persisted for recipient {recipient_id}"
                )
                return False
            except Exception as exc:
                logger.warning(
                    f"Broadcast delivery failed for recipient {recipient_id}: {exc}"
                )
                return False

    results = await asyncio.gather(
        *(deliver(recipient_id) for recipient_id in recipient_ids)
    )
    delivered = sum(results)
    failed = len(results) - delivered
    broadcast_id = str(uuid.uuid4())
    web_delivered, web_failed, web_error = await _send_web_announcement(
        broadcast_id,
        payload,
        _announcement_plain_text(body),
    )
    if failed or web_failed or web_error or not recipient_ids:
        failed_ids = [
            recipient_id
            for recipient_id, succeeded in zip(recipient_ids, results)
            if not succeeded
        ]
        failed_id_list = ", ".join(str(uid) for uid in failed_ids[:20])
        if len(failed_ids) > 20:
            failed_id_list += f", ... (+{len(failed_ids) - 20} lainnya)"
        report = [
            "Broadcast selesai dengan error.",
            f"Telegram: {delivered}/{len(results)} berhasil, {failed} gagal.",
            f"Web: {web_delivered} berhasil, {web_failed} gagal.",
        ]
        if failed_id_list:
            report.append(f"ID penerima Telegram gagal: {failed_id_list}")
        if web_error:
            report.append(f"Web gagal: {web_error}.")
        if not recipient_ids and not web_delivered:
            report.append("Belum ada user client bot/web yang menerima pengumuman.")
        await _notify_admins(message.bot, "\n".join(report))
    logger.info(
        f"Telegram announcement from admin {admin.id}: "
        f"Telegram {delivered}/{len(results)} delivered, {failed} failed; "
        f"web {web_delivered} delivered, {web_failed} failed"
    )
