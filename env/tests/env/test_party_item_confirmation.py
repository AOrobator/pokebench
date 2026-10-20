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


@pytest.mark.parametrize(
    "address,value",
    [
        (PRINTER + 0x1C, b"\0"),  # printing
        (PRINTER + 0x1C, b"\6"),  # timed pause
        (PRINTER + 0x1B, b"\0"),  # finished printer / handoff
        (0x03003014, b"\4"),  # auto-scroll waits without button
    ],
)
def test_passive_printer_phases_are_not_input(address, value):
    m = message()
    m.put(address, value)
    assert read_menu_family(m.read, PARTY_CALLBACK, party_item_confirmation=True).ready is False


@pytest.mark.parametrize("function", [0x081B1E61, 0x081B672D, 0x081B12F9])
def test_hp_animation_and_handoffs_stay_passive(function):
    m = message()
    put_task(m, 0, function, [])
    assert read_menu_family(m.read, PARTY_CALLBACK, party_item_confirmation=True).ready is False


def test_retained_native_memory_reaches_production_readout_and_json():
    import json
    from pathlib import Path

    from pokebench_env.game_state import MapNames
    from pokebench_env.readout import SERVER_FEATURES, features_off_from_env, state_json
    from pokebench_env.rerender import read_state, render

    fixture = json.loads((Path(__file__).parent / "fixtures/party-item-6507.json").read_text())
    memory = fixture["memory"]

    def read(address, length):
        return bytes.fromhex(memory[f"{address:#x}:{length}"])

    switch = "party-item-confirmation-v1"
    assert switch in SERVER_FEATURES and switch in features_off_from_env({})
    off = frozenset(SERVER_FEATURES) - {"ram-state-v1", "expanded-menu-battle-information-v1"}
    legacy = read_state(read, MapNames({}), active_ui=True, off=off)
    assert render(legacy, off) == fixture["off_readout"]
    on = off - {switch}
    corrected = read_state(read, MapNames({}), active_ui=True, off=on)
    ui = state_json(corrected)["active_ui"]
    assert ui["phase"] == "party_item_message"
    assert ui["ready"] is True and ui["selected"] == "A/B: CONTINUE"
    assert (
        "Interface: party_item_message; input ready; selected A/B: CONTINUE; "
        "A or B continues the message" in render(corrected, on)
    )


@pytest.mark.parametrize(
    "address,value",
    [
        (PRINTER + 4, b"\5"),
        (PRINTER, struct.pack("<I", STRING_VAR4 - 1)),
        (PRINTER, struct.pack("<I", STRING_VAR4 + 100)),
        (PRINTER + 0x1C, b"\7"),
    ],
)
def test_invalid_native_printer_has_diagnostic(address, value):
    m = message()
    m.put(address, value)
    ui = read_menu_family(m.read, PARTY_CALLBACK, party_item_confirmation=True)
    assert ui.ready is None and ui.diagnostic


def test_fade_and_wrong_wait_control_never_claim_confirmation():
    m = message()
    from pokebench_env.menus import PALETTE_FADE

    m.put(PALETTE_FADE + 7, b"\x80")
    assert read_menu_family(m.read, PARTY_CALLBACK, party_item_confirmation=True).ready is False


def test_duplicate_printer_task_is_unknown_not_ready():
    m = message()
    put_task(m, 2, 0x081B1B8D, [])
    ui = read_menu_family(m.read, PARTY_CALLBACK, party_item_confirmation=True)
    assert ui.ready is None and ui.diagnostic == "Party message has no unique text task"


def test_wait_must_belong_to_the_consumed_pause_control():
    m = message()
    p = m.read(PRINTER, 4)
    cursor = struct.unpack("<I", p)[0]
    m.put(cursor - 1, b"\x08")
    assert read_menu_family(m.read, PARTY_CALLBACK, party_item_confirmation=True).ready is False


def test_short_printer_read_is_unknown():
    m = message()

    def read(address, length):
        return b"" if address == PRINTER else m.read(address, length)

    ui = read_menu_family(read, PARTY_CALLBACK, party_item_confirmation=True)
    assert ui.ready is None and ui.diagnostic == "short Party text printer read"
