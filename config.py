import os
from dotenv import load_dotenv

load_dotenv()


def _int_env(name: str, default: int) -> int:
    raw = os.getenv(name, "").strip()
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


BOT_TOKEN: str = os.getenv("BOT_TOKEN", "").strip()
PUBLIC_URL: str = os.getenv("PUBLIC_URL", "").strip().rstrip("/")
WEB_HOST: str = os.getenv("WEB_HOST", "0.0.0.0").strip() or "0.0.0.0"
WEB_PORT: int = _int_env("WEB_PORT", 8080)