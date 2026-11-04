"""d951 seq 16513: evolution result waits in gDisplayedStringBattle."""

import struct
from pathlib import Path

from test_evolution_decision import native

from pokebench_env.battle_text import BATTLE_TEXT, PRINTERS, TEXT_FLAGS
from pokebench_env.evolution_decision import EvolutionGate
from pokebench_env.game_state import MapNames
from pokebench_env.rerender import read_state
from tests.env.test_menus import put_task
from tests.env.test_ui_state import text, window

FIXTURES = Path(__file__).parent / "fixtures"


def result_memory(state=15):
    m = native()
    put_task(m, 0, 0x0813E571, [state, 280, 281, 129, 0, 0, 11, 11, 0, 0, 0])
    page = {
        15: "COMBUSKEN did not learn DOUBLE KICK.",
        20: "And…",
        21: "COMBUSKEN learned DOUBLE KICK!",
    }[state]
    raw = text(page) + b"\xfb\xff"
    m.put(BATTLE_TEXT, raw)
    printer = bytearray(36)
    struct.pack_into("<I", printer, 0, BATTLE_TEXT + len(raw) - 1)
    printer[0x1B], printer[0x1C] = 1, 2
    m.put(PRINTERS, printer)
    return m


def test_acknowledgment_requires_waiting_result_owner_and_never_answers_move_question():
    m = result_memory()
    gate = EvolutionGate(m.read)
    gate._ui()
    gate.decision, gate.sent = "evolve", True
    assert gate.before_frame(["B"]) == ["A"]
    for address, invalid in [
        (PRINTERS + 4, 1),
        (PRINTERS + 0x1B, 0),
        (PRINTERS + 0x1C, 0),
        (TEXT_FLAGS, 4),
    ]:
        old = m.read(address, 1)
        m.put(address, bytes([invalid]))
        assert gate.before_frame(["B"]) == []
        observed = read_state(m.read, MapNames({}), active_ui=True, off=frozenset())
        assert observed.active_ui.ready is False
        m.put(address, old)
    put_task(m, 0, 0x0813E571, [15, 280, 281, 1, 0, 0, 11, 11, 0, 0, 0])
    assert gate.before_frame(["B"]) == []  # requires TASK_BIT_LEARN_MOVE
    put_task(m, 0, 0x0813E571, [22, 280, 281, 129, 0, 0, 4, 5, 10, 0, 0])
    window(m, 12, 0, 5, 4, True)
    assert gate.before_frame(["B"]) == ["B"]  # caller chooses, no automatic A
