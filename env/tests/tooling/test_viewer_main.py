"""Fake-tool rehearsal of scripts/viewer-main.sh; no viewer, pnpm or game processes."""

from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[3] / "scripts"


def _git(cwd: Path, *args: str) -> None:
    subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True)


def test_viewer_script_delegates_to_the_locked_runtime_owner(tmp_path: Path) -> None:
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
    binary = tmp_path / "bin"
    binary.mkdir()
    uv = binary / "uv"
    output = tmp_path / "argv"
    uv.write_text('#!/bin/sh\nprintf "%s\\n" "$@" > "$OWNED_ARGV"\n')
    uv.chmod(0o755)
    result = subprocess.run(
        ["/bin/bash", str(scripts / "viewer-main.sh")],
        cwd=root,
        env={
            **os.environ,
            "PATH": str(binary) + os.pathsep + os.environ["PATH"],
            "OWNED_ARGV": str(output),
        },
        capture_output=True,
        text=True,
        timeout=30,
    )
    assert result.returncode == 0, (result.stdout, result.stderr)
    assert output.read_text().splitlines() == [
        "run",
        "--project",
        str(root / "env"),
        "python",
        "-m",
        "pokebench_env.current_runtime",
        "viewer",
        "--root",
        str(root),
    ]
