"""The delivery preflight on reduced real requests, and the gateway's refusal without a receipt."""

import functools
import json
import tempfile
from pathlib import Path

import pytest

import claude_gateway as cg
import preflight

FIX = Path(__file__).with_name("fixtures")
BUNDLE = [FIX / f"bundle-d06b9f4db-request-{n}.json" for n in (601, 1007, 1041)]
AACFF = [FIX / "aacff2371-request-145-battle-update.json", FIX / "aacff2371-request-400.json"]
AUTO = {"current_turn": "auto", "tool_schemas": "auto", "schema_hint": "auto"}


def preset(tmp_path: Path, on: bool) -> Path:
    path = tmp_path / "preset.json"
    path.write_text(json.dumps({"features": {name: on for name in preflight.SWITCHES}}))
    return path


def test_bundle_requests_pass_with_the_switches_recorded_on(tmp_path: Path) -> None:
    said: list[str] = []
    receipt = preflight.run_preflight(BUNDLE + AACFF, preset(tmp_path, True), AUTO, said.append)
    assert receipt["passed"] is True and receipt["requests"] == 5
    totals = receipt["totals"]
    assert isinstance(totals, dict)
    assert totals["tool_result"] == {"applicable": 5, "passed": 5}
    assert totals["schemas"] == {"applicable": 5, "passed": 5}
    assert totals["no_echo"] == {"applicable": 5, "passed": 5}
    assert totals["hint"] == {"applicable": 3, "passed": 3}
    assert receipt["gateway_sha256"] == preflight.gateway_sha256()
    assert receipt["preset_switches"] == dict.fromkeys(preflight.SWITCHES, True)
    assert "hint: 3/3" in said


def test_switches_off_fail_loudly(tmp_path: Path) -> None:
    said: list[str] = []
    receipt = preflight.run_preflight(BUNDLE, preset(tmp_path, False), AUTO, said.append)
    assert receipt["passed"] is False
    failures = receipt["failures"]
    assert isinstance(failures, list) and len(failures) == 3
    assert {f["request"] for f in failures} == {p.name for p in BUNDLE}
    assert any(line.startswith("FAIL bundle-d06b9f4db-request-601.json") for line in said)
    totals = receipt["totals"]
    assert isinstance(totals, dict) and totals["schemas"]["passed"] == 0


def test_operator_overrides_clear_an_old_preset(tmp_path: Path) -> None:
    on = {"current_turn": "on", "tool_schemas": "on", "schema_hint": "on"}
    assert preflight.run_preflight(BUNDLE, preset(tmp_path, False), on, lambda s: None)["passed"]


def test_a_check_no_request_exercises_fails(tmp_path: Path) -> None:
    said: list[str] = []
    receipt = preflight.run_preflight(AACFF, preset(tmp_path, True), AUTO, said.append)
    assert receipt["passed"] is False and "FAIL: no request exercised hint" in said
    assert (
        preflight.run_preflight([], preset(tmp_path, True), AUTO, lambda s: None)["passed"] is False
    )


def test_cli_writes_the_receipt_and_spreads_the_limit(tmp_path: Path) -> None:
    folder = tmp_path / "requests"
    folder.mkdir()
    for index, path in enumerate(BUNDLE + AACFF):
        (folder / f"request-{index + 1}.json").write_bytes(path.read_bytes())
    out = tmp_path / "out"
    said: list[str] = []
    code = preflight.main(
        ["--preset", str(preset(tmp_path, True)), "--out", str(out), "--limit", "4", str(folder)],
        said.append,
    )
    receipt = json.loads((out / "preflight-receipt.json").read_text())
    assert receipt["requests"] == 4 and said[-1].startswith(("PASS", "FAIL"))
    assert code == (0 if receipt["passed"] else 1)
    code = preflight.main(
        ["--preset", str(preset(tmp_path, False)), "--out", str(out), *map(str, BUNDLE)],
        lambda s: None,
    )
    assert code == 1 and json.loads((out / "preflight-receipt.json").read_text())["passed"] is False


