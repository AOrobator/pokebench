import subprocess
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]


def dry_run(*args: str) -> list[str]:
    result = subprocess.run(
        ["just", "--dry-run", *args], cwd=REPO_ROOT, capture_output=True, text=True, check=True
    )
    return [line for line in result.stderr.splitlines() if line.strip()]


def test_view_builds_then_serves_the_named_run() -> None:
    lines = dry_run("view", "2026-10-11T22-16-26_think-swarm_890b")
    assert lines == ["pnpm -r build", "node packages/viewer/dist/cli.js 2026-10-11T22-16-26_think-swarm_890b"]


def test_view_without_a_run_opens_the_newest() -> None:
    assert dry_run("view")[-1] == "node packages/viewer/dist/cli.js"
