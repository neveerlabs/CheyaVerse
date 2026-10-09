#!/usr/bin/env python3
"""Create a ZIP archive of this project while skipping common generated files."""

from __future__ import annotations

import fnmatch
import os
import re
import stat
import sys
import zipfile
from pathlib import Path, PurePosixPath


PROJECT_ROOT = Path(__file__).resolve().parent
SCRIPT_PATH = Path(__file__).resolve()
EXCLUDED_DIRECTORY_NAMES = {
    ".hg",
    ".hypothesis",
    ".mypy_cache",
    ".nox",
    ".next",
    ".pytest_cache",
    ".ruff_cache",
    ".svn",
    ".tox",
    ".turbo",
    ".vercel",
    ".venv",
    ".cache",
    ".parcel-cache",
    "__pycache__",
    "build",
    "coverage",
    "dist",
    "node_modules",
    "out",
    "playwright-report",
    "test-results",
    "venv",
}
EXCLUDED_FILE_PATTERNS = {
    ".DS_Store",
    ".coverage",
    ".eslintcache",
    "Thumbs.db",
    "*.pyc",
    "*.pyo",
    "*.tsbuildinfo",
    "npm-debug.log*",
    "pnpm-debug.log*",
    "yarn-debug.log*",
    "yarn-error.log*",
}
VERSION_PATTERN = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,79}\Z")


def project_relative_path(path: Path) -> str:
    return path.relative_to(PROJECT_ROOT).as_posix()


def ask_additional_exclusions() -> set[str]:
    while True:
        answer = input("Ada file/folder tambahan yang tidak ikut dibackup? (y/n): ")
        answer = answer.strip().lower()
        if answer in {"n", "no", "tidak", "t"}:
            return set()
        if answer in {"y", "yes", "ya"}:
            break
        print("Masukkan y untuk ya atau n untuk tidak.")

    while True:
        raw_paths = input(
            "Masukkan path relatif dari root project: "
        )
        requested = [item.strip().replace("\\", "/") for item in raw_paths.split(",")]
        if not requested or any(not item for item in requested):
            print("Masukkan setidaknya satu path; pisahkan beberapa path dengan koma.")
            continue

        exclusions: set[str] = set()
        errors: list[str] = []
        for item in requested:
            relative = PurePosixPath(item)
            if relative.is_absolute() or any(part in {"", ".", ".."} for part in relative.parts):
                errors.append(f"Path harus relatif dan berada di dalam project: {item}")
                continue

            candidate = PROJECT_ROOT.joinpath(*relative.parts)
            if not candidate.exists() and not candidate.is_symlink():
                errors.append(f"Path tidak ditemukan: {item}")
                continue
            if candidate.resolve(strict=False) != PROJECT_ROOT and PROJECT_ROOT not in candidate.resolve(strict=False).parents:
                errors.append(f"Path keluar dari root project: {item}")
                continue
            exclusions.add(relative.as_posix().rstrip("/"))

        if errors:
            for error in errors:
                print(error)
            continue
        return exclusions


def ask_version() -> str:
    while True:
        version = input("Masukkan catatan versi untuk nama file ZIP: ").strip()
        if VERSION_PATTERN.fullmatch(version):
            return version
        print(
            "Versi wajib 1-80 karakter, diawali huruf/angka, dan hanya boleh "
            "berisi huruf, angka, titik, garis bawah, atau tanda hubung."
        )


def is_excluded_directory(name: str) -> bool:
    return name in EXCLUDED_DIRECTORY_NAMES


def is_excluded_file(name: str) -> bool:
    return any(fnmatch.fnmatchcase(name, pattern) for pattern in EXCLUDED_FILE_PATTERNS)


def is_explicitly_excluded(relative_path: str, exclusions: set[str]) -> bool:
    return any(
        relative_path == excluded or relative_path.startswith(f"{excluded}/")
        for excluded in exclusions
    )


def collect_project_entries(exclusions: set[str]) -> tuple[list[Path], int]:
    included: list[Path] = []
    symlink_entries = 0

    for current, directory_names, file_names in os.walk(PROJECT_ROOT, followlinks=False):
        current_path = Path(current)
        relative_current = (
            "" if current_path == PROJECT_ROOT else project_relative_path(current_path)
        )

        kept_directories: list[str] = []
        for name in sorted(directory_names):
            directory = current_path / name
            relative = (
                f"{relative_current}/{name}" if relative_current else name
            )
            if is_explicitly_excluded(relative, exclusions):
                continue
            if directory.is_symlink():
                included.append(directory)
                symlink_entries += 1
            elif (
                not is_excluded_directory(name)
                and not is_explicitly_excluded(relative, exclusions)
            ):
                kept_directories.append(name)
                included.append(directory)
        directory_names[:] = kept_directories

        for name in sorted(file_names):
            path = current_path / name
            relative = f"{relative_current}/{name}" if relative_current else name
            if is_excluded_file(name) or is_explicitly_excluded(relative, exclusions) or (
                current_path == PROJECT_ROOT
                and fnmatch.fnmatchcase(name, "CheyaVerse-*.zip")
            ):
                continue
            if path.is_symlink():
                included.append(path)
                symlink_entries += 1
                continue
            included.append(path)

    return included, symlink_entries


def write_archive_entry(archive: zipfile.ZipFile, path: Path) -> None:
    relative = project_relative_path(path)
    if path.is_symlink():
        info = zipfile.ZipInfo(relative)
        info.create_system = 3
        info.external_attr = (stat.S_IFLNK | 0o777) << 16
        archive.writestr(info, os.readlink(path))
    elif path.is_dir():
        archive.writestr(f"{relative}/", "")
    else:
        archive.write(path, arcname=relative)


def create_archive(version: str, exclusions: set[str]) -> Path:
    archive_path = SCRIPT_PATH.with_name(f"CheyaVerse-{version}.zip")
    if archive_path.exists():
        raise FileExistsError(
            f"{archive_path.name} already exists; choose a different version "
            "to avoid overwriting an existing backup."
        )

    entries, symlink_entries = collect_project_entries(exclusions)
    archive_created = False
    try:
        with zipfile.ZipFile(
            archive_path,
            mode="x",
            compression=zipfile.ZIP_DEFLATED,
            compresslevel=6,
        ) as archive:
            archive_created = True
            for path in entries:
                write_archive_entry(archive, path)
    except Exception:
        if archive_created:
            archive_path.unlink(missing_ok=True)
        raise

    print(f"Backup selesai: {archive_path}")
    print(f"Jumlah file/folder yang dimasukkan: {len(entries)}")
    if exclusions:
        print("Path tambahan yang dikecualikan: " + ", ".join(sorted(exclusions)))
    if symlink_entries:
        print(f"Symlink yang disertakan sebagai tautan: {symlink_entries}")
    print("File/folder tersembunyi, termasuk .env dan database, tetap disertakan.")
    return archive_path


def main() -> int:
    try:
        exclusions = ask_additional_exclusions()
        version = ask_version()
        create_archive(version, exclusions)
    except (EOFError, KeyboardInterrupt):
        print("\nBackup dibatalkan.")
        return 1
    except Exception as error:
        print(f"Gagal membuat backup: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