def test_preset_without_features_reads_all_off(tmp_path: Path) -> None:
    path = tmp_path / "p.json"
    path.write_text(json.dumps({"id": "x"}))
    assert preflight.preset_features(path) == dict.fromkeys(preflight.SWITCHES, False)


@functools.cache
def _generated() -> str:
    with tempfile.TemporaryDirectory() as name:
        made = preflight.run_preflight(BUNDLE, preset(Path(name), True), AUTO, lambda s: None)
    return json.dumps(made)


def make_receipt(tmp_path: Path, **change: object) -> Path:
    receipt = json.loads(_generated())
    receipt.update(change)
    path = tmp_path / "receipt.json"
    path.write_text(json.dumps(receipt))
    return path


def session_args(tmp_path: Path, receipt: Path | None) -> list[str]:
    extra = [] if receipt is None else ["--preflight-receipt", str(receipt)]
    return [
        "--mode",
        "session",
        "--model",
        "m",
        "--bridge",
        str(tmp_path / "b"),
        "--port",
        "1",
        "--run-id",
        "r",
        *extra,
    ]


@pytest.mark.enforce_preflight
def test_session_gateway_refuses_without_a_matching_passing_receipt(tmp_path: Path) -> None:
    gateway_file = Path(cg.__file__)
    config = cg.parse_args(session_args(tmp_path, make_receipt(tmp_path)))[0]
    assert config.mode == "session"
    for receipt in (
        None,
        tmp_path / "missing.json",
        make_receipt(tmp_path, passed=False),
        make_receipt(tmp_path, gateway_sha256="0" * 64),
        make_receipt(tmp_path, overrides={**AUTO, "current_turn": "on"}),
        make_receipt(tmp_path, version=2),
        make_receipt(tmp_path, preflight_sha256="0" * 64),
        make_receipt(tmp_path, requests=0),
        make_receipt(tmp_path, failures=[{"request": "x"}]),
        make_receipt(tmp_path, totals={}),
    ):
        with pytest.raises(SystemExit):
            cg.parse_args(session_args(tmp_path, receipt))
    assert preflight.receipt_problem(
        make_receipt(tmp_path, passed=False), config, gateway_file
    ) == ("preflight receipt did not pass")
    stateless = [
        "--mode",
        "stateless",
        "--model",
        "m",
        "--bridge",
        str(tmp_path),
        "--port",
        "1",
        "--run-id",
        "r",
    ]
    assert cg.parse_args(stateless)[0].mode == "stateless"


@pytest.mark.enforce_preflight
def test_a_bare_declaration_is_not_a_receipt(tmp_path: Path) -> None:
    config = cg.parse_args(session_args(tmp_path, make_receipt(tmp_path)))[0]
    bare = tmp_path / "bare.json"
    bare.write_text(
        json.dumps(
            {"passed": True, "gateway_sha256": preflight.gateway_sha256(), "overrides": AUTO}
        )
    )
    assert preflight.receipt_problem(bare, config, Path(cg.__file__)) is not None
    partial = make_receipt(tmp_path, totals={"tool_result": {"applicable": 0, "passed": 0}})
    assert "tool_result" in str(preflight.receipt_problem(partial, config, Path(cg.__file__)))


def strip(raw: bytes, keep: object) -> bytes:
    body = json.loads(raw)
    body["messages"] = [m for m in body["messages"] if keep(m)]
    return json.dumps(body).encode()


def test_no_assistant_and_empty_tool_results_are_not_exercised(tmp_path: Path) -> None:
    raw = BUNDLE[0].read_bytes()
    no_assistant = tmp_path / "request-1.json"
    no_assistant.write_bytes(strip(raw, lambda m: m["role"] != "assistant"))
    body = json.loads(raw)
    for m in body["messages"]:
        if m["role"] == "tool":
            m["content"] = ""
    empty_tool = tmp_path / "request-2.json"
    empty_tool.write_text(json.dumps(body))
    receipt = preflight.run_preflight(
        [no_assistant, empty_tool], preset(tmp_path, True), AUTO, lambda s: None
    )
    rows = receipt["failures"] or []
    totals = receipt["totals"]
    assert isinstance(totals, dict) and not rows
    assert totals["no_echo"]["applicable"] == 1
    assert totals["tool_result"]["applicable"] == 1
    alone = preflight.run_preflight([empty_tool], preset(tmp_path, True), AUTO, lambda s: None)
    assert alone["passed"] is False


