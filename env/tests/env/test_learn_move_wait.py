"""move-learn-tool-v1: the game server's per-frame wait for the move-learning prompts.

Real RAM: the raw-RAM archives test_move_learn.py uses (run 2026-10-20T20-26-22_qwen36-gpu1_97a0,
COMBUSKEN learning DOUBLE KICK after evolving and TORCHIC learning PECK in battle). Synthetic
memory covers the branches those archives do not reach. Game flow: pret/pokeemerald 731ad5bf
src/evolution_scene.c (EVOSTATE_REPLACE_MOVE, MVSTATE_*), data/battle_scripts_1.s
BattleScript_AskToLearnMove, src/pokemon_summary_screen.c Task_HandleReplaceMoveInput.
"""

from __future__ import annotations

import json
import struct
import threading
import types
from contextlib import nullcontext
from typing import Any

import pytest
from fastapi import FastAPI
from test_battle_text import Memory, encode
from test_move_learn import _rom, archived
from test_view import get

from pokebench_env import learn_move_wait as lmw
from pokebench_env.game_state import MapNames

TASKS = 0x03005E00
CALLBACK2 = 0x030022C4
EVOLUTION = 0x0813E571
TRADE = 0x0813F1B9


@pytest.mark.parametrize(
    ("name", "step"),
    [
        ("evo-intro3-printing", "busy"),
        ("evo-intro3-waiting", "page"),
        ("evo-delete-printing", "busy"),
        ("evo-delete-box", "box"),
        ("evo-stop-printing", "busy"),
        ("evo-stop-box", "box"),
        ("battle-delete-box", "box"),
        ("battle-stop-box", "box"),
        # The recorded forget list was captured while its fade-in still ran.
        ("summary-forget", "busy"),
    ],
)
def test_recorded_move_learning_states(name: str, step: str) -> None:
    assert lmw.learn_step(archived(name)) == step


def test_battle_learner_is_the_exp_getter_and_the_move_to_learn() -> None:
    for name in ("battle-delete-box", "battle-stop-box", "summary-forget"):
        assert lmw.battle_learner(archived(name)) == {"party_slot": 0, "new_move": "PECK"}
    for name in ("evo-delete-box", "evo-stop-box", "evo-intro3-waiting"):
        assert lmw.battle_learner(archived(name)) is None


def test_the_battle_script_range_is_the_rom_script() -> None:
    rom = _rom()
    start = lmw.ASK_TO_LEARN_MOVE - 0x08000000
    end = lmw.LEARN_FLOW_END - 0x08000000
    # buffermovetolearn; printstring TRYTOLEARNMOVE1-3; waitstate; setbyte learnMoveState 0.
    assert rom[start : start + 17].hex(" ") == (
        "71 10 10 00 10 11 00 10 12 00 3a 2e 93 44 02 02 00"
    )
    assert rom[start + 17 : start + 22] == bytes.fromhex("5a10ac2d08")  # yesnoboxlearnmove
    assert rom[start + 32 : start + 37] == bytes.fromhex("5be3ab2d08")  # yesnoboxstoplearningmove
    assert rom[end - 5 : end] == bytes.fromhex("28d9ab2d08")  # goto BattleScript_TryLearnMoveLoop


class Game(Memory):
    """Synthetic layout: gMain.callback2, gTasks, the palette fade and the battle script."""

    def __init__(self) -> None:
        super().__init__()
        self.set(0x030026F9, 0, 1)
        self.set(CALLBACK2, 0x0813E3A5)

    def task(self, slot: int, function: int, *data: int) -> None:
        base = TASKS + 0x28 * slot
        self.set(base, function)
        self.set(base + 4, 1, 1)
        self.put(base + 8, struct.pack("<16h", *data, *([0] * (16 - len(data)))))

    def evolution(self, state: int, mvstate: int = 0, function: int = EVOLUTION) -> None:
        self.task(0, function, state, 0, 0, 0, 0, 0, mvstate)

    def fade(self) -> None:
        self.set(0x02037FD4 + 7, 0x80, 1)

    def waiting(self, text: str = "Hi") -> None:
        self.message(encode(text) + b"\xfa\xff", len(text), state=2)

    def battle_flow(self, pc: int = lmw.ASK_TO_LEARN_MOVE) -> None:
        self.set(0x030026F9, 2, 1)
        self.set(0x02024214, pc)


