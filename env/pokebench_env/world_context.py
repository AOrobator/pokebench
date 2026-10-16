"""Live field objects, coordinate scripts and owned field-message text.

Layouts: pret/pokeemerald 731ad5b global.fieldmap.h/event_data.c;
US addresses verified against native map records and ROM instructions.
Sprite labels describe graphics, not inferred character names or objectives.
"""

import json
import struct
from collections.abc import Callable
from dataclasses import asdict, dataclass, replace
from hashlib import sha256
from pathlib import Path

from pokebench_env.game_screen import TASKS, ReadMemory
from pokebench_env.live_map import MAP_HEADER, MAP_OFFSET, OBJECT_EVENTS
from pokebench_env.map_rules import TRIGGER_ELEVATION_RULE
from pokebench_env.native_text import decode_native_text, native_text_payload
from pokebench_env.ui_state import ActiveUi, _window_drawn

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
    identity: str | None = None

    def json(self) -> dict[str, object]:
        value = asdict(self)
        if self.identity is None:
            value.pop("identity")
        return value


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
class NoMessage:
    """readout-truth-v1: the game shows no field message (never in the state JSON).

    sFieldMessageBoxMode is FIELD_MESSAGE_BOX_HIDDEN, window 0 is not drawn, no
    Task_DrawFieldMessage is live and text printer 0 is idle. `script` names what the
    global script context is doing (None: no script is running).
    """

    script: str | None


# readout-truth-v1: field menus that own the window while the message printer is idle
# (menu_pc.py owners: Task_HandleYesNoInput, Task_HandleMultichoiceInput,
# Task_HandleScrollingMultichoiceInput's grid, the callback YES/NO task).
TRUTH_MENU_OWNERS = {
    "field_yes_no": 0x080E215D,
    "field_multichoice": 0x080E2059,
    "pc_access": 0x080E2059,
    "field_multichoice_grid": 0x080E2309,
    "field_confirmation": 0x08121FDD,
}
SCRIPT_PHASES = {
    0x08099D95: "script_pause",
    0x0809A671: "movement_wait",
    0x0809833D: "message_close_wait",
}


def read_no_message(read: ReadMemory) -> NoMessage | None:
    # Every read must be whole: a short read is a failure, never an absence.
    mode, active = read(FIELD_MESSAGE_MODE, 1), read(FIELD_PRINTER + 0x1B, 1)
    tasks, status = read(TASKS, 16 * 0x28), read(GLOBAL_SCRIPT_STATUS, 1)
    context = read(GLOBAL_SCRIPT, 12)
    if (len(mode), len(active), len(tasks), len(status), len(context)) != (1, 1, 0x280, 1, 12):
        return None
    if mode[0] != 0 or active[0] != 0 or _window_drawn(read, 0):
        return None
    if any(
        tasks[i + 4] == 1 and int.from_bytes(tasks[i : i + 4], "little") == DRAW_FIELD_MESSAGE
        for i in range(0, len(tasks), 0x28)
    ):
        return None
    # script.c: CONTEXT_SHUTDOWN (2) or SCRIPT_MODE_STOPPED (0) means no script runs.
    if status[0] == 2 or context[1] == 0:
        return NoMessage(None)
    if context[1] == 2:
        return NoMessage(
            SCRIPT_PHASES.get(int.from_bytes(context[4:8], "little"), "script_running")
        )
    return NoMessage("script_running")


@dataclass(frozen=True)
class FieldActivity:
    """Qualified non-message owner; never establishes advance-button readiness."""

    phase: str
    owner: int


def read_field_activity(
    read: ReadMemory, native_ui: ActiveUi | None, *, truth: bool = False
) -> FieldActivity | None:
    mode = read(FIELD_MESSAGE_MODE, 1)[0]
    tasks = read(TASKS, 16 * 0x28)
    owners = [
        tasks[i : i + 0x28]
        for i in range(0, len(tasks), 0x28)
        if tasks[i + 4] == 1 and int.from_bytes(tasks[i : i + 4], "little") == DRAW_FIELD_MESSAGE
    ]
    if mode in (2, 3) and len(owners) == 1 and int.from_bytes(owners[0][8:10], "little") in (0, 1):
        return FieldActivity("message_initializing", DRAW_FIELD_MESSAGE)
    if mode != 0:
        return None
    # A drawn window can retain old pixels after Task_DrawFieldMessage exits.
    # script.c only calls nativePtr in NATIVE mode; BYTECODE retains that pointer.
    context = read(GLOBAL_SCRIPT, 12)
    if read(GLOBAL_SCRIPT_STATUS, 1)[0] == 0 and read(FIELD_PRINTER + 0x1B, 1)[0] == 0:
        owner = int.from_bytes(context[4:8], "little")
        if context[1] == 2 and owner in SCRIPT_PHASES:
            return FieldActivity(SCRIPT_PHASES[owner], owner)
        script = int.from_bytes(context[8:12], "little")
        if context[1] == 1 and 0x08000000 <= script < 0x0A000000:
            return FieldActivity("script_running", script)
    # Reuse the stricter interface decoder; a task pointer alone is insufficient.
    # Only generic ownership is exposed, never the ablated menu's contents.
    if native_ui is not None and native_ui.diagnostic is None:
        known = {"pc_player_menu": 0x0816AF99, "menu_message_printing": 0x08121F3D}
        # readout-truth-v1: a known field YES/NO or multichoice box is a valid owner too.
        expected = (known | TRUTH_MENU_OWNERS if truth else known).get(native_ui.phase)
        matches = sum(
            tasks[i + 4] == 1 and int.from_bytes(tasks[i : i + 4], "little") == expected
            for i in range(0, len(tasks), 0x28)
        )
        if expected is not None and matches == 1:
            return FieldActivity("other_interface", expected)
    return None


