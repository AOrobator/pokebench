"""move-learn-tool-v1 (agent side): the game server's wait for the move-learning prompts.

The agent's learn_move tool presses one button at a time and then asks for the state on the first
emulated frame where the move-learning flow it is driving needs input again, or has left the
flow; bounded in frames, never wall time. Game flow, pret/pokeemerald 731ad5bf:

- Evolution scene (src/evolution_scene.c Task_EvolutionScene, trade scene
  Task_TradeEvolutionScene): tState EVOSTATE_REPLACE_MOVE (22; trade 20) runs MVSTATE_*. MVSTATE 4
  takes the YES/NO input, 5/6 hand the screen to the summary move select and back; the other
  states print a page that waits for A or B. After the flow, EVOSTATE_TRY_LEARN_MOVE (15),
  EVOSTATE_LEARNED_MOVE (20) and EVOSTATE_TRY_LEARN_ANOTHER_MOVE (21) print the result pages.
- Battle (data/battle_scripts_1.s BattleScript_AskToLearnMove .. BattleScript_LearnedNewMove):
  yesnoboxlearnmove / yesnoboxstoplearningmove boxes and the pages between them, while
  gBattlescriptCurrInstr is inside that script. US ROM f3ae0881 bytes at 0x082DABE3:
  71 (buffermovetolearn), 10 10 00, 10 11 00, 10 12 00 (printstring TRYTOLEARNMOVE1-3), 3a,
  2e 93 44 02 02 00,
  5a 10 ac 2d 08 (yesnoboxlearnmove -> 0x082DAC10), ..., 5b e3 ab 2d 08 (yesnoboxstoplearningmove
  -> 0x082DABE3), ..., and BattleScript_LearnedNewMove's goto ends at 0x082DAC2B.
- Summary screen (src/pokemon_summary_screen.c): Task_HandleReplaceMoveInput takes the
  forget-a-move input; Task_HandleInputCantForgetHMsMoves shows the HM window.

The learner in battle is gBattleStruct->expGetterMonId and the move gMoveToLearn, as the move-learn
readout reads them (move_learn.py). Nothing here changes what the model sees: the route is only
called by learn_move, which exists only with the switch on.
"""

import threading
from collections.abc import Callable
from contextlib import AbstractContextManager
from typing import Literal, TypeVar, cast

from pokebench_env.battle_choices import exact
from pokebench_env.battle_text import (
    BATTLE_STRUCT,
    EXP_GETTER,
    IN_BATTLE,
    PALETTE_FADE,
    SCRIPT_PC,
    SteppedEmulator,
    battle_text_phase,
    read_battle_message,
)
from pokebench_env.game_screen import GMAIN, ReadMemory
from pokebench_env.menus import SUMMARY_CALLBACK, task_snapshot
from pokebench_env.move_learn import EVOLUTION_TASK, MOVE_COUNT, MOVE_TO_LEARN, REPLACE_MOVE
from pokebench_env.native_text import decode_native_text
from pokebench_env.pokemon import MOVE_NAMES

SWITCH = "move-learn-tool-v1"
ASK_TO_LEARN_MOVE = 0x082DABE3  # BattleScript_AskToLearnMove
LEARN_FLOW_END = 0x082DAC2B  # just past BattleScript_LearnedNewMove's goto
# Task_HandleReplaceMoveInput, Task_HandleInputCantForgetHMsMoves (menus.py summary owners).
FORGET_TASKS = frozenset({0x081C174D, 0x081C1941})
# The summary task menus.py treats as "not ready" (a page slide or window change).
SUMMARY_BUSY_TASK = 0x081C1E21
YES_NO_INPUT = 4
SUMMARY_HANDOFF = frozenset({5, 6})
# Evolution scene states that print the flow's result pages (evolution scene only).
AFTER_FLOW = frozenset({15, 20, 21})
LEARN_BOUND_FRAMES = 600

Step = Literal["box", "page", "forget", "busy", "other"]
Reason = Literal["box", "page", "forget", "other", "bound", "paused"]
T = TypeVar("T")


def _u32(read: ReadMemory, address: int) -> int:
    return int.from_bytes(exact(read, address, 4), "little")


def _in_battle_flow(read: ReadMemory) -> bool:
    return bool(exact(read, IN_BATTLE, 1)[0] & 2) and (
        ASK_TO_LEARN_MOVE <= _u32(read, SCRIPT_PC) < LEARN_FLOW_END
    )


