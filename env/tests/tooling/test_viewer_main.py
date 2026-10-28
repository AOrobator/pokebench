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


def test_frontier_helper_requires_an_explicit_verified_viewer(tmp_path: Path) -> None:
    helper = SCRIPTS.parent / ".claude/skills/pokebench-review/frontier.mjs"
    preload = tmp_path / "no-network.mjs"
    preload.write_text("globalThis.fetch=()=>{throw new Error('unexpected network request');};\n")
    env = {key: value for key, value in os.environ.items() if key != "POKEBENCH_VIEWER_WORKTREE"}
    result = subprocess.run(
        ["node", "--import", str(preload), str(helper)],
        env=env, capture_output=True, text=True, timeout=10,
    )
    assert result.returncode == 1, (result.stdout, result.stderr)
    assert result.stderr.strip() == (
        "Set POKEBENCH_VIEWER_WORKTREE to the verified tree serving 8790; no default viewer tree is assumed."
    ), (result.stdout, result.stderr)
    assert result.stdout == "", result.stdout


def test_frontier_helper_loads_the_explicit_owned_viewer(tmp_path: Path) -> None:
    helper = SCRIPTS.parent / ".claude/skills/pokebench-review/frontier.mjs"
    tree = tmp_path / "owned viewer with spaces"
    dist = tree / "packages/viewer/dist"
    dist.mkdir(parents=True)
    (tree / "package.json").write_text('{"type":"module"}')
    (dist / "frontier.js").write_text(
        "console.log('owned viewer imported');\n"
        "export const FRONTIER_MILESTONES=[{id:'CLOCK_SET'}];\n"
        "export const frontierReferences=()=>({best:null,human:null});\n"
    )
    (dist / "workbench-data.js").write_text(
        "export const parseWorkbench=value=>{if(value.owner!=='owned')throw Error('foreign data');return value;};\n"
    )
    preload = tmp_path / "owned-fetch.mjs"
    preload.write_text(
        "globalThis.fetch=async url=>{if(url!=='http://127.0.0.1:8790/api/workbench')throw Error('foreign URL');"
        "return {ok:true,json:async()=>({owner:'owned',runs:[]})};};\n"
    )
    result = subprocess.run(
        ["node", "--import", str(preload), str(helper)],
        env={**os.environ,"POKEBENCH_VIEWER_WORKTREE":str(tree)},
        capture_output=True, text=True, timeout=10,
    )
    assert result.returncode == 0, (result.stdout, result.stderr)
    assert result.stderr == "", result.stderr
    assert result.stdout.startswith("owned viewer imported\n## best valid new-game run:"), result.stdout
    assert "## human reference (viewer frontierReferences)\nunavailable" in result.stdout, result.stdout