@dataclass(frozen=True)
class WorldContext:
    objects: tuple[LiveObject, ...]
    triggers: tuple[ScriptTrigger, ...]
    dialogue: str | None
    message: FieldMessage | None = None
    message_diagnostic: str | None = None
    field_activity: FieldActivity | None = None
    # readout-truth-v1 only; text facts, never in the state JSON.
    no_message: NoMessage | None = None

    def json(self) -> dict[str, object]:
        value = asdict(self)
        value.pop("no_message")
        if self.message is None:
            value.pop("message")
        if self.message_diagnostic is None:
            value.pop("message_diagnostic")
        if self.field_activity is None:
            value.pop("field_activity")
        return value

    def text(
        self,
        *,
        objects: bool = True,
        triggers: bool = True,
        dialogue: bool = True,
        message: bool = False,
        rules_in_prompt: bool = False,
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
            if not rules_in_prompt:
                lines.append(TRIGGER_ELEVATION_RULE)
        if dialogue and self.dialogue is not None:
            lines.append(
                "Active field-message buffer (can include pages not yet displayed):\n"
                + self.dialogue
            )
        elif dialogue and self.no_message is not None:
            lines.append("Field-message text: none (no message box is open).")
        elif dialogue:
            lines.append(
                "Field-message text: unavailable; do not infer that the dialogue box is closed."
            )
        if message:
            if self.field_activity is not None:
                lines.append(
                    f"Field activity: {self.field_activity.phase}; "
                    "not an input-ready field message. Inspect the active interface "
                    "and control lock before acting."
                )
            if self.message is None and self.field_activity is None and self.no_message:
                lines.append(
                    "Field-message phase: no message is open and no script is running."
                    if self.no_message.script is None
                    else "Field-message phase: no message is open; a script is running "
                    f"({self.no_message.script})."
                )
            elif self.message is None and self.field_activity is None:
                lines.append(
                    "Field-message phase: unavailable; do not infer a cutscene "
                    "or an input-ready dialogue."
                )
            elif self.message is not None:
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
            if self.message_diagnostic is not None:
                lines.append("STATE COVERAGE ERROR: " + self.message_diagnostic)
        return "\n".join(lines)


def read_world_context(
    read: ReadMemory,
    position: tuple[int, int],
    map_id: tuple[int, int],
    save1: int,
    decode: Callable[[bytes], str],
    *,
    message_phase: bool = False,
    native_ui: ActiveUi | None = None,
    truth: bool = False,
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
    diagnostic = None
    if read(FIELD_MESSAGE_MODE, 1)[0] in (2, 3) or (
        message is not None and message.phase == "dismiss_wait"
    ):
        raw = read(STRING_VAR4, 1000)
        try:
            payload = native_text_payload(raw)
            if message is not None:
                message = replace(message, identity=sha256(payload).hexdigest())
            dialogue = decode_native_text(
                payload + b"\xff",
                require_terminator=True,
                line_breaks={0xFA: "\n", 0xFB: "\n", 0xFE: "\n"},
            )
        except ValueError as error:
            diagnostic = f"harness bug: field-message text: {error}"
            if message is not None:
                # Malformed token arity cannot qualify a string boundary.
                # Preserve the full bounded native buffer identity instead.
                message = replace(message, identity=sha256(raw).hexdigest())
    activity = (
        read_field_activity(read, native_ui, truth=truth)
        if message_phase and message is None and _window_drawn(read, 0)
        else None
    )
    if message_phase and message is None and activity is None and _window_drawn(read, 0):
        printer = read(FIELD_PRINTER, 0x24)
        context = read(GLOBAL_SCRIPT, 12)
        tasks = read(TASKS, 16 * 0x28)
        functions = [
            f"0x{int.from_bytes(tasks[i : i + 4], 'little'):08X}"
            for i in range(0, len(tasks), 0x28)
            if tasks[i + 4] == 1
        ]
        owner_diagnostic = (
            f"field-message owner unqualified; mode {read(FIELD_MESSAGE_MODE, 1)[0]}; "
            f"printer active {printer[0x1B]}, state {printer[0x1C]}, "
            f"cursor 0x{int.from_bytes(printer[:4], 'little'):08X}; "
            f"script status {read(GLOBAL_SCRIPT_STATUS, 1)[0]}, mode {context[1]}, "
            f"native 0x{int.from_bytes(context[4:8], 'little'):08X}; tasks {','.join(functions)}"
        )
        diagnostic = (
            owner_diagnostic if diagnostic is None else diagnostic + "; " + owner_diagnostic
        )
    # readout-truth-v1: "none open" only when nothing above found a message or a failure.
    quiet = truth and dialogue is None and message is None and diagnostic is None
    return WorldContext(
        tuple(objects),
        tuple(triggers),
        dialogue,
        message,
        diagnostic,
        activity,
        read_no_message(read) if quiet else None,
    )
