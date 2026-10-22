"""move-learn-early-comparison-v1: the move comparison on the pages before the game's questions.

Run 2026-10-22T00-22-02_qwen36-gpu0_d951 answered learn_move forget "none" for DOUBLE KICK at
turn 430 from the evolution scene's "COMBUSKEN is trying to learn DOUBLE KICK." page (event seq
16473, MVSTATE 1): the readout showed no type, power or description for the move, because
move-learn-comparison-v1 lists the moves only at the YES/NO box and the forget-a-move list.
Fixtures are that run's raw-RAM archives copied byte for byte (move-learn-early.provenance.json):
the evolution page, and TORCHIC's two PECK pages in battle (event seq 16298 and 16306). Flow:
pret/pokeemerald 731ad5bf src/evolution_scene.c MVSTATE_INTRO_MSG_1..MVSTATE_PRINT_YES_NO (the
same numbers in Task_TradeEvolutionScene's T_MVSTATE_*), src/battle_message.c
sText_TryToLearnMove1/2.
"""

from __future__ import annotations

import json
from dataclasses import replace
from functools import cache
from pathlib import Path

import pytest
from test_move_learn import _rom, archived, interface_block, maps

from pokebench_env.game_screen import ReadMemory
from pokebench_env.game_state import GameState
from pokebench_env.move_learn import (
    COMPARISON_SWITCH,
    EARLY_SWITCH,
    QUESTION_SWITCH,
    read_move_learning,
)
from pokebench_env.raw_ram import load_raw_ram
from pokebench_env.readout import SERVER_FEATURES, features_off_from_env, state_json
from pokebench_env.rerender import read_state, render

FIXTURES = Path(__file__).parent / "fixtures"
PROVENANCE = json.loads((FIXTURES / "move-learn-early.provenance.json").read_text())
EARLY = frozenset({EARLY_SWITCH})

COMBUSKEN_PAGE_MOVES = [
    "Moves (the game's move data and the summary screen's descriptions):",
    "  COMBUSKEN (FIRE/FIGHTING) knows:",
    '  1 SCRATCH NORMAL physical pow 40 acc 100 PP 35/35 — "Scratches the foe with sharp claws."',
    '  2 GROWL NORMAL status acc 100 PP 40/40 — "Growls cutely to reduce the foe\'s ATTACK."',
    "  3 FOCUS ENERGY NORMAL status never misses PP 30/30 — "
    '"Focuses power to raise the critical-hit ratio."',
    "  4 EMBER FIRE special pow 40 acc 100 PP 17/25 — "
    '"A weak fire attack that may inflict a burn."',
    "  New move: DOUBLE KICK FIGHTING physical pow 30 acc 100 PP 30/30 — "
    '"A double-kicking attack that strikes the foe twice."',
]
TORCHIC_PAGE_MOVES = [
    "Moves (the game's move data and the summary screen's descriptions):",
    "  TORCHIC (FIRE) knows:",
    '  1 SCRATCH NORMAL physical pow 40 acc 100 PP 35/35 — "Scratches the foe with sharp claws."',
    '  2 GROWL NORMAL status acc 100 PP 40/40 — "Growls cutely to reduce the foe\'s ATTACK."',
    "  3 FOCUS ENERGY NORMAL status never misses PP 30/30 — "
    '"Focuses power to raise the critical-hit ratio."',
    "  4 EMBER FIRE special pow 40 acc 100 PP 17/25 — "
    '"A weak fire attack that may inflict a burn."',
    "  New move: PECK FLYING physical pow 35 acc 100 PP 35/35 — "
    '"Attacks the foe with a jabbing beak, etc."',
]
PAGES = {
    "battle-page1": "TORCHIC is trying to learn PECK.",
    "battle-page2": "But, TORCHIC can't learn more than four moves.",
}