def test_evolution_scene_steps() -> None:
    game = Game()
    game.evolution(22, 4)
    assert lmw.learn_step(game.read) == "box"
    game.evolution(22, 5)
    assert lmw.learn_step(game.read) == "busy"
    game.evolution(22, 1)
    assert lmw.learn_step(game.read) == "busy"
    game.waiting()
    assert lmw.learn_step(game.read) == "page"
    game.evolution(20, 6, function=TRADE)
    assert lmw.learn_step(game.read) == "busy"
    game.fade()
    game.evolution(22, 4)
    assert lmw.learn_step(game.read) == "busy"


def test_after_the_flow_the_result_pages_wait_and_other_scenes_are_not_waited_for() -> None:
    game = Game()
    game.evolution(15)
    assert lmw.learn_step(game.read) == "busy"
    game.waiting()
    assert lmw.learn_step(game.read) == "page"
    game.idle()
    game.evolution(8)
    assert lmw.learn_step(game.read) == "other"
    game.waiting()
    assert lmw.learn_step(game.read) == "page"
    game.task(1, EVOLUTION, 22)
    with pytest.raises(ValueError, match="more than one evolution scene task"):
        lmw.learn_step(game.read)


def test_summary_screen_steps() -> None:
    game = Game()
    game.set(CALLBACK2, 0x081BFAB5)
    assert lmw.learn_step(game.read) == "other"
    game.evolution(22, 6)
    assert lmw.learn_step(game.read) == "busy"
    game.task(1, 0x081C174D)
    assert lmw.learn_step(game.read) == "forget"
    game.task(2, 0x081C1E21)
    assert lmw.learn_step(game.read) == "busy"
    game.task(2, 0x081C1941)
    assert lmw.learn_step(game.read) == "forget"
    battle = Game()
    battle.set(CALLBACK2, 0x081BFAB5)
    battle.battle_flow()
    assert lmw.learn_step(battle.read) == "busy"


@pytest.mark.parametrize(
    ("phase", "step"),
    [
        ("prompt", "box"),
        ("message_waiting", "page"),
        ("busy", "busy"),
        ("screen", "busy"),
        ("input", "other"),
    ],
)
def test_battle_flow_steps(monkeypatch: pytest.MonkeyPatch, phase: str, step: str) -> None:
    monkeypatch.setattr(lmw, "battle_text_phase", lambda read: phase)
    game = Game()
    game.battle_flow()
    assert lmw.learn_step(game.read) == step
    game.battle_flow(lmw.LEARN_FLOW_END)
    assert lmw.learn_step(game.read) == "other"


def test_battle_learner_validates_what_it_reads() -> None:
    game = Game()
    assert lmw.battle_learner(game.read) is None
    game.battle_flow()
    with pytest.raises(ValueError, match="gBattleStruct pointer 0x0 is not in EWRAM"):
        lmw.battle_learner(game.read)
    game.set(0x0202449C, 0x02010000)
    game.set(0x02010000 + 0x10, 6, 1)
    with pytest.raises(ValueError, match="move learner party slot 6 is out of range"):
        lmw.battle_learner(game.read)
    game.set(0x02010000 + 0x10, 1, 1)
    with pytest.raises(ValueError, match="invalid move to learn 0"):
        lmw.battle_learner(game.read)
    game.set(0x020244E2, 64, 2)
    game.put(0x0831977C + 13 * 64, encode("PECK") + b"\xff")
    assert lmw.battle_learner(game.read) == {"party_slot": 1, "new_move": "PECK"}
    game.put(0x0831977C + 13 * 64, encode("ABCDEFGHIJKLM"))
    assert lmw.battle_learner(game.read) == {"party_slot": 1, "new_move": "ABCDEFGHIJKLM"}


class Scripted:
    def __init__(self, *steps: str) -> None:
        self.steps = list(steps)

    def __call__(self, read: object) -> str:
        return self.steps.pop(0) if len(self.steps) > 1 else self.steps[0]


def wait_in_thread(wait: lmw.LearnWait, capture: Any, bound: int = 600):  # type: ignore[no-untyped-def]
    result: dict[str, object] = {}

    def target() -> None:
        try:
            result["r"] = wait.wait(capture, nullcontext(), bound)
        except (RuntimeError, ValueError) as error:
            result["error"] = str(error)

    thread = threading.Thread(target=target, daemon=True)
    thread.start()
    return thread, result


