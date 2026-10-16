"""warp-arrival-settle-v1: observations wait out the game's door/stairs/warp tasks.

The control-2919 rows are RAM windows copied byte for byte from that run's raw-RAM
archives (fixtures/warp-settle-2919.json names each archive and its sha256); the
location, position and lock of each row come from the paired state events. Task
addresses: docs/findings/2026-10-16_warp-arrival-settle.md.
"""

from __future__ import annotations

import json
import struct
import threading
import types
from collections.abc import Callable
from dataclasses import replace
from pathlib import Path

import pytest
from fastapi import FastAPI
from pydantic import BaseModel
from test_pause import FrameLoop, post
from test_readout import IN_GAME
from test_screen_settle import png
from test_view import get

from pokebench_env import observation as observation_module
from pokebench_env import rerender
from pokebench_env.game_screen import TASKS
from pokebench_env.game_state import FIELD_CONTROLS_LOCK, GameState, MapNames
from pokebench_env.menus import PALETTE_FADE
from pokebench_env.observation import install_observation
from pokebench_env.readout import SERVER_FEATURES, WARP_ANIMATION_LOCK, features_off_from_env
from pokebench_env.screen_settle import (
    PALETTE_RAM,
    SETTLE_BOUND_FRAMES,
    WARP_FEATURE,
    WARP_SETTLE_BOUND_FRAMES,
    WARP_TASKS,
    FrameSettle,
    Settled,
    transitioning,
    warp_animating,
    warp_task_live,
)

FIXTURE = json.loads((Path(__file__).parent / "fixtures" / "warp-settle-2919.json").read_text())
ROWS = {row["state_seq"]: row for row in FIXTURE["rows"]}
TODAY_LOCK = "Field controls: locked (dialog, menu, or script; direction presses cannot move)"
DO_DOOR_WARP = 0x080AFA89
EXIT_DOOR = 0x080AF439


class Ram:
    """Sparse emulator memory: zero everywhere except the windows put into it."""

    def __init__(self) -> None:
        self.cells: dict[int, int] = {}

    def put(self, address: int, data: bytes) -> Ram:
        for offset, value in enumerate(data):
            self.cells[address + offset] = value
        return self

    def read(self, address: int, length: int) -> bytes:
        return bytes(self.cells.get(address + i, 0) for i in range(length))


def recorded(seq: int) -> Ram:
    ram = Ram()
    for window in ROWS[seq]["windows"]:
        ram.put(int(window["address"], 16), bytes.fromhex(window["hex"]))
    return ram


def tasks(*funcs: int) -> bytes:
    raw = bytearray(16 * 0x28)
    for i, func in enumerate(funcs):
        struct.pack_into("<I", raw, i * 0x28, func)
        raw[i * 0x28 + 4] = 1
    return bytes(raw)


def synthetic(
    *, lock: bool, funcs: tuple[int, ...] = (), fade: bool = False, black: bool = False
) -> Ram:
    ram = Ram()
    ram.put(FIELD_CONTROLS_LOCK, bytes([int(lock)]))
    ram.put(TASKS, tasks(*funcs))
    ram.put(PALETTE_FADE, bytes(7) + (b"\x80" if fade else b"\x00"))
    ram.put(PALETTE_RAM, bytes(0x400) if black else b"\xff\x7f" + bytes(0x3FE))
    return ram


class Game:
    """The current frame's memory; tests swap `ram` between emulated frames."""

    def __init__(self, ram: Ram) -> None:
        self.ram = ram
        self.frame = 0

    def read(self, address: int, length: int) -> bytes:
        return self.ram.read(address, length)


Capture = Callable[[], object]


def waiting(settle: FrameSettle, capture: Capture, lock: threading.Lock):
    out: dict[str, object] = {}
    registered = threading.Event()

    def worker() -> None:
        out["result"] = settle.settle_traced(capture, lock, on_wait=registered.set)

    thread = threading.Thread(target=worker, daemon=True)
    thread.start()
    assert registered.wait(5)
    return out, thread


def at_once(settle: FrameSettle, capture: Capture, lock: threading.Lock) -> tuple[object, Settled]:
    out: dict[str, tuple[object, Settled]] = {}
    waited: list[bool] = []

    def worker() -> None:
        out["r"] = settle.settle_traced(capture, lock, on_wait=lambda: waited.append(True))

    thread = threading.Thread(target=worker, daemon=True)
    thread.start()
    thread.join(5)
    assert not thread.is_alive(), "captured without waiting for a frame"
    assert waited == []
    return out["r"]


