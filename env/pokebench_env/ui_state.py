"""What is on screen for the player to respond to: an open dialog box and a menu cursor.

Addresses are pokeemerald symbols in the US ROM, found and labelled from live
RAM dumps against screenshots (docs/findings/game-state.md). The message
buffer and the menu struct both keep their last contents after the box or
menu closes, so each is reported only while its window is drawn: the game
blanks a window's pixel buffer when it clears the window, and marks it
removed (bg 0xFF) when it frees it.
"""

import struct
from collections.abc import Mapping
from dataclasses import dataclass

from pokebench_env.game_screen import ReadMemory, Screen
from pokebench_env.gba_text import GBA_TEXT

STRING_VAR4 = 0x02021FC4
STRING_VAR4_SIZE = 1000
MESSAGE_WINDOW = 0
# Screens where window 0 was checked to be the standard message box.
MESSAGE_SCREENS = frozenset({"overworld", "birch_speech"})
MENU = 0x0203CD90
WINDOWS = 0x02020004
WINDOW_SIZE = 12
WINDOW_REMOVED = 0xFF
EWRAM = range(0x02000000, 0x02040000)

MESSAGE_TEXT = {
    **GBA_TEXT,
    0x1B: "é",
    0x2D: "&",
    0x5C: "(",
    0x5D: ")",
    0xB1: "“",
    0xB2: "”",
    0xB3: "‘",
    0xF0: ":",
}
LINE_BREAKS = {0xFE: " ", 0xFA: " ", 0xFB: " | "}
# Argument bytes after 0xFC <code> (pokeemerald EXT_CTRL_CODE_*).
CONTROL_ARGS = {0x04: 3, 0x0B: 2, 0x10: 2} | dict.fromkeys(
    (0x01, 0x02, 0x03, 0x05, 0x06, 0x08, 0x0C, 0x0D, 0x0E, 0x11, 0x12, 0x13, 0x14), 1
)


@dataclass(frozen=True)
class Menu:
    selected: int
    options: int


def decode_message(raw: bytes) -> str:
    out: list[str] = []
    i = 0
    while i < len(raw) and raw[i] != 0xFF:
        byte = raw[i]
        if byte == 0xFC:
            if i + 1 >= len(raw):
                break
            i += 2 + CONTROL_ARGS.get(raw[i + 1], 0)
            continue
        out.append(LINE_BREAKS.get(byte) or MESSAGE_TEXT.get(byte, "?"))
        i += 1
    return "".join(out).strip(" |")


def _window_drawn(read: ReadMemory, window_id: int) -> bool:
    bg, _left, _top, width, height, _pal, _base, pixels = struct.unpack(
        "<BBBBBBHI", read(WINDOWS + WINDOW_SIZE * window_id, WINDOW_SIZE)
    )
    size = width * height * 32
    if bg == WINDOW_REMOVED or size == 0 or pixels not in EWRAM or pixels + size > EWRAM.stop:
        return False
    return len(set(read(pixels, size))) > 1


def read_dialog(read: ReadMemory, screen_kind: str) -> str | None:
    if screen_kind not in MESSAGE_SCREENS or not _window_drawn(read, MESSAGE_WINDOW):
        return None
    return decode_message(read(STRING_VAR4, STRING_VAR4_SIZE)) or None


def read_menu(read: ReadMemory) -> Menu | None:
    cursor, _minimum, maximum, window_id = struct.unpack("<bbbB", read(MENU + 2, 4))
    if maximum <= 0 or not 0 <= cursor <= maximum or not _window_drawn(read, window_id):
        return None
    return Menu(selected=cursor + 1, options=maximum + 1)


