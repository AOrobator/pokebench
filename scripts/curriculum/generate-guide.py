#!/usr/bin/env python3
"""Generate packages/agent/src/rayquaza-guide-data.ts from docs/curriculum/rayquaza-guide-*.md, in file order."""
import json
import re
import sys
from pathlib import Path

ROW = re.compile(r"^\| (?P<after>[A-Z0-9_:]+) \| (?P<map>\S+) \| (?P<note>.+?) \| (?P<source>.+?) \|$")
HEADER = """import type {GuideStep} from "./rayquaza-guide.js";

// Generated from docs/curriculum/rayquaza-guide-*.md by scripts/curriculum/generate-guide.py. Do not edit by hand.
export const RAYQUAZA_GUIDE_STEPS:readonly GuideStep[]=[
"""


def map_ids(path: Path) -> dict[str, list[int]]:
    groups = json.loads(path.read_text())
    return {name: [g, n] for g, group in enumerate(groups["group_order"]) for n, name in enumerate(groups[group])}


def rows(text: str, ids: dict[str, list[int]]) -> list[dict[str, object]]:
    out: list[dict[str, object]] = []
    for line in text.splitlines():
        match = ROW.match(line)
        if match is None or match["after"] == "After":
            continue
        note = match["note"].removesuffix(" CHECK")
        if len(note) > 300:
            raise SystemExit(f"{match['after']}: note is over 300 characters")
        step: dict[str, object] = {"after": match["after"], "map": None if match["map"] == "-" else match["map"], "note": note}
        if match["after"].startswith("MAP:"):
            step["enter"] = ids[match["after"].removeprefix("MAP:")]
        out.append(step)
    return out


def main() -> None:
    root = Path(sys.argv[1])
    ids = map_ids(Path(sys.argv[2]))
    files = sorted((root / "docs/curriculum").glob("rayquaza-guide-*.md"))
    files = [f for f in files if "fact-check" not in f.name]
    steps = [row for f in sorted(files, key=lambda f: "badges" not in f.name) for row in rows(f.read_text(), ids)]
    body = "".join(f" {json.dumps(step, ensure_ascii=False)},\n" for step in steps)
    (root / "packages/agent/src/rayquaza-guide-data.ts").write_text(HEADER + body + "];\n")
    print(len(steps), "steps")


if __name__ == "__main__":
    main()
