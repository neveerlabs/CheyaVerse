import asyncio
import hmac
import ipaddress
import json
import logging
from typing import Any
from datetime import datetime

from aiohttp import web

import memory_telegram as memory
import personal_memory
from config import ADMIN_TELEGRAM_IDS, TELEGRAM_AI_MEMORY_SECRET


MAX_IMPORT_MESSAGES = 100
MAX_TEXT_LENGTH = 4000
ALLOWED_MEDIA_TYPES = {
    "photo",
    "video",
    "animation",
    "document",
    "audio",
    "voice",
    "video_note",
    "sticker",
}


def _integer(value: Any, *, positive: bool = True) -> int | None:
    if isinstance(value, bool) or not isinstance(value, int):
        return None
    if positive and value <= 0:
        return None
    return value


def _valid_admin(owner_uid: Any) -> int | None:
    uid = _integer(owner_uid)
    return uid if uid in ADMIN_TELEGRAM_IDS else None


def _valid_group_id(value: Any) -> int | None:
    group_id = _integer(value, positive=False)
    return group_id if group_id is not None and group_id < 0 else None


def _valid_timestamp(value: Any) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        return None
    try:
        datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    except ValueError:
        return None
    return value


def _authorize(request: web.Request) -> bool:
    expected = TELEGRAM_AI_MEMORY_SECRET
    supplied = request.headers.get("Authorization", "")
    prefix = "Bearer "
    if not expected or not supplied.startswith(prefix):
        return False
    return hmac.compare_digest(supplied[len(prefix):], expected)


def _validate_import_messages(value: Any) -> list[dict[str, Any]] | None:
    if not isinstance(value, list) or not 1 <= len(value) <= MAX_IMPORT_MESSAGES:
        return None
    messages: list[dict[str, Any]] = []
    for row in value:
        if not isinstance(row, dict):
            return None
        message_id = _integer(row.get("messageId"))
        sender_kind = row.get("role", row.get("senderKind"))
        sender_name = row.get("senderName")
        content = row.get("content")
        media_types = row.get("mediaTypes")
        reply_id = row.get("replyToMessageId")
        created_at = row.get("timestampIso", row.get("createdAt"))
        if (
            message_id is None
            or sender_kind not in {"admin", "user", "bot"}
            or not isinstance(sender_name, str)
            or len(sender_name) > 120
            or not isinstance(content, str)
            or not content.strip()
            or len(content) > MAX_TEXT_LENGTH
            or not isinstance(media_types, list)
            or len(media_types) > 8
            or any(
                not isinstance(item, str) or item not in ALLOWED_MEDIA_TYPES
                for item in media_types
            )
            or reply_id is not None and not isinstance(reply_id, (str, int))
            or not isinstance(created_at, str)
            or _valid_timestamp(created_at) is None
        ):
            return None
        messages.append(
            {
                "messageId": message_id,
                "senderKind": "user" if sender_kind == "admin" else sender_kind,
                "senderName": sender_name,
                "content": content,
                "mediaTypes": media_types,
                "replyToMessageId": _integer(reply_id),
                "createdAt": created_at,
            }
        )
    return messages


