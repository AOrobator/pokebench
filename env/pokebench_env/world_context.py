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

from pokebench_env.game_screen import TASKS, ReadMemory
from pokebench_env.live_map import MAP_HEADER, MAP_OFFSET, OBJECT_EVENTS
from pokebench_env.ui_state import _window_drawn

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


FIELD_PRINTER = 0x020201B0
DRAW_FIELD_MESSAGE = 0x08098155
GLOBAL_SCRIPT = 0x03000E40
GLOBAL_SCRIPT_STATUS = 0x03000E38
WAIT_FOR_A_OR_B = 0x0809AC99
TEXT_FLAGS = 0x03003014


@dataclass(frozen=True)
class FieldMessage:
    phase: str
    cursor: int
    ready: bool

    def json(self) -> dict[str, object]:
        return asdict(self)


def read_field_message(read: ReadMemory) -> FieldMessage | None:
    mode = read(FIELD_MESSAGE_MODE, 1)[0]
    if mode not in (0, 2, 3) or not _window_drawn(read, 0):
        return None
    if mode == 0:
        context = read(GLOBAL_SCRIPT, 12)
        printer = read(FIELD_PRINTER, 0x24)
        cursor = int.from_bytes(printer[:4], "little") - STRING_VAR4
        if (
            read(GLOBAL_SCRIPT_STATUS, 1)[0] == 0
            and context[1] == 2
            and int.from_bytes(context[4:8], "little") == WAIT_FOR_A_OR_B
            and printer[4] == 0
            and printer[0x1B] == 0
            and 0 <= cursor < 1000
        ):
            return FieldMessage("dismiss_wait", cursor, True)
        return None
    tasks = read(TASKS, 16 * 0x28)
    owners = [
        body
        for offset in range(0, len(tasks), 0x28)
        if len(body := tasks[offset : offset + 0x28]) == 0x28
        and int.from_bytes(body[:4], "little") == DRAW_FIELD_MESSAGE
        and body[4] == 1
        and int.from_bytes(body[8:10], "little") == 2
    ]
    printer = read(FIELD_PRINTER, 0x24)
    cursor = int.from_bytes(printer[:4], "little") - STRING_VAR4
    if len(owners) != 1 or printer[4] != 0 or printer[0x1B] != 1 or not 0 <= cursor < 1000:
        return None
    phase = {
        0: "printing",
        1: "button_wait",
        2: "page_wait",
        3: "scroll_wait",
        4: "scrolling",
        5: "audio_wait",
        6: "printing_pause",
    }.get(printer[0x1C])
    if phase is None:
        return None
    ready = mode == 2 and not read(TEXT_FLAGS, 1)[0] & 4 and printer[0x1C] in (1, 2, 3)
    return FieldMessage(phase, cursor, ready)


@dataclass(frozen=True)
class WorldContext:
    objects: tuple[LiveObject, ...]
    triggers: tuple[ScriptTrigger, ...]
    dialogue: str | None
    message: FieldMessage | None = None
    message_diagnostic: str | None = None

    def json(self) -> dict[str, object]:
        value = asdict(self)
        if self.message is None:
            value.pop("message")
        if self.message_diagnostic is None:
            value.pop("message_diagnostic")
        return value

    def text(
        self,
        *,
        objects: bool = True,
        triggers: bool = True,
        dialogue: bool = True,
        message: bool = False,
    ) -> str:
        lines = []
        if objects:
            lines.append(
                "Field objects (ids are map-local, not globally unique; "
                "sprite kinds are not personal names):"
            )
            for o in self.objects:
                lines.append(
                    f"- map {o.map_id[0]}/{o.map_id[1]} object {o.local_id}: "
                    f"sprite {o.sprite_kind or 'unknown'} "
                    f"(graphics {o.graphics_id}) at ({o.x},{o.y})"
                )
        if triggers:
            lines.append(
                "Nearby script-trigger tiles (a clear terrain tile can still run a script):"
            )
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
        if dialogue and self.dialogue is not None:
            lines.append(
                "Active field-message buffer (can include pages not yet displayed):\n"
                + self.dialogue
            )
        elif dialogue:
            lines.append(
                "Field-message text: unavailable; do not infer that the dialogue box is closed."
            )
        if message:
            if self.message is None:
                lines.append(
                    "Field-message phase: unavailable; do not infer a cutscene "
                    "or an input-ready dialogue."
                )
                if self.message_diagnostic is not None:
                    lines.append("STATE COVERAGE ERROR: " + self.message_diagnostic)
            else:
                m = self.message
                lines.append(
                    f"Field-message phase: {m.phase}; buffer cursor {m.cursor}; "
                    + (
                        "A or B advances this message; use one input, then inspect."
                        if m.ready
                        else "Message is printing, scrolling, waiting or automatic; "
                        "inspect before continuing."
                    )
                    + " The buffer can include later pages. "
                    "Repeated identical text is not evidence of story progress."
                )
        return "\n".join(lines)


def read_world_context(
    read: ReadMemory,
    position: tuple[int, int],
    map_id: tuple[int, int],
    save1: int,
    decode: Callable[[bytes], str],
    *,
    message_phase: bool = False,
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
    message = read_field_message(read) if message_phase else None
    dialogue = None
    if read(FIELD_MESSAGE_MODE, 1)[0] in (2, 3) or (
        message is not None and message.phase == "dismiss_wait"
    ):  # NORMAL / AUTO_SCROLL; 1 is unused.
        raw = read(STRING_VAR4, 1000)
        if 0xFF in raw:
            raw = raw[: raw.index(0xFF)]
            # Unhandled extended controls/placeholders fail unavailable instead
            # of silently dropping formatting operands or inventing text.
            if not any(b in (0xFC, 0xFD) for b in raw):
                decoded = ["\n" if b in (0xFA, 0xFB, 0xFE) else decode(bytes([b])) for b in raw]
                if all(s != "?" or b == 0xAC for b, s in zip(raw, decoded, strict=True)):
                    dialogue = "".join(decoded)
    diagnostic = None
    if message_phase and message is None and _window_drawn(read, 0):
        printer = read(FIELD_PRINTER, 0x24)
        context = read(GLOBAL_SCRIPT, 12)
        tasks = read(TASKS, 16 * 0x28)
        functions = [
            f"0x{int.from_bytes(tasks[i : i + 4], 'little'):08X}"
            for i in range(0, len(tasks), 0x28)
            if tasks[i + 4] == 1
        ]
        diagnostic = (
            f"field-message owner unqualified; mode {read(FIELD_MESSAGE_MODE, 1)[0]}; "
            f"printer active {printer[0x1B]}, state {printer[0x1C]}, "
            f"cursor 0x{int.from_bytes(printer[:4], 'little'):08X}; "
            f"script status {read(GLOBAL_SCRIPT_STATUS, 1)[0]}, mode {context[1]}, "
            f"native 0x{int.from_bytes(context[4:8], 'little'):08X}; tasks {','.join(functions)}"
        )
    return WorldContext(tuple(objects), tuple(triggers), dialogue, message, diagnostic)
