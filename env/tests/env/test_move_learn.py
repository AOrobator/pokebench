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
import types
from collections.abc import Callable
from dataclasses import replace
from functools import cache
from pathlib import Path
from typing import cast

import pytest
from fastapi import FastAPI
from test_screen_settle import png
from test_warp_arrival_settle import Shot

from pokebench_env import serve
from pokebench_env.game_screen import ReadMemory
from pokebench_env.game_state import GameState, MapNames
from pokebench_env.menus import PALETTE_FADE
from pokebench_env.move_learn import (
    COMPARISON_SWITCH,
    QUESTION_SWITCH,
    SETTLE_BOUND_FRAMES,
    SETTLE_SWITCH,
    move_learning_busy,
    question_kind,
    read_move_learning,
)
from pokebench_env.raw_ram import load_raw_ram
from pokebench_env.readout import SERVER_FEATURES, features_off_from_env, state_json
from pokebench_env.rerender import PORYMAP_MAPS, read_state, render
from pokebench_env.rom import resolve_rom
from pokebench_env.screen_settle import FrameSettle, Settled
from pokebench_env.ui_state import ActiveUi

FIXTURES = Path(__file__).parent / "fixtures"
PROVENANCE = json.loads((FIXTURES / "move-learn-raw.provenance.json").read_text())
SWITCHES = frozenset({SETTLE_SWITCH, QUESTION_SWITCH, COMPARISON_SWITCH})
PRINTING = ("evo-intro3-printing", "evo-delete-printing", "evo-stop-printing")
READY = ("evo-intro3-waiting", "evo-delete-box", "evo-stop-box")

DELETE_DOUBLE_KICK = (
    'The game asks: "Delete a move to make room for DOUBLE KICK?" YES: the game lists '
    "COMBUSKEN's moves so you pick one to forget for DOUBLE KICK. NO or B: the game asks "
    '"Stop learning DOUBLE KICK?"'
)
STOP_DOUBLE_KICK = (
    'The game asks: "Stop learning DOUBLE KICK?" YES: the game says "COMBUSKEN did not learn '
    'DOUBLE KICK." and COMBUSKEN keeps the moves it knows. NO or B: the game starts over with '
    '"COMBUSKEN is trying to learn DOUBLE KICK."'
)
COMBUSKEN_MOVES = [
    "Moves (the game's move data and the summary screen's descriptions):",
    "  COMBUSKEN (FIRE/FIGHTING) knows:",
    "  1 PECK FLYING physical pow 35 acc 100 PP 35/35 — "
    '"Attacks the foe with a jabbing beak, etc."',
    '  2 GROWL NORMAL status acc 100 PP 40/40 — "Growls cutely to reduce the foe\'s ATTACK."',
    "  3 FOCUS ENERGY NORMAL status never misses PP 30/30 — "
    '"Focuses power to raise the critical-hit ratio."',
    "  4 EMBER FIRE special pow 40 acc 100 PP 21/25 — "
    '"A weak fire attack that may inflict a burn."',
    "  New move: DOUBLE KICK FIGHTING physical pow 30 acc 100 PP 30/30 — "
    '"A double-kicking attack that strikes the foe twice."',
]
TORCHIC_MOVES = [
    "Moves (the game's move data and the summary screen's descriptions):",
    "  TORCHIC (FIRE) knows:",
    '  1 SCRATCH NORMAL physical pow 40 acc 100 PP 35/35 — "Scratches the foe with sharp claws."',
    '  2 GROWL NORMAL status acc 100 PP 40/40 — "Growls cutely to reduce the foe\'s ATTACK."',
    "  3 FOCUS ENERGY NORMAL status never misses PP 30/30 — "
    '"Focuses power to raise the critical-hit ratio."',
    "  4 EMBER FIRE special pow 40 acc 100 PP 23/25 — "
    '"A weak fire attack that may inflict a burn."',
    "  New move: PECK FLYING physical pow 35 acc 100 PP 35/35 — "
    '"Attacks the foe with a jabbing beak, etc."',
]


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
    return read_state(archived(name), maps(), active_ui=True, off=off)


