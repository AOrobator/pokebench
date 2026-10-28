"""Gateway delivery preflight: prove what Claude will receive, with no model calls.

Recorded harness requests (a bridge's requests/ folder, or any request-*.json files) go
through this gateway with an in-memory stand-in for claude. Each is checked as a later
turn of an established session, which is the state after a compaction:

  tool_result   every tool result after the model's latest reply is in the prompt
  schemas       the full tool listing is in the system prompt
  no_echo       the model's own latest reply is not sent back to it
  hint          a reply that fails an anyOf/oneOf gets a re-ask listing the allowed forms

The gateway switches are taken from the play preset the run will use, plus the same
--current-turn/--tool-schemas/--schema-hint overrides the gateway will be started with.
A passing run writes preflight-receipt.json; claude_gateway.py refuses to start in session
mode without a passing receipt for its own sha256 and the same overrides.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import tempfile
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path

import claude_gateway as cg

SWITCHES = ("gateway-current-turn-v1", "gateway-tool-schemas-v1", "gateway-schema-hint-v1")
GOOD_REPLY = json.dumps({"name": "observe", "arguments": {}})


@dataclass
class StubRunner:
    """Records each call's spec; answers with queued replies, then a valid observe."""

    replies: list[str] = field(default_factory=list)
    specs: list[cg.CallSpec] = field(default_factory=list)

    def __call__(self, config: cg.Config, spec: cg.CallSpec) -> cg.CallResult:
        self.specs.append(spec)
        text = self.replies.pop(0) if self.replies else GOOD_REPLY
        return cg.CallResult(text, spec.session_id or "preflight", cg.Usage(), (), 0)


def _text(content: Sequence[cg.JsonObject]) -> str:
    return "\n".join(str(block.get("text", "")) for block in content)


def _message_text(message: cg.Message) -> str:
    return "\n".join(p.text for p in message.parts if p.text is not None)


def preset_features(preset: Path) -> dict[str, bool]:
    data = cg._obj(json.loads(preset.read_text(encoding="utf8")), "preset")
    features = data.get("features")
    recorded = cg._obj(features, "features") if isinstance(features, dict) else {}
    return {name: recorded.get(name) is True for name in SWITCHES}


def bad_union_reply(tools: Sequence[cg.Tool]) -> str | None:
    """A reply whose first anyOf/oneOf argument matches none of its options."""
    for tool in tools:
        properties = tool.parameters.get("properties")
        if not isinstance(properties, dict):
            continue
        for key, sub in properties.items():
            if isinstance(sub, dict) and ("anyOf" in sub or "oneOf" in sub):
                arguments = {str(key): {"__no_such_form__": 0}}
                return json.dumps({"name": tool.name, "arguments": arguments})
    return None


CHECKS = ("tool_result", "schemas", "no_echo", "hint")
# Which gateway switch delivers what each check looks for.
CHECK_SWITCH = {
    "tool_result": ("current_turn", "gateway-current-turn-v1"),
    "schemas": ("tool_schemas", "gateway-tool-schemas-v1"),
    "hint": ("schema_hint", "gateway-schema-hint-v1"),
}


def switches_off(features: dict[str, bool], overrides: dict[str, str]) -> list[str]:
    """The checks whose switch this launch would run OFF (override, else the preset)."""
    off = []
    for check, (option, switch) in CHECK_SWITCH.items():
        mode = overrides[option]
        if mode == "off" or (mode == "auto" and not features[switch]):
            off.append(check)
    return off


