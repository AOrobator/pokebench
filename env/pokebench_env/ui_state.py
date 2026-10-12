"""What is on screen for the player to respond to: an open dialog box and a menu cursor.

Addresses are pokeemerald symbols in the US ROM, found and labelled from live
RAM dumps against screenshots (docs/findings/game-state.md). The message
buffer and the menu struct both keep their last contents after the box or
menu closes, so each is reported only while its window is drawn: the game
blanks a window's pixel buffer when it clears the window, and marks it
removed (bg 0xFF) when it frees it.
"""

import struct
from dataclasses import dataclass

from pokebench_env.game_screen import ReadMemory
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
    return "".join(out).strip()


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
