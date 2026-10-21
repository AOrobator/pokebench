"""The party art build writes ROM-derived art only under the repository's runs/.

Covers scripts/party-art/build_party_art.py main()'s output check, which runs before any build.
"""

import importlib.util
import sys
from pathlib import Path

import pytest

SCRIPTS = Path(__file__).resolve().parents[3] / "scripts"
sys.path.insert(0, str(SCRIPTS / "trainer-card"))
spec = importlib.util.spec_from_file_location(
    "build_party_art", SCRIPTS / "party-art" / "build_party_art.py"
)
assert spec is not None and spec.loader is not None
party_art = importlib.util.module_from_spec(spec)
spec.loader.exec_module(party_art)
RUNS = SCRIPTS.parent / "runs"


@pytest.fixture
def builds(monkeypatch: pytest.MonkeyPatch) -> list[Path]:
    calls: list[Path] = []
    monkeypatch.setattr(party_art, "build", lambda out, root, rom: calls.append(out) or 0)
    monkeypatch.setattr(party_art, "publish", lambda out, built: calls.append(out))
    return calls


@pytest.mark.parametrize(
    "outside",
    [
        "docs/party-v1",
        "/tmp/party-v1",
        "runs/../docs/party-v1",
        "runs",
        "runs/sprites/../..",
        "runs/.",
    ],
)
def test_an_output_outside_runs_is_refused_before_any_build(
    outside: str, builds: list[Path], tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    out = Path(outside) if outside.startswith("/") else SCRIPTS.parent / outside
    assert party_art.main([str(out), "--rom", str(tmp_path / "rom.gba")]) == 2
    assert builds == []
    assert "outside" in capsys.readouterr().err


def test_a_parent_link_that_escapes_runs_is_refused(builds: list[Path], tmp_path: Path) -> None:
    link = RUNS / ".party-art-path-test-link"
    link.unlink(missing_ok=True)
    link.symlink_to(tmp_path)
    try:
        assert party_art.main([str(link / "party-v1"), "--rom", str(tmp_path / "rom.gba")]) == 2
        assert builds == []
    finally:
        link.unlink()


def test_an_output_under_runs_is_built_and_published(builds: list[Path], tmp_path: Path) -> None:
    out = RUNS / ".party-art-path-test" / "party-v1"
    try:
        assert party_art.main([str(out), "--rom", str(tmp_path / "rom.gba")]) == 0
        assert len(builds) == 2
    finally:
        for leftover in out.parent.glob("*"):
            leftover.rmdir()
        out.parent.rmdir()
