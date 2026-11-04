import subprocess
from pathlib import Path

import pytest

from pokebench_env.vendor import VENDOR_PIN

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