def interface_block(text: str) -> list[str]:
    lines = text.split("\n")
    start = next(i for i, line in enumerate(lines) if line.startswith("Interface:"))
    end = next(i for i, line in enumerate(lines) if line.startswith("Bag:"))
    return lines[start + 1 : end]


# --- the recorded states ------------------------------------------------------------------


def test_fixtures_are_the_recorded_loop_states() -> None:
    expected = {
        "evo-intro3-printing": ("evolution_move_learning", False, 2, 0, 0),
        "evo-intro3-waiting": ("evolution_move_learning", True, 2, 0, 0),
        "evo-delete-printing": ("evolution_move_learning", False, 3, 5, 10),
        "evo-delete-box": ("evolution_move_confirmation", True, 4, 5, 10),
        "evo-stop-printing": ("evolution_move_learning", False, 3, 11, 0),
        "evo-stop-box": ("evolution_move_confirmation", True, 4, 11, 0),
    }
    for name, (phase, ready, mls, yes, no) in expected.items():
        ui = state(name).active_ui
        assert ui is not None and ui.details is not None
        details = ui.details
        assert (ui.phase, ui.ready) == (phase, ready), name
        assert (
            details["move_learning_state"],
            details["yes_next_state"],
            details["no_next_state"],
        ) == (mls, yes, no), name
    battle = {"battle-delete-box": "learn_move", "battle-stop-box": "stop_learning_move"}
    for name, kind in battle.items():
        recorded = state(name).battle
        assert recorded is not None and recorded.prompt is not None
        assert (recorded.prompt.kind, recorded.prompt.ready) == (kind, True)
    summary = state("summary-forget").active_ui
    assert summary is not None and summary.phase == "summary_move_forget"


# --- move-learn-settle-v1 -----------------------------------------------------------------


@pytest.mark.parametrize("name", PRINTING)
def test_the_scene_is_busy_while_its_text_prints_or_the_box_is_not_drawn(name: str) -> None:
    assert move_learning_busy(archived(name)) is True


@pytest.mark.parametrize("name", (*READY, "battle-delete-box", "battle-stop-box", "summary-forget"))
def test_input_ready_states_and_other_screens_are_not_busy(name: str) -> None:
    assert move_learning_busy(archived(name)) is False


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


def test_the_recorded_busy_state_is_held_by_the_production_hook() -> None:
    read = archived("evo-delete-printing")
    settle = FrameSettle(read)
    settle.move_learning = lambda: move_learning_busy(read)
    settle.move_learning_bound_frames = 3
    _, settled = drive(settle, 10)
    assert settled.reason == "move_learning_bound"


@pytest.mark.parametrize(("off", "hooked"), [("", True), (SETTLE_SWITCH, False)])
def test_production_run_hooks_the_frame_settle_only_with_the_switch_on(
    monkeypatch: pytest.MonkeyPatch, off: str, hooked: bool
) -> None:
    monkeypatch.setenv("POKEBENCH_FEATURES_OFF", off)
    captured: list[FrameSettle] = []
    original = serve.install_frame_settle

    def capture(emulator: object, settle: FrameSettle) -> None:
        captured.append(settle)
        original(emulator, settle)  # type: ignore[arg-type]

    monkeypatch.setattr(serve, "install_frame_settle", capture)
    read = archived("evo-delete-printing")

    class Emulator:
        def run_frame_with_buttons(self, buttons: list[str]) -> None:
            pass

    serve.run(
        [],
        uvicorn=types.SimpleNamespace(run=lambda *a, **k: None),
        vendor_main=lambda: None,
        observation=(
            FastAPI(),
            lambda: Shot(screenshot_base64=png((9, 9, 9))),
            read,
            MapNames({}),
            threading.Lock(),
        ),
        frames=Emulator,
    )
    [settle] = captured
    assert (settle.move_learning is not None) is hooked
    if hooked:
        assert settle.move_learning is not None and settle.move_learning() is True
        assert settle.move_learning_bound_frames == SETTLE_BOUND_FRAMES


