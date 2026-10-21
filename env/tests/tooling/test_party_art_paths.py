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
ROM = "/nonexistent/rom.gba"


@pytest.fixture
def repo(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> Path:
    """A private repository root whose runs/ the build is confined to."""
    (tmp_path / "runs" / "sprites").mkdir(parents=True)
    monkeypatch.setattr(party_art, "RUNS_ROOT", tmp_path / "runs")
    return tmp_path


@pytest.fixture
def builds(monkeypatch: pytest.MonkeyPatch) -> list[Path]:
    calls: list[Path] = []
    monkeypatch.setattr(party_art, "build", lambda out, root, rom: calls.append(out) or 0)
    monkeypatch.setattr(party_art, "publish", lambda out, built: calls.append(out))
    return calls


def test_the_real_root_is_the_repository_runs() -> None:
    assert party_art.RUNS_ROOT == SCRIPTS.parent / "runs"


@pytest.mark.parametrize(
    "outside",
    [
        "docs/party-v1",
        "/elsewhere/party-v1",
        "runs/../docs/party-v1",
        "runs",
        "runs/sprites/../..",
        "runs/.",
    ],
)
def test_an_output_outside_runs_is_refused_before_any_build(
    outside: str, repo: Path, builds: list[Path], capsys: pytest.CaptureFixture[str]
) -> None:
    out = Path(outside) if outside.startswith("/") else repo / outside
    assert party_art.main([str(out), "--rom", ROM]) == 2
    assert builds == []
    assert "outside" in capsys.readouterr().err


def test_a_parent_link_that_escapes_runs_is_refused(repo: Path, builds: list[Path]) -> None:
    outside = repo / "elsewhere"
    outside.mkdir()
    link = repo / "runs" / "link"
    link.symlink_to(outside)
    assert party_art.main([str(link / "party-v1"), "--rom", ROM]) == 2
    assert builds == []


def test_an_output_under_runs_is_built_and_published(repo: Path, builds: list[Path]) -> None:
    out = repo / "runs" / "sprites" / "party-v1"
    assert party_art.main([str(out), "--rom", ROM]) == 0
    built, published = builds
    assert (built.parent, published) == (out.parent, out)
