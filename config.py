import os
from dotenv import load_dotenv

load_dotenv()

BOT_TOKEN: str = os.getenv("BOT_TOKEN", "").strip()
PUBLIC_URL: str = os.getenv("PUBLIC_URL", "").strip().rstrip("/")
WEB_HOST: str = os.getenv("WEB_HOST", "0.0.0.0").strip()
WEB_PORT: int = int(os.getenv("WEB_PORT", "8080").strip() or "8080")

if not BOT_TOKEN:
    raise RuntimeError("BOT_TOKEN not found. Please populate the .env file first.")