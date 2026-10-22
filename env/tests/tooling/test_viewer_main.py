"""Fake-tool rehearsal of scripts/viewer-main.sh; no viewer, pnpm or game processes."""

from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[3] / "scripts"


def _git(cwd: Path, *args: str) -> None:
    subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True)


def test_viewer_tree_shares_the_main_checkout_venv(tmp_path: Path) -> None:
    root = tmp_path / "root"
    (root / "env").mkdir(parents=True)
    (root / "env/keep").write_text("")
    (root / ".gitignore").write_text(".venv/\n")
    _git(root, "init", "-q", "-b", "main")
    _git(root, "add", ".")
    _git(root, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "init")
    (root / "env/.venv/bin").mkdir(parents=True)
    scripts = root / "scripts"
    scripts.mkdir()
    shutil.copy(SCRIPTS / "viewer-main.sh", scripts / "viewer-main.sh")
    restart = scripts / "viewer-restart.sh"
    restart.write_text("#!/bin/sh\nexit 0\n")
    restart.chmod(0o755)
    binary = tmp_path / "bin"
    binary.mkdir()
    pnpm = binary / "pnpm"
    pnpm.write_text("#!/bin/sh\nexit 0\n")
    pnpm.chmod(0o755)
    tree = tmp_path / "tree"
    env = {
        **os.environ,
        "PATH": str(binary) + os.pathsep + os.environ["PATH"],
        "POKEBENCH_VIEWER_WORKTREE": str(tree),
    }
    result = subprocess.run(
        ["/bin/bash", str(scripts / "viewer-main.sh")],
        cwd=root,
        env=env,
        capture_output=True,
        text=True,
        timeout=30,
    )
    assert result.returncode == 0, (result.stdout, result.stderr)
    venv = tree / "env/.venv"
    assert venv.is_symlink()
    assert venv.resolve() == (root / "env/.venv").resolve()
