import asyncio
import errno
import socket
from collections.abc import Awaitable, Callable
from typing import TypeVar

T = TypeVar("T")

MAX_ATTEMPTS = 3
REQUEST_TIMEOUT_SECONDS = 20
MAX_RETRY_DELAY_SECONDS = 5
TRANSIENT_ERROR_CODES = {
    errno.ECONNRESET,
    errno.ETIMEDOUT,
    socket.EAI_AGAIN,
}
TRANSIENT_ERROR_NAMES = {
    "ClientConnectorDNSError",
    "ServerDisconnectedError",
}


def is_transient_network_error(error: BaseException) -> bool:
    pending = [error]
    seen: set[int] = set()
    while pending:
        current = pending.pop()
        if id(current) in seen:
            continue
        seen.add(id(current))

        if isinstance(current, (asyncio.TimeoutError, ConnectionError)):
            return True
        if getattr(current, "errno", None) in TRANSIENT_ERROR_CODES:
            return True
        if getattr(current, "code", None) in {
            "ECONNRESET",
            "ETIMEDOUT",
            "EAI_AGAIN",
        }:
            return True
        if type(current).__name__ in TRANSIENT_ERROR_NAMES:
            return True

        message = str(current).lower()
        if "temporary failure in name resolution" in message:
            return True
        for attribute in ("__cause__", "__context__", "os_error"):
            cause = getattr(current, attribute, None)
            if isinstance(cause, BaseException):
                pending.append(cause)
    return False


async def with_telegram_retry(
    operation: Callable[[], Awaitable[T]],
    *,
    label: str,
    logger,
) -> T:
    for attempt in range(MAX_ATTEMPTS):
        try:
            return await asyncio.wait_for(
                operation(),
                timeout=REQUEST_TIMEOUT_SECONDS,
            )
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            if not is_transient_network_error(exc) or attempt == MAX_ATTEMPTS - 1:
                raise
            delay = min(2**attempt, MAX_RETRY_DELAY_SECONDS)
            logger.warning(
                f"Transient Telegram {label} network error "
                f"(attempt {attempt + 1}/{MAX_ATTEMPTS}): {exc}; "
                f"retrying in {delay}s."
            )
            await asyncio.sleep(delay)
