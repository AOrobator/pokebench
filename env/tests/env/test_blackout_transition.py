"""Exact CB2_WhiteOut owner, pret731ad5bf overworld.c:1550; no RunTasks during wait."""
import struct

from test_transition_coherence import Zeros

from pokebench_env.game_screen import GMAIN, Screen, read_screen
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
