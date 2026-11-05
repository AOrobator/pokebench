#!/usr/bin/env python3
"""Generate packages/agent/src/rayquaza-guide-data.ts from docs/curriculum/rayquaza-guide-*.md, in file order."""
import json
import re
import sys
from pathlib import Path

ROW = re.compile(r"^\| `?(?P<after>[A-Za-z0-9_:]+)`? \| `?(?P<map>[^`\s]+)`? \| (?P<note>.+?) \| (?P<source>.+?) \|$")
TO = re.compile(r"\bTO:(\w+)")
TOWN_TYPES = {"MAP_TYPE_TOWN", "MAP_TYPE_CITY"}
OUTDOOR_TYPES = TOWN_TYPES | {"MAP_TYPE_ROUTE", "MAP_TYPE_OCEAN_ROUTE"}
HEADER = """import type {GuideStep} from "./rayquaza-guide.js";

// Generated from docs/curriculum/rayquaza-guide-*.md by scripts/curriculum/generate-guide.py. Do not edit by hand.
export const RAYQUAZA_GUIDE_STEPS:readonly GuideStep[]=[
"""


def map_ids(path: Path) -> dict[str, list[int]]:
    groups = json.loads(path.read_text())
    return {name: [g, n] for g, group in enumerate(groups["group_order"]) for n, name in enumerate(groups[group])}


def map_types(path: Path, ids: dict[str, list[int]]) -> dict[str, str]:
    out: dict[str, str] = {}
    for name in ids:
        info = path.parent / name / "map.json"
        if info.exists():
            out[name] = json.loads(info.read_text())["map_type"]
    return out


def rows(text: str, ids: dict[str, list[int]], types: dict[str, str]) -> list[dict[str, object]]:
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
        if match["after"].startswith("AT:"):
            _, name, x, y = match["after"].split(":")
            step["at"] = {"id": ids[name], "x": int(x), "y": int(y)}
        tagged = TO.search(match["source"])
        if tagged:
            if types.get(tagged[1]) not in TOWN_TYPES:
                raise SystemExit(f"{match['after']}: {tagged[1]} is not a town or city")
            step["to"] = {"map": tagged[1], "id": ids[tagged[1]]}
        out.append(step)
    return out


def main() -> None:
    root = Path(sys.argv[1])
    ids = map_ids(Path(sys.argv[2]))
    types = map_types(Path(sys.argv[2]), ids)
    files = sorted((root / "docs/curriculum").glob("rayquaza-guide-*.md"))
    files = [f for f in files if "fact-check" not in f.name]
    steps = [row for f in sorted(files, key=lambda f: "badges" not in f.name) for row in rows(f.read_text(), ids, types)]
    body = "".join(f" {json.dumps(step, ensure_ascii=False)},\n" for step in steps)
    keys = sorted(f"{ids[name][0]}/{ids[name][1]}" for name, kind in types.items() if kind in OUTDOOR_TYPES)
    outdoors = f"export const RAYQUAZA_OUTDOOR_MAPS:readonly string[]={json.dumps(keys)};\n"
    (root / "packages/agent/src/rayquaza-guide-data.ts").write_text(HEADER + body + "];\n\n// Maps where Teleport and Fly work (Overworld_MapTypeAllowsTeleportAndFly).\n" + outdoors)
    print(len(steps), "steps")


if __name__ == "__main__":
    main()
