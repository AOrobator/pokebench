"""Coherent capture stays with FrameSettle; game-state safety is never bypassed."""

import threading

import pytest

from pokebench_env.battle_state import IN_BATTLE
from pokebench_env.pokemon import PokemonCpu
from pokebench_env.screen_settle import PALETTE_RAM, FrameSettle


class Memory:
    def __init__(self) -> None:
        self.idle = False
        self.battle = True
        self.frame = 0

    def pokemon_cpu_context(self) -> PokemonCpu:
        gprs = [0] * 16
        gprs[15] = 0x080008C8 if self.idle else 0x08006D9A
        return PokemonCpu(tuple(gprs), 0x3F, 0, b"")

    def __call__(self, address: int, length: int) -> bytes:
        if address == IN_BATTLE:
            return bytes([2 if self.battle else 0])
        if address == PALETTE_RAM:
            return b"\x01" + bytes(length - 1)
        return bytes(length)


def test_waits_for_current_coherent_battle_frame_without_bypassing_guard() -> None:
    memory = Memory()
    settle = FrameSettle(memory, coherent_battle=True, coherence_bound_frames=3)
    lock = threading.Lock()
    rows = []
    registered = threading.Event()
    thread = threading.Thread(
        target=lambda: rows.append(
            settle.settle_traced(lambda: (memory.frame, memory.idle), lock, registered.set)
        )
    )
    thread.start()
    assert registered.wait(1), "busy battle must register a frame wait before capturing"
    with lock:
        memory.frame = 1
        settle.on_frame()
    assert rows == [], "a busy emulated frame must not satisfy coherent capture"
    with lock:
        memory.frame = 2
        memory.idle = True
        settle.on_frame()
    thread.join(1)
    assert not thread.is_alive()
    assert rows[0][0] == (2, True)
    assert rows[0][1].frames == 2
    assert rows[0][1].reason == "coherence"


def test_off_is_immediate_without_new_cpu_predicate() -> None:
    memory = Memory()
    settle = FrameSettle(memory)
    value, receipt = settle.settle_traced(lambda: memory.idle, threading.Lock())
    assert value is False
    assert (receipt.frames, receipt.reason) == (0, "immediate")


def test_busy_frame_bound_is_small_and_captures_current_partial_state() -> None:
    memory = Memory()
    settle = FrameSettle(memory, coherent_battle=True, coherence_bound_frames=2)
    lock = threading.Lock()
    captures = []

    def capture():
        assert lock.locked()
        captures.append(memory.frame)
        return memory.idle

    def frames():
        for _ in range(2):
            with lock:
                memory.frame += 1
                settle.on_frame()

    value, receipt = settle.settle_traced(capture, lock, frames)
    assert value is False
    assert (receipt.frames, receipt.reason) == (2, "coherence_bound")
    with lock:
        memory.frame += 1
        settle.on_frame()
    assert captures == [2], "timed/bounded captures must be removed from the frame owner"


def test_stopped_frame_loop_has_a_wall_bound_and_no_late_capture() -> None:
    memory = Memory()
    settle = FrameSettle(memory, coherent_battle=True, coherence_timeout_seconds=0.005)
    lock = threading.Lock()
    captures = []
    value, receipt = settle.settle_traced(lambda: captures.append(memory.frame), lock)
    assert value is None
    assert (receipt.frames, receipt.reason) == (0, "coherence_timeout")
    with lock:
        memory.idle = True
        settle.on_frame()
    assert captures == [0]
    assert settle._waiters == []


@pytest.mark.parametrize("held", [False, True])
def test_pause_or_input_hold_never_advances_game_time(held: bool) -> None:
    memory = Memory()
    settle = FrameSettle(memory, coherent_battle=True)
    if held:
        settle.capture_held = lambda: True
    else:
        settle.park()
    value, receipt = settle.settle_traced(lambda: memory.idle, threading.Lock())
    assert value is False
    assert (receipt.frames, receipt.reason) == (0, "input_hold" if held else "paused")


def test_pause_interrupts_an_existing_coherence_wait() -> None:
    memory = Memory()
    settle = FrameSettle(memory, coherent_battle=True)
    value, receipt = settle.settle_traced(lambda: memory.idle, threading.Lock(), settle.park)
    assert value is False
    assert (receipt.frames, receipt.reason) == (0, "paused")
    assert settle._waiters == []


def test_input_hold_appearing_during_wait_releases_without_waiting_for_idle() -> None:
    memory = Memory()
    settle = FrameSettle(memory, coherent_battle=True)
    lock = threading.Lock()

    def hold():
        with lock:
            settle.capture_held = lambda: True
            settle.on_frame()

    value, receipt = settle.settle_traced(lambda: memory.idle, lock, hold)
    assert value is False
    assert (receipt.frames, receipt.reason) == (1, "input_hold")


