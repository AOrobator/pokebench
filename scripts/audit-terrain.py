"""Read every Emerald ROM map and inventory nonordinary terrain; never starts a game.

Run from the repo root with PYTHONPATH=env and POKEBENCH_ROM set. Output contains
only map identities/counts, never ROM bytes, tile layouts or save data.
"""

import argparse
import hashlib
import json
import os
import subprocess
from collections import Counter
from pathlib import Path

from pokebench_env.exit_labels import read_rom_map
from pokebench_env.game_state import MapNames
from pokebench_env.live_map import _symbol
from pokebench_env.rom import resolve_rom
from pokebench_env.terrain_visibility import TERRAIN


def audit(source: Path) -> dict[str, object]:
    rom = resolve_rom(os.environ).read_bytes()
    names = MapNames.load(source / "data/maps")
    totals: Counter[int] = Counter()
    rows: list[dict[str, object]] = []
    failures: list[list[int]] = []

    def read(address: int, size: int) -> bytes:
        offset = address - 0x08000000
        if not 0 <= offset <= len(rom) - size:
            raise ValueError("map parser requested bytes outside verified ROM")
        return rom[offset : offset + size]

    for map_id in names.ids():
        layout = read_rom_map(read, map_id)
        if layout is None:
            failures.append(list(map_id))
            continue
        counts: Counter[int] = Counter()
        hidden: Counter[int] = Counter()
        for y in range(layout.height):
            for x in range(layout.width):
                block = layout.block(x, y)
                if block is None:
                    raise ValueError("missing in-bounds block")
                _, collision, _, behavior = block
                if collision or behavior not in TERRAIN:
                    continue
                counts[behavior] += 1
                if _symbol((x, y), (-1, -1), set(), set(), collision, behavior) == ".":
                    hidden[behavior] += 1
        totals.update(counts)
        rows.append(
            {
                "map_id": list(map_id),
                "name": names.name(map_id),
                "width": layout.width,
                "height": layout.height,
                "special_tiles": {f"{b:02X}": n for b, n in sorted(counts.items())},
                "legacy_special_drawn_clear": {
                    f"{b:02X}": n for b, n in sorted(hidden.items())
                },
            }
        )
    revision = subprocess.run(
        ["git", "-C", str(source), "rev-parse", "HEAD"],
        check=True,
        text=True,
        capture_output=True,
    ).stdout.strip()
    return {
        "rom_sha1": hashlib.sha1(rom, usedforsecurity=False).hexdigest(),
        "source_revision": revision,
        "scope": "All default ROM map headers. Runtime alternate layouts and mutations require native readback; this inventory is not executable reachability proof.",
        "maps": rows,
        "unreadable": failures,
        "behavior_totals": {
            f"{b:02X}": {
                "tiles": n,
                "maps": [r["name"] for r in rows if f"{b:02X}" in r["special_tiles"]],
            }
            for b, n in sorted(totals.items())
        },
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    result = audit(args.source)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(f"Read {len(result['maps'])} maps; {len(result['unreadable'])} unreadable")
