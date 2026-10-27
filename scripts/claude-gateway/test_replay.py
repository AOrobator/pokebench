"""The replay tool against the fake `claude`."""

import json
from pathlib import Path

import replay
from test_claude_gateway import FAKE, GOOD, request


def setup(tmp_path: Path, plan: list[dict[str, object]], count: int) -> tuple[Path, list[str]]:
    home = tmp_path / "home"
    home.mkdir()
    (home / "plan.json").write_text(json.dumps(plan))
    files = []
    for turn in range(1, count + 1):
        path = tmp_path / f"request-{turn}-full.json"
        path.write_bytes(request(turn))
        files.append(str(path))
    return home, files


def args(tmp_path: Path, home: Path, mode: str, budget: str, files: list[str]) -> list[str]:
    return [
        "--mode", mode, "--model", "claude-opus-5-5", "--out", str(tmp_path / "out"),
        "--budget-usd", budget, "--claude", str(FAKE), "--claude-config-dir", str(home), *files,
    ]  # fmt: skip


def test_session_replay_summarizes_every_turn(tmp_path: Path) -> None:
    home, files = setup(tmp_path, [{"result": "nope"}, {"result": GOOD}], 3)
    said: list[str] = []
    assert replay.main(args(tmp_path, home, "session", "1", files), said.append) == 0
    summary = json.loads((tmp_path / "out" / "summary.json").read_text())
    assert summary["ended"] == "complete" and summary["turns"] == 3
    assert summary["valid_rate"] == 1.0
    assert round(summary["first_try_valid_rate"], 3) == 0.667
    assert summary["context_tokens_per_turn"] == [100 + 60 + 101 + 60, 162, 163]
    assert summary["cost_usd"] == 0.04 and summary["per_turn"][0]["attempts"] == 2
    assert said[0].startswith("request-1-full.json: valid attempts=2")


def test_replay_stops_at_budget_and_provider_wait(tmp_path: Path) -> None:
    home, files = setup(tmp_path, [{"result": GOOD}], 3)
    assert replay.main(args(tmp_path, home, "stateless", "0.015", files), lambda s: None) == 1
    summary = json.loads((tmp_path / "out" / "summary.json").read_text())
    assert summary["turns"] == 1 and "would pass $0.015" in summary["ended"]

    other = tmp_path / "b"
    other.mkdir()
    home, files = setup(other, [{"error": "You've hit your limit"}], 1)
    assert replay.main(args(other, home, "stateless", "1", files), lambda s: None) == 1
    summary = json.loads((other / "out" / "summary.json").read_text())
    assert summary["turns"] == 0 and "provider wait" in summary["ended"]
    assert summary["valid_rate"] == 0.0 and summary["latency_ms_max"] == 0


def test_replay_refuses_an_existing_folder(tmp_path: Path) -> None:
    home, files = setup(tmp_path, [{"result": GOOD}], 1)
    (tmp_path / "out").mkdir()
    try:
        replay.main(args(tmp_path, home, "stateless", "1", files), lambda s: None)
    except SystemExit as exit:
        assert exit.code == 2
    else:
        raise AssertionError("expected a refusal")
