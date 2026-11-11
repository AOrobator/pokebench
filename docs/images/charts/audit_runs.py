import json
import glob
import os
import sys
from datetime import datetime

R = os.environ.get("POKEBENCH_RUNS_ROOT", "runs")


def ts(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def run(sfx):
    return glob.glob(f"{R}/*_{sfx}")[0]


def hms(s):
    s = round(s)
    return f"{s // 3600}:{s % 3600 // 60:02d}:{s % 60:02d}"


def scan(sfx):
    t0 = None
    end = None
    b = []
    seen = set()
    held = []
    extra = []
    start = None
    last_t = None
    for line in open(run(sfx) + "/events.jsonl", errors="ignore"):
        if not any(
            k in line
            for k in ('"run_start"', '"run_end"', '"milestone"', '"operator_control"')
        ):
            continue
        e = json.loads(line)
        t = e["type"]
        last_t = e.get("t", last_t)
        if t == "run_start":
            t0 = ts(e["t"])
            start = e.get("start_state")
        elif t == "run_end":
            end = e
        elif (
            t == "milestone" and e["name"].endswith("_BADGE") and e["name"] not in seen
        ):
            seen.add(e["name"])
            if e.get("origin") == "present_at_start":
                held.append(e["name"])
            else:
                b.append((e["name"], e.get("turn"), (ts(e["t"]) - t0).total_seconds()))
        elif t == "milestone" and e["name"] in ("GAME_CLEAR_CONFIRMED",):
            extra.append((e["name"], e.get("turn"), (ts(e["t"]) - t0).total_seconds()))
        elif t == "operator_control":
            extra.append(
                (
                    "OPS",
                    e.get("turn"),
                    {k: v for k, v in e.items() if k not in ("v", "run", "t", "type")},
                )
            )
    return dict(
        t0=t0,
        held=held,
        badges=b,
        extra=extra,
        start=start,
        end=end and {k: end.get(k) for k in ("reason", "turns", "wall_ms", "t")},
        endsec=end and (ts(end["t"]) - t0).total_seconds(),
    )


for sfx in sys.argv[1:]:
    r = scan(sfx)
    print(f"== {sfx} start={str(r['start'])[:120]} held={r['held']}")
    for n, tu, s in r["badges"]:
        print(f"   {n:14} turn {tu:>5}  {hms(s)}")
    for x in r["extra"]:
        print("  ", str(x)[:260])
    print("   end", r["end"], hms(r["endsec"] or 0))
