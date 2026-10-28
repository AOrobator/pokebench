"""The delivery preflight on reduced real requests, and the gateway's refusal without a receipt."""

import json
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


def make_receipt(tmp_path: Path, **change: object) -> Path:
    receipt = {
        "passed": True,
        "gateway_sha256": preflight.gateway_sha256(),
        "overrides": AUTO,
        **change,
    }
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
