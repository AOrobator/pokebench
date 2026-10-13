"""Rebuild the qualified sign-script catalog from the reference and operator ROM.

Usage: python scripts/build-interaction-names.py SOURCE_MAPS ROM OUTPUT_JSON RECEIPT_JSON
The ROM is only read; output contains SHA256 digests, never ROM bytes.
Ambiguous arrays and non-sign event layouts deliberately remain unresolved.
"""

import hashlib
import json
import re
import struct
import sys
from pathlib import Path

source, rom_path, output, receipt = map(Path, sys.argv[1:])
rom = rom_path.read_bytes()
if hashlib.sha1(rom).hexdigest() != "f3ae088181bf583e55daf962a92bb46f4f1d07b7":
    raise ValueError("Catalog generation requires the verified US Emerald ROM")
names = {}
proof = []
facing = {"BG_EVENT_PLAYER_FACING_ANY": 0, "BG_EVENT_PLAYER_FACING_NORTH": 1,
          "BG_EVENT_PLAYER_FACING_SOUTH": 2, "BG_EVENT_PLAYER_FACING_EAST": 3,
          "BG_EVENT_PLAYER_FACING_WEST": 4}
for path in sorted(source.glob("*/map.json")):
    events = json.loads(path.read_text()).get("bg_events", [])
    if not events or any(e["type"] != "sign" for e in events):
        continue
    prefixes = [struct.pack("<HHBB2x", e["x"], e["y"], e["elevation"],
                            facing[e["player_facing_dir"]]) for e in events]
    hits = []
    start = 0
    while True:
        at = rom.find(prefixes[0], start)
        if at < 0:
            break
        start = at + 1
        if at % 4 or at + len(events) * 12 > len(rom):
            continue
        if all(rom[at + 12*i:at + 12*i + 8] == prefix and
               0x08000000 <= struct.unpack_from("<I", rom, at + 12*i + 8)[0]
               < 0x08000000 + len(rom) for i, prefix in enumerate(prefixes)):
            hits.append(at)
    if len(hits) != 1:
        continue
    for i, event in enumerate(events):
        pointer = struct.unpack_from("<I", rom, hits[0] + 12*i + 8)[0]
        symbol = event["script"]
        suffix = symbol.split("_EventScript_")[-1]
        label = re.sub(r"(?<=[a-z])(?=[A-Z])", " ", suffix).replace("_", " ")
        label = {"WallClock": "Wall clock", "PC": "PC", "GameCube": "GameCube",
                 "Notebook": "Notebook"}.get(suffix, label)
        key = str(pointer)
        entry = {"name": label, "script": symbol,
                 "signature": hashlib.sha256(rom[pointer-0x08000000:pointer-0x08000000+16]).hexdigest()}
        if key in names and names[key]["name"] != label:
            raise ValueError("Conflicting script labels")
        names[key] = entry
        proof.append({"map": path.parent.name, "event": i, "x": event["x"], "y": event["y"],
                      "pointer": hex(pointer), "script": symbol, "label": label,
                      "table": hex(hits[0] + 0x08000000)})
output.write_text(json.dumps(names, indent=2, sort_keys=True) + "\n")
receipt.write_text(json.dumps({"rom_sha1": hashlib.sha1(rom).hexdigest(),
                              "records": proof}, indent=2) + "\n")
