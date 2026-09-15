import logging
import sys
from datetime import datetime


class CheyaFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        timestamp = datetime.fromtimestamp(record.created).strftime("%H:%M:%S")
        status = record.levelname
        message = record.getMessage()
        if record.exc_info:
            message = f"{message} | {self.formatException(record.exc_info)}"
        return f"[{timestamp}] [{status}] {message}"


def _build_logger() -> logging.Logger:
    log = logging.getLogger("cheyaverse")
    log.setLevel(logging.INFO)
    log.handlers.clear()
    log.propagate = False

    stream = logging.StreamHandler(sys.stdout)
    stream.setFormatter(CheyaFormatter())
    log.addHandler(stream)

    logging.getLogger("aiogram").setLevel(logging.WARNING)
    logging.getLogger("asyncio").setLevel(logging.WARNING)

    return log


logger = _build_logger()