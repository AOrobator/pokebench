"""LoadWallyZigzagoon source731ad5bf: MOVE2-4 are cleared, their PP is retained."""

import struct

import pytest
from test_battle_state import fixture
from test_game_state import text

from pokebench_env.action_history import NativeActionJournal, read_action_frame
from pokebench_env.battle_choices import MONS, POSITIONS, TYPE_FLAGS
from pokebench_env.battle_state import read_battle_state
from pokebench_env.game_screen import Screen
from pokebench_env.game_state import MapNames, read_game_state
from pokebench_env.pokemon import BATTLE_MOVES, MOVE_NAMES
from pokebench_env.ui_state import read_active_ui


def tutorial():
    memory = fixture()
    memory.put(TYPE_FLAGS, struct.pack("<I", 0x204))
    memory.put(MONS, struct.pack("<H", 288))
    memory.put(MONS + 0x2A, bytes([7]))
    memory.put(MONS + 0x0C, struct.pack("<4H", 33, 0, 0, 0))
    memory.put(MONS + 0x24, bytes([35, 40, 30, 0]))
    memory.put(MOVE_NAMES + 33 * 13, text("TACKLE") + b"\xff")
    memory.put(BATTLE_MOVES + 33 * 12, bytes([0, 35, 0, 95, 35]) + bytes(7))
    return memory


def test_empty_slots_in_native_tutorial_only_and_off_parity():
    memory = tutorial()
    legacy = read_battle_state(memory.read)
    assert legacy.diagnostic == "harness bug: empty battle move has PP"
    assert read_battle_state(memory.read, tutorial_owner_enabled=False) == legacy
    repaired = read_battle_state(memory.read, tutorial_owner_enabled=True)
    assert repaired.initialized and repaired.diagnostic is None
    assert [(move.move_id, move.pp, move.max_pp) for move in repaired.battlers[0].moves[2:]] == [
        (0, 0, 0),
        (0, 0, 0),
    ]
    memory.put(TYPE_FLAGS, bytes(4))
    assert read_battle_state(memory.read, tutorial_owner_enabled=True) == legacy


@pytest.mark.parametrize("invalid", [65, 255])
def test_tutorial_does_not_hide_out_of_range_pp(invalid):
    memory = tutorial()
    memory.put(MONS + 0x26, bytes([invalid]))
    assert read_battle_state(memory.read, tutorial_owner_enabled=True).phase == "unavailable"


def test_game_state_and_active_ui_forward_existing_switch():
    memory = tutorial()
    on = read_game_state(memory.read, MapNames({}), tutorial_owner_enabled=True)
    off = read_game_state(memory.read, MapNames({}), tutorial_owner_enabled=False)
    assert on.battle.initialized and on.battle.diagnostic is None
    assert off.battle.phase == "unavailable"
    assert on.active_ui.diagnostic is None
    assert off.active_ui.diagnostic == "harness bug: empty battle move has PP"
    screen = Screen("battle", 0, 0)
    assert read_active_ui(memory.read, screen, tutorial_owner_enabled=True).diagnostic is None
    assert (
        read_active_ui(memory.read, screen, tutorial_owner_enabled=False).diagnostic
        == off.active_ui.diagnostic
    )


@pytest.mark.parametrize(
    "address,data",
    [
        (MONS, struct.pack("<H", 280)),
        (MONS + 0x2A, bytes([8])),
        (MONS + 0x0C, struct.pack("<H", 10)),
    ],
)
def test_tutorial_exception_requires_source_owned_borrowed_mon(address, data):
    memory = tutorial()
    memory.put(address, data)
    assert (
        read_battle_state(memory.read, tutorial_owner_enabled=True).diagnostic
        == "harness bug: empty battle move has PP"
    )


def test_native_journal_uses_the_same_tutorial_coverage_switch():
    memory = tutorial()
    assert read_action_frame(memory.read, tutorial_owner_enabled=True).battle.initialized
    assert (
        read_action_frame(memory.read, tutorial_owner_enabled=False).battle.phase == "unavailable"
    )
    on = NativeActionJournal(tutorial_owner_enabled=True)
    on.advance(memory.read)
    assert on.previous.battle.initialized and on.previous.ui.diagnostic is None
    off = NativeActionJournal(tutorial_owner_enabled=False)
    off.advance(memory.read)
    assert off.previous.battle.phase == "unavailable"


def test_tutorial_exception_does_not_apply_to_the_foe_side():
    memory = tutorial()
    memory.put(POSITIONS, bytes([1, 0]))
    assert (
        read_battle_state(memory.read, tutorial_owner_enabled=True).diagnostic
        == "harness bug: empty battle move has PP"
    )