async def _handle(request: web.Request) -> web.Response:
    if not _authorize(request):
        raise web.HTTPUnauthorized(
            text=json.dumps({"ok": False, "error": "unauthorized"}),
            content_type="application/json",
        )
    try:
        body = await request.json()
    except (json.JSONDecodeError, web.HTTPBadRequest):
        raise web.HTTPBadRequest(
            text=json.dumps({"ok": False, "error": "invalid_json"}),
            content_type="application/json",
        )
    if not isinstance(body, dict) or not isinstance(body.get("action"), str):
        raise web.HTTPBadRequest(
            text=json.dumps({"ok": False, "error": "invalid_request"}),
            content_type="application/json",
        )

    action = body["action"]
    owner_uid = _valid_admin(body.get("ownerUid"))
    group_id = _valid_group_id(body.get("groupId"))

    if action == "retrieve_owner_memory":
        if owner_uid is None or not isinstance(body.get("query"), str):
            raise web.HTTPBadRequest(
                text=json.dumps({"ok": False, "error": "invalid_owner_memory_request"}),
                content_type="application/json",
            )
        return web.json_response(
            {
                "ok": True,
                "memory": await asyncio.to_thread(
                    memory.retrieve_owner_memory, owner_uid, body["query"]
                ),
            }
        )

    if action == "personal_memory_search":
        query = body.get("query", "")
        limit = body.get("limit", 20)
        if (
            owner_uid is None
            or not isinstance(query, str)
            or isinstance(limit, bool)
            or not isinstance(limit, int)
        ):
            raise web.HTTPBadRequest(
                text=json.dumps({"ok": False, "error": "invalid_personal_memory_query"}),
                content_type="application/json",
            )
        try:
            memories = await asyncio.to_thread(
                personal_memory.search, owner_uid, query, limit
            )
        except ValueError as error:
            raise web.HTTPBadRequest(
                text=json.dumps({"ok": False, "error": str(error)}),
                content_type="application/json",
            ) from error
        return web.json_response(
            {"ok": True, "memories": memories}
        )

    if action == "personal_memory_create":
        content = body.get("content")
        tags = body.get("tags", [])
        source = body.get("source", "web")
        if (
            owner_uid is None
            or not isinstance(content, str)
            or not isinstance(tags, list)
            or not isinstance(source, str)
        ):
            raise web.HTTPBadRequest(
                text=json.dumps({"ok": False, "error": "invalid_personal_memory"}),
                content_type="application/json",
            )
        try:
            result = await asyncio.to_thread(
                personal_memory.create, owner_uid, content, tags, source
            )
        except ValueError as error:
            raise web.HTTPBadRequest(
                text=json.dumps({"ok": False, "error": str(error)}),
                content_type="application/json",
            ) from error
        return web.json_response({"ok": True, **result})

    if action == "personal_memory_update":
        memory_id = body.get("memoryId")
        content = body.get("content")
        tags = body.get("tags")
        source = body.get("source", "web")
        if (
            owner_uid is None
            or not isinstance(memory_id, str)
            or content is not None and not isinstance(content, str)
            or tags is not None and not isinstance(tags, list)
            or not isinstance(source, str)
        ):
            raise web.HTTPBadRequest(
                text=json.dumps({"ok": False, "error": "invalid_personal_memory"}),
                content_type="application/json",
            )
        try:
            updated = await asyncio.to_thread(
                personal_memory.update,
                owner_uid,
                memory_id,
                content,
                tags,
                source,
            )
        except ValueError as error:
            raise web.HTTPBadRequest(
                text=json.dumps({"ok": False, "error": str(error)}),
                content_type="application/json",
            ) from error
        return web.json_response({"ok": True, "updated": updated is not None, "memory": updated})

    if action == "personal_memory_delete":
        memory_id = body.get("memoryId")
        if owner_uid is None or not isinstance(memory_id, str):
            raise web.HTTPBadRequest(
                text=json.dumps({"ok": False, "error": "invalid_personal_memory"}),
                content_type="application/json",
            )
        try:
            deleted = await asyncio.to_thread(personal_memory.delete, owner_uid, memory_id)
        except ValueError as error:
            raise web.HTTPBadRequest(
                text=json.dumps({"ok": False, "error": str(error)}),
                content_type="application/json",
            ) from error
        return web.json_response({"ok": True, "deleted": deleted})

    if owner_uid is None or group_id is None:
        raise web.HTTPBadRequest(
            text=json.dumps({"ok": False, "error": "invalid_owner_or_group"}),
            content_type="application/json",
        )

    if action == "store_owner_message":
        message_id = _integer(body.get("messageId"))
        sender_name = body.get("senderName")
        content = body.get("content")
        media_types = body.get("mediaTypes")
        reply_id = body.get("replyToMessageId")
        if (
            message_id is None
            or not isinstance(sender_name, str)
            or not isinstance(content, str)
            or len(content) > MAX_TEXT_LENGTH
            or not isinstance(media_types, list)
            or len(media_types) > 8
            or any(
                not isinstance(item, str) or item not in ALLOWED_MEDIA_TYPES
                for item in media_types
            )
            or reply_id is not None and _integer(reply_id) is None
            or body.get("timestamp") is not None
            and _valid_timestamp(body.get("timestamp")) is None
        ):
            raise web.HTTPBadRequest(
                text=json.dumps({"ok": False, "error": "invalid_owner_message"}),
                content_type="application/json",
            )
        result = await asyncio.to_thread(
            memory.store_owner_message,
            group_id=group_id,
            owner_uid=owner_uid,
            group_title=str(body.get("groupTitle") or "")[:200],
            message_id=message_id,
            sender_name=sender_name,
            content=content,
            media_types=media_types,
            reply_to_message_id=reply_id,
            edited=body.get("edited") is True,
            timestamp=_valid_timestamp(body.get("timestamp")),
        )
        return web.json_response({"ok": True, "stored": result == "stored", "reason": result})

    if action == "retrieve_group_memory":
        if not isinstance(body.get("query"), str):
            raise web.HTTPBadRequest(
                text=json.dumps({"ok": False, "error": "invalid_memory_query"}),
                content_type="application/json",
            )
        reply_id = body.get("replyToMessageId")
        if reply_id is not None and _integer(reply_id) is None:
            raise web.HTTPBadRequest(
                text=json.dumps({"ok": False, "error": "invalid_reply_id"}),
                content_type="application/json",
            )
        return web.json_response(
            {
                "ok": True,
                "memory": await asyncio.to_thread(
                    memory.retrieve_group_memory,
                    group_id,
                    owner_uid,
                    body["query"],
                    reply_id,
                ),
            }
        )

    if action == "get_insight":
        message_id = _integer(body.get("messageId"))
        if message_id is None:
            raise web.HTTPBadRequest(
                text=json.dumps({"ok": False, "error": "invalid_message_id"}),
                content_type="application/json",
            )
        return web.json_response(
            {
                "ok": True,
                "summary": await asyncio.to_thread(
                    memory.get_insight, group_id, owner_uid, message_id
                ),
            }
        )

    if action == "store_insight":
        message_id = _integer(body.get("messageId"))
        summary = body.get("summary")
        if message_id is None or not isinstance(summary, str) or len(summary) > 1600:
            raise web.HTTPBadRequest(
                text=json.dumps({"ok": False, "error": "invalid_insight"}),
                content_type="application/json",
            )
        await asyncio.to_thread(
            memory.store_insight,
            group_id=group_id,
            owner_uid=owner_uid,
            group_title=str(body.get("groupTitle") or "")[:200],
            message_id=message_id,
            summary=summary,
            replace=body.get("replace") is True,
        )
        return web.json_response({"ok": True})

    if action == "store_bot_message":
        message_id = _integer(body.get("messageId"))
        raw_reply_id = body.get("replyToMessageId")
        reply_id = _integer(raw_reply_id) if raw_reply_id is not None else None
        content = body.get("content")
        if (
            message_id is None
            or raw_reply_id is not None and reply_id is None
            or not isinstance(content, str)
            or not content.strip()
            or len(content) > MAX_TEXT_LENGTH
            or body.get("timestamp") is not None
            and _valid_timestamp(body.get("timestamp")) is None
        ):
            raise web.HTTPBadRequest(
                text=json.dumps({"ok": False, "error": "invalid_bot_message"}),
                content_type="application/json",
            )
        await asyncio.to_thread(
            memory.store_bot_message,
            group_id=group_id,
            message_id=message_id,
            content=content,
            reply_to_message_id=reply_id,
            timestamp=_valid_timestamp(body.get("timestamp")),
        )
        return web.json_response({"ok": True})

    if action == "import_messages":
        messages = _validate_import_messages(body.get("messages"))
        group_title = body.get("groupTitle")
        if messages is None or not isinstance(group_title, str):
            raise web.HTTPBadRequest(
                text=json.dumps({"ok": False, "error": "invalid_import"}),
                content_type="application/json",
            )
        await asyncio.to_thread(
            memory.import_rows,
            groups=[
                {
                    "group_id": group_id,
                    "owner_uid": owner_uid,
                    "group_title": group_title[:200],
                }
            ],
            messages=[
                {
                    "id": f"tg-{group_id}-{item['messageId']}",
                    "group_id": group_id,
                    "telegram_message_id": item["messageId"],
                    "sender_uid": owner_uid if item["senderKind"] == "user" else None,
                    "sender_name": item["senderName"],
                    "sender_kind": item["senderKind"],
                    "content": item["content"],
                    "media_types": ",".join(item["mediaTypes"]),
                    "reply_to_message_id": item["replyToMessageId"],
                    "created_at": item["createdAt"],
                }
                for item in messages
            ],
            insights=[],
        )
        return web.json_response({"ok": True, "imported": len(messages)})

    raise web.HTTPBadRequest(
        text=json.dumps({"ok": False, "error": "unsupported_action"}),
        content_type="application/json",
    )


