import struct

import pytest

from pokebench_env.evolution_decision import EvolutionGate, decision_ui
from pokebench_env.game_screen import GMAIN
from pokebench_env.menu_pokemon_lifecycle import read_pokemon_lifecycle_menu
from tests.env.test_menu_pokemon_lifecycle import evo
from tests.env.test_menus import put_task
from tests.env.test_ui_state import window


def native(state=8):
    m = evo(state)
    m.put(0x020244E2, struct.pack("<H", 55))
    m.put(GMAIN + 4, struct.pack("<I", 0x0813E3A5))
    return m


def test_observation_preserves_off_and_removes_invented_cursor_on():
    m = native()
    old = read_pokemon_lifecycle_menu(m.read, 0x0813E3A5)
    assert old.selected == "CANCEL"
    fixed = decision_ui(old)
    assert fixed.selected is None
    assert fixed.phase == "evolution_decision"
    assert "choose_evolution" in fixed.controls
    assert "B declines" not in fixed.controls
    assert old.selected == "CANCEL"  # no mutation of legacy result
    for state in [0, 5, 7, 9, 17, 19]:
        ui = decision_ui(read_pokemon_lifecycle_menu(native(state).read, 0x0813E3A5))
        assert ui.selected is None and "directions select" not in ui.controls
    m = evo(22, False, 4)
    window(m, 12, 0, 5, 4, True)
    ui = read_pokemon_lifecycle_menu(m.read, 0x0813E3A5)
    assert decision_ui(ui).selected == ui.selected
    assert "B answers NO" in decision_ui(ui).controls  # native move choice remains separate


@pytest.mark.parametrize("choice,expected", [("evolve", []), ("cancel", ["B"])])
def test_freezes_indefinitely_and_only_explicit_choice_advances(choice, expected):
    m = native()
    gate = EvolutionGate(m.read)
    assert gate.before_frame(["B"]) is None
    token = gate.pending()["token"]
    for _ in range(80):
        assert gate.before_frame(["A", "B"]) is None
    gate.choose(token, choice)
    assert gate.before_frame(["B", "A"]) == expected
    assert gate.before_frame(["B"]) == []  # queued input cannot leak after decision
    with pytest.raises(ValueError, match="pending"):
        gate.choose(token, choice)


def test_pre_window_batch_is_neutralized_and_transition_stops_on_first_window():
    m = native(7)
    gate = EvolutionGate(m.read)
    assert gate.before_frame(["B"]) == []
    put_task(m, 0, 0x0813E571, [8, 280, 281, 1, 0, 0, 0, 0, 0, 0, 0])
    assert gate.before_frame(["B"]) is None
    first = gate.pending()["token"]
    with pytest.raises(ValueError, match="pending"):
        gate.choose(first + 1, "cancel")
    m.put(GMAIN + 4, struct.pack("<I", 0x08085E51))
    assert gate.before_frame(["A"]) == ["A"]
    with pytest.raises(ValueError, match="pending"):
        gate.choose(first, "cancel")
    m.put(GMAIN + 4, struct.pack("<I", 0x0813E3A5))
    assert gate.before_frame(["B"]) is None
    assert gate.pending()["token"] > first


def test_trade_uncancellable_and_move_learning_do_not_get_decisions():
    for trade, state, flags in [(True, 8, 1), (False, 8, 0), (False, 22, 1)]:
        m = native(state)
        put_task(
            m, 0, 0x0813F1B9 if trade else 0x0813E571, [state, 280, 281, flags, 0, 0, 0, 0, 0, 0, 0]
        )
        gate = EvolutionGate(m.read)
        assert gate.before_frame(["A"]) == ["A"]
        assert gate.pending() is None


def test_accepted_decision_does_not_freeze_on_transient_post_choice_decode_failure():
    m = native()
    gate = EvolutionGate(m.read)
    gate.choose(gate.pending()["token"], "evolve")
    # A malformed transitional native owner cannot acquire a new choice; it also
    # cannot freeze the animation after a choice was already accepted.
    put_task(m, 0, 0x0813E571, [23, 280, 281, 1, 0, 0, 0, 0, 0, 0, 0])
    assert gate.before_frame(["B"]) == []


