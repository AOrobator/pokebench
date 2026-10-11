"""Wiring tests: the `just` entry points actually invoke the gates with the right values.

Unit tests prove the coverage gate and the hook work; these prove the production
entry points (`just coverage`, `just setup`) reach them. `just --dry-run` prints
the recipe commands without executing them.
"""

import json
import shlex
import subprocess
import tomllib
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
ENV_DIR = REPO_ROOT / "env"
COVERAGE_FLOOR = "90"


def dry_run(recipe: str) -> list[tuple[str | None, list[str]]]:
    result = subprocess.run(
        ["just", "--dry-run", recipe],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=True,
    )
    commands: list[tuple[str | None, list[str]]] = []
    for line in result.stderr.splitlines() or result.stdout.splitlines():
        if not line.strip() or line.startswith("echo "):
            continue
        cwd: str | None = None
        if line.startswith("cd ") and " && " in line:
            prefix, line = line.split(" && ", 1)
            cwd = prefix.removeprefix("cd ")
        commands.append((cwd, shlex.split(line)))
    return commands


def find(
    commands: list[tuple[str | None, list[str]]], *head: str
) -> tuple[int, str | None, list[str]]:
    matches = [
        (index, cwd, argv)
        for index, (cwd, argv) in enumerate(commands)
        if argv[: len(head)] == list(head)
    ]
    assert len(matches) == 1, f"expected exactly one {head} command, got {matches}"
    return matches[0]


def test_coverage_recipe_gates_python_on_the_report_pytest_writes() -> None:
    commands = dry_run("coverage")
    pytest_index, pytest_cwd, pytest_argv = find(commands, "uv", "run", "pytest")
    gate_index, gate_cwd, gate_argv = find(
        commands, "uv", "run", "python", "-m", "pokebench_gates.coverage_gate"
    )
    assert pytest_cwd == gate_cwd == "env"
    assert "--cov" in pytest_argv
    assert "--cov-branch" in pytest_argv
    json_reports = [
        a.removeprefix("--cov-report=json:")
        for a in pytest_argv
        if a.startswith("--cov-report=json:")
    ]
    assert len(json_reports) == 1, pytest_argv
    assert gate_index > pytest_index
    assert gate_argv[5:] == [json_reports[0], "--min", COVERAGE_FLOOR]


def test_coverage_recipe_runs_the_typescript_coverage_script() -> None:
    commands = dry_run("coverage")
    _, cwd, argv = find(commands, "pnpm", "-r", "coverage")
    assert cwd is None
    for package_json in sorted((REPO_ROOT / "packages").glob("*/package.json")):
        scripts = json.loads(package_json.read_text())["scripts"]
        assert scripts["coverage"] == "vitest run --coverage", package_json


def test_every_python_package_is_measured() -> None:
    config = tomllib.loads((ENV_DIR / "pyproject.toml").read_text())
    measured = set(config["tool"]["coverage"]["run"]["source"])
    packages = {
        path.parent.name
        for path in ENV_DIR.glob("*/__init__.py")
        if path.parent.name not in {"tests"}
    }
    assert packages == measured
    assert {"pokebench_env", "pokebench_gates"} <= measured


def test_setup_recipe_enables_the_tracked_hooks() -> None:
    commands = dry_run("setup")
    _, cwd, argv = find(commands, "git", "config", "core.hooksPath")
    assert cwd is None
    assert argv == ["git", "config", "core.hooksPath", ".githooks"]
    hook = REPO_ROOT / ".githooks" / "pre-commit"
    assert hook.stat().st_mode & 0o111
