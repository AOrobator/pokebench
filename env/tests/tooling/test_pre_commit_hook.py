import os
import shutil
import subprocess
import time
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
HOOK = REPO_ROOT / ".githooks" / "pre-commit"
ACTIVE_BODY = Path("docs/worklogs/active/2026-01-01_example.md")
GIT_ENV = {**os.environ, "GIT_CONFIG_GLOBAL": os.devnull, "GIT_CONFIG_NOSYSTEM": "1"}


def git(repo: Path, *args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", *args], cwd=repo, env=GIT_ENV, capture_output=True, text=True, check=False
    )


def make_repo(tmp_path: Path, seed: dict[str, str] | None) -> Path:
    """Create a repo whose seed commit (if any) predates the hook being installed."""
    assert HOOK.is_file(), f"missing hook at {HOOK}"
    root = tmp_path / "repo with spaces"
    root.mkdir()
    git(root, "init", "-q", "-b", "main")
    git(root, "config", "user.name", "test")
    git(root, "config", "user.email", "test@example.com")
    if seed:
        for name, content in seed.items():
            target = root / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(content)
            assert git(root, "add", "-f", name).returncode == 0
        assert git(root, "commit", "-q", "-m", "seed").returncode == 0
    hooks = root / ".githooks"
    hooks.mkdir()
    shutil.copy2(HOOK, hooks / "pre-commit")
    git(root, "config", "core.hooksPath", ".githooks")
    return root


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    return make_repo(tmp_path, {"README.md": "seed\n"})


def shift_mtime(path: Path, seconds: int) -> None:
    when = time.time() + seconds
    os.utime(path, (when, when))


def stage(repo: Path, name: str, content: str = "x\n") -> None:
    target = repo / name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content)
    assert git(repo, "add", "-f", name).returncode == 0


def active_worklog(repo: Path) -> Path:
    body = repo / ACTIVE_BODY
    body.parent.mkdir(parents=True, exist_ok=True)
    body.write_text("# worklog\n")
    return body


def test_no_worklog_allows_ordinary_commit(repo: Path) -> None:
    stage(repo, "a.txt")
    result = git(repo, "commit", "-q", "-m", "a")
    assert result.returncode == 0, result.stderr


def test_stale_active_body_blocks_commit(repo: Path) -> None:
    body = active_worklog(repo)
    shift_mtime(body, -3600)
    stage(repo, "a.txt")
    result = git(repo, "commit", "-q", "-m", "a")
    assert result.returncode != 0
    assert "worklog" in result.stderr.lower()


def test_touched_active_body_allows_commit(repo: Path) -> None:
    body = active_worklog(repo)
    shift_mtime(body, -3600)
    body.write_text("# worklog\n- [x] updated\n")
    shift_mtime(body, 5)
    stage(repo, "a.txt")
    result = git(repo, "commit", "-q", "-m", "a")
    assert result.returncode == 0, result.stderr


def test_stale_root_pointer_blocks_commit(repo: Path) -> None:
    pointer = repo / "WORKLOG.md"
    pointer.write_text("Active body: elsewhere\n")
    shift_mtime(pointer, -3600)
    stage(repo, "a.txt")
    result = git(repo, "commit", "-q", "-m", "a")
    assert result.returncode != 0


@pytest.mark.parametrize(
    "name",
    [
        "rom.gba",
        "roms/Pokemon - Emerald (USA, Europe).gba",
        "save.sav",
        "red.gb",
        "crystal.GBC",
        "runs/x/state.ss1",
        "runs/x/split.state",
    ],
)
def test_game_asset_is_rejected_even_with_fresh_worklog(repo: Path, name: str) -> None:
    active_worklog(repo)
    stage(repo, name)
    result = git(repo, "commit", "-q", "-m", "asset")
    assert result.returncode != 0
    assert "rom" in result.stderr.lower() or "game asset" in result.stderr.lower()
    assert name in result.stderr


def test_game_asset_is_rejected_without_worklog(repo: Path) -> None:
    stage(repo, "emerald.gba")
    result = git(repo, "commit", "-q", "-m", "asset")
    assert result.returncode != 0


def test_similar_names_are_not_rejected(repo: Path) -> None:
    stage(repo, "docs/gba-notes.md")
    stage(repo, "src/savestate.ts")
    result = git(repo, "commit", "-q", "-m", "ok")
    assert result.returncode == 0, result.stderr


def test_deleting_a_tracked_asset_is_allowed(tmp_path: Path) -> None:
    repo = make_repo(tmp_path, {"legacy.sav": "x\n"})
    assert git(repo, "rm", "-q", "legacy.sav").returncode == 0
    result = git(repo, "commit", "-q", "-m", "remove")
    assert result.returncode == 0, result.stderr


def test_renaming_into_an_asset_name_is_rejected(tmp_path: Path) -> None:
    repo = make_repo(tmp_path, {"notes.txt": "x\n"})
    assert git(repo, "mv", "notes.txt", "rom.gba").returncode == 0
    result = git(repo, "commit", "-q", "-m", "rename")
    assert result.returncode != 0
    assert "rom.gba" in result.stderr


def test_first_commit_with_active_worklog_is_allowed(tmp_path: Path) -> None:
    repo = make_repo(tmp_path, None)
    active_worklog(repo)
    stage(repo, "a.txt")
    result = git(repo, "commit", "-q", "-m", "first")
    assert result.returncode == 0, result.stderr