def test_result_message_acknowledgement_is_native_owned_and_never_answers_move_choice():
    from pokebench_env.battle_text import PRINTERS, TEXT_FLAGS

    m = native()
    gate = EvolutionGate(m.read)
    gate.choose(gate.pending()["token"], "evolve")
    put_task(m, 0, 0x0813E571, [15, 280, 281, 1, 0, 0, 0, 0, 0, 0, 0])
    printer = bytearray(36)
    struct.pack_into("<I", printer, 0, 0x02021FFC)
    printer[0x1B], printer[0x1C] = 1, 2
    m.put(PRINTERS, printer)
    assert gate.before_frame(["B"]) == ["A"]
    assert gate.before_frame(["B"]) == []
    assert gate.before_frame(["B"]) == ["A"]
    m.put(TEXT_FLAGS, b"\x04")  # autoscroll needs no input
    assert gate.before_frame(["B"]) == []
    m.put(TEXT_FLAGS, b"\x00")
    printer[4] = 1  # another window cannot own this acknowledgement
    m.put(PRINTERS, printer)
    assert gate.before_frame(["B"]) == []
    printer[4] = 0
    struct.pack_into("<I", printer, 0, 0x02022E2C)
    m.put(PRINTERS, printer)
    assert gate.before_frame(["B"]) == []  # unrelated displayed battle text
    put_task(m, 0, 0x0813E571, [22, 280, 281, 1, 0, 0, 4, 0, 0, 0, 0])
    window(m, 12, 0, 5, 4, True)
    assert gate.before_frame(["A"]) == ["A"]  # only the caller chooses YES/NO


def test_evolution_move_reader_uses_verified_native_owner_only_when_on():
    m = native(22)
    m.put(0x020244E2, struct.pack("<H", 24))
    from pokebench_env.pokemon import MOVE_NAMES
    from tests.env.test_ui_state import text

    m.put(MOVE_NAMES + 13 * 24, text("DOUBLE KICK") + b"\xff")
    old = read_pokemon_lifecycle_menu(m.read, 0x0813E3A5)
    fixed = read_pokemon_lifecycle_menu(m.read, 0x0813E3A5, evolution_decision=True)
    assert old.details["new_move"] == "WATER GUN"
    assert fixed.details["new_move"] == "DOUBLE KICK"
    assert fixed.details["new_move_id"] == 24


def test_production_state_reader_propagates_the_correct_move_owner():
    from pokebench_env.game_state import MapNames
    from pokebench_env.pokemon import MOVE_NAMES
    from pokebench_env.rerender import read_state
    from tests.env.test_ui_state import text

    m = native(22)
    m.put(0x020244E2, struct.pack("<H", 24))
    m.put(MOVE_NAMES + 13 * 24, text("DOUBLE KICK") + b"\xff")
    off = read_state(m.read, MapNames({}), active_ui=True, off=frozenset({"evolution-decision-v1"}))
    on = read_state(m.read, MapNames({}), active_ui=True, off=frozenset())
    assert off.active_ui.details["new_move"] == "WATER GUN"
    assert on.active_ui.details["new_move"] == "DOUBLE KICK"


def test_native_cancellation_window_is_held_even_during_palette_fade():
    from pokebench_env.menus import PALETTE_FADE

    m = native()
    m.put(PALETTE_FADE + 7, b"\x80")
    old = read_pokemon_lifecycle_menu(m.read, 0x0813E3A5)
    assert old.ready is False
    assert decision_ui(old).ready is True
    gate = EvolutionGate(m.read)
    assert gate.before_frame(["B"]) is None
    token = gate.pending()["token"]
    gate.choose(token, "cancel")
    assert gate.before_frame([]) == ["B"]
