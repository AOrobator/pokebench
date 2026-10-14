import struct

import pytest

from pokebench_env.menu_cable import CABLE_TASKS, read_cable_ui
from tests.env.test_menus import put_task
from tests.env.test_ui_state import Memory


def state(task, count=2, connected=False, mode=0):
    m = Memory()
    put_task(m, 0, task, [0, 2, 4, 0, 0, 1])
    m.put(0x030030E0, struct.pack("<I", count * 4 + (0x40 if connected else 0)))
    m.put(0x020375BC, bytes([mode]))
    m.put(0x03003100, bytes([count]))
    return m


@pytest.mark.parametrize("task", CABLE_TASKS)
def test_exact_link_task_has_native_phase(task):
    m = state(task)
    ui = read_cable_ui(m.read, 0x08085E5D)
    assert ui.phase == CABLE_TASKS[task] and ui.diagnostic is None
    assert ui.details["player_count"] == 2


def test_confirmation_player_threshold_and_connection_cancel():
    m = state(0x080B275D, count=1)
    assert read_cable_ui(m.read, 0x08085E5D).selected == "B: CANCEL"
    m = state(0x080B275D, count=2, connected=True)
    assert read_cable_ui(m.read, 0x08085E5D).selected == "A: CONFIRM PLAYERS"
    m = state(0x080B2805, count=2, connected=True)
    assert read_cable_ui(m.read, 0x08085E5D).ready
    m.put(0x03003100, b"\3")
    assert not read_cable_ui(m.read, 0x08085E5D).ready
    m = state(0x080B2805, connected=True, mode=1)
    assert not read_cable_ui(m.read, 0x08085E5D).ready


def test_invalid_native_link_bounds_explicit_bug():
    m = state(0x080B275D, count=5)
    ui = read_cable_ui(m.read, 0x08085E5D)
    assert ui.diagnostic and not ui.ready
    m = state(0x080B275D)
    put_task(m, 0, 0x080B275D, [0, 0, 4])
    assert read_cable_ui(m.read, 0x08085E5D).diagnostic


def test_unknown_callback_does_not_read():
    def no_read(address, size):
        raise AssertionError("unowned read")

    assert read_cable_ui(no_read, 0) is None