class Bench:
    """One stub gateway for the whole preflight; each request is a later turn of its session."""

    def __init__(self, tmp: Path, features: dict[str, bool], overrides: dict[str, str]) -> None:
        run = tmp / "runs" / "preflight-run"
        run.mkdir(parents=True)
        start = {"type": "run_start", "evaluation": {"features": features}}
        (run / "events.jsonl").write_text(json.dumps(start) + "\n", encoding="utf8")
        config = cg.Config(
            mode="session",
            model="preflight",
            effort="medium",
            bridge=tmp / "bridge",
            runs_root=tmp / "runs",
            run_id="preflight-run",
            current_turn=overrides["current_turn"],  # type: ignore[arg-type]
            tool_schemas=overrides["tool_schemas"],  # type: ignore[arg-type]
            schema_hint=overrides["schema_hint"],  # type: ignore[arg-type]
        )
        self.runner = StubRunner()
        self.gateway = cg.Gateway(config, runner=self.runner)

    def answer(self, request: cg.ChatRequest, raw: bytes, bad: str | None) -> list[cg.CallSpec]:
        # The state after any compaction: an established session whose tools are known.
        self.gateway.session.session_id = "preflight-session"
        self.gateway.session.run_id = "preflight-run"
        listing = cg._tool_listing(request.tools)
        self.gateway.session.tools_sha = hashlib.sha256(listing.encode()).hexdigest()
        self.runner.specs = []
        self.runner.replies = [bad] if bad else []
        self.gateway.answer(raw)
        return list(self.runner.specs)


def check_request(bench: Bench, raw: bytes) -> dict[str, object]:
    request = cg.parse_request(raw)
    bad = bad_union_reply(request.tools)
    specs = bench.answer(request, raw, bad)
    first = specs[0]
    prompt = _text(first.prompt.content)
    dialogue = request.dialogue
    last = max((i for i, m in enumerate(dialogue) if m.role == "assistant"), default=-1)
    results = [t for t in (_message_text(m) for m in dialogue[last + 1 :] if m.role == "tool") if t]
    row: dict[str, object] = {
        "tool_results": len(results),
        "tool_result": all(t in prompt for t in results) if results else None,
        "schemas": cg._tool_listing(request.tools) in first.prompt.system,
        "no_echo": None,
        "hint": None,
    }
    if last >= 0:
        own = dialogue[last]
        echoes = [_message_text(own).strip()] + [
            f"(called {c.name} {c.arguments})" for c in own.tool_calls
        ]
        echoes = [e for e in echoes if e]
        if echoes:
            row["no_echo"] = "[assistant" not in prompt and not any(e in prompt for e in echoes)
    if bad is not None:
        reask = _text(specs[1].prompt.content) if len(specs) > 1 else ""
        row["hint"] = "must match" in reask and "forms:" in reask
    return row


def gateway_sha256(path: Path | None = None) -> str:
    return hashlib.sha256((path or Path(cg.__file__)).read_bytes()).hexdigest()


def preflight_sha256() -> str:
    return hashlib.sha256(Path(__file__).read_bytes()).hexdigest()


def run_preflight(
    requests: Sequence[Path],
    preset: Path,
    overrides: dict[str, str],
    say: Callable[[str], None],
    allow_off: bool = False,
) -> dict[str, object]:
    features = preset_features(preset)
    off = switches_off(features, overrides)
    rows = []
    with tempfile.TemporaryDirectory(prefix="gateway-preflight-") as name:
        bench = Bench(Path(name), features, overrides)
        for path in requests:
            row = check_request(bench, path.read_bytes())
            row["request"] = path.name
            for check in off if allow_off else []:
                row[check] = None
            rows.append(row)
    required = [c for c in CHECKS if not (allow_off and c in off)]
    totals = {
        check: {
            "applicable": sum(1 for r in rows if r[check] is not None),
            "passed": sum(1 for r in rows if r[check] is True),
        }
        for check in CHECKS
    }
    failures = [r for r in rows if any(r[c] is False for c in required)]
    missing = [c for c in required if totals[c]["applicable"] == 0]
    if off and not allow_off:
        say(f"FAIL: these switches would run OFF: {', '.join(off)} (--allow-off for a legacy arm)")
    passed = bool(rows) and not failures and not missing and (allow_off or not off)
    for check in CHECKS:
        state = " (OFF, not required)" if check not in required else ""
        say(f"{check}: {totals[check]['passed']}/{totals[check]['applicable']}{state}")
    if missing:
        say(f"FAIL: no request exercised {', '.join(missing)}")
    for row in failures[:10]:
        say(f"FAIL {row['request']}: {json.dumps(row)}")
    return {
        "version": 1,
        "at": datetime.now(UTC).isoformat(timespec="seconds"),
        "passed": passed,
        "gateway_sha256": gateway_sha256(),
        "preflight_sha256": preflight_sha256(),
        "preset": str(preset),
        "preset_sha256": hashlib.sha256(preset.read_bytes()).hexdigest(),
        "preset_switches": features,
        "overrides": overrides,
        "allow_off": allow_off,
        "off_checks": off if allow_off else [],
        "requests": len(rows),
        "totals": totals,
        "failures": failures,
    }


