"""0d5d event39808: gText_PkmnHasNoEnergy; source 731ad5bf party_menu.c/text.c."""
import json
import struct
from pathlib import Path

import pytest

from pokebench_env.game_state import MapNames
from pokebench_env.menus import PALETTE_FADE, PARTY_CALLBACK, PARTY_MENU, read_menu_family
from pokebench_env.readout import SERVER_FEATURES, features_off_from_env, state_json
from pokebench_env.rerender import read_state, render
from pokebench_env.ui_state import STRING_VAR4
from tests.env.test_menus import put_task
from tests.env.test_ui_state import Memory, text

ID = "party-menu-message-v1"
PRINTER = 0x020201B0 + 6 * 0x24
OFF = frozenset(SERVER_FEATURES) | {ID}
OFF -= {"ram-state-v1", "expanded-menu-battle-information-v1", "readout-truth-v1"}


def fixture(sequence=8360):
    data = json.loads((Path(__file__).parent / f"fixtures/party-menu-{sequence}.json").read_text())
    m = Memory()
    for key, value in data["memory"].items():
        address, _ = key.split(":")
        m.put(int(address, 16), bytes.fromhex(value))
    return m, data


def corrected(m):
    return read_state(m.read, MapNames({}), active_ui=True, off=OFF - {ID})


def test_exact_event39808_reaches_production_json_and_readout_with_off_bytes_unchanged():
    m, data = fixture()
    assert render(read_state(m.read, MapNames({}), active_ui=True, off=OFF), OFF) == data["off_readout"]
    state = corrected(m)
    ui = state_json(state)["active_ui"]
    assert ui["phase"] == "party_return_after_message"
    assert ui["ready"] is True and ui["selected"] == "A/B: CONTINUE"
    assert ui["details"]["message"] == "MUDKIP has no energy left to battle!"
    assert ui["details"]["cursor_species"] == "MUDKIP"
    assert "Dialog: MUDKIP has no energy left to battle!" in render(state, OFF - {ID})
    assert "A or B continues the message" in render(state, OFF - {ID})
    assert ID in SERVER_FEATURES and ID in features_off_from_env({})


def test_post_acknowledgement_does_not_reuse_stale_message_and_names_cursor():
    m, data = fixture(8367)
    assert render(read_state(m.read, MapNames({}), active_ui=True, off=OFF), OFF) == data["off_readout"]
    state = corrected(m)
    assert state.active_ui.selected == "PARTY SLOT 1 (index 0): MUDKIP (fainted)"
    assert state.active_ui.ready is True
    assert "message" not in state.active_ui.details
    assert "has no energy" not in render(state, OFF - {ID})
    m.put(PARTY_MENU + 9, b"\1")
    assert corrected(m).active_ui.selected == "PARTY SLOT 2 (index 1): TAILLOW"


@pytest.mark.parametrize("address,value", [
    (PRINTER + 0x1C, b"\0"), (PRINTER + 0x1C, b"\6"),
    (PRINTER + 0x1B, b"\0"), (0x03003014, b"\4"),
    (PALETTE_FADE + 7, b"\x80"),
    (STRING_VAR4 + 37, b"\x08"),
])
def test_printing_timed_pause_inactive_autoscroll_fade_wrong_control_are_not_ready(address, value):
    m, _ = fixture()
    m.put(address, value)
    assert corrected(m).active_ui.ready is False


@pytest.mark.parametrize("address,value", [
    (PRINTER + 4, b"\5"),
    (PRINTER, struct.pack("<I", STRING_VAR4 - 1)),
    (PRINTER, struct.pack("<I", STRING_VAR4 + 1000)),
    (PRINTER + 0x1C, b"\7"),
    (STRING_VAR4, b"\xff"),
])
def test_invalid_message_or_printer_fails_closed(address, value):
    m, _ = fixture()
    m.put(address, value)
    ui = corrected(m).active_ui
    assert ui.ready is None and ui.diagnostic


def test_duplicate_missing_text_task_and_other_transition_never_claim_wait():
    m, _ = fixture()
    put_task(m, 2, 0x081B1B8D, [])
    assert corrected(m).active_ui.ready is None
    for function in [0x081B1E61, 0x081B672D, 0x081B12F9]:
        put_task(m, 0, function, [])
        assert corrected(m).active_ui.ready is False
    m, _ = fixture()
    put_task(m, 1, 0x08000001, [])
    assert corrected(m).active_ui.ready is False
    assert "message" not in corrected(m).active_ui.details


def test_reader_omission_and_explicit_off_equal_legacy():
    m, _ = fixture()
    old = read_menu_family(m.read, PARTY_CALLBACK)
    assert read_menu_family(m.read, PARTY_CALLBACK, party_menu_message=False) == old


def test_new_switch_does_not_enable_old_item_confirmation():
    m, _ = fixture()
    put_task(m, 0, 0x081B6795, [])
    ui = corrected(m).active_ui
    assert ui.ready is False and ui.selected is None
