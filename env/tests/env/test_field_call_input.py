"""field-call-input-v1: a field call text box that waits for A says so.

pret/pokeemerald 731ad5bf src/match_call.c, src/text.c. Run 7442 waited 35 turns on
Dad's call at the ellipsis page while the readout said input not ready.
"""

import struct

import pytest
from test_game_state import MAPS, OVERWORLD, game

from pokebench_env.menu_field_people import (
    CALL_ELLIPSIS,
    FIELD_CALL_SWITCH,
    MATCH_CALL,
    PRINTERS,
    SE_PLAYERS,
    read_field_people_menu,
)
from pokebench_env.menus import PALETTE_FADE
from pokebench_env.readout import SERVER_FEATURES, features_off_from_env, format_readout
from pokebench_env.rerender import read_state
from pokebench_env.ui_state import STRING_VAR4
from tests.env.test_menu_field_people import npc
from tests.env.test_ui_state import text, window

CALLBACK = 0x08085E5D
FIRST_PAGE_END = 12  # past HELLO \n THERE \p
TEXT = text("HELLO") + b"\xfe" + text("THERE") + b"\xfb" + text("BYE") + b"\xff"


def printer(m, current, *, active=1, state=2, window_id=0, slot=0):
    raw = bytearray(0x24)
    struct.pack_into("<I", raw, 0, current)
    raw[4] = window_id
    raw[0x1B] = active
    raw[0x1C] = state
    m.put(PRINTERS + 0x24 * slot, bytes(raw))


def call(state=5):
    m = npc(MATCH_CALL, [state, 0, 0])
    m.put(0x0203CD80, struct.pack("<IHBB", 55, 0, 5, 1))
    m.put(STRING_VAR4, TEXT)
    m.put(CALL_ELLIPSIS, bytes([0xB0] * 6 + [0xFB, 0xFF]))
    return m


def on(m):
    return read_field_people_menu(m.read, CALLBACK, call_input=True)


def off(m):
    return read_field_people_menu(m.read, CALLBACK)


def page(m, **printer_args):
    printer(m, STRING_VAR4 + FIRST_PAGE_END, **printer_args)
    return m


def test_off_keeps_the_page_wait_as_input_not_ready():
    ui = off(page(call()))
    assert (ui.phase, ui.selected, ui.ready, ui.value) == (
        "field_match_call_message",
        None,
        False,
        None,
    )
    assert ui.controls == "Directions select; A confirms; B closes or declines"
    assert ui.details["text_printing"] is True
    assert "call_text_state" not in ui.details and "text_state" not in ui.details


@pytest.mark.parametrize("state", [1, 2, 3])
def test_on_a_page_wait_is_ready_and_names_the_page(state):
    ui = on(page(call(), state=state))
    assert (ui.phase, ui.selected, ui.ready) == ("field_match_call_message", "CONTINUE", True)
    assert ui.value == "HELLO THERE"
    assert ui.details["call_text_state"] == "waiting"
    assert ui.details["text_printing"] is False
    assert ui.controls == "text box waiting for A; A or B shows the next page"
    assert "Interface: field_match_call_message; input ready; selected CONTINUE" in ui.text()
    assert "text box waiting for A" in ui.text()
    assert "text printing: NO" in ui.text()


def test_on_the_ellipsis_page_of_call_state_4_also_takes_a():
    # MatchCall_ReadyIntro prints sText_PokenavCallEllipsis ("………………\p"), run by
    # MatchCall_PrintIntro. gStringVar4 is not this page: a random call has not filled it yet.
    m = call(4)
    printer(m, CALL_ELLIPSIS + 7)
    ui = on(m)
    assert (ui.phase, ui.selected, ui.ready) == ("field_match_call_message", "CONTINUE", True)
    assert ui.value == "…" * 6
    assert ui.details["call_text_state"] == "waiting"
    assert "message" not in ui.details


@pytest.mark.parametrize("state", [0, 4, 5, 6])
def test_on_a_printer_mid_character_stays_not_ready(state):
    ui = on(page(call(), state=state))
    assert (ui.selected, ui.ready, ui.value) == (None, False, None)
    assert ui.details["call_text_state"] == "printing"
    assert ui.details["text_printing"] is True
    assert ui.controls == "Transition or text printing; selection input is not active"


def test_on_the_ellipsis_being_written_reads_as_a_transition():
    m = call(4)
    printer(m, CALL_ELLIPSIS + 3, state=0)
    ui = on(m)
    assert (ui.phase, ui.ready) == ("field_match_call_transition", False)
    assert ui.details["call_text_state"] == "printing"


