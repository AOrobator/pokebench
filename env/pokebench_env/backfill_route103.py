"""Recover route103_rival for runs recorded before the reader had it, from their raw-RAM archives.

The values go to runs/<id>/derived/route103_rival.jsonl; the run's events.jsonl is never changed.
Only ROUTE 103 and OLDALE TOWN states are decoded; the three splits that need it happen there.
"""

import json
import os
import re
import sys
import tempfile
from pathlib import Path

from pokebench_env.raw_ram import load_raw_ram
from pokebench_env.route103_rival import read_route103_rival

SOURCE = "raw-ram-route103-v1"
FEATURE = "route103-rival-splits-v1"
PLACES = {"ROUTE103", "ROUTE 103", "OLDALE TOWN"}
SAVE_BLOCK_1_POINTER = 0x03005D8C
RUN_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")


class BackfillError(Exception):
    pass


def backfill(run_dir: Path) -> list[dict[str, object]]:
    lines = (run_dir / "events.jsonl").read_text(encoding="utf8").splitlines()
    events = [json.loads(line) for line in lines if line.strip() != ""]
    start = events[0] if events else None
    if not isinstance(start, dict) or start.get("type") != "run_start":
        raise BackfillError("no run_start")
    if FEATURE in (start.get("harness_features") or []):
        raise BackfillError("records route103_rival natively")
    rows: list[dict[str, object]] = []
    for event in events:
        if not isinstance(event, dict):
            continue
        ref = event.get("raw_ram")
        if (
            event.get("type") != "state"
            or event.get("started") is not True
            or not isinstance(event.get("location"), str)
            or event.get("location") not in PLACES
            or not isinstance(ref, dict)
        ):
            continue
        path, sha256, seq = ref.get("path"), ref.get("sha256"), event.get("seq")
        if not isinstance(path, str) or not isinstance(sha256, str) or type(seq) is not int:
            raise BackfillError(f"malformed state at seq {seq}")
        if not re.fullmatch(r"raw-ram/[0-9]{8,}\.json\.gz", path):
            raise BackfillError(f"unexpected raw RAM path {path}")
        read = load_raw_ram(run_dir / path, sha256)
        save1 = int.from_bytes(read(SAVE_BLOCK_1_POINTER, 4), "little")
        if not 0x02000000 <= save1 <= 0x02040000 - 0x159C:
            continue
        rival = read_route103_rival(read, save1, event.get("in_battle") is True)
        rows.append({"seq": seq, "raw_ram": path, "sha256": sha256, "route103_rival": rival.json()})
    derived = run_dir / "derived"
    if derived.is_symlink() or (derived.exists() and not derived.is_dir()):
        raise BackfillError("derived must be a plain directory inside the run")
    derived.mkdir(exist_ok=True)
    header = {"v": 1, "run": run_dir.name, "source": SOURCE}
    # An exclusively created, unpredictable temp file: a planted symlink is never written through.
    fd, temp = tempfile.mkstemp(dir=derived, prefix=".route103_rival.", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf8") as file:
            file.write("".join(json.dumps(r) + "\n" for r in [header, *rows]))
        os.replace(temp, derived / "route103_rival.jsonl")
    except BaseException:
        Path(temp).unlink(missing_ok=True)
        raise
    return rows


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print("usage: backfill_route103 RUNS_ROOT RUN_ID...", file=sys.stderr)
        return 2
    root, ids = Path(argv[0]), argv[1:]
    if any(not RUN_ID.fullmatch(run) for run in ids):
        print("run ids must be plain run directory names", file=sys.stderr)
        return 2
    status = 0
    for run in ids:
        try:
            rows = backfill(root / run)
        except (BackfillError, OSError, ValueError) as error:
            print(f"{run}: {error}", file=sys.stderr)
            status = 1
            continue
        print(f"{run}: {len(rows)} states written to derived/route103_rival.jsonl")
    return status


if __name__ == "__main__":  # pragma: no cover - thin CLI entry
    sys.exit(main(sys.argv[1:]))