@cache
def early(name: str) -> ReadMemory:
    archive = PROVENANCE["archives"][name]
    return load_raw_ram(
        FIXTURES / f"move-learn-early-{name}.json.gz", archive["sha256"], rom=_rom()
    )


def early_state(name: str, off: frozenset[str] = frozenset()) -> GameState:
    return read_state(early(name), maps(), active_ui=True, off=off)


def old_state(name: str, off: frozenset[str] = frozenset()) -> GameState:
    return read_state(archived(name), maps(), active_ui=True, off=off)


# --- the recorded states ------------------------------------------------------------------


def test_fixtures_are_the_recorded_pages() -> None:
    ui = early_state("evo-page1").active_ui
    assert ui is not None and ui.details is not None
    assert (ui.phase, ui.ready, ui.details["move_learning_state"]) == (
        "evolution_move_learning",
        True,
        1,
    )
    assert ui.details["new_move"] == "DOUBLE KICK"
    for name, page in PAGES.items():
        battle = early_state(name).battle
        assert battle is not None and battle.message is not None
        assert (battle.message.state, battle.message.page) == ("waiting_for_input", page)


# --- ON: the block on the pages, no question yet ------------------------------------------


def test_the_recorded_double_kick_page_lists_the_moves() -> None:
    block = interface_block(render(early_state("evo-page1"), frozenset()))
    assert block[-len(COMBUSKEN_PAGE_MOVES) :] == COMBUSKEN_PAGE_MOVES
    assert not any(line.startswith("The game asks:") for line in block)


@pytest.mark.parametrize("name", list(PAGES))
def test_the_battle_pages_list_the_moves(name: str) -> None:
    text = render(early_state(name), frozenset())
    assert "\n".join(TORCHIC_PAGE_MOVES) in text
    assert "The game asks:" not in text


@pytest.mark.parametrize("name", ("evo-intro3-printing", "evo-intro3-waiting"))
def test_the_page_before_the_question_lists_the_moves(name: str) -> None:
    learning = old_state(name).move_learning
    assert learning is not None
    assert (learning.owner, learning.question, learning.new.facts.name) == (
        "evolution",
        None,
        "DOUBLE KICK",
    )


@pytest.mark.parametrize("name", ("evo-delete-printing", "evo-stop-printing"))
def test_the_question_while_it_prints_lists_the_moves_without_the_question(name: str) -> None:
    learning = old_state(name).move_learning
    assert learning is not None and learning.question is None
    assert "The game asks:" not in render(old_state(name), frozenset())


@pytest.mark.parametrize(
    "name", ("evo-delete-box", "evo-stop-box", "battle-delete-box", "battle-stop-box", "summary-forget")
)
def test_the_boxes_and_the_forget_list_are_unchanged(name: str) -> None:
    assert old_state(name).move_learning == old_state(name, EARLY).move_learning
    assert render(old_state(name), frozenset()) == render(old_state(name, EARLY), EARLY)


def _with_state(ui_state: GameState, mvstate: int, *, trade: bool = False) -> object:
    ui = ui_state.active_ui
    assert ui is not None and ui.details is not None
    details = {**ui.details, "move_learning_state": mvstate, "trade_evolution": trade}
    return replace(ui, details=details)


@pytest.mark.parametrize("mvstate", (0, 1, 2, 3))
@pytest.mark.parametrize("trade", (False, True))
def test_every_state_before_an_answer_reads_the_learner(mvstate: int, trade: bool) -> None:
    recorded = early_state("evo-page1")
    ui = _with_state(recorded, mvstate, trade=trade)
    learning = read_move_learning(early("evo-page1"), ui, None, recorded.party, early=True)  # type: ignore[arg-type]
    assert learning is not None and learning.new.facts.name == "DOUBLE KICK"


@pytest.mark.parametrize("mvstate", (5, 6, 7, 8, 9, 10, 11, 12))
def test_states_after_an_answer_read_nothing(mvstate: int) -> None:
    recorded = early_state("evo-page1")
    ui = _with_state(recorded, mvstate)
    assert read_move_learning(early("evo-page1"), ui, None, recorded.party, early=True) is None  # type: ignore[arg-type]