# --- move-learn-question-v1 ---------------------------------------------------------------


@pytest.mark.parametrize(
    ("name", "line"),
    [
        ("evo-delete-box", DELETE_DOUBLE_KICK),
        ("evo-stop-box", STOP_DOUBLE_KICK),
        (
            "battle-delete-box",
            'The game asks: "Delete a move to make room for PECK?" YES: the game lists '
            "TORCHIC's moves so you pick one to forget for PECK. NO or B: the game asks "
            '"Stop learning PECK?"',
        ),
        (
            "battle-stop-box",
            'The game asks: "Stop learning PECK?" YES: the game says "TORCHIC did not learn PECK." '
            "and TORCHIC keeps the moves it knows. NO or B: the game starts over with "
            '"TORCHIC is trying to learn PECK."',
        ),
    ],
)
def test_question_line_names_the_open_question_and_both_answers(name: str, line: str) -> None:
    off = SWITCHES - {QUESTION_SWITCH}
    block = interface_block(render(state(name, off), off))
    assert line in block
    # Right after the YES/NO answer line, before anything else.
    assert block[-1] == line


@pytest.mark.parametrize("name", (*PRINTING, "evo-intro3-waiting", "summary-forget"))
def test_no_question_line_without_a_ready_question(name: str) -> None:
    off = SWITCHES - {QUESTION_SWITCH}
    assert "The game asks:" not in render(state(name, off), off)


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


@pytest.mark.parametrize("name", ("evo-delete-box", "evo-stop-box"))
def test_comparison_lists_known_and_new_moves_with_the_game_descriptions(name: str) -> None:
    off = SWITCHES - {COMPARISON_SWITCH}
    block = interface_block(render(state(name, off), off))
    assert block[-len(COMBUSKEN_MOVES) :] == COMBUSKEN_MOVES


@pytest.mark.parametrize("name", ("battle-delete-box", "battle-stop-box", "summary-forget"))
def test_comparison_in_battle_and_on_the_forget_move_list(name: str) -> None:
    off = SWITCHES - {COMPARISON_SWITCH}
    block = interface_block(render(state(name, off), off))
    assert block[-len(TORCHIC_MOVES) :] == TORCHIC_MOVES


def test_both_switches_on_put_the_question_before_the_moves() -> None:
    block = interface_block(render(state("evo-delete-box"), frozenset()))
    assert block[-len(COMBUSKEN_MOVES) - 1 :] == [DELETE_DOUBLE_KICK, *COMBUSKEN_MOVES]


@pytest.mark.parametrize("name", PRINTING)
def test_no_comparison_while_the_scene_prints(name: str) -> None:
    assert "Moves (the game's move data" not in render(state(name), frozenset())


# --- OFF parity, typed state and failures -------------------------------------------------


@pytest.mark.parametrize("name", list(PROVENANCE["archives"]))
def test_off_is_byte_for_byte_the_readout_without_the_reader(name: str) -> None:
    off = frozenset(SWITCHES)
    without = state(name, off)
    assert without.move_learning is None and without.move_learning_diagnostic is None
    on = state(name)
    assert render(without, off) == render(replace(on, move_learning=None), off)
    assert render(on, off) == render(without, off)


@pytest.mark.parametrize("name", list(PROVENANCE["archives"]))
def test_state_json_is_unchanged_by_the_reader(name: str) -> None:
    assert state_json(state(name)) == state_json(state(name, frozenset(SWITCHES)))


def test_a_failed_read_is_a_visible_harness_bug_not_a_guess() -> None:
    base = archived("evo-delete-box")

    def broken(address: int, length: int) -> bytes:
        if address == 0x0861C524 + 4 * 23:  # DOUBLE KICK's description pointer
            return b"\x00\x00\x00\x00"
        return base(address, length)

    recorded = read_state(broken, maps(), active_ui=True, off=frozenset())
    assert recorded.move_learning is None
    assert recorded.move_learning_diagnostic is not None
    text = render(recorded, frozenset())
    assert "HARNESS BUG (move learning): harness bug: move learning: move description" in text
    assert "HARNESS BUG (move learning)" not in render(recorded, frozenset(SWITCHES))


