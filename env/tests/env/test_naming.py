import struct

import pytest

from pokebench_env.game_state import decode_text, read_game_state
from pokebench_env.naming import NAMING_POINTER, SPRITES, NamingState, read_naming
from pokebench_env.readout import format_readout, state_json
from tests.env.test_game_state import MAPS, NAMING, Memory, game, text

POINTER = 0x02000010


def keyboard(page: int = 1, column: int = 0, row: int = 0, phase: int = 2) -> Memory:
    m = game(NAMING)
    m.put(NAMING_POINTER, struct.pack("<I", POINTER))
    m.put(POINTER + 0x1E10, bytes([phase]))
    m.put(POINTER + 0x1E22, bytes([page, 3]))
    m.put(POINTER + 0x1800, text("AB") + b"\xff")
    m.put(SPRITES + 3 * 0x44 + 0x2E, struct.pack("<hh", column, row))
    m.put(SPRITES + 3 * 0x44 + 0x3E, b"\x01")
    return m


@pytest.mark.parametrize(
    ("page", "column", "row", "key"),
    [
        (1, 1, 0, "B"),
        (2, 1, 0, "b"),
        (0, 0, 1, "5"),
        (0, 4, 3, "'"),
        (1, 6, 0, "SPACE"),
        (1, 8, 0, "PAGE"),
        (2, 8, 1, "BACK"),
        (0, 6, 2, "OK"),
    ],
)
def test_keyboard_pages_cursor_and_side_buttons(page: int, column: int, row: int, key: str) -> None:
    s = read_naming(keyboard(page, column, row).read, decode_text)
    assert s is not None
    assert (s.text, s.column, s.row, s.key, s.ready) == ("AB", column, row, key, True)


@pytest.mark.parametrize(
    ("page", "column", "row"), [(3, 0, 0), (1, -1, 0), (1, 9, 0), (1, 0, -1), (1, 0, 4), (1, 8, 3)]
)
def test_invalid_page_or_cursor_is_unavailable(page: int, column: int, row: int) -> None:
    assert read_naming(keyboard(page, column, row).read, decode_text) is None


@pytest.mark.parametrize("pointer", [0, 0x03000000, 0x02000011, 0x0203FFFF])
def test_unallocated_or_invalid_pointer_is_unavailable(pointer: int) -> None:
    m = keyboard()
    m.put(NAMING_POINTER, struct.pack("<I", pointer))
    assert read_naming(m.read, decode_text) is None


def test_uncreated_or_inactive_sprite_is_unavailable() -> None:
    m = keyboard()
    m.put(POINTER + 0x1E23, b"\x40")
    assert read_naming(m.read, decode_text) is None
    m = keyboard()
    m.put(SPRITES + 3 * 0x44 + 0x3E, b"\x00")
    assert read_naming(m.read, decode_text) is None


def test_transition_is_reported_and_editor_name_is_not_save_data() -> None:
    state = read_game_state(keyboard(phase=1).read, MAPS)
    assert not state.started and state.name is None
    assert state.naming == NamingState("AB", "uppercase", 0, 0, "A", False)
    assert state_json(state)["naming"] == {
        "text": "AB",
        "page": "uppercase",
        "column": 0,
        "row": 0,
        "key": "A",
        "ready": False,
    }
    assert "transitioning; wait and observe" in format_readout(state)
    assert "Name being edited" in format_readout(state)
    assert "Naming input: ready" in NamingState("", "symbols", 0, 0, "0", True).readout()
