"""Shared Pokémon markings editor, called only by a verified active parent owner."""

import struct
from typing import TYPE_CHECKING

from pokebench_env.game_screen import ReadMemory
from pokebench_env.menus import _ewram, owner_details

if TYPE_CHECKING:
    from pokebench_env.ui_state import ActiveUi

MARKINGS_POINTER = 0x0203A124
SPRITES = 0x02020630
MARKINGS_CURSOR_CALLBACK = 0x0811FF7D


def read_markings_ui(read: ReadMemory, callback: int, *, ready: bool) -> "ActiveUi":
    from pokebench_env.ui_state import ActiveUi

    details = owner_details(read, callback)
    try:
        pointer = struct.unpack("<I", read(MARKINGS_POINTER, 4))[0]
        if not _ewram(pointer, 0x34):
            raise ValueError("invalid MonMarkingsMenu pointer")
        raw = read(pointer, 0x34)
        flags = raw[4]
        cursor = struct.unpack_from("<b", raw, 5)[0]
        edited = list(raw[6:10])
        sprite = struct.unpack_from("<I", raw, 0x24)[0]
        if flags > 15 or cursor not in range(6) or any(value not in (0, 1) for value in edited):
            raise ValueError("invalid markings cursor/flags")
        if sprite not in range(SPRITES, SPRITES + 64 * 0x44, 0x44):
            raise ValueError("invalid markings cursor sprite pointer")
        cursor_raw = read(sprite, 0x44)
        if (
            cursor_raw[0x3E] & 5 != 1
            or struct.unpack_from("<I", cursor_raw, 0x1C)[0] != MARKINGS_CURSOR_CALLBACK
        ):
            raise ValueError("markings cursor sprite is not active visible verified owner")
        options = ["CIRCLE", "SQUARE", "TRIANGLE", "HEART", "OK", "CANCEL"]
        details.update(
            {
                "options": options,
                "selected_index": cursor,
                "saved_markings": flags,
                "edited_markings": edited,
            }
        )
        return ActiveUi(
            "pokemon_markings",
            options[cursor],
            ready,
            "UP/DOWN selects; A toggles marking or accepts; B cancels",
            details=details,
        )
    except (ValueError, struct.error, IndexError) as error:
        return ActiveUi(
            "pokemon_markings",
            None,
            None,
            "Markings observation unavailable",
            str(error),
            details=details,
        )
