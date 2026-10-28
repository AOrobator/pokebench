"""Exercise the real just recipes with isolated stand-ins for expensive leaf tools."""

import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
JUST = shutil.which("just")
if JUST is None:
    raise RuntimeError("The recipe gate test requires just, the repository's task runner")

FAKE_TOOL = """#!/usr/bin/env python3
import json
import os
import sys
from pathlib import Path

name = Path(sys.argv[0]).name
args = sys.argv[1:]
with Path(os.environ["RECIPE_TRACE"]).open("a") as trace:
    trace.write(json.dumps([name, *args]) + "\\n")
if name == "pnpm":
    source = Path("src/registry.json")
    compiled = Path("dist/registry.json")
    if args == ["-r", "build"]:
        if os.environ.get("RECIPE_BUILD_ERROR") == "1":
            print("controlled build failure", file=sys.stderr)
            sys.exit(41)
        compiled.parent.mkdir(exist_ok=True)
        compiled.write_bytes(source.read_bytes())
    elif args == ["-r", "coverage"]:
        if not compiled.exists() or compiled.read_bytes() != source.read_bytes():
            print("compiled registry is missing or stale", file=sys.stderr)
            sys.exit(23)
    else:
        raise SystemExit("unexpected pnpm arguments")
elif name == "just" and args != ["trainer-card-check"]:
    raise SystemExit("unexpected nested just recipe")
"""


def run_recipe(tmp_path, recipe, artifact="stale", *, build_error=False):
    # Spaces ensure the actual runner and stub executables use argv/path handling correctly.
    case = tmp_path / "recipe workspace"
    case.mkdir()
    (case / "env").mkdir()
    (case / "src").mkdir()
    source = case / "src/registry.json"
    source.write_text('["existing", "new-feature"]\n')
    compiled = case / "dist/registry.json"
    if artifact == "stale":
        compiled.parent.mkdir()
        compiled.write_text('["existing"]\n')
    justfile = case / "justfile"
    justfile.write_bytes((REPO / "justfile").read_bytes())
    ports = case / "bin"
    ports.mkdir()
    for name in ("pnpm", "uv", "just"):
        executable = ports / name
        executable.write_text(FAKE_TOOL)
        executable.chmod(0o755)
    trace = case / "calls.jsonl"
    env = {**os.environ, "PATH": f"{ports}{os.pathsep}{os.environ['PATH']}"}
    env["RECIPE_TRACE"] = str(trace)
    env["RECIPE_BUILD_ERROR"] = "1" if build_error else "0"
    result = subprocess.run(
        [JUST, "--justfile", str(justfile), "--working-directory", str(case), recipe],
        env=env,
        capture_output=True,
        text=True,
        timeout=15,
        check=False,
    )
    calls = [json.loads(line) for line in trace.read_text().splitlines()] if trace.exists() else []
    return result, calls, source, compiled


@pytest.mark.parametrize("recipe", ["test", "coverage"])
@pytest.mark.parametrize("artifact", ["missing", "stale"])
def test_gate_builds_missing_or_stale_registry_before_viewer_coverage(tmp_path, recipe, artifact):
    result, calls, source, compiled = run_recipe(tmp_path, recipe, artifact)
    assert result.returncode == 0, result.stdout + result.stderr
    assert compiled.read_bytes() == source.read_bytes()
    assert calls[:2] == [["pnpm", "-r", "build"], ["pnpm", "-r", "coverage"]]
    assert calls.count(["pnpm", "-r", "coverage"]) == 1
    assert calls.count(["pnpm", "-r", "build"]) == 1
    assert calls[-1] == ["just", "trainer-card-check"]


@pytest.mark.parametrize("recipe", ["test", "coverage"])
def test_build_failure_stops_before_coverage_and_retains_the_build_error(tmp_path, recipe):
    result, calls, _, _ = run_recipe(tmp_path, recipe, build_error=True)
    assert result.returncode != 0
    assert "controlled build failure" in result.stderr
    assert calls == [["pnpm", "-r", "build"]]
