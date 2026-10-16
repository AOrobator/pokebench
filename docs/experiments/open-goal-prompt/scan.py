"""Pre-registered diagnostic for open-goal-prompt-v1 (mechanism, not grading, not causal).

Per run: how many turns of model reasoning (assistant thinking + text) name Rustboro, or a gym,
before any game source did. Game sources are what the model was shown: tool-result text and
dialogue_auto_advance pages. The system prompt is the suspected bias, so it is not a game source.

Read-only over runs/<id>/events.jsonl (POKEBENCH_RUNS_ROOT overrides the runs root, e.g. from a worktree). Each run is scanned up to a fixed cutoff seq so the
counts can be reproduced while a run is still appending.

  python3 -I docs/experiments/open-goal-prompt/scan.py write   # (re)build manifest.json from runs/
  python3 -I docs/experiments/open-goal-prompt/scan.py check   # same population, each run rescanned to its cutoff; exit 1 on any drift
"""

import glob
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
RUNS = os.environ.get("POKEBENCH_RUNS_ROOT") or os.path.join(HERE, "..", "..", "..", "runs")
MANIFEST = os.path.join(HERE, "manifest.json")
DAYS = ("2026-10-15", "2026-10-16")
# Dataset cutoff: runs started before 3:00 PM New York on 2026-10-16 (run ids begin with their start time).
STARTED_BEFORE = "2026-10-16T15-00-00"
LANES = ("qwen36-gpu0", "qwen36-gpu1", "think-fast")
RUSTBORO = re.compile(r"rustboro", re.I)
GYM = re.compile(r"\bgym", re.I)
LAB_IN_RUSTBORO = re.compile(r"lab\b[^.\n]{0,30}(\b(in|at)\s+rustboro|\(rustboro)", re.I)


def cohort(preset: str) -> str:
    if "cook" in preset:
        return "cook-bundle" if preset.rstrip("-").split("-")[-1].startswith("bun") else "cook-control"
    if "dryrun" in preset:
        return "dryrun-clockset"
    if "factorial" in preset:
        return "factorial-clockset"
    if "finals" in preset:
        return "finals-boot"
    return "other"


def scan(path: str, cutoff: int | None) -> dict[str, object] | None:
    start = None
    last_seq = -1
    turns = 0
    game_rustboro = game_gym = None
    rustboro_turns: set[int] = set()
    gym_pre: set[int] = set()
    lab_turns: set[int] = set()
    turn1 = False
    with open(path) as f:
        for line in f:
            try:
                e = json.loads(line)
            except ValueError:
                continue
            seq = e.get("seq", -1)
            if cutoff is not None and seq > cutoff:
                break
            last_seq = max(last_seq, seq)
            kind = e.get("type")
            if kind == "run_start":
                start = e
            elif kind == "assistant":
                turn = e.get("turn", 0)
                turns = max(turns, turn)
                text = (e.get("thinking") or "") + "\n" + (e.get("text") or "")
                if RUSTBORO.search(text) and game_rustboro is None:
                    rustboro_turns.add(turn)
                    turn1 = turn1 or turn == 1
                if GYM.search(text) and game_gym is None:
                    gym_pre.add(turn)
                    turn1 = turn1 or turn == 1
                if LAB_IN_RUSTBORO.search(text):
                    lab_turns.add(turn)
            elif kind in ("tool_result", "dialogue_auto_advance"):
                text = e.get("text") or "" if kind == "tool_result" else json.dumps(e, ensure_ascii=False)
                if game_rustboro is None and RUSTBORO.search(text):
                    game_rustboro = e.get("turn")
                if game_gym is None and GYM.search(text):
                    game_gym = e.get("turn")
    if start is None or turns == 0:
        return None
    evaluation = start.get("evaluation") or {}
    preset = evaluation.get("preset_id") or ""
    return {
        "run": os.path.basename(os.path.dirname(path)),
        "cutoff_seq": last_seq,
        "cohort": cohort(preset),
        "preset": preset,
        "start": os.path.basename((start.get("start_state") or {}).get("path", "boot")),
        "max_wall_ms": (start.get("budgets") or {}).get("max_wall_ms"),
        "prompt_names_rustboro": bool(RUSTBORO.search(start.get("system_prompt") or "")),
        "turns": turns,
        "game_first_rustboro_turn": game_rustboro,
        "game_first_gym_turn": game_gym,
        "rustboro_turns_before_game": len(rustboro_turns),
        "gym_turns_before_game": len(gym_pre),
        "goal_named_at_turn_1": turn1,
        "lab_in_rustboro_turns": len(lab_turns),
    }


def paths() -> list[str]:
    found = []
    for day in DAYS:
        for lane in LANES:
            found += glob.glob(os.path.join(RUNS, f"{day}T*_{lane}_*", "events.jsonl"))
    return sorted(p for p in found if os.path.basename(os.path.dirname(p)) < STARTED_BEFORE)


def main() -> int:
    mode = sys.argv[1] if len(sys.argv) > 1 else "check"
    if mode == "write":
        rows = [r for r in (scan(p, None) for p in paths()) if r is not None]
        with open(MANIFEST, "w") as f:
            json.dump(rows, f, indent=1, ensure_ascii=False)
            f.write("\n")
        print(f"wrote {len(rows)} runs")
        return 0
    rows = json.load(open(MANIFEST))
    drift = 0
    eligible = {r["run"] for r in (scan(p, None) for p in paths()) if r is not None}
    listed = {r["run"] for r in rows}
    for run in sorted(eligible ^ listed):
        drift += 1
        print("population:", run, "eligible but not listed" if run in eligible else "listed but not eligible")
    for row in rows:
        again = scan(os.path.join(RUNS, row["run"], "events.jsonl"), row["cutoff_seq"])
        if again != row:
            drift += 1
            print("drift:", row["run"])
    print(f"checked {len(rows)} runs against {len(eligible)} eligible, {drift} drifted")
    return 1 if drift else 0


if __name__ == "__main__":
    sys.exit(main())