async def start_server(host: str, port: int) -> web.AppRunner:
    if not TELEGRAM_AI_MEMORY_SECRET:
        raise RuntimeError("TELEGRAM_AI_MEMORY_SECRET is required.")
    if host != "localhost" and not ipaddress.ip_address(host).is_loopback:
        raise ValueError("TELEGRAM_AI_MEMORY_HOST must be a loopback address.")
    memory.initialize()
    app = web.Application(client_max_size=2 * 1024 * 1024)
    app.router.add_post("/internal/telegram-group-ai", _handle)
    runner = web.AppRunner(app, access_log=None)
    await runner.setup()
    site = web.TCPSite(runner, host=host, port=port)
    await site.start()
    return runner


async def _run_standalone() -> None:
    from config import TELEGRAM_AI_MEMORY_HOST, TELEGRAM_AI_MEMORY_PORT

    runner = await start_server(
        TELEGRAM_AI_MEMORY_HOST,
        TELEGRAM_AI_MEMORY_PORT,
    )
    logging.basicConfig(level=logging.INFO)
    logging.info(
        "Telegram AI memory API listening on %s:%s.",
        TELEGRAM_AI_MEMORY_HOST,
        TELEGRAM_AI_MEMORY_PORT,
    )
    try:
        await asyncio.Event().wait()
    finally:
        await runner.cleanup()


if __name__ == "__main__":
    try:
        asyncio.run(_run_standalone())
    except KeyboardInterrupt:
        pass
