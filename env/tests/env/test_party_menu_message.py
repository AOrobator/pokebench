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
from tests.env.test_ui_state import Memory

ID = "party-menu-message-v1"
PRINTER = 0x020201B0 + 6 * 0x24
OFF = frozenset(SERVER_FEATURES) | {ID}
OFF -= {"ram-state-v1", "expanded-menu-battle-information-v1", "readout-truth-v1"}


def fixture(sequence=8361):
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
    assert (
        render(read_state(m.read, MapNames({}), active_ui=True, off=OFF), OFF)
        == data["off_readout"]
    )
    state = corrected(m)
    ui = state_json(state)["active_ui"]
    assert ui["phase"] == "party_return_after_message"
    assert ui["ready"] is True and ui["selected"] == "A/B: CONTINUE"
    assert ui["details"]["message"] == "MUDKIP has no energy left to battle!"
    assert ui["details"]["cursor_species"] == "MUDKIP"
    assert 'Dialog: "MUDKIP has no energy left to battle!"' in render(state, OFF - {ID})
    assert "A or B continues the message" in render(state, OFF - {ID})
    assert ID in SERVER_FEATURES and ID in features_off_from_env({})


def test_post_acknowledgement_does_not_reuse_stale_message_and_names_cursor():
    m, data = fixture(8367)
    assert (
        render(read_state(m.read, MapNames({}), active_ui=True, off=OFF), OFF)
        == data["off_readout"]
    )
    state = corrected(m)
    assert state.active_ui.selected == "PARTY SLOT 1 (index 0): MUDKIP (fainted)"
    assert state.active_ui.ready is True
    assert "message" not in state.active_ui.details
    assert "has no energy" not in render(state, OFF - {ID})
    m.put(PARTY_MENU + 9, b"\1")
    assert corrected(m).active_ui.selected == "PARTY SLOT 2 (index 1): TAILLOW"


@pytest.mark.parametrize(
    "address,value",
    [
        (PRINTER + 0x1C, b"\0"),
        (PRINTER + 0x1C, b"\6"),
        (PRINTER + 0x1B, b"\0"),
        (0x03003014, b"\4"),
        (PALETTE_FADE + 7, b"\x80"),
        (STRING_VAR4 + 37, b"\x08"),
    ],
)
def test_printing_timed_pause_inactive_autoscroll_fade_wrong_control_are_not_ready(address, value):
    m, _ = fixture()
    m.put(address, value)
    assert corrected(m).active_ui.ready is False


@pytest.mark.parametrize(
    "address,value",
    [
        (PRINTER + 4, b"\5"),
        (PRINTER, struct.pack("<I", STRING_VAR4 - 1)),
        (PRINTER, struct.pack("<I", STRING_VAR4 + 1000)),
        (PRINTER + 0x1C, b"\7"),
        (STRING_VAR4, b"\xff"),
    ],
)
def test_invalid_message_or_printer_fails_closed(address, value):
    m, _ = fixture()
    m.put(address, value)
    ui = corrected(m).active_ui
    assert ui.ready is None and ui.diagnostic
    assert "message" not in ui.details


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


def test_cursor_buttons_empty_slots_and_bad_party_do_not_invent_species():
    for slot, label in [(6, "CONFIRM"), (7, "CANCEL"), (5, "PARTY SLOT 6 (index 5)")]:
        m, _ = fixture(8367)
        m.put(PARTY_MENU + 9, bytes([slot]))
        ui = corrected(m).active_ui
        assert ui.selected == label
        assert "cursor_species" not in ui.details
    m, _ = fixture(8367)
    # Corrupt checksum in the actual decoded party struct, not a substituted PartyMon.
    m.put(0x020244EC + 28, b"\xff\xff")
    ui = corrected(m).active_ui
    assert "cursor_species" not in ui.details
    assert ui.selected == "PARTY SLOT 1 (index 0)"


def test_switch_second_cursor_and_action_menu_keep_distinct_selection_owners():
    m, _ = fixture(8367)
    m.put(PARTY_MENU + 10, b"\1\10")
    ui = corrected(m).active_ui
    assert ui.selected == "PARTY SLOT 2 (index 1): TAILLOW"
    assert ui.details["party_slot"] == 0 and ui.details["cursor_party_index"] == 1


def test_short_printer_and_undrawn_window_are_diagnostic():
    m, _ = fixture()
    for address in [PRINTER, 0x0202004C]:

        def read(a, n, missing=address):
            return b"" if a == missing else m.read(a, n)

        ui = read_menu_family(read, PARTY_CALLBACK, party_menu_message=True)
        assert ui.ready is None and ui.diagnostic


def test_new_switch_owns_button_numbering_even_without_readout_truth():
    for slot, label in [(6, "CONFIRM"), (7, "CANCEL")]:
        m, _ = fixture(8367)
        m.put(PARTY_MENU + 9, bytes([slot]))
        ui = read_menu_family(m.read, PARTY_CALLBACK, party_menu_message=True)
        assert ui.selected == label and ui.ready is True
    m, _ = fixture(8367)
    m.put(PARTY_MENU + 10, b"\xff\10")
    ui = read_menu_family(m.read, PARTY_CALLBACK, party_menu_message=True)
    assert ui.ready is None and ui.diagnostic == "Party cursor has no selected slot"


def test_cursor_labels_egg_without_exposing_underlying_species(monkeypatch):
    from dataclasses import replace
    import pokebench_env.game_state as reader

    m, _ = fixture(8367)
    party = corrected(m).party
    monkeypatch.setattr(reader, "_party", lambda *a, **k: (replace(party[0], is_egg=True),))
    ui = corrected(m).active_ui
    assert ui.details["cursor_species"] == "EGG"
    assert "MUDKIP" not in ui.selected


def test_prior_action_menu_keeps_action_and_names_its_party_cursor():
    m, _ = fixture(8356)
    ui = corrected(m).active_ui
    assert ui.phase == "party_action_menu" and ui.selected == "SEND OUT"
    assert ui.details["cursor_species"] == "MUDKIP"
    assert ui.details["cursor_party_index"] == 0


def test_earlier_retained_message_sample_has_the_same_verified_wait():
    m, _ = fixture(8360)
    ui = corrected(m).active_ui
    assert ui.ready is True and ui.selected == "A/B: CONTINUE"


def test_a_rom_backed_printer_cannot_publish_stale_stringvar4():
    m, _ = fixture()
    m.put(PRINTER, struct.pack("<I", 0x08500000))
    state = corrected(m)
    assert state.active_ui.ready is None
    assert "message" not in state.active_ui.details
    assert "has no energy" not in (state.dialog or "")
    m, _ = fixture()
    m.put(PRINTER + 0x1B, b"\0")
    state = corrected(m)
    assert state.active_ui.ready is False
    assert "message" not in state.active_ui.details
