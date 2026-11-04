"""Prove the test guards still catch I/O: only the listed pure tests may pass in the proof suites."""

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VITEST_PASSES = {"pure"}
VITEST_TOTAL = 11
PYTEST_PASSES = {"test_pure", "test_one_loop_passes"}
PYTEST_TOTAL = 14


def vitest() -> tuple[set[str], int]:
    done = subprocess.run(
        ["pnpm", "exec", "vitest", "run", "--config", "no-io-proof.config.ts", "--reporter=verbose"],
        cwd=ROOT / "packages/agent",
        capture_output=True,
        text=True,
        check=False,
    )
    results = re.findall(r"([✓×]) \S+ > (\w+)", re.sub(r"\x1b\[[0-9;]*m", "", done.stdout))
    return {name for mark, name in results if mark == "✓"}, len(results)


def pytest() -> tuple[set[str], int]:
    done = subprocess.run(
        [
            sys.executable,
            "-m",
            "pytest",
            "-q",
            "-rA",
            "-p",
            "no:cacheprovider",
            "-p",
            "pokebench_gates.no_io_guard",
            "--continue-on-collection-errors",
            "--rootdir",
            "scripts/no-io-proof",
            "scripts/no-io-proof",
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    results = re.findall(r"^(PASSED|FAILED|ERROR) \S+::(\w+)", done.stdout, re.MULTILINE)
    passed = {name for state, name in results if state == "PASSED"}
    import_caught = re.search(r"^ERROR \S+test_no_io_import_proof\.py", done.stdout, re.MULTILINE)
    return passed, len({name for _, name in results}) + bool(import_caught)


def main() -> int:
    failures = []
    for name, (passed, total), expected, count in (
        ("vitest", vitest(), VITEST_PASSES, VITEST_TOTAL),
        ("pytest", pytest(), PYTEST_PASSES, PYTEST_TOTAL),
    ):
        if passed != expected or total != count:
            failures.append(f"{name}: {sorted(passed)} of {total}, want {sorted(expected)} of {count}")
    print("\n".join(failures) or "no-I/O guards OK")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
