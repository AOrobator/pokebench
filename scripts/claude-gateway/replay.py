"""Replay recorded harness requests through the gateway, with no run and no game.

Each request file goes through Gateway.answer in order, as if the harness had
sent it, and the per-call log becomes a summary: reply validity, tokens, cost,
latency and (in session mode) how the context grows. It stops before the spend
cap is passed, and at the first provider wait instead of holding for minutes.
"""

from __future__ import annotations

import argparse
import json
import statistics
import sys
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from pathlib import Path

import claude_gateway as cg


class ProviderWait(RuntimeError):
    pass


@dataclass(frozen=True)
class Turn:
    source: str
    valid: bool
    first_try: bool
    attempts: int
    input_tokens: int
    cache_read_tokens: int
    cache_creation_tokens: int
    output_tokens: int
    cost_usd: float
    latency_ms: int

    @property
    def context_tokens(self) -> int:
        return self.input_tokens + self.cache_read_tokens + self.cache_creation_tokens


def _stop(seconds: float) -> None:
    raise ProviderWait(f"provider wait (would retry in {seconds:.0f}s)")


def _rows(path: Path, request: int) -> list[dict[str, object]]:
    rows = [json.loads(line) for line in path.read_text().splitlines() if line]
    return [row for row in rows if row["request"] == request]


def _int(row: dict[str, object], key: str) -> int:
    value = row[key]
    return value if isinstance(value, int) else 0


def _cost(row: dict[str, object]) -> float:
    value = row["cost_usd"]
    return float(value) if isinstance(value, int | float) else 0.0


def replay(
    gateway: cg.Gateway, files: Sequence[Path], budget_usd: float, say: Callable[[str], None]
) -> tuple[list[Turn], str]:
    turns: list[Turn] = []
    spent = 0.0
    for path in files:
        if turns and spent + spent / len(turns) > budget_usd:
            return turns, f"stopped before {path.name}: the next turn would pass ${budget_usd}"
        try:
            seq, outcome = gateway.answer(path.read_bytes())
        except ProviderWait as error:
            return turns, f"stopped at {path.name}: {error}"
        rows = _rows(gateway.config.bridge / "calls.jsonl", seq)
        turn = Turn(
            source=path.name,
            valid=outcome.reply is not None,
            first_try=outcome.reply is not None and len(rows) == 1,
            attempts=len(rows),
            input_tokens=sum(_int(r, "input_tokens") for r in rows),
            cache_read_tokens=sum(_int(r, "cache_read_tokens") for r in rows),
            cache_creation_tokens=sum(_int(r, "cache_creation_tokens") for r in rows),
            output_tokens=sum(_int(r, "output_tokens") for r in rows),
            cost_usd=sum(_cost(r) for r in rows),
            latency_ms=sum(_int(r, "latency_ms") for r in rows),
        )
        turns.append(turn)
        spent += turn.cost_usd
        say(
            f"{path.name}: {'valid' if turn.valid else 'INVALID'} attempts={turn.attempts} "
            f"context={turn.context_tokens} out={turn.output_tokens} "
            f"${turn.cost_usd:.4f} {turn.latency_ms}ms"
        )
    return turns, "complete"


def summarize(turns: Sequence[Turn], ended: str, config: cg.Config) -> dict[str, object]:
    count = len(turns)
    latencies = [t.latency_ms for t in turns] or [0]
    cost = sum(t.cost_usd for t in turns)
    return {
        "mode": config.mode,
        "model": config.model,
        "effort": config.effort,
        "ended": ended,
        "turns": count,
        "valid_rate": sum(t.valid for t in turns) / count if count else 0.0,
        "first_try_valid_rate": sum(t.first_try for t in turns) / count if count else 0.0,
        "cost_usd": round(cost, 6),
        "cost_per_turn_usd": round(cost / count, 6) if count else 0.0,
        "latency_ms_median": statistics.median(latencies),
        "latency_ms_max": max(latencies),
        "input_tokens": sum(t.input_tokens for t in turns),
        "cache_read_tokens": sum(t.cache_read_tokens for t in turns),
        "cache_creation_tokens": sum(t.cache_creation_tokens for t in turns),
        "output_tokens": sum(t.output_tokens for t in turns),
        "context_tokens_per_turn": [t.context_tokens for t in turns],
        "per_turn": [{**t.__dict__, "context_tokens": t.context_tokens} for t in turns],
    }


def main(argv: Sequence[str] | None = None, say: Callable[[str], None] = print) -> int:
    parser = argparse.ArgumentParser(prog="claude-gateway-replay", description=__doc__)
    parser.add_argument("--mode", choices=("stateless", "session"), required=True)
    parser.add_argument("--model", required=True)
    parser.add_argument("--effort", default="medium")
    parser.add_argument("--out", type=Path, required=True, help="a new folder for this replay")
    parser.add_argument("--budget-usd", type=float, required=True)
    parser.add_argument("--claude", default="claude")
    parser.add_argument("--claude-config-dir", type=Path)
    parser.add_argument("requests", type=Path, nargs="+")
    args = parser.parse_args(sys.argv[1:] if argv is None else argv)
    out: Path = args.out.resolve()
    if out.exists():
        parser.error(f"{out} exists; replay into a new folder")
    config = cg.Config(
        mode=args.mode,
        model=args.model,
        effort=args.effort,
        bridge=out,
        runs_root=out / "no-runs",
        claude=args.claude,
        claude_config_dir=args.claude_config_dir,
        backoff=(0.0,),
    )
    gateway = cg.Gateway(config, sleep=_stop)
    turns, ended = replay(gateway, args.requests, args.budget_usd, say)
    summary = summarize(turns, ended, config)
    (out / "summary.json").write_text(json.dumps(summary, indent=1) + "\n")
    say(json.dumps({k: v for k, v in summary.items() if k != "per_turn"}))
    return 0 if ended == "complete" else 1


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
