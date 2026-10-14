import struct

import pytest

from pokebench_env.menu_item_use import AUTOMATIC_TASKS, INPUT_TASKS, read_item_use_ui
from pokebench_env.ui_state import STRING_VAR4
from tests.env.test_menus import put_task
from tests.env.test_ui_state import Memory, text, window


def state(task):
    m = Memory()
    put_task(m, 0, task, [0] * 10 + [2])
    window(m, 2, 0, 27, 4, True)
    m.put(STRING_VAR4, text("ITEM MESSAGE") + b"\xff")
    m.put(0x0203CE7C, struct.pack("<H", 13))
    return m


@pytest.mark.parametrize("task", INPUT_TASKS)
def test_item_use_source_input_message_and_printer_readiness(task):
    m = state(task)
    ui = read_item_use_ui(m.read, 0x081AAD5D)
    assert ui.phase == INPUT_TASKS[task][0] and ui.selected == INPUT_TASKS[task][1] and ui.ready
    assert ui.details["message"] == "ITEM MESSAGE" and ui.details["item_id"] == 13
    m.put(0x020201B0 + 2 * 0x24 + 0x1B, b"\1")
    assert not read_item_use_ui(m.read, 0x081AAD5D).ready


@pytest.mark.parametrize("task", AUTOMATIC_TASKS)
def test_exact_item_use_automatic_owners_never_invent_buttons(task):
    ui = read_item_use_ui(state(task).read, 0x081AAD5D)
    assert ui.phase == AUTOMATIC_TASKS[task] and not ui.ready and ui.selected is None


def test_shared_message_continuation_polls_actual_a_only_handler():
    m = state(0x08121F3D)
    m.put(0x0300117C, struct.pack("<I", 0x081AD351))
    m.put(0x0203A140, b"\2")
    ui = read_item_use_ui(m.read, 0x081AAD5D)
    assert ui.selected == "A: CONTINUE" and ui.ready
    m.put(0x0300117C, struct.pack("<I", 0x081ABBBD))
    assert read_item_use_ui(m.read, 0x081AAD5D) is None


def test_item_message_missing_content_is_harness_bug():
    m = state(0x081AD351)
    m.put(STRING_VAR4, b"\xff")
    assert read_item_use_ui(m.read, 0x081AAD5D).diagnostic
