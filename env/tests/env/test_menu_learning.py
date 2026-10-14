import struct

import pytest

from pokebench_env.game_screen import TASKS
from pokebench_env.menu_learning import (
    LEARNING_CALLBACK,
    LEARNING_POINTER,
    VALID_STATES,
    read_learning_ui,
)
from pokebench_env.pokemon import MOVE_NAMES
from tests.env.test_menus import list_task
from tests.env.test_ui_state import Memory, menu, text, window

POINTER = 0x02014000


def learning(state: int = 4) -> Memory:
    memory = Memory()
    memory.put(LEARNING_POINTER, struct.pack("<I", POINTER))
    memory.put(POINTER, bytes([state]))
    memory.put(POINTER + 0x12, struct.pack("<2H", 33, 45))
    memory.put(POINTER + 0x110, bytes([3, 3, 1]))
    for move, name in [(33, "TACKLE"), (45, "GROWL")]:
        memory.put(MOVE_NAMES + move * 13, text(name) + b"\xff")
    list_task(memory, 1)
    memory.put(TASKS + 40 + 20, struct.pack("<HH", 3, 3))
    memory.put(0x02011000 + 4, struct.pack("<i", 33))
    memory.put(0x02012000, text("TACKLE") + b"\xff")
    menu(memory, 1, 1, 2)
    window(memory, 2, 0, 6, 4, True)
    return memory


@pytest.mark.parametrize("state", sorted(VALID_STATES))
def test_state_machine_input_readiness(state: int) -> None:
    ui = read_learning_ui(learning(state).read, LEARNING_CALLBACK)
    assert ui.diagnostic is None
    assert ui.ready is (state in (4, 6, 9, 13, 18, 26, 33))
    assert ui.details["available_move_ids"] == [33, 45]
    if state in (4, 6):
        assert ui.selected == "TACKLE"
    if state in (9, 13, 18, 26):
        assert ui.selected == "NO"


@pytest.mark.parametrize(
    "fault", ["pointer", "state", "party", "slot", "count", "move", "list", "menu"]
)
def test_invalid_learning_owner_data(fault: str) -> None:
    memory = learning()
    if fault == "pointer":
        memory.put(LEARNING_POINTER, b"\0" * 4)
    if fault == "state":
        memory.put(POINTER, b"\7")
    if fault == "party":
        memory.put(POINTER + 0x44, b"\6")
    if fault == "slot":
        memory.put(POINTER + 0x45, b"\5")
    if fault == "count":
        memory.put(POINTER + 0x110, b"\0")
    if fault == "move":
        memory.put(POINTER + 0x12, struct.pack("<H", 355))
    if fault == "list":
        memory.put(0x02011000 + 4, struct.pack("<i", 13))
    if fault == "menu":
        memory.put(POINTER, rb"\9")
        menu(memory, 1, 2, 2)
    ui = read_learning_ui(memory.read, LEARNING_CALLBACK)
    assert ui.diagnostic
    assert ui.selected is None
    assert ui.ready is None


def test_other_callback_returns_none() -> None:
    assert read_learning_ui(Memory().read, 0) is None
