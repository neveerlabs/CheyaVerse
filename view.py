#!/usr/bin/env python3
from __future__ import annotations

import os
import sys
import json
import time
import base64
import hashlib
import urllib.request
import urllib.error
import urllib.parse
from pathlib import Path

OWNER = ""
REPO = ""
BRANCH = ""

SCRIPT_PATH = Path(__file__).resolve()
SCRIPT_DIR = SCRIPT_PATH.parent
SELF_NAME = SCRIPT_PATH.name
CONFIG_FILE = SCRIPT_DIR / ".viewrc"

SKIP_DIRS = {
    ".git", "__pycache__", ".venv", "venv", "env",
    "node_modules", ".idea", ".vscode", ".pytest_cache",
    ".mypy_cache", ".ruff_cache", "dist", "build", ".next", "target",
}
SKIP_FILES = {".DS_Store", "Thumbs.db", "desktop.ini", ".viewrc"}
SKIP_EXTS = {".pyc", ".pyo", ".pyd", ".so", ".dylib", ".dll", ".exe"}


class C:
    R = "\033[0m"
    B = "\033[1m"
    D = "\033[2m"
    RED = "\033[91m"
    GRN = "\033[92m"
    YEL = "\033[93m"
    BLU = "\033[94m"
    MAG = "\033[95m"
    CYN = "\033[96m"
    WHT = "\033[97m"


class GitHubError(Exception):
    pass


def clear():
    if sys.stdout.isatty():
        sys.stdout.write("\033[2J\033[H")
        sys.stdout.flush()


def hr(n=56):
    print(f"  {C.D}{'─' * n}{C.R}")


def default_repo_name():
    return SCRIPT_DIR.name


def should_skip_dir(name):
    return name in SKIP_DIRS


def should_skip_file(name):
    if name in SKIP_FILES:
        return True
    if name.endswith((".tmp", ".bak", ".swp", ".swo", "~")):
        return True
    if Path(name).suffix.lower() in SKIP_EXTS:
        return True
    return False


def prompt(msg):
    try:
        return input(f"  {C.CYN}❯{C.R} {msg}").strip()
    except (KeyboardInterrupt, EOFError):
        print()
        return ""


def load_config():
    global OWNER, REPO, BRANCH
    try:
        if CONFIG_FILE.exists():
            data = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
            OWNER = (data.get("owner") or "").strip()
            REPO = (data.get("repo") or "").strip()
            BRANCH = (data.get("branch") or "").strip()
    except Exception:
        pass


def save_config(owner, repo, branch):
    global OWNER, REPO, BRANCH
    OWNER = owner or ""
    REPO = repo or ""
    BRANCH = branch or ""
    try:
        CONFIG_FILE.write_text(
            json.dumps(
                {"owner": OWNER, "repo": REPO, "branch": BRANCH},
                indent=2,
            ),
            encoding="utf-8",
        )
        return True
    except Exception:
        return False


def api_get(url):
    req = urllib.request.Request(url)
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("User-Agent", "view.py")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            data = r.read()
    except urllib.error.HTTPError as e:
        if e.code == 404:
            raise GitHubError("Repo not found or private (404).")
        if e.code == 403:
            raise GitHubError("Rate limit reached or access denied (403).")
        if e.code == 401:
            raise GitHubError("Authentication required (401).")
        raise GitHubError(f"HTTP {e.code}: {e.reason}")
    except urllib.error.URLError as e:
        raise GitHubError(f"Connection failed: {e.reason}")
    try:
        return json.loads(data.decode("utf-8"))
    except Exception:
        raise GitHubError("Invalid response from GitHub.")


def detect_default_branch(owner, repo):
    info = api_get(f"https://api.github.com/repos/{owner}/{repo}")
    return info.get("default_branch", "main")


def fetch_remote_tree(owner, repo, branch):
    url = (
        f"https://api.github.com/repos/{owner}/{repo}"
        f"/git/trees/{urllib.parse.quote(branch)}?recursive=1"
    )
    data = api_get(url)
    out = {}
    for item in data.get("tree", []):
        if item.get("type") == "blob":
            out[item["path"]] = item["sha"]
    return out


def fetch_blob(owner, repo, sha):
    try:
        data = api_get(f"https://api.github.com/repos/{owner}/{repo}/git/blobs/{sha}")
    except GitHubError:
        return None
    content = data.get("content")
    encoding = data.get("encoding")
    if not content:
        return None
    if encoding == "base64":
        try:
            return base64.b64decode(content)
        except Exception:
            return None
    return content.encode("utf-8", errors="replace")


def blob_sha(content):
    header = f"blob {len(content)}\0".encode()
    return hashlib.sha1(header + content).hexdigest()


def normalize_eol(content):
    return content.replace(b"\r\n", b"\n").replace(b"\r", b"\n")


def content_equal(a, b):
    if a == b:
        return True
    if normalize_eol(a) == normalize_eol(b):
        return True
    try:
        if a.decode("utf-8").strip() == b.decode("utf-8").strip():
            return True
    except Exception:
        pass
    try:
        if a.decode("utf-8", errors="replace").strip() == b.decode("utf-8", errors="replace").strip():
            return True
    except Exception:
        pass
    return False