def run_frames(
    game: Game,
    settle: FrameSettle,
    lock: threading.Lock,
    thread: threading.Thread,
    schedule: Callable[[int], Ram | None],
    limit: int = 2000,
) -> int:
    stepped = 0
    while thread.is_alive() and stepped < limit:
        with lock:
            game.frame += 1
            nxt = schedule(game.frame)
            if nxt is not None:
                game.ram = nxt
            settle.on_frame()
        stepped += 1
        thread.join(0.001)
    thread.join(5)
    return stepped


# --- receipts ---------------------------------------------------------------------------


def test_task_addresses_are_the_rom_receipt() -> None:
    assert WARP_TASKS == {
        0x080AF439: "Task_ExitDoor",
        0x080AF551: "Task_ExitNonAnimDoor",
        0x080AF611: "Task_ExitNonDoor",
        0x080AFA0D: "Task_WarpAndLoadMap",
        0x080AFA89: "Task_DoDoorWarp",
    }
    assert FIELD_CONTROLS_LOCK == 0x03000F2C and TASKS == 0x03005E00
    assert FIXTURE["source"]["rom_sha1"] == "f3ae088181bf583e55daf962a92bb46f4f1d07b7"


def test_bound_covers_the_measured_chain_and_stays_under_the_fetch_timeout() -> None:
    longest_measured = 137  # Birch's lab -> Littleroot, first locked frame to unlocked
    slowest_lane_fps = 42.8  # control-2919 / bundle-3f21 raw-RAM frame and time stamps
    fetch_timeout_s = 15.0  # packages/agent/src/game-tools.ts observation getJson
    assert WARP_SETTLE_BOUND_FRAMES == 300
    assert WARP_SETTLE_BOUND_FRAMES >= 2 * longest_measured
    assert WARP_SETTLE_BOUND_FRAMES / slowest_lane_fps < fetch_timeout_s / 2
    assert SETTLE_BOUND_FRAMES == 146


# --- archived control-2919 RAM ----------------------------------------------------------

HELD = [1383, 2010, 2884, 3165, 3166]


@pytest.mark.parametrize("seq", HELD)
def test_each_recorded_mid_animation_capture_passed_todays_settle_at_once(seq: int) -> None:
    ram = recorded(seq)
    assert ROWS[seq]["field_controls_locked"] is True
    assert transitioning(ram.read) is False, "today's settle captured this frame at once"
    assert warp_task_live(ram.read) and warp_animating(ram.read)
    game = Game(ram)
    assert at_once(FrameSettle(game.read), lambda: ROWS[seq]["position"], threading.Lock()) == (
        ROWS[seq]["position"],
        Settled(0, "immediate"),
    )


@pytest.mark.parametrize(
    ("chain", "location", "position"),
    [
        ([1383, 1392], "LITTLEROOT TOWN BRENDANS HOUSE 2F", {"x": 7, "y": 2}),
        ([2010, 2020], "LITTLEROOT TOWN", {"x": 5, "y": 9}),
        ([2884, 2894, 2900], "LITTLEROOT TOWN PROFESSOR BIRCHS LAB", {"x": 6, "y": 12}),
        ([3165, 3166, 3174], "LITTLEROOT TOWN", {"x": 7, "y": 17}),
    ],
)
def test_switch_on_holds_the_recorded_captures_until_the_unlocked_arrival(
    chain: list[int], location: str, position: dict[str, int]
) -> None:
    """Replay: each archived snapshot becomes the game's memory for one emulated frame."""
    game = Game(recorded(chain[0]))
    lock = threading.Lock()
    settle = FrameSettle(game.read, warp=True)
    seen: list[int] = []
    current = {"seq": chain[0]}

    def capture() -> dict[str, object]:
        seen.append(current["seq"])
        return ROWS[current["seq"]]

    def schedule(frame: int) -> Ram | None:
        if frame < len(chain):
            current["seq"] = chain[frame]
            return recorded(chain[frame])
        return None

    out, thread = waiting(settle, capture, lock)
    run_frames(game, settle, lock, thread, schedule)
    row, settled = out["result"]  # type: ignore[misc]
    assert seen == [chain[-1]]
    assert (row["location"], row["position"], row["field_controls_locked"]) == (
        location,
        position,
        False,
    )
    assert settled == Settled(len(chain) - 1, "warp")