@dataclass(frozen=True)
class ActiveUi:
    """Active input owner, separate from stale generic menu/save buffers."""

    phase: str
    selected: str | None
    ready: bool | None
    controls: str
    diagnostic: str | None = None
    value: str | None = None

    def json(self) -> dict[str, object]:
        from dataclasses import asdict

        return asdict(self)

    def text(self) -> str:
        readiness = (
            "unavailable" if self.ready is None else ("ready" if self.ready else "not ready")
        )
        selection = "" if self.selected is None else f"; selected {self.selected}"
        diagnostic = "" if self.diagnostic is None else f"; STATE COVERAGE ERROR: {self.diagnostic}"
        value = "" if self.value is None else f"; value {self.value}"
        return (
            f"Interface: {self.phase}; input {readiness}{selection}{value}; "
            f"{self.controls}{diagnostic}"
        )


# Verified US ROM task pointers and main_menu.c ownership, not address ranges.
BIRCH_PHASES = {
    0x08030C19: "birch_transition",
    0x08030C91: "birch_transition",
    0x08030CD5: "birch_transition",
    0x08030D85: "birch_transition",
    0x08030DC9: "gender_question",
    0x08030E09: "gender_question_printing",
    0x08030E39: "gender_selection",
    0x08030ED5: "gender_transition",
    0x08030F7D: "gender_transition",
    0x08030FD5: "name_question",
    0x08031015: "name_question_printing",
    0x08031041: "name_entry_prompt",
    0x08031091: "naming_transition",
    0x0803261D: "name_confirmation_transition",
    0x08031105: "name_confirmation_printing",
    0x08031145: "name_confirmation_printing",
    0x08031189: "name_confirmation",
    0x08031221: "name_confirmed_transition",
    0x08031259: "name_confirmed_transition",
    0x0803133D: "name_confirmed_transition",
    0x080313E5: "intro_ready",
    0x080314C5: "intro_transition",
    0x08031581: "intro_transition",
    0x080315BD: "intro_transition",
    0x08031631: "intro_transition",
}


def read_active_ui(read: ReadMemory, screen: "Screen") -> ActiveUi | None:
    from pokebench_env.game_screen import TASKS

    if screen.callback2 == 0x080E2E05:
        return ActiveUi(
            "naming_transition",
            None,
            False,
            "Naming editor initializing; selection input is not active",
        )
    if screen.callback2 == 0x080E4F59:
        from pokebench_env.gba_text import decode_text
        from pokebench_env.naming import NAMING_POINTER, read_naming

        naming = read_naming(read, decode_text)
        if naming is None:
            pointer = int.from_bytes(read(NAMING_POINTER, 4), "little")
            return ActiveUi(
                "unsupported",
                None,
                None,
                "Observe and report this coverage error",
                f"callback2 0x080E4F59; naming buffer or cursor invalid; pointer 0x{pointer:08X}",
            )
        if not naming.ready:
            return ActiveUi(
                "naming_transition",
                None,
                False,
                "Naming editor transition; selection input is not active",
            )
        return None
    if screen.kind == "field_transition":
        return ActiveUi(
            "field_transition", None, False, "Map load in progress; field input is not active"
        )
    if screen.kind == "clock":
        return read_clock_ui(read)
    if screen.callback2 not in (0x0802F6B1, 0x08031679) and screen.kind != "unknown":
        return None
    tasks = read(TASKS, 16 * 0x28)
    if len(tasks) != 16 * 0x28:
        raise ValueError("short active UI gTasks read")
    functions = [
        int.from_bytes(tasks[i : i + 4], "little")
        for i in range(0, len(tasks), 0x28)
        if tasks[i + 4] == 1
    ]
    owners = (
        [fn for fn in functions if fn in BIRCH_PHASES]
        if screen.callback2 in (0x0802F6B1, 0x08031679)
        else []
    )
    if len(owners) == 1:
        phase = BIRCH_PHASES[owners[0]]
        if phase in ("gender_selection", "name_confirmation"):
            menu = read_menu(read)
            if menu is None or menu.options != 2:
                return ActiveUi(
                    phase,
                    None,
                    None,
                    "Selection unavailable; observe again.",
                    f"active owner 0x{owners[0]:08X}; invalid or undrawn two-option menu",
                )
            labels = ("BOY", "GIRL") if phase == "gender_selection" else ("YES", "NO")
            controls = (
                "UP/DOWN selects; A accepts"
                if phase == "gender_selection"
                else "UP/DOWN selects; A accepts selection; "
                "B declines and returns to gender selection"
            )
            return ActiveUi(phase, labels[menu.selected - 1], True, controls)
        ready = phase == "name_entry_prompt"
        return ActiveUi(
            phase,
            None,
            ready,
            "A or B advances"
            if ready
            else "Transition or text printing; selection input is not active",
        )
    if screen.kind != "unknown" and not owners:
        return None
    return ActiveUi(
        "unsupported",
        None,
        None,
        "Observe and report this coverage error; do not infer a selection.",
        f"callback1 0x{screen.callback1:08X}; callback2 0x{screen.callback2:08X}; active tasks "
        + ",".join(f"0x{fn:08X}" for fn in functions),
    )


