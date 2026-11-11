"""Re-derive every time plotted in the README charts from runs/<id>/events.jsonl.

Usage: python audit_runs.py 5f0f 67d7 6302+1121+69d8+d718 ...

Each argument is a run id suffix, or several joined by "+" for a checkpoint chain. For each run it
prints the first observed time of every gym badge, Elite Four win, Champion win and game clear,
measured from run_start (milestones already held at the start are skipped). A chain is stitched
the way the charts do it: each leg is cut at the milestone whose save state the next leg loaded,
read from that leg's run_start, and the next leg's times are added to the sum of those cuts.
Runs are read from $POKEBENCH_RUNS_ROOT, default runs/.
"""

from __future__ import annotations

import glob
import json
import os
import sys
from datetime import datetime
from pathlib import Path

RUNS = os.environ.get("POKEBENCH_RUNS_ROOT", "runs")
BADGES = (
    "STONE_BADGE",
    "KNUCKLE_BADGE",
    "DYNAMO_BADGE",
    "HEAT_BADGE",
    "BALANCE_BADGE",
    "FEATHER_BADGE",
    "MIND_BADGE",
    "RAIN_BADGE",
)
LEAGUE = (
    "ELITE_FOUR_SIDNEY_DEFEATED",
    "ELITE_FOUR_PHOEBE_DEFEATED",
    "ELITE_FOUR_GLACIA_DEFEATED",
    "ELITE_FOUR_DRAKE_DEFEATED",
    "WALLACE_DEFEATED",
    "GAME_CLEAR_CONFIRMED",
)
PLOTTED = BADGES + LEAGUE


def ts(text: str) -> datetime:
    return datetime.fromisoformat(text.replace("Z", "+00:00"))


def hms(seconds: float) -> str:
    s = round(seconds)
    return f"{s // 3600}:{s % 3600 // 60:02d}:{s % 60:02d}"


def events(suffix: str) -> list[dict]:
    folder = glob.glob(f"{RUNS}/*_{suffix}")[0]
    out = []
    with open(Path(folder) / "events.jsonl", errors="ignore") as lines:
        for line in lines:
            if '"run_start"' in line or '"run_end"' in line or '"milestone"' in line:
                out.append(json.loads(line))
    return out


def first_observed(evs: list[dict]) -> tuple[dict, dict[str, tuple[int, float]]]:
    """run_start and {milestone: (turn, seconds from run_start)}, first observed only."""
    start = next(e for e in evs if e["type"] == "run_start")
    t0 = ts(start["t"])
    seen: dict[str, tuple[int, float]] = {}
    for e in evs:
        name = e.get("name")
        if e["type"] != "milestone" or not name or name in seen:
            continue
        if e.get("origin") == "present_at_start":
            seen[name] = (-1, 0.0)
            continue
        seen[name] = (e.get("turn", -1), (ts(e["t"]) - t0).total_seconds())
    return start, seen


def checkpoint_name(start: dict) -> str | None:
    state = start.get("start_state") or {}
    path = state.get("path") if isinstance(state, dict) else None
    return Path(path).stem if path else None


def audit(chain: list[str]) -> None:
    legs = [first_observed(events(s)) for s in chain]
    offset = 0.0
    print("== " + " + ".join(chain))
    for i, (suffix, (start, seen)) in enumerate(zip(chain, legs)):
        for name in PLOTTED:
            turn, secs = seen.get(name, (-1, -1.0))
            if turn >= 0:
                print(f"   {suffix} {name:28} turn {turn:>5}  {hms(offset + secs)}")
        if i + 1 < len(chain):
            cut = checkpoint_name(legs[i + 1][0])
            turn, secs = seen.get(cut or "", (-1, -1.0))
            if turn < 0:
                sys.exit(f"{suffix}: no observed {cut} to stitch the next leg at")
            print(
                f"   {suffix} cut at {cut} (turn {turn}) {hms(secs)}; next leg starts at "
                f"{hms(offset + secs)}"
            )
            offset += secs


if __name__ == "__main__":
    for arg in sys.argv[1:]:
        audit(arg.split("+"))
