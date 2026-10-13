"""US Emerald script identities, qualified by exact ROM bytes.

Catalog: pret/pokeemerald 731ad5b, unique complete background-event array
matches in ROM SHA1 f3ae088181bf583e55daf962a92bb46f4f1d07b7. The pointer
and SHA256 of16 bytes own identity; coordinates always come from the current event.
Names are script labels, not proof an interaction is currently permitted.
"""

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path

from pokebench_env.game_screen import ReadMemory


@dataclass(frozen=True)
class ScriptName:
    name: str
    signature: str


def load_names() -> dict[int, ScriptName]:
    raw = json.loads(Path(__file__).with_name("interaction-names.json").read_text())
    if not isinstance(raw, dict):
        raise ValueError("malformed interaction-name catalog")
    result = {}
    for pointer, entry in raw.items():
        if (
            not isinstance(pointer, str)
            or not pointer.isdecimal()
            or not 0x08000000 <= int(pointer) < 0x0A000000
            or not isinstance(entry, dict)
            or not isinstance(entry.get("name"), str)
            or not entry["name"]
            or not isinstance(entry.get("signature"), str)
            or len(entry["signature"]) != 64
        ):
            raise ValueError("malformed interaction-name entry")
        bytes.fromhex(entry["signature"])
        signature = entry["signature"]
        result[int(pointer)] = ScriptName(entry["name"], signature)
    return result


SCRIPT_NAMES = load_names()


def script_name(read: ReadMemory, pointer: int) -> str | None:
    entry = SCRIPT_NAMES.get(pointer)
    if entry is None or hashlib.sha256(read(pointer, 16)).hexdigest() != entry.signature:
        return None
    return entry.name
