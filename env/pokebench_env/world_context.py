"""Live field objects, coordinate scripts and owned field-message text.

Layouts: pret/pokeemerald 731ad5b global.fieldmap.h/event_data.c;
US addresses verified against native map records and ROM instructions.
Sprite labels describe graphics, not inferred character names or objectives.
"""

import json
import struct
from collections.abc import Callable
from dataclasses import asdict, dataclass
from pathlib import Path

from pokebench_env.game_screen import ReadMemory
from pokebench_env.live_map import MAP_HEADER, MAP_OFFSET, OBJECT_EVENTS

FIELD_MESSAGE_MODE = 0x020375BC
STRING_VAR4 = 0x02021FC4
SAVE_VARIABLES = 0x139C


def graphics_names() -> dict[int, str]:
    raw = json.loads(Path(__file__).with_name("event-graphics.json").read_text())
    if not isinstance(raw, dict) or not all(
        isinstance(k, str) and k.isdecimal() and isinstance(v, str) for k, v in raw.items()
    ):
        raise ValueError("malformed graphics labels")
    return {int(k): v for k, v in raw.items()}


GRAPHICS = graphics_names()


def rom_pointer(value: int) -> bool:
    return 0x08000000 <= value < 0x0A000000 and value % 4 == 0


@dataclass(frozen=True)
class LiveObject:
    local_id: int
    map_id: tuple[int, int]
    graphics_id: int
    sprite_kind: str | None
    x: int
    y: int


@dataclass(frozen=True)
class ScriptTrigger:
    x: int
    y: int
    elevation: int
    variable: int
    required_value: int
    current_value: int | None
    condition_met: bool | None
    script_pointer: int


@dataclass(frozen=True)
class WorldContext:
    objects: tuple[LiveObject, ...]
    triggers: tuple[ScriptTrigger, ...]
    dialogue: str | None

    def json(self) -> dict[str, object]:
        return asdict(self)

    def text(self) -> str:
        lines = [
            "Field objects (ids are map-local, not globally unique; "
            "sprite kinds are not personal names):"
        ]
        for o in self.objects:
            lines.append(
                f"- map {o.map_id[0]}/{o.map_id[1]} object {o.local_id}: "
                f"sprite {o.sprite_kind or 'unknown'} "
                f"(graphics {o.graphics_id}) at ({o.x},{o.y})"
            )
        lines.append("Nearby script-trigger tiles (a clear terrain tile can still run a script):")
        for t in self.triggers:
            status = (
                "matches"
                if t.condition_met is True
                else "does not match"
                if t.condition_met is False
                else "unavailable"
            )
            lines.append(
                f"- ({t.x},{t.y}), elevation {t.elevation}: variable "
                f"0x{t.variable:04X}={t.current_value}, needs {t.required_value}; "
                f"condition {status}; script 0x{t.script_pointer:08X}"
            )
        lines.append(
            "Trigger elevation must also match the player on entry (0 matches any elevation)."
        )
        if self.dialogue is not None:
            lines.append(
                "Active field-message buffer (can include pages not yet displayed):\n"
                + self.dialogue
            )
        else:
            lines.append(
                "Field-message text: unavailable; do not infer that the dialogue box is closed."
            )
        return "\n".join(lines)


def read_world_context(
    read: ReadMemory,
    position: tuple[int, int],
    map_id: tuple[int, int],
    save1: int,
    decode: Callable[[bytes], str],
) -> WorldContext | None:
    events = int.from_bytes(read(MAP_HEADER + 4, 4), "little")
    if not rom_pointer(events):
        return None
    x, y = position
    objects = []
    bodies = read(OBJECT_EVENTS, 16 * 0x24)
    for offset in range(0, len(bodies), 0x24):
        body = bodies[offset : offset + 0x24]
        if not body[0] & 1 or body[1] & 0x20 or body[2] & 1 or (body[10], body[9]) != map_id:
            continue
        ox, oy = struct.unpack_from("<hh", body, 0x10)
        ox -= MAP_OFFSET
        oy -= MAP_OFFSET
        if abs(ox - x) <= 7 and abs(oy - y) <= 7:
            objects.append(LiveObject(body[8], map_id, body[5], GRAPHICS.get(body[5]), ox, oy))
    header = read(events, 16)
    count = header[2]
    pointer = int.from_bytes(header[12:16], "little")
    triggers = []
    if count and rom_pointer(pointer):
        raw = read(pointer, count * 16)
        for offset in range(0, len(raw), 16):
            tx, ty, elevation, var, wanted, script = struct.unpack_from("<hhBxHH2xI", raw, offset)
            if not 0x08000000 <= script < 0x0A000000 or abs(tx - x) > 7 or abs(ty - y) > 7:
                continue
            if var < 0x4000:
                value: int | None = var
            elif 0x4000 <= var <= 0x40FF and 0x02000000 <= save1 <= 0x02040000 - 0x159C:
                value = int.from_bytes(
                    read(save1 + SAVE_VARIABLES + 2 * (var - 0x4000), 2), "little"
                )
            else:
                value = None
            wanted &= 0xFF  # TryRunCoordEventScript casts its index to u8.
            matches = True if var == 0 else None if value is None else value == wanted
            triggers.append(ScriptTrigger(tx, ty, elevation, var, wanted, value, matches, script))
    dialogue = None
    if read(FIELD_MESSAGE_MODE, 1)[0] in (2, 3):  # NORMAL / AUTO_SCROLL; 1 is unused.
        raw = read(STRING_VAR4, 1000)
        if 0xFF in raw:
            raw = raw[: raw.index(0xFF)]
            # Unhandled extended controls/placeholders fail unavailable instead
            # of silently dropping formatting operands or inventing text.
            if not any(b in (0xFC, 0xFD) for b in raw):
                decoded = ["\n" if b in (0xFA, 0xFB, 0xFE) else decode(bytes([b])) for b in raw]
                if all(s != "?" or b == 0xAC for b, s in zip(raw, decoded, strict=True)):
                    dialogue = "".join(decoded)
    return WorldContext(tuple(objects), tuple(triggers), dialogue)
