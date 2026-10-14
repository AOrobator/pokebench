import struct

import pytest

from pokebench_env.menu_save import SAVE_CALLBACK, SAVE_PHASES, read_save_ui
from pokebench_env.ui_state import STRING_VAR4
from tests.env.test_menu_prelude import saved_header
from tests.env.test_menus import put_task
from tests.env.test_ui_state import Memory, menu, text, window

CALLBACK = 0x08085E5D


def saving(fn=0x080A0109):
    m = Memory()
    put_task(m, 0, 0x0809FA35, [1])
    m.put(0x03005DF4, struct.pack("<I", 0x0809FE45))
    m.put(SAVE_CALLBACK, struct.pack("<I", fn))
    saved_header(m)
    window(m, 0, 0, 27, 4, True)
    window(m, 1, 0, 5, 4, True)
    menu(m, 0, 1, 1)
    m.put(STRING_VAR4, text("SAVE THE GAME?") + b"\xff")
    return m


@pytest.mark.parametrize("fn", SAVE_PHASES)
def test_all_save_callbacks_own_explicit_phase(fn):
    m = saving(fn)
    if fn >= 0x080A035D:
        m.put(0x03005DF4, struct.pack("<I", 0x0809FED5))
    ui = read_save_ui(m.read, CALLBACK)
    assert ui.phase == SAVE_PHASES[fn] and ui.diagnostic is None
    assert ui.ready == (fn in (0x080A0109, 0x080A01ED, 0x080A02D9, 0x080A0325, 0x080A03A5))


def test_save_selection_readiness_printer_and_sound():
    m = saving()
    menu(m, 1, 1, 1)
    ui = read_save_ui(m.read, CALLBACK)
    assert ui.selected == "NO" and ui.ready and ui.details["saved_player_name"] == "ANDREW"
    m.put(0x020201CB, b"\1")
    assert read_save_ui(m.read, CALLBACK).ready is False
    m = saving(0x080A02D9)
    m.put(0x030075F4, struct.pack("<I", 1))
    assert read_save_ui(m.read, CALLBACK).ready is False
    m.put(0x030075F4, struct.pack("<I", 0x80000000))
    m.put(0x03007634, struct.pack("<I", 0x80000000))
    assert read_save_ui(m.read, CALLBACK).ready
    m = saving(0x080A0325)
    m.put(0x02037620, b"\1")
    assert read_save_ui(m.read, CALLBACK).ready is False


@pytest.mark.parametrize(
    "mutation", ["callback", "printer", "message", "menu", "parents", "header"]
)
def test_invalid_save_source_values_are_diagnostic(mutation):
    m = saving()
    if mutation == "callback":
        m.put(SAVE_CALLBACK, b"\0" * 4)
    elif mutation == "printer":
        m.put(0x020201CB, b"\2")
    elif mutation == "message":
        m.put(STRING_VAR4, b"\xff")
    elif mutation == "menu":
        menu(m, 0, 0, 1)
    elif mutation == "parents":
        put_task(m, 1, 0x0809FFD1, [])
    elif mutation == "header":
        m.put(0x03005D8C, b"\0" * 8)
    assert read_save_ui(m.read, CALLBACK).diagnostic


def test_no_owner_and_initial_handoff_do_not_borrow_old_callback():
    m = Memory()
    assert read_save_ui(m.read, 0) is None
    assert read_save_ui(m.read, CALLBACK) is None
    m = saving()
    m.put(0x03005DF4, struct.pack("<I", 0x0809FE29))
    ui = read_save_ui(m.read, CALLBACK)
    assert ui.phase == "save_transition" and ui.ready is False
