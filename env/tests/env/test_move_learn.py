"""move-learn-settle-v1, move-learn-question-v1 and move-learn-comparison-v1.

The fixtures are raw-RAM archives copied byte for byte from run
2026-10-20T20-26-22_qwen36-gpu1_97a0 (move-learn-raw.provenance.json names each source archive
and its sha256): COMBUSKEN learning DOUBLE KICK after evolving (turns 779+), and TORCHIC learning
PECK in battle (turns 755-770), including the summary screen's forget-a-move list. Game flow:
pret/pokeemerald 731ad5bf src/evolution_scene.c MVSTATE_*, data/battle_scripts_1.s
BattleScript_AskToLearnMove, src/battle_message.c sText_TryToLearnMove1/3,
sText_StopLearningMove, sText_DidNotLearnMove.
"""

from __future__ import annotations

import json
import os
import threading
from collections.abc import Callable
from functools import cache
from pathlib import Path
from typing import cast

import pytest

from pokebench_env.game_screen import ReadMemory
from pokebench_env.game_state import GameState, MapNames
from pokebench_env.menus import PALETTE_FADE
from pokebench_env.move_learn import (
    COMPARISON_SWITCH,
    QUESTION_SWITCH,
    SETTLE_BOUND_FRAMES,
    SETTLE_SWITCH,
    question_kind,
)
from pokebench_env.raw_ram import load_raw_ram
from pokebench_env.readout import SERVER_FEATURES, features_off_from_env
from pokebench_env.rerender import PORYMAP_MAPS, read_state
from pokebench_env.rerender import render as _render
from pokebench_env.rom import resolve_rom
from pokebench_env.screen_settle import FrameSettle, Settled
from pokebench_env.ui_state import ActiveUi

FIXTURES = Path(__file__).parent / "fixtures"
PROVENANCE = json.loads((FIXTURES / "move-learn-raw.provenance.json").read_text())
SWITCHES = frozenset({SETTLE_SWITCH, QUESTION_SWITCH, COMPARISON_SWITCH})


@cache
def _rom() -> bytes:
    return resolve_rom({"POKEBENCH_ROM": os.environ.get("POKEBENCH_ROM", "")}).read_bytes()


@cache
def archived(name: str) -> ReadMemory:
    archive = PROVENANCE["archives"][name]
    return load_raw_ram(FIXTURES / f"move-learn-{name}.json.gz", archive["sha256"], rom=_rom())


@cache
def maps() -> MapNames:
    return MapNames.load(PORYMAP_MAPS)


def state(name: str, off: frozenset[str] = frozenset()) -> GameState:
    return read_state(
        archived(name), maps(), active_ui=True, off=off | {"move-learn-type-matchup-v1"}
    )


def render(snapshot: GameState, off: frozenset[str]) -> str:
    """Keep the historical comparison tests on their original feature set."""
    return _render(snapshot, off | {"move-learn-type-matchup-v1"})


def interface_block(text: str) -> list[str]:
    lines = text.split("\n")
    start = next(i for i, line in enumerate(lines) if line.startswith("Interface:"))
    end = next(i for i, line in enumerate(lines) if line.startswith("Bag:"))
    return lines[start + 1 : end]


# --- the recorded states ------------------------------------------------------------------


# --- move-learn-settle-v1 -----------------------------------------------------------------


class Script:
    """A settle hook that is busy for the first `busy` frames it is asked about."""

    def __init__(self, busy: int) -> None:
        self.busy = busy
        self.asked = 0

    def __call__(self) -> bool:
        self.asked += 1
        return self.asked <= self.busy


def blank(address: int, length: int) -> bytes:
    # A non-black palette and no fade: only the move-learning hook can hold a capture.
    return bytes([1] * length) if address == 0x05000000 else bytes(length)


def settle_with(hook: Callable[[], bool] | None, bound: int = SETTLE_BOUND_FRAMES) -> FrameSettle:
    settle = FrameSettle(blank)
    settle.move_learning = hook
    settle.move_learning_bound_frames = bound
    return settle


def drive(settle: FrameSettle, frames: int) -> tuple[str, Settled]:
    result: dict[str, object] = {}
    lock = threading.Lock()
    thread = threading.Thread(
        target=lambda: result.update(r=settle.settle_traced(lambda: "captured", lock)),
        daemon=True,
    )
    thread.start()
    for _ in range(frames):
        if not thread.is_alive():
            break
        thread.join(0.01)
        with lock:
            settle.on_frame()
    thread.join(5)
    assert not thread.is_alive()
    captured, settled = cast(tuple[str, Settled], result["r"])
    return captured, settled


