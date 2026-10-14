import struct

import pytest

from pokebench_env.menu_aux import read_aux_ui
from pokebench_env.ui_state import STRING_VAR4
from tests.env.test_menus import put_task
from tests.env.test_ui_state import Memory, menu, text, window


def test_unowned_callback_does_not_read():
    def no_read(address, size):
        raise AssertionError("unowned read")

    assert read_aux_ui(no_read, 0x08085E5D) is None


@pytest.mark.parametrize(
    "function,ready", [(0x08177A21, False), (0x08177A51, True), (0x08177A99, False)]
)
def test_diploma_native_task_controls_readiness_and_contents(function, ready):
    m = Memory()
    put_task(m, 0, function, [])
    window(m, 0, 0, 28, 16, True)
    m.put(STRING_VAR4, text("DIPLOMA: ANDREW") + b"\xff")
    m.put(0x02021CC4, text("HOENN") + b"\xff")
    ui = read_aux_ui(m.read, 0x08177A09)
    assert ui.ready is ready and ui.diagnostic is None
    assert ui.details["pokedex_type"] == "HOENN"
    assert ui.details["message"] == "DIPLOMA: ANDREW"
    window(m, 0, 0, 28, 16, False)
    if ready:
        assert read_aux_ui(m.read, 0x08177A09).diagnostic


@pytest.mark.parametrize("selected", [0, 1])
def test_clear_save_actual_yes_no_and_invalid_window(selected):
    m = Memory()
    put_task(m, 0, 0x0817AD41, [])
    window(m, 1, 0, 5, 4, True)
    menu(m, selected, 1, 1)
    m.put(0x085EFA8F, text("CLEAR ALL SAVE DATA?") + b"\xff")
    ui = read_aux_ui(m.read, 0x0817ADE5)
    assert ui.ready and ui.selected == ("YES", "NO")[selected]
    assert ui.details["message"] == "CLEAR ALL SAVE DATA?"
    menu(m, selected, 0, 1)
    assert read_aux_ui(m.read, 0x0817ADE5).diagnostic


def rtc():
    m = Memory()
    put_task(m, 0, 0x0809F201, [3, 1])
    put_task(m, 1, 0x0809EDE9, [0, 0, 2, 365, 12, 34, 56, 0, 2])
    window(m, 2, 0, 20, 4, True)
    return m


@pytest.mark.parametrize(
    "index,label", enumerate(["DAYS", "HOURS", "MINUTES", "SECONDS", "CONFIRM"], 1)
)
def test_rtc_all_selected_fields_and_current_edit_values(index, label):
    m = rtc()
    put_task(m, 1, 0x0809EDE9, [0, 0, index, 365, 12, 34, 56, 0, 2])
    ui = read_aux_ui(m.read, 0x0809F091)
    assert ui.ready and ui.selected == label and ui.diagnostic is None
    assert [ui.details[k] for k in ("days", "hours", "minutes", "seconds")] == [365, 12, 34, 56]


@pytest.mark.parametrize(
    "values",
    [[0, 12, 34, 56], [10000, 12, 34, 56], [365, 24, 34, 56], [365, 12, 60, 56], [365, 12, 34, -1]],
)
def test_rtc_invalid_native_values_are_bugs(values):
    m = rtc()
    put_task(m, 1, 0x0809EDE9, [0, 0, 2, *values, 0, 2])
    ui = read_aux_ui(m.read, 0x0809F091)
    assert ui.diagnostic and not ui.ready and ui.selected is None


def test_rtc_prompt_result_and_transitions():
    m = Memory()
    window(m, 0, 0, 20, 8, True)
    window(m, 1, 0, 27, 4, True)
    m.put(0x03005D90, struct.pack("<I", 0x0202C000))
    m.put(0x085EC9EC, text("RESET TIME? A: CONFIRM B: CANCEL") + b"\xff")
    put_task(m, 0, 0x0809F201, [2])
    put_task(m, 1, 0x0809F0F9, [1])
    assert read_aux_ui(m.read, 0x0809F091).ready
    m.put(0x03005E00 + 40 + 4, b"\0")
    m.put(0x085ECA8A, text("SAVE COMPLETED") + b"\xff")
    m.put(0x0202018C, struct.pack("<IB", 0x085ECA8A + 15, 1))
    put_task(m, 0, 0x0809F201, [5])
    assert read_aux_ui(m.read, 0x0809F091).selected == "A: CONTINUE"
    for state in (0, 1, 2, 3, 4, 6):
        put_task(m, 0, 0x0809F201, [state])
        assert not read_aux_ui(m.read, 0x0809F091).ready


def test_rtc_result_uses_actual_source_temp_printer_not_guessed_success():
    m = Memory()
    window(m, 1, 0, 27, 4, True)
    put_task(m, 0, 0x0809F201, [5])
    m.put(0x085ECA8A, text("SAVE COMPLETED") + b"\xff")
    m.put(0x085ECA9A, text("SAVE FAILED") + b"\xff")
    m.put(0x0202018C, struct.pack("<IB", 0x085ECA9A + 12, 1))
    ui = read_aux_ui(m.read, 0x0809F091)
    assert ui.ready and ui.details["message"] == "SAVE FAILED"
    m.put(0x0202018C, struct.pack("<IB", 0x08000000, 1))
    assert read_aux_ui(m.read, 0x0809F091).diagnostic
