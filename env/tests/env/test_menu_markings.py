import struct

import pytest

from pokebench_env.menu_markings import MARKINGS_POINTER, SPRITES, read_markings_ui
from tests.env.test_ui_state import Memory

POINTER = 0x02014000


def markings() -> Memory:
    memory = Memory()
    memory.put(MARKINGS_POINTER, struct.pack("<I", POINTER))
    memory.put(POINTER + 4, bytes([3, 2, 1, 0, 1, 0]))
    memory.put(POINTER + 0x24, struct.pack("<I", SPRITES))
    memory.put(SPRITES + 0x1C, struct.pack("<I", 0x0811FF7D))
    memory.put(SPRITES + 0x3E, b"\1")
    return memory


def test_live_markings_cursor_and_edited_values() -> None:
    ui = read_markings_ui(markings().read, 0x081C7401, ready=True)
    assert ui.selected == "TRIANGLE"
    assert ui.details["edited_markings"] == [1, 0, 1, 0]
    assert ui.details["saved_markings"] == 3
    assert read_markings_ui(markings().read, 0x081C7401, ready=False).ready is False


@pytest.mark.parametrize(
    "fault", ["pointer", "flags", "cursor", "array", "sprite", "callback", "inactive", "hidden"]
)
def test_markings_requires_visible_valid_owned_cursor(fault: str) -> None:
    memory = markings()
    if fault == "pointer":
        memory.put(MARKINGS_POINTER, b"\0" * 4)
    if fault == "flags":
        memory.put(POINTER + 4, b"\x10")
    if fault == "cursor":
        memory.put(POINTER + 5, b"\6")
    if fault == "array":
        memory.put(POINTER + 6, b"\2")
    if fault == "sprite":
        memory.put(POINTER + 0x24, b"\0" * 4)
    if fault == "callback":
        memory.put(SPRITES + 0x1C, b"\0" * 4)
    if fault == "inactive":
        memory.put(SPRITES + 0x3E, b"\0")
    if fault == "hidden":
        memory.put(SPRITES + 0x3E, b"\5")
    ui = read_markings_ui(memory.read, 0x081C7401, ready=True)
    assert ui.diagnostic
    assert ui.selected is None