@pytest.mark.parametrize("idle,battle", [(True, True), (False, False)])
def test_coherent_or_nonbattle_capture_remains_immediate(idle: bool, battle: bool) -> None:
    memory = Memory()
    memory.idle, memory.battle = idle, battle
    settle = FrameSettle(memory, coherent_battle=True)
    value, receipt = settle.settle_traced(lambda: memory.frame, threading.Lock())
    assert value == 0
    assert (receipt.frames, receipt.reason) == (0, "immediate")


def test_capture_failure_on_coherence_timeout_is_delivered_and_waiter_removed() -> None:
    settle = FrameSettle(Memory(), coherent_battle=True, coherence_timeout_seconds=0.005)

    def fail():
        raise ValueError("capture failed")

    with pytest.raises(ValueError, match="capture failed"):
        settle.settle_traced(fail, threading.Lock())
    assert settle._waiters == []


@pytest.mark.parametrize("frames,seconds", [(0, 1), (1, 0), (1, float("nan")), (1, float("inf"))])
def test_invalid_bounds_refused(frames: int, seconds: float) -> None:
    with pytest.raises(ValueError, match="bounds"):
        FrameSettle(Memory(), coherence_bound_frames=frames, coherence_timeout_seconds=seconds)


def test_production_defaults_pin_finite_bounds() -> None:
    settle = FrameSettle(Memory())
    assert settle.coherent_battle is False
    assert settle.coherence_bound_frames == 60
    assert settle.coherence_timeout_seconds == 2


@pytest.mark.parametrize("enabled", [False, True])
def test_real_server_factory_gates_capture_and_returns_settle_metadata(
    monkeypatch, enabled
) -> None:
    import json
    import types

    from fastapi import FastAPI
    from test_screen_settle import Shot, png
    from test_view import get

    from pokebench_env import serve
    from pokebench_env.game_state import MapNames
    from pokebench_env.readout import SERVER_FEATURES
    from pokebench_env.screen_settle import COHERENT_BATTLE_FEATURE

    monkeypatch.setenv(
        "POKEBENCH_FEATURES_OFF",
        ",".join(
            feature
            for feature in SERVER_FEATURES
            if feature != COHERENT_BATTLE_FEATURE or not enabled
        ),
    )
    memory = Memory()
    lock = threading.Lock()
    registered = threading.Event()
    results = []

    class TracedSettle(FrameSettle):
        def settle_traced(self, capture, memory_lock, on_wait=None):
            return super().settle_traced(capture, memory_lock, registered.set)

    monkeypatch.setattr(serve, "FrameSettle", TracedSettle)

    class Emulator:
        def run_frame_with_buttons(self, buttons):
            assert buttons == [], "coherent capture must not issue game inputs"
            memory.frame += 1
            memory.idle = True

    app = FastAPI()

    def vendor_main():
        request = threading.Thread(
            target=lambda: results.append(get(app, "/pokebench/observation"))
        )
        request.start()
        if enabled:
            assert registered.wait(1), "factory must enable the real coherent capture wait"
            with lock:
                Emulator().run_frame_with_buttons([])
        request.join(1)
        assert not request.is_alive()

    serve.run(
        [],
        uvicorn=types.SimpleNamespace(run=lambda *a, **k: None),
        vendor_main=vendor_main,
        observation=(
            app,
            lambda: Shot(screenshot_base64=png((10, 20, 30))),
            memory,
            MapNames({}),
            lock,
        ),
        frames=Emulator,
    )
    status, _, body = results[0]
    assert status == 200
    payload = json.loads(body)
    assert memory.frame == (1 if enabled else 0)
    if enabled:
        assert payload["state"]["settle"] == {"frames": 1, "reason": "coherence"}
    else:
        assert "settle" not in payload["state"], "OFF must preserve the old payload"


