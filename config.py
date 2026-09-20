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
SUPABASE_URL: str = os.getenv("SUPABASE_URL", "").strip()
SUPABASE_KEY: str = os.getenv("SUPABASE_KEY", "").strip()
SUPABASE_BUCKET: str = os.getenv("SUPABASE_BUCKET", "cheyaverse-media").strip()
SUPABASE_TABLE: str = os.getenv("SUPABASE_TABLE", "media").strip()
MEDIA_TTL_DAYS: int = _int_env("MEDIA_TTL_DAYS", 30)
SIGNED_URL_TTL: int = _int_env("SIGNED_URL_TTL", 2592000)