def test_an_echoed_tool_call_line_fails(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    original = cg.ChatRequest.current_turn

    def leaky(self: cg.ChatRequest) -> tuple[cg.Message, ...]:
        return self.dialogue[-4:]

    monkeypatch.setattr(cg.ChatRequest, "current_turn", property(leaky))
    receipt = preflight.run_preflight(BUNDLE[:1], preset(tmp_path, True), AUTO, lambda s: None)
    assert receipt["passed"] is False and receipt["failures"]
    assert original is not None


def test_off_switches_need_allow_off_and_are_recorded(tmp_path: Path) -> None:
    said: list[str] = []
    off_preset = preset(tmp_path, False)
    assert preflight.run_preflight(BUNDLE, off_preset, AUTO, said.append)["passed"] is False
    assert any("would run OFF" in line for line in said)
    legacy = preflight.run_preflight(BUNDLE, off_preset, AUTO, lambda s: None, allow_off=True)
    assert legacy["passed"] is True
    assert legacy["off_checks"] == ["tool_result", "schemas", "hint"]
    path = tmp_path / "legacy.json"
    path.write_text(json.dumps(legacy))
    config = cg.parse_args(session_args(tmp_path, make_receipt(tmp_path)))[0]
    assert preflight.receipt_problem(path, config, Path(cg.__file__)) is None
    assert preflight.switches_off(
        dict.fromkeys(preflight.SWITCHES, True), {**AUTO, "schema_hint": "off"}
    ) == ["hint"]


def test_one_bench_for_the_whole_preflight(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    made: list[object] = []
    original = preflight.Bench.__init__

    def counting(self: preflight.Bench, *args: object) -> None:
        made.append(self)
        original(self, *args)  # type: ignore[arg-type]

    monkeypatch.setattr(preflight.Bench, "__init__", counting)
    preflight.run_preflight(BUNDLE + AACFF, preset(tmp_path, True), AUTO, lambda s: None)
    assert len(made) == 1


@pytest.mark.enforce_preflight
def test_off_checks_must_be_exactly_what_the_switches_imply(tmp_path: Path) -> None:
    config = cg.parse_args(session_args(tmp_path, make_receipt(tmp_path)))[0]
    gateway = Path(cg.__file__)
    every = ["tool_result", "schemas", "no_echo", "hint"]
    forged = make_receipt(tmp_path, allow_off=True, off_checks=every, totals={})
    assert "off_checks" in str(preflight.receipt_problem(forged, config, gateway))
    unswitched = make_receipt(tmp_path, allow_off=True, off_checks=["schemas"])
    assert "off_checks" in str(preflight.receipt_problem(unswitched, config, gateway))
    for switches in (None, {}, dict.fromkeys(preflight.SWITCHES, "yes")):
        bad = make_receipt(tmp_path, preset_switches=switches)
        assert "preset_switches" in str(preflight.receipt_problem(bad, config, gateway))


@pytest.mark.enforce_preflight
def test_counts_must_be_integers_within_the_request_count(tmp_path: Path) -> None:
    config = cg.parse_args(session_args(tmp_path, make_receipt(tmp_path)))[0]
    gateway = Path(cg.__file__)
    flags = {c: {"applicable": True, "passed": True} for c in preflight.CHECKS}
    assert preflight.receipt_problem(make_receipt(tmp_path, requests=True), config, gateway)
    assert preflight.receipt_problem(
        make_receipt(tmp_path, requests=1, totals=flags), config, gateway
    )
    over = {c: {"applicable": 9, "passed": 9} for c in preflight.CHECKS}
    assert preflight.receipt_problem(
        make_receipt(tmp_path, requests=3, totals=over), config, gateway
    )
