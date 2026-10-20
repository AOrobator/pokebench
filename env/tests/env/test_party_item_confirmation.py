"""Native party text waits: pret/pokeemerald 731ad5b text.c/party_menu.c."""
import struct

import pytest

from pokebench_env.menus import PARTY_CALLBACK, read_menu_family
from pokebench_env.ui_state import STRING_VAR4
from tests.env.test_menus import put_task
from tests.env.test_ui_state import Memory, text, window

PRINTER = 0x020201B0 + 6 * 0x24


def message():
    m = Memory()
    put_task(m, 0, 0x081B6795, [])
    put_task(m, 1, 0x081B1B8D, [])
    window(m, 6, 0, 27, 4, True)
    payload = text("TORCHIC HP RESTORED") + b"\xfc\x09"
    m.put(STRING_VAR4, payload + b"\xff")
    p = bytearray(0x24)
    struct.pack_into("<I", p, 0, STRING_VAR4 + len(payload))
    p[4], p[0x1B], p[0x1C] = 6, 1, 1
    m.put(PRINTER, p)
    return m


def test_native_pause_until_press_is_ready_and_off_is_identical():
    m = message()
    old = read_menu_family(m.read, PARTY_CALLBACK)
    assert old.ready is False
    assert read_menu_family(m.read, PARTY_CALLBACK, party_item_confirmation=False) == old
    ui = read_menu_family(m.read, PARTY_CALLBACK, party_item_confirmation=True)
    assert ui.phase == "party_item_message" and ui.ready is True
    assert ui.selected == "A/B: CONTINUE"
    assert ui.controls == "A or B continues the message"
    assert ui.details["message"] == "TORCHIC HP RESTORED"


@pytest.mark.parametrize("address,value", [
    (PRINTER + 0x1C, b"\0"),  # printing
    (PRINTER + 0x1C, b"\6"),  # timed pause
    (PRINTER + 0x1B, b"\0"),  # finished printer / handoff
    (0x03003014, b"\4"),  # auto-scroll waits without button
])
def test_passive_printer_phases_are_not_input(address, value):
    m = message()
    m.put(address, value)
    assert read_menu_family(m.read, PARTY_CALLBACK, party_item_confirmation=True).ready is False


@pytest.mark.parametrize("function", [0x081B1E61, 0x081B672D, 0x081B12F9])
def test_hp_animation_and_handoffs_stay_passive(function):
    m = message()
    put_task(m, 0, function, [])
    assert read_menu_family(m.read, PARTY_CALLBACK, party_item_confirmation=True).ready is False
