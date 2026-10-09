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


def _int_set_env(name: str) -> frozenset[int]:
    values: set[int] = set()
    for raw in os.getenv(name, "").split(","):
        try:
            value = int(raw.strip())
        except ValueError:
            continue
        if value > 0:
            values.add(value)
    return frozenset(values)


BOT_TOKEN: str = os.getenv("BOT_TOKEN", "").strip()
TELEGRAM_BOT_API_URL: str = os.getenv("TELEGRAM_BOT_API_URL", "").strip().rstrip("/")
PUBLIC_URL: str = os.getenv("PUBLIC_URL", "").strip().rstrip("/")
WEB_HOST: str = os.getenv("WEB_HOST", "0.0.0.0").strip() or "0.0.0.0"
WEB_PORT: int = _int_env("WEB_PORT", 8080)
SUPABASE_DB_URL: str = os.getenv("SUPABASE_DB_URL", "").strip()
SUPABASE_URL: str = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
SUPABASE_SERVICE_ROLE_KEY: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
SUPABASE_JWT_SECRET: str = os.getenv("SUPABASE_JWT_SECRET", "").strip()
TELEGRAM_STORAGE_CHAT_ID: int = _int_env("TELEGRAM_STORAGE_CHAT_ID", 0)
ADMIN_TELEGRAM_IDS: frozenset[int] = _int_set_env("ADMIN_TELEGRAM_IDS")
BROADCAST_WEB_SECRET: str = os.getenv("BROADCAST_WEB_SECRET", "").strip()
TELEGRAM_GROUP_AI_SECRET: str = os.getenv("TELEGRAM_GROUP_AI_SECRET", "").strip()
TELEGRAM_AI_MEMORY_HOST: str = (
    os.getenv("TELEGRAM_AI_MEMORY_HOST", "127.0.0.1").strip() or "127.0.0.1"
)
TELEGRAM_AI_MEMORY_PORT: int = _int_env("TELEGRAM_AI_MEMORY_PORT", 8765)
TELEGRAM_AI_MEMORY_SECRET: str = os.getenv("TELEGRAM_AI_MEMORY_SECRET", "").strip()
TELEGRAM_AI_MEMORY_DB_PATH: str = os.getenv(
    "TELEGRAM_AI_MEMORY_DB_PATH", ""
).strip()
MEDIA_TTL_DAYS: int = _int_env("MEDIA_TTL_DAYS", 30)
VAPID_PUBLIC_KEY: str = os.getenv("VAPID_PUBLIC_KEY", "").strip()
VAPID_PRIVATE_KEY: str = os.getenv("VAPID_PRIVATE_KEY", "").strip()
VAPID_SUBJECT: str = os.getenv("VAPID_SUBJECT", "mailto:userlinuxorg@gmail.com").strip()