def test_on_the_capture_waits_frame_by_frame_until_the_input_is_ready() -> None:
    # Busy when the observation arrives and on the next three frames; ready on the fourth.
    captured, settled = drive(settle_with(Script(busy=4)), 50)
    assert captured == "captured"
    assert (settled.frames, settled.reason) == (4, "move_learning")


def test_on_the_wait_is_bounded_in_frames() -> None:
    captured, settled = drive(settle_with(lambda: True, bound=7), 50)
    assert captured == "captured"
    assert (settled.frames, settled.reason) == (7, "move_learning_bound")


def test_off_captures_at_once() -> None:
    _, settled = drive(settle_with(None), 50)
    assert (settled.frames, settled.reason) == (0, "immediate")


def test_a_ready_scene_is_captured_at_once_with_the_switch_on() -> None:
    _, settled = drive(settle_with(lambda: False), 50)
    assert (settled.frames, settled.reason) == (0, "immediate")


def test_a_fade_keeps_its_own_bound_and_reason_with_the_switch_on() -> None:
    fading = {"on": True}

    def read(address: int, length: int) -> bytes:
        if address == 0x05000000:
            return bytes([1] * length)
        if address == PALETTE_FADE + 7 and fading["on"]:
            return b"\x80"
        return bytes(length)

    settle = FrameSettle(read)
    settle.move_learning = lambda: False
    settle.move_learning_bound_frames = SETTLE_BOUND_FRAMES
    result: dict[str, object] = {}
    lock = threading.Lock()
    thread = threading.Thread(
        target=lambda: result.update(r=settle.settle_traced(lambda: "x", lock)), daemon=True
    )
    thread.start()
    thread.join(0.05)
    for _ in range(3):
        with lock:
            settle.on_frame()
    fading["on"] = False
    with lock:
        settle.on_frame()
    thread.join(5)
    _, settled = cast(tuple[str, Settled], result["r"])
    assert settled.reason == "fade"


# --- move-learn-question-v1 ---------------------------------------------------------------


def test_trade_scene_pairs_and_unknown_pairs() -> None:
    def ui(yes: int, no: int, ready: bool = True) -> ActiveUi:
        return ActiveUi(
            "evolution_move_confirmation",
            "YES",
            ready,
            "",
            details={"yes_next_state": yes, "no_next_state": no},
        )

    assert question_kind(ui(5, 9), None) == "delete"
    assert question_kind(ui(10, 0), None) == "stop"
    assert question_kind(ui(5, 10, ready=False), None) is None
    assert question_kind(ui(7, 7), None) is None
    assert question_kind(None, None) is None


# --- move-learn-comparison-v1 -------------------------------------------------------------


# --- OFF parity, typed state and failures -------------------------------------------------


# --- registration -------------------------------------------------------------------------


def test_switches_are_registered_server_side_last_and_default_off() -> None:
    assert SERVER_FEATURES[60:63] == (SETTLE_SWITCH, QUESTION_SWITCH, COMPARISON_SWITCH)
    assert SWITCHES <= features_off_from_env({})
    assert features_off_from_env({"POKEBENCH_FEATURES_OFF": SETTLE_SWITCH}) == {SETTLE_SWITCH}


# --- every reader failure is visible ------------------------------------------------------


def test_a_warp_during_a_move_learning_wait_takes_the_warp_bound(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from pokebench_env import screen_settle

    frames = {"n": 0}
    monkeypatch.setattr(screen_settle, "warp_animating", lambda read: 2 <= frames["n"] < 5)
    settle = FrameSettle(blank, warp=True, warp_bound_frames=50)
    settle.move_learning = lambda: frames["n"] < 2
    settle.move_learning_bound_frames = 3
    result: dict[str, object] = {}
    lock = threading.Lock()
    thread = threading.Thread(
        target=lambda: result.update(r=settle.settle_traced(lambda: "x", lock)), daemon=True
    )
    thread.start()
    thread.join(0.05)
    while thread.is_alive() and frames["n"] < 40:
        frames["n"] += 1
        with lock:
            settle.on_frame()
        thread.join(0.01)
    thread.join(5)
    _, settled = cast(tuple[str, Settled], result["r"])
    assert settled.reason == "warp"
    assert settled.frames == 5
