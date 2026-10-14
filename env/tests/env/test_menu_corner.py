import struct

import pytest

from pokebench_env.menu_corner import (
    GRID_OPTIONS,
    ROULETTE_CALLBACK,
    ROULETTE_INPUT,
    ROULETTE_POINTER,
    ROULETTE_WAIT,
    SLOTS_CALLBACK,
    SLOTS_INFO_TASK,
    SLOTS_POINTER,
    SLOTS_TASK,
    read_corner_ui,
)
from tests.env.test_menus import put_task
from tests.env.test_ui_state import Memory, menu, window

HEAP = 0x02010000


def slots(state=5):
    m = Memory()
    raw = bytearray(0x68)
    raw[0] = state
    struct.pack_into("<4h", raw, 0xC, 100, 0, 0, 1)
    m.put(SLOTS_POINTER, struct.pack("<I", HEAP))
    m.put(HEAP, raw)
    put_task(m, 0, SLOTS_TASK, [])
    return m


def roulette(function=ROULETTE_INPUT, selection=6):
    m = Memory()
    raw = bytearray(0xB8)
    raw[0x19] = 1
    struct.pack_into("<HHI", raw, 0xA8, 65535, 3, 0x08140969)
    m.put(ROULETTE_POINTER, struct.pack("<I", HEAP))
    m.put(HEAP, raw)
    data = [0] * 16
    data[4] = selection
    data[13] = 100
    put_task(m, 0, function, data)
    for i in range(1, 20):
        m.put(0x085B6154 + i * 20 + 8, struct.pack("<I", 1 << i))
    return m


def test_bet_and_stop_changes():
    m = slots()
    ui = read_corner_ui(m.read, SLOTS_CALLBACK)
    assert ui.selected == "BET 1" and ui.ready and ui.details["coins"] == 100
    m.put(HEAP, bytes([12]))
    m.put(HEAP + 0x18, struct.pack("<h", 2))
    ui = read_corner_ui(m.read, SLOTS_CALLBACK)
    assert (ui.phase, ui.selected, ui.ready) == ("slots_stop_reel", "RIGHT", True)


@pytest.mark.parametrize("state", range(29))
def test_all_slots_phases(state):
    m = slots(state)
    if state == 22:
        menu(m, 1, 1, 0)
        window(m, 0, 0, 5, 4, True)
    if state == 8:
        put_task(m, 1, SLOTS_INFO_TASK, [6])
        window(m, 1, 0, 20, 13, True)
    ui = read_corner_ui(m.read, SLOTS_CALLBACK)
    assert ui.diagnostic is None
    assert ui.ready == (state in (5, 7, 8, 12, 22, 24, 26))
    if state == 22:
        assert ui.selected == "NO"


@pytest.mark.parametrize(
    "offset,value", [(0, 29), (1, 6), (0xC, 255), (0x12, 4), (0x18, 4), (0x28, 21)]
)
def test_invalid_slots_state(offset, value):
    m = slots()
    m.put(HEAP + offset, bytes([value]))
    if offset == 0xC:
        m.put(HEAP + offset, struct.pack("<h", -1))
    ui = read_corner_ui(m.read, SLOTS_CALLBACK)
    assert ui.ready is None and ui.diagnostic


def test_help_transition_and_invalid_window():
    m = slots(8)
    put_task(m, 1, SLOTS_INFO_TASK, [4])
    assert read_corner_ui(m.read, SLOTS_CALLBACK).ready is False
    put_task(m, 1, SLOTS_INFO_TASK, [6])
    assert read_corner_ui(m.read, SLOTS_CALLBACK).diagnostic


@pytest.mark.parametrize("selection", range(1, 20))
def test_roulette_grid_selection(selection):
    m = roulette(selection=selection)
    m.put(HEAP + 8, struct.pack("<I", 1 << selection))
    ui = read_corner_ui(m.read, ROULETTE_CALLBACK)
    assert (ui.selected, ui.ready) == (GRID_OPTIONS[selection], True)
    assert ui.details["selected_available"] is False
    assert ui.details["unavailable_selections"] == [selection]
    assert len(ui.details["options"]) == 19


def test_roulette_continue_and_transition():
    m = roulette(ROULETTE_WAIT)
    ui = read_corner_ui(m.read, ROULETTE_CALLBACK)
    assert ui.selected == "CONTINUE" and ui.ready
    m.put(HEAP + 0xAA, b"\0\0")
    assert read_corner_ui(m.read, ROULETTE_CALLBACK).ready is False
    m = roulette(0x081408A9)
    assert read_corner_ui(m.read, ROULETTE_CALLBACK).ready is False


@pytest.mark.parametrize(
    "mutation", ["pointer", "owner", "selection", "table", "bet", "continuation"]
)
def test_invalid_roulette_owner(mutation):
    m = roulette(ROULETTE_WAIT if mutation == "continuation" else ROULETTE_INPUT)
    if mutation == "pointer":
        m.put(ROULETTE_POINTER, b"\0" * 4)
    elif mutation == "owner":
        put_task(m, 0, 0x08000001, [])
    elif mutation == "selection":
        m.put(0x03005E00 + 16, b"\0\0")
    elif mutation == "table":
        m.put(HEAP + 4, b"\2")
    elif mutation == "bet":
        m.put(HEAP + 0x19, b"\2")
    elif mutation == "continuation":
        m.put(HEAP + 0xAC, b"\0" * 4)
    ui = read_corner_ui(m.read, ROULETTE_CALLBACK)
    assert ui.ready is None and ui.diagnostic


def test_other_callback_and_fade():
    m = slots()
    assert read_corner_ui(m.read, 0) is None
    m.put(0x02037FDB, b"\x80")
    assert read_corner_ui(m.read, SLOTS_CALLBACK).ready is False


@pytest.mark.parametrize("mutation", ["task", "pointer", "reel", "quit", "help", "coins"])
def test_remaining_corner_invalid_owners(mutation):
    m = slots(
        12 if mutation == "reel" else 22 if mutation == "quit" else 8 if mutation == "help" else 5
    )
    if mutation == "task":
        m.put(0x03005E00, b"\0" * 4)
    elif mutation == "pointer":
        m.put(SLOTS_POINTER, b"\0" * 4)
    elif mutation == "reel":
        m.put(HEAP + 0x18, b"\3\0")
    elif mutation == "coins":
        m = roulette()
        m.put(0x03005E00 + 8 + 26, struct.pack("<h", -1))
        assert read_corner_ui(m.read, ROULETTE_CALLBACK).diagnostic
        return
    assert read_corner_ui(m.read, SLOTS_CALLBACK).diagnostic
