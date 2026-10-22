"""Qualified placements, not live NPC presence (pret/pokeemerald 731ad5bf).

TrySpawnObjectEvents bounds templates by current map event count and FlagGet.
MovementType_None is empty; FaceDirection only faces. Scripts may still relocate
objects, so even these stationary idle types never establish current presence.
"""

import struct
from dataclasses import dataclass

from pokebench_env.character_presence import TEMPLATES
from pokebench_env.game_screen import ReadMemory
from pokebench_env.live_map import MAP_HEADER, OBJECT_EVENTS

SWITCH = "static-npc-template-approach-v1"
STATIONARY = frozenset({0, 7, 8, 9, 10})


def _exact(read: ReadMemory, address: int, size: int) -> bytes:
    body = read(address, size)
    if len(body) != size:
        raise ValueError("short static template read")
    return body


def _rom(pointer: int) -> bool:
    return 0x08000000 <= pointer < 0x0A000000


@dataclass(frozen=True)
class StaticNpcTemplate:
    local_id: int
    x: int
    y: int
    elevation: int
    movement_type: int
    hide_flag: int

    def json(self) -> dict[str, int]:
        return {
            "local_id": self.local_id,
            "x": self.x,
            "y": self.y,
            "elevation": self.elevation,
            "movement_type": self.movement_type,
            "hide_flag": self.hide_flag,
        }


@dataclass(frozen=True)
class StaticNpcTemplates:
    map_id: tuple[int, int]
    templates: tuple[StaticNpcTemplate, ...]

    def json(self) -> dict[str, object]:
        return {
            "map_id": list(self.map_id),
            "source": "saveblock1_templates",
            "templates": [template.json() for template in self.templates],
        }


def read_static_npc_templates(
    read: ReadMemory, save1: int, map_id: tuple[int, int]
) -> StaticNpcTemplates | None:
    try:
        if not 0x02000000 <= save1 < 0x02040000 - TEMPLATES - 64 * 24:
            return None
        if tuple(_exact(read, save1 + 4, 2)) != map_id:
            return None
        events = int.from_bytes(_exact(read, MAP_HEADER + 4, 4), "little")
        if not _rom(events) or events % 4:
            return None
        header = _exact(read, events, 8)
        count, canonical = header[0], int.from_bytes(header[4:8], "little")
        if count > 64 or not _rom(canonical) or canonical % 4:
            return None
        rows = _exact(read, save1 + TEMPLATES, count * 24)
        originals = _exact(read, canonical, count * 24)
        loaded = set()
        bodies = _exact(read, OBJECT_EVENTS, 16 * 0x24)
        for offset in range(0, len(bodies), 0x24):
            body = bodies[offset : offset + 0x24]
            if body[0] & 1 and not body[2] & 1 and (body[10], body[9]) == map_id:
                loaded.add(body[8])  # Includes invisible loaded slots: never a template fallback.
        found = []
        seen: set[int] = set()
        for offset in range(0, len(rows), 24):
            entry, original = rows[offset : offset + 24], originals[offset : offset + 24]
            local_id, movement = entry[0], entry[9]
            if local_id in seen:
                return None
            seen.add(local_id)
            script = int.from_bytes(entry[0x10:0x14], "little")
            if local_id == 0 or local_id == 255 or local_id in loaded:
                continue
            if original[0] != local_id or original[0x10:0x14] != entry[0x10:0x14]:
                continue
            if entry[2] != 0 or movement not in STATIONARY or entry[8] > 15:
                continue
            if int.from_bytes(entry[0xC:0xE], "little") != 0 or not _rom(script):
                continue
            if (
                _exact(read, script, 1)[0] == 0x5C
            ):  # trainerbattle; never execute or infer script outcomes.
                continue
            flag = int.from_bytes(entry[0x14:0x16], "little")
            if flag >= 0x960:  # Special/invalid flags need another verified owner.
                continue
            if flag and _exact(read, save1 + 0x1270 + flag // 8, 1)[0] & (1 << (flag % 8)):
                continue
            x, y = struct.unpack_from("<hh", entry, 4)
            if not 0 <= x <= 255 or not 0 <= y <= 255:
                continue
            found.append(StaticNpcTemplate(local_id, x, y, entry[8], movement, flag))
        return StaticNpcTemplates(map_id, tuple(found))
    except (ValueError, OSError, KeyError, IndexError, struct.error):
        return None
