import struct

import pytest

from pokebench_env.game_screen import TASKS
from pokebench_env.menu_pokemon_lifecycle import read_pokemon_lifecycle_menu
from pokebench_env.pokemon import BATTLE_MOVES, ITEMS, MOVE_NAMES, SPECIES_NAMES
from tests.env.test_menus import put_task
from tests.env.test_pokemon import fixture
from tests.env.test_ui_state import Memory, menu, text, window

SCREEN = 0x02010000


def game():
    m = Memory()
    raw, read = fixture()
    raw = bytearray(raw)
    raw[8:16] = text("TORCHIC") + b"\xff"
    raw[0x12] = 2
    m.put(0x020244EC, raw)
    for address, length in [
        (SPECIES_NAMES + 280 * 11, 11),
        (ITEMS + 13 * 44, 44),
        *[(MOVE_NAMES + 13 * i, 13) for i in (55, 78, 33)],
        *[(BATTLE_MOVES + 12 * i + 4, 1) for i in (55, 78, 33)],
    ]:
        m.put(address, read(address, length))
    m.put(SPECIES_NAMES + 11 * 281, text("COMBUSKEN") + b"\xff")
    return m


def evo(state=8, trade=False, move_state=0):
    m = game()
    put_task(
        m,
        0,
        0x0813F1B9 if trade else 0x0813E571,
        [state, 280, 281, 1, 0, 0, move_state, 5, 10, 0, 0],
    )
    m.put(0x02024334, b"\x01")
    put_task(m, 1, 0x0817BE95, [])
    m.put(0x02022F58, struct.pack("<H", 55))
    return m


def test_evolution_cancel_window_and_animation_are_distinct():
    m = evo()
    ui = read_pokemon_lifecycle_menu(m.read, 0x0813E3A5)
    assert (ui.phase, ui.selected, ui.ready) == ("evolution_cancel_window", "CANCEL", True)
    assert ui.details["pre_species"] == "TORCHIC" and ui.details["post_species"] == "COMBUSKEN"
    m.put(TASKS + 40 + 4, b"\x00")
    assert read_pokemon_lifecycle_menu(m.read, 0x0813E3A5).ready is False
    m = game()
    assert read_pokemon_lifecycle_menu(m.read, 0x0813DD7D).ready is False


@pytest.mark.parametrize("trade,callback,state", [(False, 0x0813E3A5, 22), (True, 0x0813E3C1, 20)])
def test_evolution_move_confirmation_uses_correct_native_cursor_owner(trade, callback, state):
    m = evo(state, trade, 4)
    m.put(0x02024333, b"\x01")
    menu(m, 1, 1, 0)
    window(m, 0, 0, 5, 4, True)
    window(m, 12, 0, 5, 4, True)
    ui = read_pokemon_lifecycle_menu(m.read, callback)
    assert ui.selected == "NO" and ui.ready is True and ui.details["new_move"] == "WATER GUN"
    if trade:
        window(m, 0, 0, 5, 4, False)
    else:
        m.put(0x02024333, b"\x02")
    assert read_pokemon_lifecycle_menu(m.read, callback).diagnostic


def test_evolution_impossible_phase_and_duplicate_input_owner_are_harness_bugs():
    m = evo(23)
    assert read_pokemon_lifecycle_menu(m.read, 0x0813E3A5).diagnostic
    m = evo()
    put_task(m, 2, 0x0813F1B9, [])
    assert "multiple" in read_pokemon_lifecycle_menu(m.read, 0x0813E3A5).diagnostic


