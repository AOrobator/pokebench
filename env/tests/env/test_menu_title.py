import struct

import pytest

from pokebench_env.menu_title import TITLE_MAIN, TITLE_TASKS, TRANSITIONS, read_title_ui
from tests.env.test_menus import put_task
from tests.env.test_ui_state import Memory


def title(task=0x080AAD65):
    m = Memory()
    put_task(m, 0, task, [])
    m.put(0x03005D8C, struct.pack("<I", 0x02028000))
    return m


@pytest.mark.parametrize("task", TITLE_TASKS)
def test_title_actual_task_input_scope(task):
    ui = read_title_ui(title(task).read, TITLE_MAIN)
    assert ui.ready and ui.diagnostic is None and ui.phase == TITLE_TASKS[task]
    if task == 0x080AAD65:
        assert ui.details["rtc_reset_enabled"] is False
        assert "UP+B+SELECT: CLEAR SAVE" in ui.details["available_controls"]
    else:
        assert len(ui.details["available_controls"]) == 4 and "SKIP ANIMATION" in ui.selected


def test_title_rtc_chord_requires_both_source_owners():
    m = title()
    m.put(0x02028000 + 0x1270 + 0x8C2 // 8, bytes([1 << (0x8C2 % 8)]))
    assert not read_title_ui(m.read, TITLE_MAIN).details["rtc_reset_enabled"]
    m.put(0x02028000 + 0x139C + 0x2C * 2, struct.pack("<H", 0x920))
    ui = read_title_ui(m.read, TITLE_MAIN)
    assert (
        ui.details["rtc_reset_enabled"]
        and "LEFT+B+SELECT: RESET RTC" in ui.details["available_controls"]
    )
    m.put(0x02028000 + 0x1270 + 0x8C2 // 8, b"\0")
    assert not read_title_ui(m.read, TITLE_MAIN).details["rtc_reset_enabled"]


@pytest.mark.parametrize("callback", TRANSITIONS)
def test_title_and_main_handoff_does_not_run_stale_title_task(callback):
    ui = read_title_ui(title().read, callback)
    assert not ui.ready and ui.selected is None and ui.diagnostic is None


def test_invalid_title_owners_fail_explicitly():
    assert read_title_ui(Memory().read, TITLE_MAIN).diagnostic
    m = title()
    put_task(m, 1, 0x080AAD65, [])
    assert read_title_ui(m.read, TITLE_MAIN).diagnostic
