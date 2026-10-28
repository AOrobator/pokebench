import json
import struct
from contextlib import nullcontext

import pytest
from fastapi import FastAPI
from test_human import request
from test_view import get

from pokebench_env.evolution_decision import EvolutionGate, decision_ui, install_evolution_decision
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


def test_endpoint_native_frame_hook_and_stale_duplicate_validation():
    m = native()
    applied = []

    class Emulator:
        def run_frame_with_buttons(self, buttons):
            applied.append(buttons)

    api = FastAPI()
    install_evolution_decision(api, Emulator, m.read, nullcontext())
    emu = Emulator()
    emu.run_frame_with_buttons(["B"])
    assert applied == []
    status, _, body = get(api, "/pokebench/evolution")
    import json

    token = json.loads(body)["pending"]["token"]
    assert status == 200
    assert request(api, "/pokebench/evolution", {"token": token, "decision": "maybe"})[0] == 422
    assert (
        request(api, "/pokebench/evolution", {"token": token + 1, "decision": "cancel"})[0] == 409
    )
    assert request(api, "/pokebench/evolution", {"token": token, "decision": "cancel"})[0] == 200
    assert request(api, "/pokebench/evolution", {"token": token, "decision": "cancel"})[0] == 409
    emu.run_frame_with_buttons(["A"])
    assert applied == [["B"]]


def test_native_action_history_records_fixed_owner_and_actual_decision_input():
    from pokebench_env.action_history import install_action_history

    m = native()
    applied = []

    class Emulator:
        def run_frame_with_buttons(self, buttons):
            applied.append(buttons)

    api = FastAPI()
    put_task(m, 0, 0x0813E571, [7, 280, 281, 1, 0, 0, 0, 0, 0, 0, 0])
    journal = install_action_history(api, Emulator, m.read, evolution_decision=True)
    journal.advance(m.read)
    put_task(m, 0, 0x0813E571, [8, 280, 281, 1, 0, 0, 0, 0, 0, 0, 0])
    install_evolution_decision(api, Emulator, m.read, nullcontext())
    emu = Emulator()
    emu.run_frame_with_buttons(["B"])
    assert journal.frame == 1  # frozen iterations are not native frames
    _, _, body = get(api, "/pokebench/evolution")
    import json

    token = json.loads(body)["pending"]["token"]
    request(api, "/pokebench/evolution", {"token": token, "decision": "cancel"})
    emu.run_frame_with_buttons(["A"])
    assert applied == [["B"]]
    assert journal.frame == 2
    entries = journal.snapshot(0)["entries"]
    assert any(e["kind"] == "native_input" and e["details"]["buttons"] == ["B"] for e in entries)
    assert any(
        e["kind"] == "menu_changed"
        and e["details"]["phase"] == "evolution_decision"
        and e["details"]["selected"] is None
        for e in entries
    )


def test_production_readout_and_server_factory_switch_are_connected(monkeypatch):
    from types import SimpleNamespace

    from pydantic import BaseModel

    from pokebench_env.game_state import MapNames
    from pokebench_env.readout import SERVER_FEATURES
    from pokebench_env.rerender import read_state, render
    from pokebench_env.serve import run

    class Shot(BaseModel):
        screenshot_base64: str = "cG5n"

    for enabled in [False, True]:
        m = native()
        off = (
            frozenset(SERVER_FEATURES)
            - {"ram-state-v1"}
            - ({"evolution-decision-v1"} if enabled else set())
        )
        monkeypatch.setenv("POKEBENCH_FEATURES_OFF", ",".join(off))
        state = read_state(m.read, MapNames({}), active_ui=True, off=off)
        text = render(state, off)
        if enabled:
            assert state.active_ui.selected is None
            assert "choose_evolution" in text and "B declines" not in text
            assert "Menu: no selectable menu is open; use choose_evolution" in text
            assert "Menu: unavailable" not in text
        else:
            assert state.active_ui.selected == "CANCEL"
        calls = []

        class Emulator:
            def run_frame_with_buttons(self, buttons, calls=calls):
                calls.append(buttons)

        api = FastAPI()
        run(
            [],
            uvicorn=SimpleNamespace(run=lambda *a, **k: None),
            vendor_main=lambda: None,
            observation=(api, Shot, m.read, MapNames({}), nullcontext()),
            frames=Emulator,
        )
        Emulator().run_frame_with_buttons(["B"])
        assert calls == ([] if enabled else [["B"]])
        assert get(api, "/pokebench/evolution")[0] == (200 if enabled else 404)


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


def test_native_move_owner_literal_matches_the_operator_rom():
    import os

    from pokebench_env.rom import RomError, resolve_rom

    try:
        rom = resolve_rom(os.environ).read_bytes()
    except RomError:
        pytest.skip("POKEBENCH_ROM is not set to the Emerald ROM")
    # MonTryLearningNewMove STRH r0,[r2] at 0x080693EC; r2 loads
    # its gMoveToLearn pointer from literal 0x0806941C.
    assert rom[0x693D8:0x693DA] == bytes.fromhex("104a")
    assert rom[0x693EC:0x693EE] == bytes.fromhex("1080")
    assert int.from_bytes(rom[0x6941C:0x69420], "little") == 0x020244E2


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