def test_egg_nickname_choice_and_hatching_transition_record_identity():
    m = game()
    m.put(0x03000DE0, struct.pack("<I", SCREEN))
    m.put(SCREEN + 2, b"\x09")
    assert read_pokemon_lifecycle_menu(m.read, 0x08071A95).ready is False
    m.put(SCREEN + 2, b"\x0a")
    menu(m, 0, 1, 0)
    window(m, 0, 0, 5, 4, True)
    ui = read_pokemon_lifecycle_menu(m.read, 0x08071A95)
    assert ui.phase == "egg_hatch_nickname_confirmation" and ui.selected == "YES"
    assert ui.details["pokemon_nickname"] == "TORCHIC"
    assert read_pokemon_lifecycle_menu(m.read, 0x080717A1).ready is False


def recipient(function=0x08166635, state=0):
    m = game()
    m.put(0x0203BCAC, struct.pack("<I", SCREEN))
    m.put(0x0203BC90, struct.pack("<I", SCREEN + 0x7FD0))
    body = bytearray(0x9C)
    struct.pack_into("<I", body, 0, function)
    body[0x50] = state
    body[0x70] = 2
    body[0x71] = 0
    body[0x57:0x5C] = bytes([1, 2, 3, 4, 5])
    body[0x5C:0x61] = bytes([6, 7, 8, 9, 10])
    m.put(SCREEN + 0x7FD0, body)
    m.put(SCREEN + 0x7FB8, bytes([14, 0, 0, 0]))
    return m


def test_pokeblock_recipient_cancel_and_transitions_follow_filtered_party_list():
    m = recipient()
    ui = read_pokemon_lifecycle_menu(m.read, 0x0816631D)
    assert ui.selected == "TORCHIC" and ui.details["party_slots"] == [0]
    assert ui.details["candidate_0_nickname"] == "TORCHIC"
    m.put(SCREEN + 0x8041, b"\x01")
    assert read_pokemon_lifecycle_menu(m.read, 0x0816631D).selected == "CANCEL"
    m = recipient(state=1)
    assert read_pokemon_lifecycle_menu(m.read, 0x0816631D).ready is False


@pytest.mark.parametrize(
    "function,state,phase",
    [
        (0x08166635, 6, "pokeblock_feed_confirmation"),
        (0x08166635, 7, "pokeblock_cannot_feed_message"),
        (0x08166A35, 1, "pokeblock_results"),
        (0x08166A35, 5, "pokeblock_results"),
    ],
)
def test_pokeblock_confirmation_fullness_and_enhancement_messages(function, state, phase):
    m = recipient(function, state)
    menu(m, 1, 1, 0)
    window(m, 0, 0, 5, 4, True)
    ui = read_pokemon_lifecycle_menu(m.read, 0x0816631D)
    assert ui.phase == phase and ui.ready is True
    assert ui.selected == ("NO" if state == 6 else "CONTINUE")
    assert ui.details["conditions_after"] == [6, 7, 8, 9, 10]


@pytest.mark.parametrize("function", [0x08166381, 0x08166565, 0x0816681D, 0x08166BED])
def test_pokeblock_passive_source_functions_are_not_input_ready(function):
    m = recipient(function)
    assert read_pokemon_lifecycle_menu(m.read, 0x0816631D).ready is False


def test_pokeblock_bad_filtered_slot_and_unknown_session_callback_are_diagnostics():
    m = recipient()
    m.put(SCREEN + 0x7FB9, b"\x06")
    assert "party index" in read_pokemon_lifecycle_menu(m.read, 0x0816631D).diagnostic
    m = recipient(0x08160001)
    assert "callback" in read_pokemon_lifecycle_menu(m.read, 0x0816631D).diagnostic


def test_lifecycle_unknown_language_preserves_species_but_reports_text_defect():
    m = recipient()
    m.put(0x020244EC + 0x12, b"\xff")
    ui = read_pokemon_lifecycle_menu(m.read, 0x0816631D)
    assert ui.details["candidate_0_species"] == "TORCHIC" and "language" in ui.diagnostic


def test_unrelated_callback_does_not_read_memory():
    def unreadable(address, length):
        raise AssertionError("must not read")

    assert read_pokemon_lifecycle_menu(unreadable, 0) is None
