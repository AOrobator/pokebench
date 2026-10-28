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


def _config(tmp: Path, overrides: dict[str, str]) -> cg.Config:
    return cg.Config(
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


def check_request(
    raw: bytes, features: dict[str, bool], overrides: dict[str, str]
) -> dict[str, object]:
    request = cg.parse_request(raw)
    bad = bad_union_reply(request.tools)
    with tempfile.TemporaryDirectory(prefix="gateway-preflight-") as name:
        tmp = Path(name)
        run = tmp / "runs" / "preflight-run"
        run.mkdir(parents=True)
        start = {"type": "run_start", "evaluation": {"features": features}}
        (run / "events.jsonl").write_text(json.dumps(start) + "\n", encoding="utf8")
        runner = StubRunner([bad] if bad else [])
        gateway = cg.Gateway(_config(tmp, overrides), runner=runner)
        # A later turn of an established session: the state after any compaction.
        gateway.session.session_id = "preflight-session"
        gateway.session.run_id = "preflight-run"
        gateway.session.tools_sha = hashlib.sha256(
            cg._tool_listing(request.tools).encode()
        ).hexdigest()
        gateway.answer(raw)
    first = runner.specs[0]
    prompt = _text(first.prompt.content)
    dialogue = request.dialogue
    last = max((i for i, m in enumerate(dialogue) if m.role == "assistant"), default=-1)
    results = [m for m in dialogue[last + 1 :] if m.role == "tool"]
    own = _message_text(dialogue[last]) if last >= 0 else ""
    row: dict[str, object] = {
        "tool_results": len(results),
        "tool_result": all(_message_text(m) in prompt for m in results) if results else None,
        "schemas": cg._tool_listing(request.tools) in first.prompt.system,
        "no_echo": not (own.strip() and own in prompt),
        "hint": None,
    }
    if bad is not None:
        reask = _text(runner.specs[1].prompt.content) if len(runner.specs) > 1 else ""
        row["hint"] = "must match" in reask and "forms:" in reask
    return row


def gateway_sha256(path: Path | None = None) -> str:
    return hashlib.sha256((path or Path(cg.__file__)).read_bytes()).hexdigest()


def run_preflight(
    requests: Sequence[Path], preset: Path, overrides: dict[str, str], say: Callable[[str], None]
) -> dict[str, object]:
    features = preset_features(preset)
    rows = []
    for path in requests:
        row = check_request(path.read_bytes(), features, overrides)
        row["request"] = path.name
        rows.append(row)
    checks = ("tool_result", "schemas", "no_echo", "hint")
    totals = {
        check: {
            "applicable": sum(1 for r in rows if r[check] is not None),
            "passed": sum(1 for r in rows if r[check] is True),
        }
        for check in checks
    }
    failures = [r for r in rows if any(r[c] is False for c in checks)]
    missing = [c for c in checks if totals[c]["applicable"] == 0]
    passed = bool(rows) and not failures and not missing
    for check in checks:
        say(f"{check}: {totals[check]['passed']}/{totals[check]['applicable']}")
    if missing:
        say(f"FAIL: no request exercised {', '.join(missing)}")
    for row in failures[:10]:
        say(f"FAIL {row['request']}: {json.dumps(row)}")
    return {
        "version": 1,
        "at": datetime.now(UTC).isoformat(timespec="seconds"),
        "passed": passed,
        "gateway_sha256": gateway_sha256(),
        "preset": str(preset),
        "preset_sha256": hashlib.sha256(preset.read_bytes()).hexdigest(),
        "preset_switches": features,
        "overrides": overrides,
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
    if data.get("passed") is not True:
        return "preflight receipt did not pass"
    if data.get("gateway_sha256") != gateway_sha256(gateway_path):
        return "preflight receipt is for a different gateway build"
    want = {
        "current_turn": config.current_turn,
        "tool_schemas": config.tool_schemas,
        "schema_hint": config.schema_hint,
    }
    if data.get("overrides") != want:
        return f"preflight receipt overrides {data.get('overrides')} differ from {want}"
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
    receipt = run_preflight(files, args.preset, overrides, say)
    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / "preflight-receipt.json").write_text(json.dumps(receipt, indent=1) + "\n")
    say(("PASS" if receipt["passed"] else "FAIL") + f": {args.out / 'preflight-receipt.json'}")
    return 0 if receipt["passed"] else 1


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
