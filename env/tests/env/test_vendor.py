import subprocess
from pathlib import Path

import pytest

from pokebench_env.vendor import VENDOR_PIN, VendorError, check_vendor

GIT_ENV = {"GIT_CONFIG_GLOBAL": "/dev/null", "GIT_CONFIG_NOSYSTEM": "1", "PATH": "/usr/bin:/bin"}


def git(repo: Path, *args: str) -> str:
    return subprocess.run(
        ["git", *args], cwd=repo, env=GIT_ENV, capture_output=True, text=True, check=True
    ).stdout.strip()


@pytest.fixture
def vendor_repo(tmp_path: Path) -> tuple[Path, str]:
    repo = tmp_path / "vendor dir"
    repo.mkdir()
    git(repo, "init", "-q", "-b", "main")
    git(repo, "config", "user.name", "t")
    git(repo, "config", "user.email", "t@example.com")
    (repo / ".gitignore").write_text("*.gba\n")
    (repo / "app.py").write_text("print('hi')\n")
    git(repo, "add", ".")
    git(repo, "commit", "-q", "-m", "seed")
    return repo, git(repo, "rev-parse", "HEAD")


def test_pin_is_the_reviewed_continual_harness_commit() -> None:
    assert VENDOR_PIN == "bbab97ad73e460b7cd7c08527d10ced30cc03fbe"


def test_pinned_clean_tree_passes(vendor_repo: tuple[Path, str]) -> None:
    repo, head = vendor_repo
    check_vendor(repo, pin=head)


def test_ignored_runtime_files_do_not_dirty_the_tree(vendor_repo: tuple[Path, str]) -> None:
    repo, head = vendor_repo
    (repo / "rom.gba").symlink_to("/nonexistent/rom.gba")
    check_vendor(repo, pin=head)


def test_wrong_commit_fails(vendor_repo: tuple[Path, str]) -> None:
    repo, _ = vendor_repo
    with pytest.raises(VendorError, match="expected"):
        check_vendor(repo, pin="0" * 40)


def test_modified_tracked_file_fails(vendor_repo: tuple[Path, str]) -> None:
    repo, head = vendor_repo
    (repo / "app.py").write_text("print('patched')\n")
    with pytest.raises(VendorError, match="app.py"):
        check_vendor(repo, pin=head)


def test_untracked_file_fails(vendor_repo: tuple[Path, str]) -> None:
    repo, head = vendor_repo
    (repo / "patch.py").write_text("x = 1\n")
    with pytest.raises(VendorError, match="patch.py"):
        check_vendor(repo, pin=head)


def test_missing_checkout_fails(tmp_path: Path) -> None:
    with pytest.raises(VendorError, match="not a git checkout"):
        check_vendor(tmp_path / "absent", pin=VENDOR_PIN)
