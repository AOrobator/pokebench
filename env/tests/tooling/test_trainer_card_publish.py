"""The trainer-card art build swaps the served art in one atomic step.

Covers scripts/trainer-card/build_art.py.
"""

import importlib.util
import os
import sys
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[3] / "scripts" / "trainer-card" / "build_art.py"
spec = importlib.util.spec_from_file_location("build_art", SCRIPT)
assert spec is not None and spec.loader is not None
build_art = importlib.util.module_from_spec(spec)
sys.modules["build_art"] = build_art
spec.loader.exec_module(build_art)


def built(root: Path, name: str, text: str) -> Path:
    d = root / name
    d.mkdir()
    (d / "manifest.json").write_text(text)
    return d


def test_first_and_later_builds_switch_the_link_and_drop_the_old_build(tmp_path: Path) -> None:
    out = tmp_path / "trainer-card-v1"
    first = built(tmp_path, ".trainer-card-v1.build-a", "one")
    build_art.publish(out, first)
    assert out.is_symlink() and (out / "manifest.json").read_text() == "one"
    second = built(tmp_path, ".trainer-card-v1.build-b", "two")
    build_art.publish(out, second)
    assert (out / "manifest.json").read_text() == "two"
    assert not first.exists()
    names = sorted(p.name for p in tmp_path.iterdir())
    assert names == [".trainer-card-v1.build-b", "trainer-card-v1"]


def test_a_failed_switch_leaves_the_old_art_served_and_a_retry_works(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    out = tmp_path / "trainer-card-v1"
    old = built(tmp_path, ".trainer-card-v1.build-a", "old")
    build_art.publish(out, old)
    new = built(tmp_path, ".trainer-card-v1.build-b", "new")
    real_replace = os.replace

    def broken(src: object, dst: object) -> None:
        raise OSError("disk went away")

    monkeypatch.setattr(build_art.os, "replace", broken)
    with pytest.raises(OSError, match="disk went away"):
        build_art.publish(out, new)
    assert (out / "manifest.json").read_text() == "old"
    assert not any(p.name.startswith(".trainer-card-v1.link-") for p in tmp_path.iterdir())
    monkeypatch.setattr(build_art.os, "replace", real_replace)
    build_art.publish(out, new)
    assert (out / "manifest.json").read_text() == "new" and not old.exists()


def test_refuses_to_replace_a_real_directory(tmp_path: Path) -> None:
    out = tmp_path / "trainer-card-v1"
    out.mkdir()
    (out / "keep").write_text("x")
    with pytest.raises(OSError, match="not a link"):
        build_art.publish(out, built(tmp_path, ".trainer-card-v1.build-a", "one"))
    assert (out / "keep").read_text() == "x"


def test_main_reports_a_failed_switch_and_keeps_the_previous_art(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    out = tmp_path / "trainer-card-v1"
    build_art.publish(out, built(tmp_path, ".trainer-card-v1.build-a", "old"))

    def fake_build(dest: Path, root: Path, rom: Path) -> int:
        (dest / "manifest.json").write_text("new")
        return 1

    def broken(src: object, dst: object) -> None:
        raise OSError("no space")

    monkeypatch.setattr(build_art, "build", fake_build)
    monkeypatch.setattr(build_art.os, "replace", broken)
    assert build_art.main([str(out), "--rom", str(tmp_path / "rom.gba")]) == 1
    assert "previous art left as it was" in capsys.readouterr().err
    assert (out / "manifest.json").read_text() == "old"
    builds = [p.name for p in tmp_path.iterdir() if p.name.startswith(".trainer-card-v1.build-")]
    assert builds == [".trainer-card-v1.build-a"]