def test_switch_off_keeps_todays_capture_of_every_recorded_row() -> None:
    for seq in HELD:
        game = Game(recorded(seq))
        assert (
            at_once(FrameSettle(game.read, warp=False), lambda seq=seq: seq, threading.Lock())[0]
            == seq
        )


# --- a real lock is never hidden --------------------------------------------------------


def test_a_script_lock_with_no_warp_task_is_captured_at_once() -> None:
    """control-2919 seq 1126: MOM's arrival dialogue holds the player; no warp task."""
    ram = recorded(1126)
    assert ROWS[1126]["field_controls_locked"] is True
    assert warp_task_live(ram.read) is False and warp_animating(ram.read) is False
    assert at_once(FrameSettle(ram.read, warp=True), lambda: "mom", threading.Lock()) == (
        "mom",
        Settled(0, "immediate"),
    )


def test_a_warp_task_without_the_lock_does_not_hold() -> None:
    ram = synthetic(lock=False, funcs=(EXIT_DOOR,))
    assert warp_task_live(ram.read) and not warp_animating(ram.read)
    assert at_once(FrameSettle(ram.read, warp=True), lambda: 1, threading.Lock())[1] == Settled(
        0, "immediate"
    )


def test_an_unrelated_task_with_the_lock_does_not_hold() -> None:
    ram = synthetic(lock=True, funcs=(0x080D487D, 0x0809D88D))
    assert not warp_animating(ram.read)


# --- bound, chain and pause -------------------------------------------------------------


def test_bound_hit_captures_anyway_and_does_not_hang() -> None:
    game = Game(synthetic(lock=True, funcs=(DO_DOOR_WARP,)))
    lock = threading.Lock()
    settle = FrameSettle(game.read, warp=True, warp_bound_frames=7)
    out, thread = waiting(settle, lambda: (game.frame, warp_animating(game.read)), lock)
    assert run_frames(game, settle, lock, thread, lambda frame: None) == 7
    assert out["result"] == ((7, True), Settled(7, "warp_bound"))


def test_the_default_warp_bound_is_used_in_frames() -> None:
    game = Game(synthetic(lock=True, funcs=(EXIT_DOOR,)))
    lock = threading.Lock()
    settle = FrameSettle(game.read, warp=True)
    out, thread = waiting(settle, lambda: game.frame, lock)
    assert run_frames(game, settle, lock, thread, lambda frame: None) == WARP_SETTLE_BOUND_FRAMES
    assert out["result"] == (WARP_SETTLE_BOUND_FRAMES, Settled(300, "warp_bound"))


def test_a_fade_only_wait_keeps_the_fade_bound_with_the_switch_on() -> None:
    game = Game(synthetic(lock=False, fade=True))
    lock = threading.Lock()
    settle = FrameSettle(game.read, bound_frames=5, warp=True, warp_bound_frames=50)
    out, thread = waiting(settle, lambda: game.frame, lock)
    assert run_frames(game, settle, lock, thread, lambda frame: None) == 5
    assert out["result"] == (5, Settled(5, "fade_bound"))


def test_a_fade_ending_settles_with_the_fade_reason() -> None:
    game = Game(synthetic(lock=False, fade=True))
    lock = threading.Lock()
    settle = FrameSettle(game.read, warp=True)
    out, thread = waiting(settle, lambda: game.frame, lock)
    run_frames(game, settle, lock, thread, lambda f: synthetic(lock=False) if f == 3 else None)
    assert out["result"] == (3, Settled(3, "fade"))


def test_a_door_entry_is_held_through_the_load_black_frames_and_the_exit() -> None:
    """Measured lab entry shape: door task, load task + fade, black, exit task + fade, exit task."""
    plan = {
        1: synthetic(lock=True, funcs=(0x080AFA0D,), fade=True),
        3: synthetic(lock=False, black=True),
        5: synthetic(lock=True, funcs=(0x080AF611,), fade=True, black=True),
        7: synthetic(lock=True, funcs=(0x080AF611,)),
        9: synthetic(lock=False),
    }
    game = Game(synthetic(lock=True, funcs=(DO_DOOR_WARP,)))
    lock = threading.Lock()
    # The fade bound is shorter than the chain: a waiter that saw a warp task keeps the warp bound.
    settle = FrameSettle(game.read, bound_frames=2, warp=True)
    out, thread = waiting(settle, lambda: game.frame, lock)
    run_frames(game, settle, lock, thread, plan.get)
    assert out["result"] == (9, Settled(9, "warp"))


