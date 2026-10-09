import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

import backup


class BackupTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        (self.root / ".git" / "objects").mkdir(parents=True)
        (self.root / ".git" / "config").write_text("git config", encoding="utf-8")
        (self.root / "dashboard" / "node_modules").mkdir(parents=True)
        (self.root / "dashboard" / "node_modules" / "junk.js").write_text(
            "generated", encoding="utf-8"
        )
        (self.root / "data").mkdir()
        (self.root / ".env").write_text("SECRET=value", encoding="utf-8")
        (self.root / "data" / "memory.sqlite3").write_bytes(b"sqlite data")
        (self.root / "main.py").write_text("print('ok')", encoding="utf-8")
        (self.root / "linked-file").symlink_to("main.py")
        (self.root / "linked-directory").symlink_to("data", target_is_directory=True)
        self.archive_path = self.root / "CheyaVerse-test.zip"
        self.root_patch = patch.object(backup, "PROJECT_ROOT", self.root)
        self.script_patch = patch.object(
            backup, "SCRIPT_PATH", self.root / "backup.py"
        )
        self.root_patch.start()
        self.script_patch.start()

    def tearDown(self) -> None:
        self.script_patch.stop()
        self.root_patch.stop()
        self.temp_dir.cleanup()

    def test_archive_includes_git_secrets_and_sqlite_but_excludes_generated_files(self) -> None:
        backup.create_archive("test", set())

        with zipfile.ZipFile(self.archive_path) as archive:
            names = set(archive.namelist())

        self.assertIn(".git/config", names)
        self.assertIn(".env", names)
        self.assertIn("data/memory.sqlite3", names)
        self.assertIn("main.py", names)
        self.assertNotIn("dashboard/node_modules/junk.js", names)
        self.assertNotIn("CheyaVerse-test.zip", names)

    def test_archive_preserves_symlinks_as_links(self) -> None:
        backup.create_archive("test", set())

        with zipfile.ZipFile(self.archive_path) as archive:
            file_link = archive.getinfo("linked-file")
            directory_link = archive.getinfo("linked-directory")
            file_target = archive.read(file_link).decode("utf-8")
            directory_target = archive.read(directory_link).decode("utf-8")

        self.assertEqual(file_target, "main.py")
        self.assertEqual(directory_target, "data")
        self.assertTrue((file_link.external_attr >> 16) & 0o120000)


if __name__ == "__main__":
    unittest.main()