@pytest.mark.parametrize("enabled", [False, True])
def test_native_geodude_fixture_through_model_observation_keeps_guard_and_pairing(
    monkeypatch, enabled
) -> None:
    import base64
    import json
    from io import BytesIO
    from pathlib import Path

    from fastapi import FastAPI
    from PIL import Image
    from test_screen_settle import Shot, png
    from test_transition_coherence import operator_rom

    from pokebench_env.game_state import MapNames
    from pokebench_env.observation import install_observation
    from pokebench_env.rerender import PORYMAP_MAPS, read_state
    from pokebench_env.transition_coherence import main_loop_idle

    fixture = json.loads(
        (Path(__file__).parent / "fixtures/coherent-battle-native.json").read_text()
    )
    rom = operator_rom()
    phases = fixture["rows"]

    class NativeMemory:
        index = 0
        windows = [
            [(address, bytes.fromhex(data)) for address, data in row["windows"]] for row in phases
        ]

        def __call__(self, address, length):
            if 0x08000000 <= address < 0x0A000000:
                offset = address - 0x08000000
                return rom[offset : offset + length]
            for base, data in self.windows[self.index]:
                if base <= address and address + length <= base + len(data):
                    return data[address - base : address - base + length]
            raise ValueError(f"native fixture has no window {address:#x}/{length}")

        def pokemon_cpu_context(self):
            cpu = phases[self.index]["cpu"]
            return PokemonCpu(
                tuple(cpu["gprs"]),
                cpu["cpsr"],
                cpu["stack_address"],
                bytes.fromhex(cpu["stack_bytes"]),
            )

    memory = NativeMemory()
    off = frozenset(phases[0]["off"])
    if enabled:
        off -= {"coherent-battle-observation-v1"}
    monkeypatch.setenv("POKEBENCH_FEATURES_OFF", ",".join(sorted(off)))
    monkeypatch.setenv("POKEBENCH_ACTIVE_UI", "1")
    maps = MapNames.load(PORYMAP_MAPS)
    partial = read_state(memory, maps, active_ui=True, off=off)
    assert main_loop_idle(memory) is False
    assert partial.mid_frame is True
    assert partial.battle_details is None and partial.party is None, "guard must remain intact"
    lock = threading.Lock()

    def frame():
        with lock:
            memory.index = 1
            settle.on_frame()

    class DrivenSettle(FrameSettle):
        def settle_traced(self, capture, memory_lock, on_wait=None):
            return super().settle_traced(capture, memory_lock, frame)

    settle = DrivenSettle(memory, coherent_battle=enabled)
    app = FastAPI()
    observe = install_observation(
        app,
        lambda: Shot(screenshot_base64=png((10, 20, 30 + memory.index))),
        memory,
        maps,
        lock,
        settle=settle,
    )
    result = observe()
    assert result["state_text"] == phases[1 if enabled else 0]["text"]
    color = Image.open(BytesIO(base64.b64decode(result["screenshot_base64"]))).getpixel((0, 0))
    assert color == (10, 20, 31 if enabled else 30), "image must belong to the same chosen snapshot"
    if enabled:
        assert result["state"]["settle"] == {"frames": 1, "reason": "coherence"}
        assert result["state"]["party"][0]["hp"] == 34
        assert result["state"]["party"][0]["moves"][3]["name"] == "EMBER"
        assert result["state"]["story"]["rustboro_gym_complete"] is False
        assert "Effective damage (" in result["state_text"]
        assert "middle of a frame" not in result["state_text"]
    else:
        assert "settle" not in result["state"]
        assert "Effective damage (" not in result["state_text"]
        assert "middle of a frame" in result["state_text"]


def test_missing_native_cpu_metadata_is_explicitly_unavailable_not_guessed(monkeypatch) -> None:
    from fastapi import FastAPI, HTTPException
    from test_screen_settle import Shot, png

    from pokebench_env.game_state import MapNames
    from pokebench_env.observation import install_observation
    from pokebench_env.readout import SERVER_FEATURES

    monkeypatch.setenv(
        "POKEBENCH_FEATURES_OFF",
        ",".join(
            feature for feature in SERVER_FEATURES if feature != "coherent-battle-observation-v1"
        ),
    )
    memory = Memory()
    # This legacy reader has no CPU method, unlike the real emulator reader.
    observe = install_observation(
        FastAPI(),
        lambda: Shot(screenshot_base64=png((10, 20, 30))),
        lambda address, length: memory(address, length),
        MapNames({}),
    )
    with pytest.raises(HTTPException, match="CPU coherence unavailable") as error:
        observe()
    assert error.value.status_code == 503


def test_battle_ending_mid_callback_still_waits_for_idle() -> None:
    memory = Memory()
    settle = FrameSettle(memory, coherent_battle=True)
    lock = threading.Lock()

    def frames():
        with lock:
            memory.battle = False
            settle.on_frame()
            assert len(settle._waiters) == 1, "battle flag clearing is not CPU coherence"
            memory.idle = True
            settle.on_frame()

    value, receipt = settle.settle_traced(lambda: memory.idle, lock, frames)
    assert value is True
    assert (receipt.frames, receipt.reason) == (2, "coherence")


