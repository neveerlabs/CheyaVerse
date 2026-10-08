import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import memory_telegram as memory
import memory as personal_memory
from config import TELEGRAM_AI_MEMORY_DB_PATH


REPOSITORY_ROOT = Path(__file__).resolve().parent.parent


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Export local Telegram AI and personal memory tables to separate JSON files."
    )
    parser.add_argument(
        "--database-path",
        default=str(
            memory.database_path()
            if TELEGRAM_AI_MEMORY_DB_PATH
            else memory.DEFAULT_DATABASE_PATH
        ),
        help="Source SQLite file (defaults to .env or the standard database path).",
    )
    parser.add_argument(
        "--output-dir",
        default=str(REPOSITORY_ROOT / "data" / "backups"),
        help="Directory for the private JSON snapshots.",
    )
    args = parser.parse_args()

    database_path = Path(args.database_path).expanduser()
    personal_memory.initialize(database_path)
    counts = memory.export_json_files(
        database_path,
        Path(args.output_dir).expanduser(),
    )
    output_directory = Path(args.output_dir).expanduser().resolve()
    print(f"JSON snapshots exported to {output_directory}:")
    output_names = {
        "groups": "group",
        "messages": "message",
        "insights": "insight",
        "memories": "memory",
    }
    for name, count in counts.items():
        print(f"  {output_names[name]}.json: {count} records")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
