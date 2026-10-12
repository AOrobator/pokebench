import subprocess
from pathlib import Path


def test_serve_builds_browser_module_before_launching():
    root = Path(__file__).resolve().parents[3]
    result = subprocess.run(
        ["just", "--dry-run", "serve"], cwd=root, capture_output=True, text=True, check=True
    )
    assert result.stderr.splitlines() == [
        "pnpm -r build",
        "cd env && uv run python -m pokebench_env.launcher",
    ]