def scan_local(root):
    out = {}
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = sorted(d for d in dirnames if not should_skip_dir(d))
        for fname in filenames:
            if should_skip_file(fname):
                continue
            full = Path(dirpath) / fname
            try:
                rel = full.relative_to(root).as_posix()
            except Exception:
                continue
            if rel == SELF_NAME:
                continue
            out[rel] = full
    return out


def collect_folders(paths):
    folders = set()
    for p in paths:
        parts = p.split("/")
        for i in range(1, len(parts)):
            folders.add("/".join(parts[:i]))
    return folders


def status_badge(s):
    if s == 0:
        return f"{C.GRN}{C.B}[0]{C.R}"
    return f"{C.RED}{C.B}[1]{C.R}"


def folder_status(node):
    for v in node.values():
        if isinstance(v, dict):
            if folder_status(v) == 1:
                return 1
        elif v == 1:
            return 1
    return 0


def collect_lines(node, plain_prefix="", colored_prefix=""):
    lines = []
    items = sorted(node.items(), key=lambda kv: (isinstance(kv[1], int), kv[0].lower()))
    n = len(items)
    for i, (name, val) in enumerate(items):
        last = i == n - 1
        connector = "└── " if last else "├── "
        connector_c = f"{C.D}{connector}{C.R}"
        next_plain = plain_prefix + ("    " if last else "│   ")
        next_colored = colored_prefix + f"{C.D}{'    ' if last else '│   '}{C.R}"
        if isinstance(val, dict):
            plain = f"{plain_prefix}{connector}{name}/"
            colored = f"{colored_prefix}{connector_c}{C.BLU}{C.B}{name}/{C.R}"
            lines.append((plain, colored, folder_status(val)))
            lines.extend(collect_lines(val, next_plain, next_colored))
        else:
            plain = f"{plain_prefix}{connector}{name}"
            colored = f"{colored_prefix}{connector_c}{name}"
            lines.append((plain, colored, val))
    return lines


def build_tree(results):
    tree = {}
    for path, status in results:
        parts = path.split("/")
        node = tree
        for part in parts[:-1]:
            node = node.setdefault(part, {})
        node[parts[-1]] = status
    return tree


def do_compare():
    owner = OWNER
    repo = REPO or default_repo_name()
    branch = BRANCH

    if not owner:
        clear()
        print(f"  {C.RED}✗ Owner not set.{C.R}")
        time.sleep(1.0)
        return

    clear()
    print(f"  {C.D}→ Connecting to GitHub...{C.R}")

    try:
        if not branch:
            branch = detect_default_branch(owner, repo)
        remote = fetch_remote_tree(owner, repo, branch)
    except GitHubError as e:
        clear()
        print(f"  {C.RED}✗ {e}{C.R}")
        print()
        print(f"  {C.D}Owner  : {owner}{C.R}")
        print(f"  {C.D}Repo   : {repo}{C.R}")
        if branch:
            print(f"  {C.D}Branch : {branch}{C.R}")
        print()
        try:
            input(f"  {C.D}Press enter to return...{C.R}")
        except (KeyboardInterrupt, EOFError):
            pass
        return

    local = scan_local(SCRIPT_DIR)
    all_paths = sorted(set(local) | set(remote))
    results = []
    to_check = []

    for p in all_paths:
        in_l = p in local
        in_r = p in remote
        if in_l and in_r:
            try:
                lb = local[p].read_bytes()
                ls = blob_sha(lb)
            except Exception:
                results.append((p, 1))
                continue
            if ls == remote[p]:
                results.append((p, 0))
            else:
                to_check.append((p, lb, remote[p]))
        else:
            results.append((p, 1))

    total = len(to_check)
    for i, (p, lb, rsha) in enumerate(to_check, 1):
        if total > 3:
            sys.stdout.write(f"\r\033[K  {C.D}Checking {i}/{total}  {p[:44]}{C.R}")
            sys.stdout.flush()
        rb = fetch_blob(owner, repo, rsha)
        if rb is None:
            results.append((p, 1))
        elif content_equal(lb, rb):
            results.append((p, 0))
        else:
            results.append((p, 1))
    if total > 3:
        sys.stdout.write("\r\033[K")
        sys.stdout.flush()

    results.sort(key=lambda x: x[0])

    local_folders = collect_folders(local.keys())
    remote_folders = collect_folders(remote.keys())
    all_folders = local_folders | remote_folders
    diff_file_count = sum(1 for _, s in results if s == 1)
    diff_folder_count = 0
    for f in all_folders:
        prefix = f + "/"
        if any(p.startswith(prefix) and s == 1 for p, s in results):
            diff_folder_count += 1

    clear()

    print(f"  {C.WHT}{C.B}{owner}/{repo}{C.R}  {C.D}({branch}){C.R}")
    print(f"  {C.D}local · {SCRIPT_DIR}{C.R}")
    print()
    hr()
    print(f"  {C.WHT}{len(local):>3}{C.R} files · {C.WHT}{len(local_folders):>3}{C.R} folders   {C.D}(local){C.R}")
    print(f"  {C.WHT}{len(remote):>3}{C.R} files · {C.WHT}{len(remote_folders):>3}{C.R} folders   {C.D}(remote){C.R}")
    print(f"  {C.RED}{diff_file_count:>3}{C.R} files · {C.RED}{diff_folder_count:>3}{C.R} folders   {C.D}(different){C.R}")
    hr()
    print()

    tree = build_tree(results)
    lines = collect_lines(tree, plain_prefix="  ", colored_prefix="  ")

    print(f"  {C.B}{C.WHT}{repo}/{C.R}")
    if lines:
        max_w = max(len(l[0]) for l in lines)
        for plain, colored, status in lines:
            pad = " " * (max_w - len(plain))
            print(f"{colored}{pad}  {status_badge(status)}")
    else:
        print(f"  {C.D}(empty){C.R}")

    print()
    try:
        input(f"  {C.D}Press enter to return...{C.R}")
    except (KeyboardInterrupt, EOFError):
        pass


