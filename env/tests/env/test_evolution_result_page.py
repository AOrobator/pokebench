"""d951 seq 16513: evolution result waits in gDisplayedStringBattle."""

import json
import struct
from contextlib import nullcontext
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from pydantic import BaseModel
from test_evolution_decision import native
from test_human import request
from test_view import get

from pokebench_env.battle_text import BATTLE_TEXT, PRINTERS, TEXT_FLAGS, read_battle_message
from pokebench_env.evolution_decision import EvolutionGate
from pokebench_env.game_state import MapNames
from pokebench_env.raw_ram import load_raw_ram
from pokebench_env.readout import SERVER_FEATURES
from pokebench_env.rerender import read_state, render
from pokebench_env.serve import run
from tests.env.test_menus import put_task
from tests.env.test_move_learn import _rom
from tests.env.test_ui_state import text, window

FIXTURES = Path(__file__).parent / "fixtures"
CONTROLS = "A or B advances the waiting evolution result text; no menu choice is open."


def result_memory(state=15):
    m = native()
    put_task(m, 0, 0x0813E571, [state, 280, 281, 129, 0, 0, 11, 11, 0, 0, 0])
    raw = text("COMBUSKEN did not learn DOUBLE KICK.") + b"\xfb\xff"
    m.put(BATTLE_TEXT, raw)
    printer = bytearray(36)
    struct.pack_into("<I", printer, 0, BATTLE_TEXT + len(raw) - 1)
    printer[0x1B], printer[0x1C] = 1, 2
    m.put(PRINTERS, printer)
    return m


@pytest.mark.parametrize("state", [15, 20, 21])
def test_result_pages_reach_native_emulator_and_switch_off_stays_unchanged(monkeypatch, state):
    # Task_EvolutionScene: cancel -> 15; learned move -> 20 -> 21.
    for enabled in [False, True]:
        m = native()
        off = (
            frozenset(SERVER_FEATURES)
            - {"ram-state-v1"}
            - ({"evolution-decision-v1"} if enabled else set())
        )
        monkeypatch.setenv("POKEBENCH_FEATURES_OFF", ",".join(off))
        monkeypatch.setenv("POKEBENCH_ACTIVE_UI", "1")
        applied = []

        class Emulator:
            def run_frame_with_buttons(self, buttons):
                applied.append(buttons)

        class Shot(BaseModel):
            screenshot_base64: str = "cG5n"

        api = FastAPI()
        run(
            [],
            uvicorn=SimpleNamespace(run=lambda *a, **k: None),
            vendor_main=lambda: None,
            observation=(api, Shot, m.read, MapNames({}), nullcontext()),
            frames=Emulator,
        )
        if enabled:
            token = json.loads(get(api, "/pokebench/evolution")[2])["pending"]["token"]
            assert (
                request(api, "/pokebench/evolution", {"token": token, "decision": "evolve"})[0]
                == 200
            )
        m.cells.update(result_memory(state).cells)
        Emulator().run_frame_with_buttons(["B"])
        Emulator().run_frame_with_buttons(["B"])
        assert applied == ([["A"], []] if enabled else [["B"], ["B"]])
        observed = read_state(m.read, MapNames({}), active_ui=True, off=off)
        shown = render(observed, off)
        if enabled:
            assert observed.active_ui.phase == "evolution_result"
            assert observed.active_ui.ready is True
            assert observed.active_ui.controls == CONTROLS
            assert f"Interface: evolution_result; input ready; {CONTROLS}" in shown
        else:
            assert observed.active_ui.phase == "evolution" and observed.active_ui.ready is False
            assert "Hold B to stop an eligible evolution" in shown
            assert "evolution_result" not in shown


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


def test_recorded_declined_double_kick_result_through_production_readout_and_gate():
    provenance = json.loads((FIXTURES / "evolution-declined-result.provenance.json").read_text())
    read = load_raw_ram(
        FIXTURES / "evolution-declined-result.json.gz", provenance["sha256"], rom=_rom()
    )
    message = read_battle_message(read)
    assert (message.state, message.page, message.diagnostic) == (
        "waiting_for_input",
        "COMBUSKEN did not learn DOUBLE KICK.",
        None,
    )
    gate = EvolutionGate(read)
    gate._ui()  # bind identity before retaining the already accepted choice
    gate.decision, gate.sent = "evolve", True
    assert gate.before_frame(["A"]) == ["A"]
    assert gate.before_frame(["B"]) == []
    on = read_state(read, MapNames({}), active_ui=True, off=frozenset())
    off_set = frozenset({"evolution-decision-v1"})
    off = read_state(read, MapNames({}), active_ui=True, off=off_set)
    assert on.active_ui.phase == "evolution_result" and on.active_ui.ready is True
    assert on.active_ui.controls == CONTROLS
    assert on.active_ui.value == "COMBUSKEN did not learn DOUBLE KICK."
    assert off.active_ui.phase == "evolution" and off.active_ui.ready is False
    assert CONTROLS in render(on, frozenset())
    assert CONTROLS not in render(off, off_set)
