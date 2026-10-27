"""Wiring tests: the `just` entry points invoke the gates exactly as intended.

Unit tests prove the coverage gate and the hook work; these prove the production
entry points (`just test`, `just coverage`, `just setup`) reach them. `just test`
is the one coverage-instrumented pass over every suite; `just coverage` names that
same pass, so a gate never runs the suites twice. `just --dry-run` prints
recipe commands without executing them, and `node` evaluates the real vitest
config. Both start read-only processes: they are the only observers of how the
recipes and the config resolve, so the skill's no-process rule is waived here.

Commands are pinned in full: a prefix match lets `|| true`, `--no-cov`, or a
`-k` filter slip through.
"""

import json
import subprocess
import tomllib
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
ENV_DIR = REPO_ROOT / "env"
COVERAGE_FLOOR = 90

EXPECTED_COVERAGE = [
    "pnpm -r coverage",
    "cd env && uv run pytest -q --cov --cov-branch --cov-report=term-missing "
    "--cov-report=json:.coverage.json",
    f"cd env && uv run python -m pokebench_gates.coverage_gate .coverage.json "
    f"--min {COVERAGE_FLOOR}",
]
EXPECTED_TEST = [*EXPECTED_COVERAGE, "just trainer-card-check"]

EXPECTED_SETUP = [
    "git config core.hooksPath .githooks",
    "pnpm install",
    "cd env && uv sync",
    'echo "✓ hooks enabled, deps installed"',
]


def recipe_lines(*recipes: str) -> list[str]:
    result = subprocess.run(
        ["just", "--dry-run", *recipes],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=True,
    )
    assert result.stdout == "", "just --dry-run is expected to print commands on stderr"
    return [line for line in result.stderr.splitlines() if line.strip()]


@pytest.fixture(scope="module")
def coverage_lines() -> list[str]:
    return recipe_lines("test")


def test_test_recipe_is_exactly_the_gated_pipeline(coverage_lines: list[str]) -> None:
    assert coverage_lines == EXPECTED_TEST


def test_coverage_names_the_same_single_pass() -> None:
    assert recipe_lines("coverage") == EXPECTED_TEST
    assert recipe_lines("test", "coverage") == EXPECTED_TEST
    assert recipe_lines("coverage", "test") == EXPECTED_TEST


def test_python_gate_reads_the_report_pytest_writes(coverage_lines: list[str]) -> None:
    pytest_line, gate_line = coverage_lines[1], coverage_lines[2]
    report = pytest_line.split("--cov-report=json:", 1)[1].split()[0]
    assert gate_line.split()[8] == report


def test_typescript_coverage_script_and_thresholds_are_the_floor() -> None:
    for package_dir in sorted(
        path.parent for path in (REPO_ROOT / "packages").glob("*/package.json")
    ):
        scripts = json.loads((package_dir / "package.json").read_text())["scripts"]
        assert scripts["coverage"] == "vitest run --coverage", package_dir
        evaluated = subprocess.run(
            [
                "node",
                "--input-type=module",
                "-e",
                "const m = await import('./vitest.config.ts');"
                "console.log(JSON.stringify(m.default.test.coverage));",
            ],
            cwd=package_dir,
            capture_output=True,
            text=True,
            check=True,
        )
        coverage = json.loads(evaluated.stdout)
        assert coverage["provider"] == "v8"
        assert coverage["thresholds"] == {
            "lines": COVERAGE_FLOOR,
            "branches": COVERAGE_FLOOR,
            "functions": COVERAGE_FLOOR,
            "statements": COVERAGE_FLOOR,
        }


def test_every_python_package_is_measured_without_omissions() -> None:
    config = tomllib.loads((ENV_DIR / "pyproject.toml").read_text())
    run = config["tool"]["coverage"]["run"]
    assert run == {"source": run["source"], "branch": True}
    assert config["tool"]["coverage"]["report"] == {"show_missing": True}
    packages = {path.parent.name for path in ENV_DIR.glob("*/__init__.py")}
    assert set(run["source"]) == packages
    assert {"pokebench_env", "pokebench_gates"} <= packages


def test_setup_recipe_enables_hooks_and_installs_both_stacks() -> None:
    assert recipe_lines("setup") == EXPECTED_SETUP
    hook = REPO_ROOT / ".githooks" / "pre-commit"
    assert hook.stat().st_mode & 0o111
