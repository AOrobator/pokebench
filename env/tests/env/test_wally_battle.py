"""LoadWallyZigzagoon source731ad5bf: MOVE2-4 are cleared, their PP is retained."""

import json
import os
import struct
from pathlib import Path

import pytest
from test_battle_state import fixture
from test_game_state import text

from pokebench_env.action_history import NativeActionJournal, read_action_frame
from pokebench_env.battle_choices import MONS, POSITIONS, TYPE_FLAGS
from pokebench_env.battle_state import read_battle_state
from pokebench_env.game_screen import Screen
from pokebench_env.game_state import MapNames, read_game_state
from pokebench_env.pokemon import BATTLE_MOVES, MOVE_NAMES
from pokebench_env.raw_ram import load_raw_ram
from pokebench_env.readout import state_json
from pokebench_env.rerender import PORYMAP_MAPS, read_state, render
from pokebench_env.rom import resolve_rom
from pokebench_env.ui_state import read_active_ui

FIXTURES = Path(__file__).parent / "fixtures"


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


def test_real_archived_tutorial_reaches_model_readout():
    provenance = json.loads((FIXTURES / "wally-battle-raw.provenance.json").read_text())
    rom = resolve_rom({"POKEBENCH_ROM": os.environ.get("POKEBENCH_ROM", "")}).read_bytes()
    read = load_raw_ram(
        FIXTURES / "wally-battle-raw.json.gz", provenance["archive"]["sha256"], rom=rom
    )
    maps = MapNames.load(PORYMAP_MAPS)
    # Isolate the existing owner switch via the same production factory used by /state and rerender.
    off = frozenset({"tutorial-party-owner-v1"})
    old = read_state(read, maps, active_ui=True, off=off)
    repaired = read_state(read, maps, active_ui=True, off=frozenset())
    assert old.battle.diagnostic == "harness bug: empty battle move has PP"
    assert repaired.battle.initialized and repaired.battle.diagnostic is None
    assert repaired.active_ui.diagnostic is None
    assert repaired.battle.battlers[0].species == "ZIGZAGOON"
    assert [move.move_id for move in repaired.battle.battlers[0].moves] == [33, 0, 0, 0]
    assert repaired.battle.ready is False
    assert (
        repaired.active_ui.controls
        == "The game controls this tutorial battle; no player battle choice is waiting"
    )
    assert "empty battle move has PP" not in render(repaired, frozenset())
    delivered = state_json(repaired)
    assert delivered["battle"]["initialized"] is True
    assert delivered["battle"]["diagnostic"] is None


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


@pytest.mark.parametrize("on", [True, False])
def test_server_factory_threads_tutorial_switch_to_frame_journal(monkeypatch, on):
    import sys
    import types

    from fastapi import FastAPI
    from test_view import get

    from pokebench_env.serve import run

    memory = tutorial()
    monkeypatch.setattr(sys, "argv", list(sys.argv))
    monkeypatch.setenv("POKEBENCH_FEATURES_OFF", "" if on else "tutorial-party-owner-v1")

    class Emulator:
        def run_frame_with_buttons(self, buttons):
            pass

    app = FastAPI()
    run(
        [],
        types.SimpleNamespace(run=lambda *args, **kwargs: None),
        lambda: Emulator().run_frame_with_buttons([]),
        actions=(app, Emulator, memory.read),
    )
    status, _, body = get(app, "/pokebench/actions")
    assert status == 200
    assert (b"empty battle move has PP" in body) is (not on)


def test_tutorial_exception_does_not_apply_to_the_foe_side():
    memory = tutorial()
    memory.put(POSITIONS, bytes([1, 0]))
    assert (
        read_battle_state(memory.read, tutorial_owner_enabled=True).diagnostic
        == "harness bug: empty battle move has PP"
    )