def test_freshest_of_pointer_and_body_decides(repo: Path) -> None:
    body = active_worklog(repo)
    shift_mtime(body, -3600)
    pointer = repo / "WORKLOG.md"
    pointer.write_text("Active body: docs/worklogs/active/2026-01-01_example.md\n")
    shift_mtime(pointer, 5)
    stage(repo, "a.txt")
    result = git(repo, "commit", "-q", "-m", "a")
    assert result.returncode == 0, result.stderr


GNU_STAT_SHIM = """#!/bin/bash
# Mimic GNU coreutils: -f means "filesystem status" (prints a report, then fails on '%m').
if [ "$1" = "-f" ]; then
    echo "  File: \\"$3\\""
    echo "    ID: 0        Namelen: 255     Type: apfs"
    exit 1
fi
if [ "$1" = "-c" ] && [ "$2" = "%Y" ]; then
    exec /usr/bin/stat -f %m "$3"
fi
exec /usr/bin/stat "$@"
"""


@pytest.mark.parametrize(("offset", "allowed"), [(5, True), (-3600, False)])
def test_freshness_works_with_gnu_stat(
    repo: Path, tmp_path: Path, offset: int, allowed: bool
) -> None:
    shim_dir = tmp_path / "gnubin"
    shim_dir.mkdir()
    shim = shim_dir / "stat"
    shim.write_text(GNU_STAT_SHIM)
    shim.chmod(0o755)
    body = active_worklog(repo)
    shift_mtime(body, offset)
    stage(repo, "a.txt")
    result = subprocess.run(
        ["git", "commit", "-q", "-m", "a"],
        cwd=repo,
        env={**GIT_ENV, "PATH": f"{shim_dir}{os.pathsep}{os.environ['PATH']}"},
        capture_output=True,
        text=True,
        check=False,
    )
    assert (result.returncode == 0) is allowed, result.stderr
    if not allowed:
        assert "worklog" in result.stderr.lower()


def archive_repo(tmp_path: Path, archived_name: str = "2026-01-02_done.md") -> tuple[Path, Path]:
    """A repo with a stale unrelated active worklog and a committed active body to archive."""
    active = f"docs/worklogs/active/{archived_name}"
    repo = make_repo(tmp_path, {active: "# done\n", str(ACTIVE_BODY): "# other\n"})
    shift_mtime(repo / ACTIVE_BODY, -3600)
    return repo, repo / active


def test_archiving_an_updated_worklog_is_allowed_while_others_are_stale(tmp_path: Path) -> None:
    repo, body = archive_repo(tmp_path)
    archived = repo / "docs/worklogs/2026-01-02_done.md"
    assert (
        git(repo, "mv", str(body.relative_to(repo)), str(archived.relative_to(repo))).returncode
        == 0
    )
    archived.write_text("# done\n- archived\n")
    shift_mtime(archived, 5)
    assert git(repo, "add", str(archived.relative_to(repo))).returncode == 0
    result = git(repo, "commit", "-q", "-m", "archive")
    assert result.returncode == 0, result.stderr


def test_archiving_without_updating_the_archived_body_is_blocked(tmp_path: Path) -> None:
    repo, body = archive_repo(tmp_path)
    archived = repo / "docs/worklogs/2026-01-02_done.md"
    assert (
        git(repo, "mv", str(body.relative_to(repo)), str(archived.relative_to(repo))).returncode
        == 0
    )
    shift_mtime(archived, -3600)
    result = git(repo, "commit", "-q", "-m", "archive")
    assert result.returncode != 0
    assert "worklog" in result.stderr.lower()


@pytest.mark.parametrize(
    "destination", ["docs/notes/2026-01-02_done.md", "docs/worklogs/x/2026-01-02_done.md"]
)
def test_moving_a_worklog_anywhere_but_the_archive_is_blocked(
    tmp_path: Path, destination: str
) -> None:
    repo, body = archive_repo(tmp_path)
    (repo / destination).parent.mkdir(parents=True, exist_ok=True)
    assert git(repo, "mv", str(body.relative_to(repo)), destination).returncode == 0
    shift_mtime(repo / destination, 5)
    result = git(repo, "commit", "-q", "-m", "move")
    assert result.returncode != 0


def test_adding_a_new_archive_file_is_not_an_archive(tmp_path: Path) -> None:
    repo, _ = archive_repo(tmp_path)
    stage(repo, "docs/worklogs/2026-01-03_new.md", "# new\n")
    shift_mtime(repo / "docs/worklogs/2026-01-03_new.md", 5)
    result = git(repo, "commit", "-q", "-m", "add")
    assert result.returncode != 0


def test_staged_archive_with_missing_working_copy_fails_closed(tmp_path: Path) -> None:
    repo = make_repo(tmp_path, {"docs/worklogs/active/2026-01-02_done.md": "# done\n"})
    archived = repo / "docs/worklogs/2026-01-02_done.md"
    moved = git(
        repo, "mv", "docs/worklogs/active/2026-01-02_done.md", "docs/worklogs/2026-01-02_done.md"
    )
    assert moved.returncode == 0
    archived.unlink()
    blocked = git(repo, "commit", "-q", "-m", "archive")
    assert blocked.returncode != 0
    staged = git(repo, "diff", "--cached", "--name-only", "--no-renames").stdout.split()
    assert staged == ["docs/worklogs/2026-01-02_done.md", "docs/worklogs/active/2026-01-02_done.md"]
    archived.write_text("# done\n")
    shift_mtime(archived, 5)
    result = git(repo, "commit", "-q", "-m", "archive")
    assert result.returncode == 0, result.stderr