def test_on_autoscroll_takes_no_button():
    m = page(call())
    m.put(0x03003014, b"\x04")
    ui = on(m)
    assert ui.ready is False
    assert ui.details["call_text_state"] == "printing"


def test_on_a_page_wait_does_not_depend_on_sound():
    # TextPrinterWaitWithDownArrow has no IsSEPlaying check; only MatchCall_PrintMessage has.
    m = page(call())
    m.put(SE_PLAYERS[0] + 4, struct.pack("<I", 1))
    assert on(m).ready is True


def test_on_the_finished_call_needs_silence_and_says_a_ends_it():
    m = call()
    printer(m, STRING_VAR4 + len(TEXT), active=0, state=0)
    ui = on(m)
    assert (ui.phase, ui.selected, ui.ready) == ("field_match_call_message", "CONTINUE", True)
    assert ui.value == "BYE"
    assert ui.details["call_text_state"] == "finished"
    assert ui.controls == "text box waiting for A; A or B ends the call"
    m.put(SE_PLAYERS[0] + 4, struct.pack("<I", 1))
    ui = on(m)
    assert (ui.selected, ui.ready) == (None, False)
    assert ui.details["call_text_state"] == "unavailable"


def test_on_an_inactive_printer_before_the_message_is_no_finished_call():
    m = call(4)
    printer(m, CALL_ELLIPSIS + 8, active=0, state=0)
    ui = on(m)
    assert (ui.phase, ui.ready) == ("field_match_call_transition", False)
    assert ui.details["call_text_state"] == "unavailable"


def test_on_a_fade_blocks_the_claim():
    m = page(call())
    m.put(PALETTE_FADE + 7, b"\x80")
    ui = on(m)
    assert ui.ready is False
    assert ui.details["call_text_state"] == "unavailable"


@pytest.mark.parametrize(
    "current", [0x08000000, STRING_VAR4 - 1, STRING_VAR4 + 1001, CALL_ELLIPSIS + 7]
)
def test_on_a_cursor_outside_the_call_text_is_unverified(current):
    m = call()
    printer(m, current)
    ui = on(m)
    assert ui.ready is False
    assert ui.details["call_text_state"] == "unavailable"


def test_on_a_printer_for_another_window_is_unverified():
    ui = on(page(call(), window_id=1))
    assert ui.ready is False
    assert ui.details["call_text_state"] == "unavailable"


def test_on_the_printer_of_the_task_window_is_the_one_read():
    m = npc(MATCH_CALL, [5, 0, 1])
    window(m, 1, 0, 18, 10, True)
    m.put(STRING_VAR4, TEXT)
    printer(m, STRING_VAR4 + FIRST_PAGE_END, window_id=1, slot=1)
    assert on(m).details["call_text_state"] == "waiting"


@pytest.mark.parametrize("state", [0, 1, 2, 3, 6, 7])
def test_on_the_other_call_states_are_transitions_without_a_page(state):
    ui = on(call(state))
    assert (ui.phase, ui.ready, ui.value) == ("field_match_call_transition", False, None)
    assert ui.details["call_text_state"] == "unavailable"


def test_on_an_invalid_printer_is_a_coverage_error():
    ui = on(page(call(), state=7))
    assert ui.ready is None
    assert "invalid field Match Call text printer" in ui.diagnostic


def memory():
    m = game(OVERWORLD)
    m.cells.update(page(call()).cells)
    m.put(0x030022C0, struct.pack("<II", *OVERWORLD))
    return m


def view(switches):
    state = read_state(memory().read, MAPS, active_ui=True, off=switches)
    return format_readout(state, switches), state


def test_production_path_honors_the_switch():
    default = features_off_from_env({})
    assert FIELD_CALL_SWITCH in default
    assert FIELD_CALL_SWITCH == "field-call-input-v1" and FIELD_CALL_SWITCH in SERVER_FEATURES
    base = default - {"expanded-menu-battle-information-v1"}
    off_text, off_state = view(base)
    on_text, on_state = view(base - {FIELD_CALL_SWITCH})
    assert off_state.active_ui is not None and off_state.active_ui.ready is False
    assert "Interface: field_match_call_message; input not ready" in off_text
    assert "text printing: YES" in off_text
    assert on_state.active_ui is not None and on_state.active_ui.ready is True
    assert "Interface: field_match_call_message; input ready" in on_text
    assert "text box waiting for A" in on_text