def test_human_server_keeps_tool_dependent_evolution_observation_off(monkeypatch):
    import os
    from types import SimpleNamespace

    from pydantic import BaseModel

    from pokebench_env.game_state import MapNames
    from pokebench_env.readout import features_off_from_env
    from pokebench_env.serve import run

    # Historical human launch shape predates evolution controls. This sparse reader
    # has no native capture source, so the independent safe recorder stays OFF.
    monkeypatch.setenv(
        "POKEBENCH_FEATURES_OFF",
        "named-interactions-v1,world-destinations-v1,bounded-navigation-v1,expanded-menu-battle-information-v1,full-map-navigation-v1,scene-journal-safe-capture-v1",
    )
    monkeypatch.setenv("POKEBENCH_ACTIVE_UI", "1")
    m = native()
    applied = []

    class Emulator:
        def run_frame_with_buttons(self, buttons):
            applied.append(buttons)

    class Shot(BaseModel):
        screenshot_base64: str = "cG5n"

    api = FastAPI()
    server = SimpleNamespace(step_environment=lambda buttons: None, fps=80)
    run(
        [],
        uvicorn=SimpleNamespace(run=lambda *a, **k: None),
        vendor_main=lambda: None,
        observation=(api, Shot, m.read, MapNames({}), nullcontext()),
        frames=Emulator,
        human=(api, server, "secret"),
    )
    human_off = features_off_from_env(os.environ)
    assert "evolution-decision-v1" in human_off
    status, _headers, body = get(api, "/pokebench/observation")
    observation = json.loads(body)
    assert status == 200
    assert observation["state"]["active_ui"]["selected"] == "CANCEL"
    assert "choose_evolution" not in observation["state_text"]
    Emulator().run_frame_with_buttons(["B"])
    assert applied == [["B"]]
    assert get(api, "/pokebench/evolution")[0] == 404


@pytest.mark.parametrize("before_hold", [False, True])
@pytest.mark.parametrize("transition", ["fade", "black"])
def test_pending_decision_observation_returns_without_advancing_held_frames(
    monkeypatch, before_hold, transition
):
    import os
    import threading
    from types import SimpleNamespace

    from pydantic import BaseModel

    from pokebench_env import serve
    from pokebench_env.game_state import MapNames
    from pokebench_env.menus import PALETTE_FADE
    from pokebench_env.readout import SERVER_FEATURES
    from pokebench_env.screen_settle import PALETTE_RAM, FrameSettle

    waiting, done = threading.Event(), threading.Event()
    captures, failures, settlements, instances = [], [], [], []

    class ObservedSettle(FrameSettle):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            instances.append(self)

        def settle_traced(self, capture, memory_lock, on_wait=None):
            result = super().settle_traced(capture, memory_lock, waiting.set)
            settlements.append(result[1])
            return result

    monkeypatch.setattr(serve, "FrameSettle", ObservedSettle)
    monkeypatch.setenv("POKEBENCH_ACTIVE_UI", "1")
    monkeypatch.setenv(
        "POKEBENCH_FEATURES_OFF",
        ",".join(
            set(SERVER_FEATURES)
            - {"ram-state-v1", "evolution-decision-v1", "warp-arrival-settle-v1"}
        ),
    )
    m = native(7 if before_hold else 8)
    m.put(PALETTE_FADE + 7, b"\x80" if transition == "fade" else b"\x00")
    m.put(PALETTE_RAM, bytes(0x400) if transition == "black" else b"\x01" + bytes(0x3FF))
    lock = threading.RLock()

    class Emulator:
        frames = 0

        def run_frame_with_buttons(self, buttons):
            self.frames += 1
            put_task(m, 0, 0x0813E571, [8, 280, 281, 1, 0, 0, 0, 0, 0, 0, 0])

    class Shot(BaseModel):
        screenshot_base64: str = "cG5n"

    api = FastAPI()
    serve.run(
        [],
        uvicorn=SimpleNamespace(run=lambda *a, **k: None),
        vendor_main=lambda: None,
        observation=(api, Shot, m.read, MapNames({}), lock),
        frames=Emulator,
    )

    def observe():
        try:
            captures.append(get(api, "/pokebench/observation"))
        except BaseException as error:
            failures.append(error)
        finally:
            done.set()

    thread = threading.Thread(target=observe, daemon=True)
    thread.start()
    emulator = Emulator()
    try:
        if before_hold:
            assert waiting.wait(1)
            with lock:
                emulator.run_frame_with_buttons(["B"])
        assert done.wait(1), "observation waited for frames blocked by the pending decision"
        with lock:
            for _ in range(200):
                emulator.run_frame_with_buttons(["B"])
        assert emulator.frames == int(before_hold)
        assert not failures
        status, _headers, body = captures[0]
        assert status == 200
        observation = json.loads(body)
        assert observation["state"]["active_ui"]["phase"] == "evolution_decision"
        assert "choose_evolution" in observation["state_text"]
        assert observation["state"]["settle"] == {
            "frames": int(before_hold),
            "reason": "input_hold",
        }
        assert settlements[0].frames == int(before_hold)
        # Reading the decision neither chooses nor advances it; ordinary pause remains independent.
        _status, _headers, pending = get(api, "/pokebench/evolution")
        assert json.loads(pending)["pending"] is not None
        instances[0].park()
        paused, receipt = instances[0].settle_traced(lambda: "paused", lock)
        assert paused == "paused" and receipt.reason == "paused"
        instances[0].resume()
        done.clear()
        thread = threading.Thread(target=observe, daemon=True)
        thread.start()
        assert done.wait(1), "observation after resume waited on an intentional hold"
        assert settlements[-1].reason == "input_hold"
        human_off = os.environ["POKEBENCH_FEATURES_OFF"]
        assert "evolution-decision-v1" not in human_off.split(",")
    finally:
        instances[0].park()
        thread.join(2)
    assert not thread.is_alive()