@pytest.mark.parametrize("initial_fade", [False, True])
def test_fade_and_coherence_share_existing_capture_owner(initial_fade: bool) -> None:
    memory = Memory()
    settle = FrameSettle(memory, coherent_battle=True)
    lock = threading.Lock()
    fade = initial_fade
    # Use the production fade predicate; change only the palette-fade byte.
    from pokebench_env.menus import PALETTE_FADE

    def read(address, length):
        if address == PALETTE_FADE + 7:
            return bytes([128 if fade else 0])
        return memory(address, length)

    read.pokemon_cpu_context = memory.pokemon_cpu_context
    settle.read = read

    def frames():
        nonlocal fade
        with lock:
            fade = not initial_fade
            settle.on_frame()
            assert len(settle._waiters) == 1
            fade = False
            memory.idle = True
            settle.on_frame()

    value, receipt = settle.settle_traced(lambda: memory.idle, lock, frames)
    assert value is True
    assert receipt.frames == 2
    assert receipt.reason == ("coherence" if initial_fade else "fade")


def test_frame_motion_error_reaches_waiter_and_cleans_up() -> None:
    memory = Memory()
    settle = FrameSettle(memory, coherent_battle=True)
    lock = threading.Lock()

    def fail():
        raise ValueError("motion failed")

    def frame():
        with lock:
            settle.move_learning = fail
            settle.on_frame()

    with pytest.raises(ValueError, match="motion failed"):
        settle.settle_traced(lambda: None, lock, frame)
    assert settle._waiters == []


@pytest.mark.parametrize("timeout", [False, True])
def test_incomplete_observation_declares_bound_and_keeps_partial_readout(monkeypatch, timeout):
    from fastapi import FastAPI
    from test_screen_settle import Shot, png

    from pokebench_env.game_state import MapNames
    from pokebench_env.observation import install_observation
    from pokebench_env.readout import SERVER_FEATURES
    from pokebench_env.screen_settle import COHERENCE_NOTE, COHERENT_BATTLE_FEATURE

    monkeypatch.setenv(
        "POKEBENCH_FEATURES_OFF",
        ",".join(
            feature
            for feature in SERVER_FEATURES
            if feature
            not in {
                COHERENT_BATTLE_FEATURE,
                "transition-coherence-v1",
                "mid-frame-readout-v1",
                "ram-state-v1",
            }
        ),
    )
    memory = Memory()
    lock = threading.Lock()

    class DrivenSettle(FrameSettle):
        def settle_traced(self, capture, memory_lock, on_wait=None):
            def frame():
                if not timeout:
                    with lock:
                        self.on_frame()

            return super().settle_traced(capture, memory_lock, frame)

    settle = DrivenSettle(
        memory, coherent_battle=True, coherence_bound_frames=1, coherence_timeout_seconds=0.005
    )
    observe = install_observation(
        FastAPI(),
        lambda: Shot(screenshot_base64=png((10, 20, 30))),
        memory,
        MapNames({}),
        lock,
        settle=settle,
    )
    result = observe()
    assert result["state"]["settle"] == {
        "frames": 0 if timeout else 1,
        "reason": "coherence_timeout" if timeout else "coherence_bound",
    }
    assert COHERENCE_NOTE in result["state_text"], result["state_text"]
    assert "Battle details: unprovided" in result["state_text"], result["state_text"]
    assert "Effective damage (" not in result["state_text"], result["state_text"]


def test_timeout_check_does_not_terminate_existing_fade_wait() -> None:
    from unittest.mock import patch

    from pokebench_env.screen_settle import _Waiter

    settle = FrameSettle(Memory(), coherent_battle=True)
    waiter = _Waiter(lambda: None)
    waiter.kind = "fade"
    settle._waiters.append(waiter)
    # Two deterministic timeout checks, then completion: no sleeps or race timing.
    with patch.object(waiter.done, "wait", side_effect=[False, True]):
        settle._await_capture(waiter, threading.Lock())
    assert settle._waiters == [waiter], "coherence timeout must not own fade release"
    assert not waiter.done.is_set()


def test_frame_completion_winning_timeout_race_is_captured_only_once() -> None:
    from unittest.mock import patch

    from pokebench_env.screen_settle import _Waiter

    captures = []
    settle = FrameSettle(Memory(), coherent_battle=True)
    waiter = _Waiter(lambda: captures.append("late"))
    waiter.kind = "coherence"
    # on_frame completed between Event.wait timing out and the caller taking the lock.
    waiter.done.set()
    with patch.object(waiter.done, "wait", side_effect=[False, True]):
        settle._await_capture(waiter, threading.Lock())
    assert captures == [], "completion racing with timeout must not capture again"
