import struct

import pytest

from pokebench_env.menu_common import MESSAGE_TASK, YESNO_CALLBACK_TASK, read_shared_menu
from pokebench_env.ui_state import STRING_VAR4
from tests.env.test_menus import put_task
from tests.env.test_ui_state import Memory, menu, text, window

CALLBACK = 0x080DFD65


def confirmation(yes=0x080E0EDD, no=0x080E10A1):
    m = Memory()
    put_task(m, 0, YESNO_CALLBACK_TASK, [0, 3, 0, 0, 0, 13])
    m.put(0x0203A138, struct.pack("<II", yes, no))
    menu(m, 1, 1, 0)
    window(m, 0, 0, 5, 4, True)
    return m


def test_purchase_confirmation_and_actual_values():
    m = confirmation()
    ui = read_shared_menu(m.read, CALLBACK)
    assert (ui.phase, ui.selected, ui.ready) == ("shop_purchase_confirmation", "NO", True)
    assert ui.details["quantity"] == 3 and ui.details["item_id"] == 13
    assert "quantity: 3" in ui.text() and "0x080E" not in ui.text()


def test_toss_and_generic_confirmation():
    m = confirmation(0x081ACF89, 0x081AD011)
    m.put(0x0203CE7C, struct.pack("<H", 13))
    m.put(0x03005E00 + 24, struct.pack("<h", 2))
    ui = read_shared_menu(m.read, CALLBACK)
    assert ui.phase == "bag_toss_confirmation" and ui.details["quantity"] == 2
    m = confirmation(0x08000001, 0x08000003)
    assert read_shared_menu(m.read, CALLBACK).phase == "menu_confirmation"
    m.put(0x02037FDB, b"\x80")
    assert read_shared_menu(m.read, CALLBACK).ready is False


def test_message_printing_has_no_selection_input():
    m = Memory()
    put_task(m, 0, MESSAGE_TASK, [])
    m.put(0x0300117C, struct.pack("<I", 0x080E0EDD))
    window(m, 0, 0, 27, 4, True)
    m.put(STRING_VAR4, text("THANK YOU") + b"\xff")
    ui = read_shared_menu(m.read, CALLBACK)
    assert ui.phase == "menu_message_printing" and ui.ready is False
    assert ui.details["message"] == "THANK YOU"


@pytest.mark.parametrize(
    "mutation", ["pair", "menu", "duplicate", "message_callback", "message_window", "message_empty"]
)
def test_invalid_shared_owner(mutation):
    m = confirmation()
    if mutation == "pair":
        m.put(0x0203A138, b"\0" * 8)
    elif mutation == "menu":
        menu(m, 0, 0, 0)
    elif mutation == "duplicate":
        put_task(m, 1, YESNO_CALLBACK_TASK, [])
    else:
        put_task(m, 0, MESSAGE_TASK, [])
        m.put(0x0300117C, struct.pack("<I", 0x08000001))
        m.put(STRING_VAR4, text("HELLO") + b"\xff")
        if mutation == "message_callback":
            m.put(0x0300117C, b"\0" * 4)
        elif mutation == "message_window":
            window(m, 0, 0, 5, 4, False)
        else:
            m.put(STRING_VAR4, b"\xff")
    ui = read_shared_menu(m.read, CALLBACK)
    assert ui.ready is None and ui.diagnostic


def test_no_owner_unknown_callback():
    m = Memory()
    assert read_shared_menu(m.read, CALLBACK) is None
    assert read_shared_menu(m.read, 0) is None


@pytest.mark.parametrize(
    "pair,phase,key",
    [
        ((0x08136B79, 0x08136C55), "pokeblock_toss_confirmation", "pokeblock_index"),
        ((0x081C654D, 0x081C63D1), "pyramid_toss_confirmation", "item_id"),
    ],
)
def test_specialized_toss_context(pair, phase, key):
    m = confirmation(*pair)
    m.put(0x0203CE7C, struct.pack("<H", 13))
    ui = read_shared_menu(m.read, CALLBACK)
    assert ui.phase == phase and ui.details[key] == 13


@pytest.mark.parametrize(
    "pair,phase",
    [
        ((0x081289F1, 0x08128FD9), "decoration_place_confirmation"),
        ((0x08128BA1, 0x08128FD9), "decoration_cancel_confirmation"),
        ((0x0812A1C1, 0x08129B35), "decoration_put_away_confirmation"),
        ((0x0812A211, 0x08129B35), "decoration_stop_put_away_confirmation"),
        ((0x0812A479, 0x08127A31), "decoration_toss_confirmation"),
    ],
)
def test_decoration_shared_confirmation_retains_context(pair, phase):
    from tests.env.test_menus_misc import decor

    m = decor()
    put_task(m, 0, YESNO_CALLBACK_TASK, [7, 8, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 1])
    m.put(0x0203A138, struct.pack("<II", *pair))
    menu(m, 1, 1, 0)
    ui = read_shared_menu(m.read, CALLBACK)
    assert ui.phase == phase and ui.selected == "NO" and ui.details["world_cursor_x"] == 7


def test_secret_base_registry_delete_context():
    m = confirmation(0x080EA121, 0x080EA13D)
    m.put(0x03005E00 + 16, struct.pack("<h", 3))
    ui = read_shared_menu(m.read, CALLBACK)
    assert (
        ui.phase == "secret_base_registry_delete_confirmation"
        and ui.details["selected_base_id"] == 3
    )