def test_operator_pause_releases_a_warp_waiter() -> None:
    game = Game(synthetic(lock=True, funcs=(EXIT_DOOR,)))
    lock = threading.Lock()
    settle = FrameSettle(game.read, warp=True)
    out, thread = waiting(settle, lambda: "captured", lock)
    settle.park()
    thread.join(5)
    assert out["result"] == ("captured", Settled(0, "paused"))
    assert at_once(settle, lambda: "parked", lock) == ("parked", Settled(0, "paused"))


def test_settle_returns_only_the_capture() -> None:
    game = Game(synthetic(lock=False))
    assert FrameSettle(game.read, warp=True).settle(lambda: 4, threading.Lock()) == 4


# --- what the model reads ---------------------------------------------------------------

LOCKED = replace(IN_GAME, field_controls_locked=True)


def test_readout_labels_a_warp_lock_only_when_on() -> None:
    on = rerender.render(LOCKED, frozenset(), warp_animation=True)
    assert WARP_ANIMATION_LOCK in on and TODAY_LOCK not in on
    assert WARP_ANIMATION_LOCK == (
        "Field controls: locked (door/stairs/warp animation still running; observe again)"
    )
    off = rerender.render(LOCKED, frozenset({WARP_FEATURE}), warp_animation=True)
    assert off == rerender.render(LOCKED, frozenset({WARP_FEATURE}))
    assert TODAY_LOCK in off and WARP_ANIMATION_LOCK not in off
    assert TODAY_LOCK in rerender.render(LOCKED, frozenset())
    free = replace(IN_GAME, field_controls_locked=False)
    assert "Field controls: available" in rerender.render(free, frozenset(), warp_animation=True)


class Shot(BaseModel):
    screenshot_base64: str


def observation_app(
    monkeypatch: pytest.MonkeyPatch,
    game: Game,
    settle: FrameSettle | None,
    off: str,
    state: GameState = LOCKED,
    lock: threading.Lock | None = None,
) -> FastAPI:
    monkeypatch.setenv("POKEBENCH_FEATURES_OFF", off)
    monkeypatch.setattr(observation_module, "read_state", lambda *a, **k: state)
    app = FastAPI()
    install_observation(
        app,
        lambda: Shot(screenshot_base64=png((90, 90, 90))),
        game.read,
        MapNames({}),
        lock or threading.Lock(),
        settle=settle,
    )
    return app


def observe(app: FastAPI) -> dict[str, object]:
    status, _, body = get(app, "/pokebench/observation")
    assert status == 200, body
    return json.loads(body)