def _no_memory(address: int, length: int) -> bytes:
    raise AssertionError(f"read {address:#x}")


@pytest.mark.parametrize(
    "page",
    (
        None,
        "Foe GEODUDE fainted!",
        "TORCHIC grew to LV. 16!",
        "TORCHIC learned PECK!",
    ),
)
def test_other_battle_pages_read_no_memory(page: str | None) -> None:
    party = early_state("battle-page1").party
    assert read_move_learning(_no_memory, None, None, party, early=True, page=page) is None


@pytest.mark.parametrize(
    "page",
    (
        "WURMPLE is trying to learn PECK.",
        "TORCHIC is trying to learn EMBER.",
        "But, WURMPLE can't learn more than four moves.",
    ),
)
def test_a_page_for_another_learner_or_move_reads_nothing(page: str) -> None:
    party = early_state("battle-page1").party
    assert read_move_learning(early("battle-page1"), None, None, party, early=True, page=page) is None


def test_without_early_the_pages_read_nothing() -> None:
    recorded = early_state("evo-page1", EARLY)
    assert read_move_learning(early("evo-page1"), recorded.active_ui, None, recorded.party) is None
    party = early_state("battle-page1").party
    assert (
        read_move_learning(early("battle-page1"), None, None, party, page=PAGES["battle-page1"])
        is None
    )


# --- OFF parity, dependency, typed state --------------------------------------------------


@pytest.mark.parametrize("name", list(PROVENANCE["archives"]))
def test_off_is_the_readout_without_the_block(name: str) -> None:
    without = early_state(name, EARLY)
    assert without.move_learning is None and without.move_learning_diagnostic is None
    text = render(without, EARLY)
    assert "Moves (the game's move data" not in text
    assert text == render(replace(early_state(name), move_learning=None), EARLY)


@pytest.mark.parametrize("name", ("evo-intro3-printing", "evo-intro3-waiting", "evo-delete-printing"))
def test_off_keeps_the_recorded_pages_without_a_reader(name: str) -> None:
    assert old_state(name, EARLY).move_learning is None


@pytest.mark.parametrize("name", list(PROVENANCE["archives"]))
def test_needs_the_comparison(name: str) -> None:
    off = frozenset({COMPARISON_SWITCH})
    assert early_state(name, off).move_learning is None
    assert "Moves (the game's move data" not in render(early_state(name, off), off)


def test_the_question_switch_alone_does_not_change_the_pages() -> None:
    off = frozenset({QUESTION_SWITCH})
    block = interface_block(render(early_state("evo-page1", off), off))
    assert block[-len(COMBUSKEN_PAGE_MOVES) :] == COMBUSKEN_PAGE_MOVES


@pytest.mark.parametrize("name", list(PROVENANCE["archives"]))
def test_state_json_is_unchanged(name: str) -> None:
    assert state_json(early_state(name)) == state_json(early_state(name, EARLY))


def test_a_failed_read_on_a_page_is_a_visible_harness_bug() -> None:
    base = early("evo-page1")

    def broken(address: int, length: int) -> bytes:
        if address == 0x0861C524 + 4 * 23:  # DOUBLE KICK's description pointer
            return b"\x00\x00\x00\x00"
        return base(address, length)

    recorded = read_state(broken, maps(), active_ui=True, off=frozenset())
    assert recorded.move_learning is None
    assert "HARNESS BUG (move learning)" in render(recorded, frozenset())


# --- registration -------------------------------------------------------------------------


def test_registered_server_side_last_and_default_off() -> None:
    assert SERVER_FEATURES[-1] == EARLY_SWITCH
    assert EARLY_SWITCH in features_off_from_env({})
    assert features_off_from_env({"POKEBENCH_FEATURES_OFF": ""}) == frozenset()