def change_owner():
    clear()
    print(f"  {C.YEL}{C.B}CHANGE OWNER{C.R}")
    hr()
    cur = OWNER
    print(f"  {C.D}Current : {cur or '(not set)'}{C.R}")
    print(f"  {C.D}Enter = keep unchanged{C.R}\n")
    val = prompt("Owner GitHub : ")
    if not val:
        print(f"\n  {C.D}No changes.{C.R}")
        time.sleep(1.0)
        return
    ok = save_config(val, REPO, BRANCH)
    if ok:
        print(f"\n  {C.GRN}✓ Owner saved to .viewrc{C.R}")
    else:
        print(f"\n  {C.YEL}⚠ Failed to write config, kept in memory.{C.R}")
    time.sleep(1.2)


def change_repo():
    clear()
    print(f"  {C.YEL}{C.B}CHANGE REPO{C.R}")
    hr()
    cur_repo = REPO or default_repo_name()
    cur_branch = BRANCH
    print(f"  {C.D}Current : {cur_repo}  ·  {cur_branch or 'auto'}{C.R}")
    print(f"  {C.D}Enter = keep unchanged{C.R}\n")
    new_repo = prompt(f"Repo name  [{cur_repo}] : ")
    if not new_repo:
        new_repo = cur_repo
    new_branch = prompt(f"Branch     [{cur_branch or 'auto'}] : ")
    if not new_branch:
        new_branch = cur_branch
    ok = save_config(OWNER, new_repo, new_branch)
    if ok:
        print(f"\n  {C.GRN}✓ Repo saved to .viewrc{C.R}")
    else:
        print(f"\n  {C.YEL}⚠ Failed to write config, kept in memory.{C.R}")
    time.sleep(1.2)


def show_menu():
    clear()
    owner = OWNER or f"{C.RED}(not set){C.R}"
    repo = REPO or default_repo_name()

    print(f"  {C.D}Local      {C.R} {SCRIPT_DIR}")
    print(f"  {C.D}Repository {C.R} {C.WHT}{repo}{C.R}")
    print(f"  {C.D}Owner      {C.R} {C.WHT}{owner}{C.R}")
    print()
    hr()
    print(f"  {C.WHT}1{C.R}  run")
    print(f"  {C.WHT}2{C.R}  change owner")
    print(f"  {C.WHT}3{C.R}  change repo")
    print(f"  {C.WHT}4{C.R}  exit")
    hr()


def pick():
    try:
        raw = input(f"  {C.CYN}❯{C.R} choose : ").strip()
    except (KeyboardInterrupt, EOFError):
        print()
        return 4
    try:
        return int(raw)
    except ValueError:
        return -1


def main():
    load_config()

    if not OWNER:
        clear()
        print(f"  {C.YEL}{C.B}INITIAL SETUP{C.R}")
        hr()
        print(f"  {C.D}Owner GitHub not set.{C.R}")
        print(f"  {C.D}Config will be saved to: {C.WHT}.viewrc{C.R}")
        print(f"  {C.D}Repo default: {C.WHT}{default_repo_name()}{C.R}\n")
        val = prompt("Owner GitHub : ")
        if not val:
            print(f"\n  {C.RED}✗ Owner is required. Exiting.{C.R}")
            return
        save_config(val, REPO, BRANCH)
        time.sleep(0.6)

    while True:
        show_menu()
        choice = pick()

        try:
            if choice == 1:
                do_compare()
            elif choice == 2:
                change_owner()
            elif choice == 3:
                change_repo()
            elif choice == 4:
                clear()
                print(f"\n  {C.D}bye 👋{C.R}\n")
                return
            else:
                print(f"  {C.RED}invalid choice{C.R}")
                time.sleep(0.6)
        except KeyboardInterrupt:
            continue
        except Exception as e:
            clear()
            print(f"  {C.RED}✗ Error: {e}{C.R}")
            time.sleep(1.5)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print(f"\n  {C.D}stopped.{C.R}")
    except Exception as e:
        print(f"\n  {C.RED}Fatal error: {e}{C.R}")
        sys.exit(1)