CLOCK_PHASES = {
    0x08134CB9: "clock_transition",
    0x08134CE9: "clock_adjustment",
    0x08134DC5: "clock_confirmation_transition",
    0x08134E31: "clock_confirmation",
    0x08134EA5: "clock_confirmed_transition",
    0x08134EE9: "clock_exit",
    0x08134F11: "clock_transition",
    0x08134F41: "clock_view",
    0x08134F79: "clock_exit",
    0x08134FB1: "clock_exit",
}


def read_clock_ui(read: ReadMemory) -> ActiveUi:
    from pokebench_env.game_screen import TASKS

    tasks = read(TASKS, 16 * 0x28)
    if len(tasks) != 16 * 0x28:
        raise ValueError("short clock task read")
    owners = [
        i
        for i in range(0, len(tasks), 0x28)
        if tasks[i + 4] == 1 and int.from_bytes(tasks[i : i + 4], "little") in CLOCK_PHASES
    ]
    if len(owners) != 1:
        return ActiveUi(
            "unsupported",
            None,
            None,
            "Observe and report this coverage error",
            "clock callback 0x08134C9D; active clock owner unavailable; active tasks "
            + ",".join(
                f"0x{int.from_bytes(tasks[i : i + 4], 'little'):08X}"
                for i in range(0, len(tasks), 0x28)
                if tasks[i + 4] == 1
            ),
        )
    index = owners[0]
    phase = CLOCK_PHASES[int.from_bytes(tasks[index : index + 4], "little")]
    hours, minutes = struct.unpack_from("<hh", tasks, index + 12)
    period = struct.unpack_from("<h", tasks, index + 18)[0]
    if not 0 <= hours <= 23 or not 0 <= minutes <= 59 or period not in (0, 1):
        return ActiveUi(
            phase,
            None,
            None,
            "Observe and report this coverage error",
            "invalid clock task hours/minutes/period",
        )
    value = f"{hours % 12 or 12}:{minutes:02d} " + ("AM" if period == 0 else "PM")
    if phase == "clock_confirmation":
        menu = read_menu(read)
        if menu is None or menu.options != 2:
            return ActiveUi(
                phase,
                None,
                None,
                "Observe again",
                "invalid or undrawn clock confirmation menu",
                value,
            )
        return ActiveUi(
            phase,
            ("YES", "NO")[menu.selected - 1],
            True,
            "UP/DOWN selects; A accepts selection; B returns to adjustment",
            value=value,
        )
    angle = struct.unpack_from("<h", tasks, index + 8)[0]
    ready = phase == "clock_view" or (phase == "clock_adjustment" and angle % 6 == 0)
    controls = (
        "LEFT/RIGHT changes time; A opens confirmation"
        if phase == "clock_adjustment"
        else "A or B closes clock"
        if phase == "clock_view"
        else "Clock transition; selection input is not active"
    )
    return ActiveUi(phase, None, ready, controls, value=value)


def active_ui_enabled_from_env(env: Mapping[str, str]) -> bool:
    flag = env.get("POKEBENCH_ACTIVE_UI")
    if flag not in (None, "0", "1"):
        raise ValueError("POKEBENCH_ACTIVE_UI must be 0 or 1")
    return flag != "0"
