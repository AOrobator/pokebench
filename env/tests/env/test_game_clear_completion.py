"""Credits after the Hall of Fame, pret credits.c; addresses verified on the US ROM."""

import struct

import pytest
from test_transition_coherence import Zeros

from pokebench_env.game_screen import (
    CREDITS_CALLBACKS,
    GMAIN,
    TASKS,
    THE_END_TASKS,
    read_screen,
)
from pokebench_env.ui_state import read_active_ui

OVERWORLD_CB1 = 0x08085E05
CB2_CREDITS = 0x081754DD
CB2_START_CREDITS = 0x08175621
TASK_CREDITS_MAIN = 0x08175775
TASK_THE_END6 = 0x08175C35


def credits(callback2: int, *tasks: int) -> Zeros:
    memory = Zeros()
    memory.put(GMAIN, struct.pack("<II", OVERWORLD_CB1, callback2))
    for slot, function in enumerate(tasks):
        memory.put(TASKS + slot * 0x28, struct.pack("<IB", function, 1))
    return memory


def test_verified_credit_addresses() -> None:
    assert CREDITS_CALLBACKS == {CB2_START_CREDITS, CB2_CREDITS}
    assert TASK_THE_END6 in THE_END_TASKS and TASK_CREDITS_MAIN not in THE_END_TASKS
    assert len(THE_END_TASKS) == 7


@pytest.mark.parametrize("callback2", sorted(CREDITS_CALLBACKS))
def test_off_keeps_the_coverage_error(callback2: int) -> None:
    memory = credits(callback2, TASK_CREDITS_MAIN)
    screen = read_screen(memory.read)
    assert screen.kind == "unknown"
    ui = read_active_ui(memory.read, screen)
    assert ui is not None and ui.phase == "unsupported" and ui.diagnostic


@pytest.mark.parametrize("callback2", sorted(CREDITS_CALLBACKS))
def test_credits_need_no_input(callback2: int) -> None:
    memory = credits(callback2, 0x08175745, TASK_CREDITS_MAIN, 0x08175DA1)
    screen = read_screen(memory.read, game_clear_completion=True)
    assert screen.kind == "credits" and screen.label == "credits"
    ui = read_active_ui(memory.read, screen, game_clear_completion=True)
    assert ui is not None and ui.phase == "credits"
    assert ui.ready is False and ui.selected is None and ui.diagnostic is None
    assert ui.controls == "The credits are playing; the game is over and needs no input"


@pytest.mark.parametrize("task", sorted(THE_END_TASKS))
def test_the_end(task: int) -> None:
    memory = credits(CB2_CREDITS, task)
    screen = read_screen(memory.read, game_clear_completion=True)
    ui = read_active_ui(memory.read, screen, game_clear_completion=True)
    assert ui is not None and ui.phase == "the_end" and ui.diagnostic is None
    assert ui.controls == "THE END is shown; the game is over and needs no input"


def test_inactive_the_end_task_is_still_credits() -> None:
    memory = credits(CB2_CREDITS, TASK_CREDITS_MAIN)
    memory.put(TASKS + 0x28, struct.pack("<IB", TASK_THE_END6, 0))
    screen = read_screen(memory.read, game_clear_completion=True)
    ui = read_active_ui(memory.read, screen, game_clear_completion=True)
    assert ui is not None and ui.phase == "credits"


def test_other_callbacks_are_untouched() -> None:
    memory = credits(CB2_CREDITS + 2, TASK_THE_END6)
    screen = read_screen(memory.read, game_clear_completion=True)
    assert screen.kind == "unknown"
    ui = read_active_ui(memory.read, screen, game_clear_completion=True)
    assert ui is not None and ui.phase == "unsupported" and ui.diagnostic


def test_short_task_read_is_an_error() -> None:
    memory = credits(CB2_CREDITS, TASK_THE_END6)
    screen = read_screen(memory.read, game_clear_completion=True)

    def short(address: int, length: int) -> bytes:
        data = memory.read(address, length)
        return data[:-1] if address == TASKS else data

    with pytest.raises(ValueError, match="short active UI gTasks read"):
        read_active_ui(short, screen, game_clear_completion=True)


def test_production_factory_is_gated_and_journal_records_no_bug() -> None:
    from pokebench_env.action_history import NativeActionJournal
    from pokebench_env.game_state import MapNames
    from pokebench_env.readout import SERVER_FEATURES, features_off_from_env, state_json
    from pokebench_env.rerender import read_state

    assert "game-clear-completion-v1" in SERVER_FEATURES
    assert "game-clear-completion-v1" not in features_off_from_env({})
    memory = credits(CB2_CREDITS, TASK_THE_END6)
    off = frozenset({"game-clear-completion-v1"})
    legacy = state_json(read_state(memory.read, MapNames({}), active_ui=True, off=off))
    current = state_json(read_state(memory.read, MapNames({}), active_ui=True, off=frozenset()))
    assert legacy["screen"] == "unknown (callback2 0x081754DD)"
    legacy_ui, current_ui = legacy["active_ui"], current["active_ui"]
    assert isinstance(legacy_ui, dict) and isinstance(current_ui, dict)
    assert legacy_ui["phase"] == "unsupported"
    assert current["screen"] == "credits"
    assert current_ui["phase"] == "the_end"
    journal = NativeActionJournal()
    journal.advance(memory.read)
    assert not any(row["kind"] == "harness_bug" for row in journal.entries)


def test_unsupported_screen_is_one_bug_however_its_tasks_change() -> None:
    from pokebench_env.action_history import NativeActionJournal

    memory = credits(0x08175F5B, 0x08175745)
    journal = NativeActionJournal()
    journal.advance(memory.read)
    memory.put(TASKS, struct.pack("<IB", 0x08175775, 1))
    journal.advance(memory.read)
    memory.put(TASKS + 0x28, struct.pack("<IB", 0x08175DA1, 1))
    journal.advance(memory.read)
    bugs = [row for row in journal.entries if row["kind"] == "harness_bug"]
    assert len(bugs) == 1
    assert bugs[0]["details"]["kind"] == "callback1 0x08085E05; callback2 0x08175F5B"
    memory.put(GMAIN + 4, struct.pack("<I", 0x08175F5D))
    journal.advance(memory.read)
    assert len([row for row in journal.entries if row["kind"] == "harness_bug"]) == 2
