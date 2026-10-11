import os
import shutil
import subprocess
import time
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
HOOK = REPO_ROOT / ".githooks" / "pre-commit"
ACTIVE_BODY = Path("docs/worklogs/active/2026-01-01_example.md")


def git(repo: Path, *args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", *args], cwd=repo, capture_output=True, text=True, check=False
    )


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    assert HOOK.is_file(), f"missing hook at {HOOK}"
    root = tmp_path / "repo with spaces"
    root.mkdir()
    git(root, "init", "-q", "-b", "main")
    git(root, "config", "user.name", "test")
    git(root, "config", "user.email", "test@example.com")
    hooks = root / ".githooks"
    hooks.mkdir()
    shutil.copy2(HOOK, hooks / "pre-commit")
    git(root, "config", "core.hooksPath", ".githooks")
    (root / "README.md").write_text("seed\n")
    git(root, "add", "README.md")
    assert git(root, "commit", "-q", "-m", "seed").returncode == 0
    return root


def age(path: Path, seconds: int) -> None:
    past = time.time() - seconds
    os.utime(path, (past, past))


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
    age(body, 3600)
    stage(repo, "a.txt")
    result = git(repo, "commit", "-q", "-m", "a")
    assert result.returncode != 0
    assert "worklog" in result.stderr.lower()


def test_touched_active_body_allows_commit(repo: Path) -> None:
    body = active_worklog(repo)
    age(body, 3600)
    time.sleep(1.1)
    body.write_text("# worklog\n- [x] updated\n")
    stage(repo, "a.txt")
    result = git(repo, "commit", "-q", "-m", "a")
    assert result.returncode == 0, result.stderr


def test_stale_root_pointer_blocks_commit(repo: Path) -> None:
    pointer = repo / "WORKLOG.md"
    pointer.write_text("Active body: elsewhere\n")
    age(pointer, 3600)
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


def test_deleting_a_tracked_asset_is_allowed(repo: Path) -> None:
    stage(repo, "legacy.sav")
    subprocess.run(
        ["git", "-c", "core.hooksPath=/dev/null", "commit", "-q", "-m", "legacy"],
        cwd=repo,
        check=True,
    )
    assert git(repo, "rm", "-q", "legacy.sav").returncode == 0
    result = git(repo, "commit", "-q", "-m", "remove")
    assert result.returncode == 0, result.stderr
