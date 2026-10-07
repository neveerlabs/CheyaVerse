import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import telegram_ai_memory as memory
from config import TELEGRAM_AI_MEMORY_DB_PATH


REPOSITORY_ROOT = Path(__file__).resolve().parent.parent


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Export local Telegram AI memory tables to separate JSON files."
    )
    parser.add_argument(
        "--database-path",
        default=TELEGRAM_AI_MEMORY_DB_PATH
        or str(memory.DEFAULT_DATABASE_PATH),
        help="Source SQLite file (defaults to .env or the standard database path).",
    )
    parser.add_argument(
        "--output-dir",
        default=str(REPOSITORY_ROOT / "backups" / "telegram-ai-memory-json"),
        help="Directory for the private JSON snapshots.",
    )
    args = parser.parse_args()

    counts = memory.export_json_files(
        Path(args.database_path).expanduser(),
        Path(args.output_dir).expanduser(),
    )
    output_directory = Path(args.output_dir).expanduser().resolve()
    print(f"JSON snapshots exported to {output_directory}:")
    for name, count in counts.items():
        print(f"  {name}.json: {count} records")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