def test_observation_at_the_bound_shows_the_animation_label_and_records_the_settle(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    game = Game(synthetic(lock=True, funcs=(DO_DOOR_WARP,)))
    lock = threading.Lock()
    settle = FrameSettle(game.read, warp=True, warp_bound_frames=4)
    app = observation_app(monkeypatch, game, settle, "", lock=lock)
    result: dict[str, dict[str, object]] = {}
    thread = threading.Thread(target=lambda: result.update(r=observe(app)), daemon=True)
    thread.start()
    thread.join(0.2)
    assert thread.is_alive(), "the observation waits for emulated frames"
    run_frames(game, settle, lock, thread, lambda frame: None)
    body = result["r"]
    assert WARP_ANIMATION_LOCK in str(body["state_text"])
    assert TODAY_LOCK not in str(body["state_text"])
    assert body["state"]["settle"] == {"frames": 4, "reason": "warp_bound"}  # type: ignore[index]


def test_observation_after_a_settled_arrival_records_the_wait(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    game = Game(synthetic(lock=True, funcs=(EXIT_DOOR,)))
    lock = threading.Lock()
    settle = FrameSettle(game.read, warp=True)
    free = replace(IN_GAME, field_controls_locked=False)
    app = observation_app(monkeypatch, game, settle, "", state=free, lock=lock)
    result: dict[str, dict[str, object]] = {}
    thread = threading.Thread(target=lambda: result.update(r=observe(app)), daemon=True)
    thread.start()
    thread.join(0.1)
    run_frames(game, settle, lock, thread, lambda f: synthetic(lock=False) if f == 6 else None)
    body = result["r"]
    assert body["state"]["settle"] == {"frames": 6, "reason": "warp"}  # type: ignore[index]
    assert "Field controls: available" in str(body["state_text"])


def test_a_script_lock_observation_keeps_todays_label_with_the_switch_on(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    game = Game(recorded(1126))
    app = observation_app(monkeypatch, game, FrameSettle(game.read, warp=True), "")
    body = observe(app)
    assert TODAY_LOCK in str(body["state_text"])
    assert body["state"]["settle"] == {"frames": 0, "reason": "immediate"}  # type: ignore[index]


def test_off_payload_is_todays_even_mid_animation(monkeypatch: pytest.MonkeyPatch) -> None:
    game = Game(recorded(3166))
    off = ",".join(sorted(features_off_from_env({})))
    body = observe(observation_app(monkeypatch, game, FrameSettle(game.read), off))
    assert TODAY_LOCK in str(body["state_text"])
    assert WARP_ANIMATION_LOCK not in str(body["state_text"])
    assert "settle" not in body["state"]  # type: ignore[operator]
    # No FrameSettle (human server): ON still labels the animation, without a settle record.
    on = observe(observation_app(monkeypatch, game, None, ""))
    assert WARP_ANIMATION_LOCK in str(on["state_text"]) and "settle" not in on["state"]  # type: ignore[operator]


def test_rerender_labels_an_archived_mid_animation_frame_only_when_on() -> None:
    maps = MapNames({})

    def run(seq: int, off: list[str]) -> str:
        env = {"POKEBENCH_FEATURES_OFF": ",".join(off), "POKEBENCH_ACTIVE_UI": "1"}
        ram = recorded(seq)
        return rerender.rerender(
            Path("/run"), [rerender.RawRef("a", "s")], lambda _p, _s: ram.read, maps, env
        )[0]

    original = rerender.read_state
    try:
        rerender.read_state = lambda *a, **k: LOCKED  # type: ignore[assignment]
        assert WARP_ANIMATION_LOCK in run(3166, [])
        assert TODAY_LOCK in run(3166, [WARP_FEATURE])
        assert TODAY_LOCK in run(1126, [])
    finally:
        rerender.read_state = original  # type: ignore[assignment]


# --- registration and production wiring -------------------------------------------------


def test_switch_is_registered_server_side_and_default_off() -> None:
    assert WARP_FEATURE == "warp-arrival-settle-v1"
    assert WARP_FEATURE in SERVER_FEATURES
    assert WARP_FEATURE in features_off_from_env({})
    assert features_off_from_env({"POKEBENCH_FEATURES_OFF": WARP_FEATURE}) == {WARP_FEATURE}


@pytest.mark.parametrize(("off", "waits"), [("", True), (WARP_FEATURE, False)])
def test_production_run_reads_the_switch_into_the_frame_settle(
    monkeypatch: pytest.MonkeyPatch, off: str, waits: bool
) -> None:
    from pokebench_env.serve import run

    monkeypatch.setenv("POKEBENCH_FEATURES_OFF", off)
    game = Game(synthetic(lock=True, funcs=(EXIT_DOOR,)))
    lock = threading.Lock()
    app = FastAPI()
    module = types.SimpleNamespace(step_environment=lambda actions: None)

    class Emulator:
        def run_frame_with_buttons(self, buttons: list[str]) -> None:
            game.frame += 1

    run(
        [],
        uvicorn=types.SimpleNamespace(run=lambda *a, **k: None),
        vendor_main=lambda: None,
        observation=(
            app,
            lambda: Shot(screenshot_base64=png((9, 9, 9))),
            game.read,
            MapNames({}),
            lock,
        ),
        pause=(app, module),
        frames=Emulator,
    )
    result: dict[str, object] = {}
    thread = threading.Thread(
        target=lambda: result.update(r=get(app, "/pokebench/observation")), daemon=True
    )
    thread.start()
    thread.join(0.2)
    assert thread.is_alive() is waits
    if waits:
        with FrameLoop(module) as loop:
            assert post(app, "/pokebench/pause", b'{"paused": true}')[0] == 200
            thread.join(5)
            assert not thread.is_alive(), "operator pause releases the warp waiter"
            loop.stop.set()
            assert post(app, "/pokebench/pause", b'{"paused": false}')[0] == 200
            loop.thread.join(2)
    thread.join(5)
    assert not thread.is_alive()