def learn_step(read: ReadMemory) -> Step:
    """What the move-learning flow does on this frame: an input it waits for, busy, or gone."""
    if exact(read, PALETTE_FADE + 7, 1)[0] & 0x80:
        return "busy"
    tasks = task_snapshot(read)
    owners = [task for task in tasks if task[1] in REPLACE_MOVE]
    if len(owners) > 1:
        raise ValueError("more than one evolution scene task")
    evolution = owners[0] if owners else None
    replacing = evolution is not None and evolution[2][0] == REPLACE_MOVE[evolution[1]]
    battle = evolution is None and _in_battle_flow(read)
    if _u32(read, GMAIN + 4) == SUMMARY_CALLBACK:
        functions = {task[1] for task in tasks}
        if SUMMARY_BUSY_TASK not in functions and functions & FORGET_TASKS:
            return "forget"
        return "busy" if replacing or battle else "other"
    waiting = read_battle_message(read).state == "waiting_for_input"
    if evolution is not None:
        _, function, data = evolution
        if replacing:
            if data[6] == YES_NO_INPUT:
                return "box"
            if data[6] in SUMMARY_HANDOFF:
                return "busy"
            return "page" if waiting else "busy"
        if function == EVOLUTION_TASK and data[0] in AFTER_FLOW:
            return "page" if waiting else "busy"
        return "page" if waiting else "other"
    if battle:
        phase = battle_text_phase(read)
        if phase == "prompt":
            return "box"
        if phase == "message_waiting":
            return "page"
        return "busy" if phase in ("busy", "screen") else "other"
    return "other"


def battle_learner(read: ReadMemory) -> dict[str, object] | None:
    """In the battle flow: the party slot learning the move and the move, as the game holds them."""
    if not _in_battle_flow(read):
        return None
    pointer = _u32(read, BATTLE_STRUCT)
    if not 0x02000000 <= pointer < 0x02040000:
        raise ValueError(f"gBattleStruct pointer {pointer:#x} is not in EWRAM")
    slot = exact(read, pointer + EXP_GETTER, 1)[0]
    if slot > 5:
        raise ValueError(f"move learner party slot {slot} is out of range")
    move = int.from_bytes(exact(read, MOVE_TO_LEARN, 2), "little")
    if not 1 <= move <= MOVE_COUNT:
        raise ValueError(f"invalid move to learn {move}")
    raw = exact(read, MOVE_NAMES + 13 * move, 13)
    name = decode_native_text(raw[: raw.index(0xFF) + 1] if 0xFF in raw else raw)
    return {"party_slot": slot, "new_move": name}


class _Waiter:
    def __init__(self, capture: Callable[[], object], bound: int) -> None:
        self.capture = capture
        self.bound = bound
        self.frames = 0
        self.reason: Reason = "bound"
        self.done = threading.Event()
        self.released = False
        self.result: object = None
        self.error: Exception | None = None


class LearnWait:
    """Hold a capture until the first emulated frame the move-learning flow waits for input
    (a YES/NO box, a page, the forget-a-move list) or leaves the flow; or until a frame bound."""

    def __init__(self, read: ReadMemory) -> None:
        self.read = read
        self._lock = threading.Lock()
        self._waiters: list[_Waiter] = []
        self._parked = False

    def on_frame(self) -> None:
        """After each emulated frame; the vendor holds its memory lock."""
        with self._lock:
            self._parked = False
            if not self._waiters:
                return
            try:
                step = learn_step(self.read)
            except (ValueError, IndexError) as error:
                for waiter in self._waiters:
                    waiter.error = error
                    waiter.done.set()
                self._waiters = []
                return
            waiting = []
            for waiter in self._waiters:
                waiter.frames += 1
                if step == "busy" and waiter.frames < waiter.bound:
                    waiting.append(waiter)
                    continue
                waiter.reason = "bound" if step == "busy" else step
                try:
                    waiter.result = waiter.capture()
                except Exception as error:  # noqa: BLE001 - re-raised on the caller's thread
                    waiter.error = error
                waiter.done.set()
            self._waiters = waiting

    def park(self) -> None:
        with self._lock:
            self._parked = True
            for waiter in self._waiters:
                waiter.released = True
                waiter.done.set()
            self._waiters = []

    def resume(self) -> None:
        with self._lock:
            self._parked = False

    def wait(
        self,
        capture: Callable[[], T],
        memory_lock: AbstractContextManager[object],
        bound_frames: int = LEARN_BOUND_FRAMES,
    ) -> tuple[T, Reason, int]:
        with memory_lock:
            with self._lock:
                if self._parked:
                    return capture(), "paused", 0
                step = learn_step(self.read)
                if step != "busy":
                    return capture(), step, 0
                waiter = _Waiter(capture, bound_frames)
                self._waiters.append(waiter)
        waiter.done.wait()
        if waiter.released:
            with memory_lock:
                return capture(), "paused", waiter.frames
        if waiter.error is not None:
            raise waiter.error
        return cast(T, waiter.result), waiter.reason, waiter.frames


def install_learn_wait(emulator: type[SteppedEmulator], wait: LearnWait) -> None:
    step = emulator.run_frame_with_buttons

    def step_waiting(self: SteppedEmulator, buttons: list[str]) -> None:
        step(self, buttons)
        wait.on_frame()

    emulator.run_frame_with_buttons = step_waiting
