"""Exact CB2_WhiteOut owner, pret731ad5bf overworld.c:1550; no RunTasks during wait."""

import struct

from test_transition_coherence import Zeros

from pokebench_env.game_screen import GMAIN, read_screen
from pokebench_env.ui_state import read_active_ui


def test_blackout_owner_is_input_not_ready_only_when_enabled() -> None:
    memory = Zeros()
    memory.put(GMAIN, struct.pack("<II", 0x08085E05, 0x08085F59))
    legacy = read_screen(memory.read)
    assert legacy.kind == "unknown"
    old = read_active_ui(memory.read, legacy)
    assert old is not None and old.phase == "unsupported" and old.diagnostic
    screen = read_screen(memory.read, blackout_transition=True)
    assert screen.kind == "field_transition"
    ui = read_active_ui(memory.read, screen, blackout_transition=True)
    assert ui is not None and ui.phase == "field_transition"
    assert ui.ready is False and ui.selected is None and ui.diagnostic is None
    assert "input is not active" in ui.controls


def test_nearby_unknown_callback_stays_a_coverage_error() -> None:
    memory = Zeros()
    memory.put(GMAIN, struct.pack("<II", 0x08085E05, 0x08085F5B))
    screen = read_screen(memory.read, blackout_transition=True)
    assert screen.kind == "unknown"
    ui = read_active_ui(memory.read, screen, blackout_transition=True)
    assert ui is not None and ui.phase == "unsupported" and ui.diagnostic


def test_production_model_factory_is_gated_and_native_journal_recognizes_owner() -> None:
    from pokebench_env.action_history import NativeActionJournal, read_action_frame
    from pokebench_env.game_state import MapNames
    from pokebench_env.readout import features_off_from_env, state_json
    from pokebench_env.rerender import read_state

    memory = Zeros()
    memory.put(GMAIN, struct.pack("<II", 0x08085E05, 0x08085F59))
    off = features_off_from_env({})
    assert "blackout-transition-v1" in off
    legacy = state_json(read_state(memory.read, MapNames({}), active_ui=True, off=off))
    current = state_json(
        read_state(memory.read, MapNames({}), active_ui=True, off=off - {"blackout-transition-v1"})
    )
    assert str(legacy["screen"]).startswith("unknown")
    assert current["screen"] == "field_transition"
    assert current["active_ui"]["ready"] is False
    assert current["party"] == [] and current["map_id"] is None
    frame = read_action_frame(memory.read)
    assert frame.ui is not None and frame.ui.diagnostic is None and frame.ui.ready is False
    journal = NativeActionJournal()
    journal.advance(memory.read)
    assert not any(row["kind"] == "harness_bug" for row in journal.entries)
    memory.put(GMAIN + 4, struct.pack("<I", 0x08085F5B))
    journal.advance(memory.read)
    assert any(row["kind"] == "harness_bug" for row in journal.entries)