def test_reader_needs_the_party() -> None:
    recorded = state("evo-delete-box")
    assert read_move_learning(archived("evo-delete-box"), recorded.active_ui, None, None) is None


# --- registration -------------------------------------------------------------------------


def test_switches_are_registered_server_side_last_and_default_off() -> None:
    assert SERVER_FEATURES[-4:-1] == (SETTLE_SWITCH, QUESTION_SWITCH, COMPARISON_SWITCH)
    assert SWITCHES <= features_off_from_env({})
    assert features_off_from_env({"POKEBENCH_FEATURES_OFF": SETTLE_SWITCH}) == {SETTLE_SWITCH}


# --- every reader failure is visible ------------------------------------------------------


def _patched(name: str, address: int, data: bytes) -> ReadMemory:
    base = archived(name)

    def read(at: int, length: int) -> bytes:
        raw = bytearray(base(at, length))
        for i in range(length):
            if address <= at + i < address + len(data):
                raw[i] = data[at + i - address]
        return bytes(raw)

    return read


def _description_pointer(name: str, move: int) -> int:
    return int.from_bytes(archived(name)(0x0861C524 + 4 * (move - 1), 4), "little")


@pytest.mark.parametrize(
    ("name", "patch", "message"),
    [
        (
            "evo-delete-box",
            lambda: (_description_pointer("evo-delete-box", 24), bytes(64)),
            "no terminator",
        ),
        (
            "battle-delete-box",
            lambda: (0x020244E2, (400).to_bytes(2, "little")),
            "invalid move id 400",
        ),
        (
            "evo-delete-box",
            lambda: (0x0831C898 + 12 * 24 + 2, b"\x63"),
            "invalid move type for move 24",
        ),
        ("evo-delete-box", lambda: (0x083203CC + 28 * 281 + 6, b"\x63"), "invalid species types"),
        ("battle-delete-box", lambda: (0x0202449C, bytes(4)), "gBattleStruct pointer 0x0"),
    ],
)
def test_bad_game_data_is_reported_not_guessed(
    name: str, patch: Callable[[], tuple[int, bytes]], message: str
) -> None:
    address, data = patch()
    recorded = read_state(_patched(name, address, data), maps(), active_ui=True, off=frozenset())
    assert recorded.move_learning is None
    assert recorded.move_learning_diagnostic is not None
    assert message in recorded.move_learning_diagnostic


def test_a_learner_slot_outside_the_party_is_reported() -> None:
    struct_pointer = int.from_bytes(archived("battle-delete-box")(0x0202449C, 4), "little")
    read = _patched("battle-delete-box", struct_pointer + 0x10, b"\x05")
    recorded = read_state(read, maps(), active_ui=True, off=frozenset())
    assert recorded.move_learning_diagnostic is not None
    assert "move learner party slot 5 is out of range" in recorded.move_learning_diagnostic


def test_an_unreadable_learner_and_missing_owner_details_raise() -> None:
    recorded = state("evo-delete-box")
    assert recorded.party is not None and recorded.active_ui is not None
    blank_mon = replace(recorded.party[0], species_id=None)
    with pytest.raises(ValueError, match="is unreadable"):
        read_move_learning(archived("evo-delete-box"), recorded.active_ui, None, (blank_mon,))
    details = dict(recorded.active_ui.details or {})
    del details["pokemon_party_index"]
    with pytest.raises(ValueError, match="lacks its party slot"):
        read_move_learning(
            archived("evo-delete-box"),
            replace(recorded.active_ui, details=details),
            None,
            recorded.party,
        )
    summary = state("summary-forget")
    assert summary.active_ui is not None and summary.party is not None
    summary_details = dict(summary.active_ui.details or {})
    summary_details["new_move_id"] = 0
    with pytest.raises(ValueError, match="summary forget-move screen lacks"):
        read_move_learning(
            archived("summary-forget"),
            replace(summary.active_ui, details=summary_details),
            None,
            summary.party,
        )


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