def test_wait_holds_until_the_first_ready_frame(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(lmw, "learn_step", Scripted("other"))
    wait = lmw.LearnWait(Game().read)
    wait.on_frame()
    assert wait.wait(lambda: "now", nullcontext()) == ("now", "other", 0)
    monkeypatch.setattr(lmw, "learn_step", Scripted("busy", "busy", "forget"))
    thread, result = wait_in_thread(wait, lambda: "captured")
    thread.join(0.1)
    wait.on_frame()
    thread.join(0.1)
    assert thread.is_alive()
    wait.on_frame()
    thread.join(5)
    assert result["r"] == ("captured", "forget", 2)


def test_wait_bound_capture_error_read_error_and_parking(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(lmw, "learn_step", Scripted("busy"))
    wait = lmw.LearnWait(Game().read)
    thread, result = wait_in_thread(wait, lambda: "late", bound=2)
    thread.join(0.1)
    wait.on_frame()
    wait.on_frame()
    thread.join(5)
    assert result["r"] == ("late", "bound", 2)

    def boom() -> str:
        raise RuntimeError("capture failed")

    thread, result = wait_in_thread(wait, boom, bound=1)
    thread.join(0.1)
    wait.on_frame()
    thread.join(5)
    assert result == {"error": "capture failed"}

    thread, result = wait_in_thread(wait, lambda: "x")
    thread.join(0.1)

    def broken(read: object) -> str:
        raise ValueError("short battle choice read")

    monkeypatch.setattr(lmw, "learn_step", broken)
    wait.on_frame()
    thread.join(5)
    assert result == {"error": "short battle choice read"}

    monkeypatch.setattr(lmw, "learn_step", Scripted("busy"))
    thread, result = wait_in_thread(wait, lambda: "held")
    thread.join(0.1)
    wait.park()
    thread.join(5)
    assert result["r"] == ("held", "paused", 0)
    assert wait.wait(lambda: "x", nullcontext()) == ("x", "paused", 0)
    wait.resume()
    thread, result = wait_in_thread(wait, lambda: "after", bound=1)
    thread.join(0.1)
    assert thread.is_alive()
    wait.on_frame()
    thread.join(5)
    assert result["r"] == ("after", "bound", 1)


def _production(**extra: Any) -> tuple[FastAPI, Game, threading.Lock, type]:
    from test_observation import Shot

    from pokebench_env.serve import run

    game = Game()
    lock = threading.Lock()
    app = FastAPI()

    class Emulator:
        def run_frame_with_buttons(self, buttons: list[str]) -> None:
            pass

    run(
        [],
        uvicorn=types.SimpleNamespace(run=lambda *a, **k: None),
        vendor_main=lambda: None,
        observation=(app, Shot, game.read, MapNames({}), lock),
        frames=Emulator,
        **extra,
    )
    return app, game, lock, Emulator


def test_the_route_through_the_production_run() -> None:
    app, game, lock, emulator = _production(
        pause=(FastAPI(), types.SimpleNamespace(step_environment=lambda actions: None))
    )
    status, _, body = get(app, "/pokebench/move-learn/wait")
    payload = json.loads(body)
    assert status == 200
    assert (payload["reason"], payload["frames"], payload["battle_learner"]) == ("other", 0, None)
    assert payload["state"]["in_battle"] is False
    game.evolution(22, 1)
    result: dict[str, object] = {}
    thread = threading.Thread(
        target=lambda: result.update(r=get(app, "/pokebench/move-learn/wait", b"max_frames=2")),
        daemon=True,
    )
    thread.start()
    thread.join(0.2)
    assert thread.is_alive()
    with lock:
        emulator().run_frame_with_buttons([])
    game.evolution(22, 4)
    with lock:
        emulator().run_frame_with_buttons([])
    thread.join(5)
    assert json.loads(result["r"][2])["reason"] == "box"  # type: ignore[index]
    assert get(app, "/pokebench/move-learn/wait", b"max_frames=0")[0] == 422


def test_human_mode_installs_no_move_learning_wait() -> None:
    server = types.SimpleNamespace(step_environment=lambda actions: None, fps=80)
    app, *_ = _production(human=(FastAPI(), server, "secret"))
    assert "/pokebench/move-learn/wait" not in [getattr(r, "path", "") for r in app.routes]