def receipt_problem(receipt: Path, config: cg.Config, gateway_path: Path) -> str | None:
    """Why this receipt does not clear this gateway for a session run, or None."""
    try:
        data = cg._obj(json.loads(receipt.read_text(encoding="utf8")), "receipt")
    except (OSError, ValueError) as error:
        return f"preflight receipt unreadable: {error}"
    if data.get("version") != 1 or data.get("passed") is not True:
        return "preflight receipt did not pass"
    if data.get("gateway_sha256") != gateway_sha256(gateway_path):
        return "preflight receipt is for a different gateway build"
    if data.get("preflight_sha256") != preflight_sha256():
        return "preflight receipt was made by a different preflight build"
    want = {
        "current_turn": config.current_turn,
        "tool_schemas": config.tool_schemas,
        "schema_hint": config.schema_hint,
    }
    if data.get("overrides") != want:
        return f"preflight receipt overrides {data.get('overrides')} differ from {want}"
    requests, failures, totals = data.get("requests"), data.get("failures"), data.get("totals")
    if not isinstance(requests, int) or requests < 1 or failures != []:
        return "preflight receipt has no requests or lists failures"
    off = data.get("off_checks")
    skipped = off if isinstance(off, list) and data.get("allow_off") is True else []
    for check in CHECKS:
        if check in skipped:
            continue
        total = totals.get(check) if isinstance(totals, dict) else None
        if not isinstance(total, dict) or not (
            isinstance(total.get("applicable"), int)
            and total["applicable"] > 0
            and total.get("passed") == total["applicable"]
        ):
            return f"preflight receipt does not show {check} exercised and passed"
    return None


def main(argv: Sequence[str] | None = None, say: Callable[[str], None] = print) -> int:
    parser = argparse.ArgumentParser(prog="gateway-preflight", description=__doc__)
    parser.add_argument(
        "--preset", type=Path, required=True, help="the play preset the run will use"
    )
    parser.add_argument("--out", type=Path, required=True, help="folder for preflight-receipt.json")
    parser.add_argument(
        "--limit", type=int, default=300, help="most requests to check (spread evenly)"
    )
    for flag in ("--current-turn", "--tool-schemas", "--schema-hint"):
        parser.add_argument(flag, choices=("auto", "on", "off"), default="auto")
    parser.add_argument(
        "--allow-off",
        action="store_true",
        help="a deliberate legacy (OFF) arm: checks whose switch is off are recorded, not required",
    )
    parser.add_argument("requests", type=Path, nargs="+", help="request-*.json files or folders")
    args = parser.parse_args(sys.argv[1:] if argv is None else argv)
    files: list[Path] = []
    for item in args.requests:
        files.extend(sorted(item.glob("request-*.json")) if item.is_dir() else [item])
    if len(files) > args.limit > 0:
        step = len(files) / args.limit
        files = [files[int(i * step)] for i in range(args.limit)]
    overrides = {
        "current_turn": args.current_turn,
        "tool_schemas": args.tool_schemas,
        "schema_hint": args.schema_hint,
    }
    receipt = run_preflight(files, args.preset, overrides, say, args.allow_off)
    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / "preflight-receipt.json").write_text(json.dumps(receipt, indent=1) + "\n")
    say(("PASS" if receipt["passed"] else "FAIL") + f": {args.out / 'preflight-receipt.json'}")
    return 0 if receipt["passed"] else 1


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
