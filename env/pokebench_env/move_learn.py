"""Learning a move when the Pokémon already knows four: settle, question and comparison.

Three switches share this reader (pret/pokeemerald 731ad5bfd6e6f265508d0efcca0ba42f9dcf5881):

- move-learn-settle-v1: observations wait, per emulated frame, while the evolution scene's
  move-learning text is being written or its YES/NO box is about to be drawn.
  src/evolution_scene.c Task_EvolutionScene tState 22 (EVOSTATE_REPLACE_MOVE; trade scene
  Task_TradeEvolutionScene tState 20): MVSTATE 0-2 and 10 print a battle string, MVSTATE 3
  waits for printer 0 to go idle and draws the box, MVSTATE 4 takes the YES/NO input,
  MVSTATE 5/6 hand the screen to the summary move select. Run
  2026-10-20T20-26-22_qwen36-gpu1_97a0 captured every press result at MVSTATE 3 (turns 779+).
- move-learn-question-v1: at a ready "Delete a move to make room for X?" or "Stop learning X?"
  box (evolution scene MVSTATE 4, or the battle script's yesnoboxlearnmove 0x5A /
  yesnoboxstoplearningmove 0x5B), one line with the question in the game's words and what each
  answer does. Strings: src/battle_message.c sText_TryToLearnMove1/3, sText_StopLearningMove,
  sText_DidNotLearnMove; flow: MVSTATE_HANDLE_YES_NO and data/battle_scripts_1.s
  BattleScript_AskToLearnMove (B takes the NO branch in all four).
- move-learn-comparison-v1: at those boxes and on the summary screen's forget-a-move list, the
  moves the Pokémon knows and the new move with type, kind, power, accuracy and PP from
  gBattleMoves, and the game's own move description (gMoveDescriptionPointers, the text the
  summary screen shows).
- move-learn-early-comparison-v1: the same comparison, with no question line, before and while
  the game asks: the evolution and trade scenes at MVSTATE_INTRO_MSG_1..MVSTATE_PRINT_YES_NO
  (0-3, the same numbers in both scenes), and in battle on the pages sText_TryToLearnMove1/2
  ("{mon} is trying to learn {move}." / "But, {mon} can't learn more than four moves.").
"""

import re
from dataclasses import dataclass
from typing import Literal

from pokebench_env.battle_choices import exact
from pokebench_env.battle_details import SPECIES_INFO, TYPE_NAMES, MoveFacts, move_text
from pokebench_env.battle_text import BATTLE_STRUCT, EXP_GETTER, BattlePrompt, read_battle_message
from pokebench_env.game_screen import ReadMemory
from pokebench_env.menus import task_snapshot
from pokebench_env.native_text import decode_native_text
from pokebench_env.pokemon import BATTLE_MOVES, MOVE_NAMES, PartyMon
from pokebench_env.ui_state import ActiveUi

SETTLE_SWITCH = "move-learn-settle-v1"
QUESTION_SWITCH = "move-learn-question-v1"
COMPARISON_SWITCH = "move-learn-comparison-v1"
EARLY_SWITCH = "move-learn-early-comparison-v1"

EVOLUTION_TASK = 0x0813E571  # Task_EvolutionScene (menu_pokemon_lifecycle.py owner literal)
TRADE_EVOLUTION_TASK = 0x0813F1B9  # Task_TradeEvolutionScene
REPLACE_MOVE = {EVOLUTION_TASK: 22, TRADE_EVOLUTION_TASK: 20}
# MVSTATE_HANDLE_YES_NO and the two summary-screen states, the same numbers in both scenes.
INPUT_STATES = frozenset({4, 5, 6})
# Emulated frames an observation may wait. The longest page, sText_StopLearningMove with its
# {PAUSE 32}, prints in well under this at every text speed.
SETTLE_BOUND_FRAMES = 600

# (yes, no) next states the scene sets before drawing each box (src/evolution_scene.c
# MVSTATE_INTRO_MSG_3 / MVSTATE_ASK_CANCEL; trade scene T_MVSTATE_*).
DELETE_PAIRS = frozenset({(5, 10), (5, 9)})
STOP_PAIRS = frozenset({(11, 0), (10, 0)})
BATTLE_QUESTIONS = {"learn_move": "delete", "stop_learning_move": "stop"}
# MVSTATE_INTRO_MSG_1..MVSTATE_PRINT_YES_NO: the pages and the questions still printing.
EARLY_STATES = frozenset({0, 1, 2, 3})
TRY_TO_LEARN = re.compile(r"(.+) is trying to learn (.+)\.")
CANT_LEARN = re.compile(r"But, (.+) can't learn more than four moves\.")

MOVE_TO_LEARN = 0x020244E2  # gMoveToLearn (menu_pokemon_lifecycle.py ROM receipt)
MOVE_DESCRIPTIONS = 0x0861C524  # gMoveDescriptionPointers[move - 1], US ROM f3ae0881
MOVE_COUNT = 354

Question = Literal["delete", "stop"]


@dataclass(frozen=True)
class LearnMove:
    facts: MoveFacts
    description: str


@dataclass(frozen=True)
class MoveLearning:
    """The open move-learning choice: the learner, its known moves and the new move."""

    owner: Literal["evolution", "battle", "summary"]
    question: Question | None
    pokemon: str
    types: tuple[str, ...]
    known: tuple[LearnMove, ...]
    new: LearnMove


def move_learning_busy(read: ReadMemory) -> bool:
    """move-learn-settle-v1: the evolution scene is replacing a move and its input is not ready.

    Not ready means a page is still being written (or its sound plays) or the YES/NO box is
    about to be drawn; a page waiting for A or B, the YES/NO input and the summary hand-off
    are ready.
    """
    owners = [task for task in task_snapshot(read) if task[1] in REPLACE_MOVE]
    if len(owners) != 1:
        return False
    _, function, data = owners[0]
    if data[0] != REPLACE_MOVE[function] or data[6] in INPUT_STATES:
        return False
    return read_battle_message(read).state != "waiting_for_input"


def question_kind(ui: ActiveUi | None, prompt: BattlePrompt | None) -> Question | None:
    if ui is not None and ui.phase == "evolution_move_confirmation" and ui.ready is True:
        details = ui.details or {}
        pair = (details.get("yes_next_state"), details.get("no_next_state"))
        if pair in DELETE_PAIRS:
            return "delete"
        if pair in STOP_PAIRS:
            return "stop"
        return None
    if prompt is not None and prompt.ready and prompt.kind in BATTLE_QUESTIONS:
        return "delete" if BATTLE_QUESTIONS[prompt.kind] == "delete" else "stop"
    return None


def _description(read: ReadMemory, move_id: int) -> str:
    pointer = int.from_bytes(exact(read, MOVE_DESCRIPTIONS + 4 * (move_id - 1), 4), "little")
    if not 0x08000000 <= pointer < 0x0A000000 - 64:
        raise ValueError(f"move description pointer {pointer:#x} is outside the ROM")
    raw = exact(read, pointer, 64)
    if 0xFF not in raw:
        raise ValueError(f"move {move_id} description has no terminator")
    text = decode_native_text(raw[: raw.index(0xFF) + 1], require_terminator=True)
    return text.replace(" | ", " ")


def _name(read: ReadMemory, move_id: int) -> str:
    raw = exact(read, MOVE_NAMES + 13 * move_id, 13)
    end = raw.index(0xFF) + 1 if 0xFF in raw else len(raw)
    return decode_native_text(raw[:end])


def _move(read: ReadMemory, move_id: int, pp: int | None, max_pp: int | None) -> LearnMove:
    """A new move (pp None) starts with the move's full PP from gBattleMoves."""
    if not 1 <= move_id <= MOVE_COUNT:
        raise ValueError(f"invalid move id {move_id}")
    row = exact(read, BATTLE_MOVES + 12 * move_id, 12)
    if row[2] >= len(TYPE_NAMES):
        raise ValueError(f"invalid move type for move {move_id}")
    base = row[4] if pp is None else pp
    facts = MoveFacts(move_id, _name(read, move_id), row[2], row[1], row[3], base, max_pp or row[4])
    return LearnMove(facts, _description(read, move_id))


def _learner(
    read: ReadMemory,
    party: tuple[PartyMon, ...],
    slot: int,
    owner: Literal["evolution", "battle", "summary"],
    question: Question | None,
    new_move: int,
) -> MoveLearning:
    if not 0 <= slot < len(party):
        raise ValueError(f"move learner party slot {slot} is out of range")
    mon = party[slot]
    if mon.species_id is None or mon.moves is None:
        raise ValueError(f"move learner in party slot {slot + 1} is unreadable")
    info = exact(read, SPECIES_INFO + 28 * mon.species_id, 28)
    if info[6] >= len(TYPE_NAMES) or info[7] >= len(TYPE_NAMES):
        raise ValueError(f"invalid species types for species {mon.species_id}")
    types = tuple(dict.fromkeys(TYPE_NAMES[t] for t in (info[6], info[7])))
    known = tuple(
        _move(read, move.move_id, move.pp, move.max_pp) for move in mon.moves if move.move_id
    )
    name = mon.nickname or mon.species or f"POKéMON #{mon.species_id}"
    return MoveLearning(owner, question, name, types, known, _move(read, new_move, None, None))


def read_move_learning(
    read: ReadMemory,
    ui: ActiveUi | None,
    prompt: BattlePrompt | None,
    party: tuple[PartyMon, ...] | None,
    *,
    early: bool = False,
    page: str | None = None,
) -> MoveLearning | None:
    """The open move-learning choice, or None when no such choice is on screen."""
    if party is None:
        return None
    question = question_kind(ui, prompt)
    details = (ui.details or {}) if ui is not None else {}
    if ui is not None and ui.phase == "evolution_move_confirmation" and question is not None:
        slot, new_move = details.get("pokemon_party_index"), details.get("new_move_id")
        if not isinstance(slot, int) or not isinstance(new_move, int):
            raise ValueError("evolution move learning lacks its party slot or new move")
        return _learner(read, party, slot, "evolution", question, new_move)
    if question is not None:
        slot = exact(read, _battle_struct(read) + EXP_GETTER, 1)[0]
        new_move = int.from_bytes(exact(read, MOVE_TO_LEARN, 2), "little")
        return _learner(read, party, slot, "battle", question, new_move)
    if ui is not None and ui.phase == "summary_move_forget":
        slot, new_move = details.get("party_slot"), details.get("new_move_id")
        if not isinstance(slot, int) or not isinstance(new_move, int) or not new_move:
            raise ValueError("summary forget-move screen lacks its party slot or new move")
        return _learner(read, party, slot, "summary", None, new_move)
    if not early:
        return None
    if ui is not None and ui.phase == "evolution_move_learning":
        if details.get("move_learning_state") not in EARLY_STATES:
            return None
        slot, new_move = details.get("pokemon_party_index"), details.get("new_move_id")
        if not isinstance(slot, int) or not isinstance(new_move, int):
            raise ValueError("evolution move learning lacks its party slot or new move")
        return _learner(read, party, slot, "evolution", None, new_move)
    return _battle_page(read, party, page)


def _battle_page(
    read: ReadMemory, party: tuple[PartyMon, ...], page: str | None
) -> MoveLearning | None:
    """move-learn-early-comparison-v1: a battle page before "Delete a move to make room for X?".

    Memory is read only for one of the two pages, and the learner is shown only when the page
    names it (and, on the first page, the move it is learning).
    """
    trying = None if page is None else TRY_TO_LEARN.fullmatch(page)
    cant = None if page is None else CANT_LEARN.fullmatch(page)
    if trying is None and cant is None:
        return None
    slot = exact(read, _battle_struct(read) + EXP_GETTER, 1)[0]
    new_move = int.from_bytes(exact(read, MOVE_TO_LEARN, 2), "little")
    learning = _learner(read, party, slot, "battle", None, new_move)
    if trying is not None:
        named = (trying.group(1), trying.group(2)) == (learning.pokemon, learning.new.facts.name)
    else:
        named = cant is not None and cant.group(1) == learning.pokemon
    return learning if named else None


def _battle_struct(read: ReadMemory) -> int:
    pointer = int.from_bytes(exact(read, BATTLE_STRUCT, 4), "little")
    if not 0x02000000 <= pointer < 0x02040000:
        raise ValueError(f"gBattleStruct pointer {pointer:#x} is not in EWRAM")
    return pointer


def question_line(learning: MoveLearning) -> str | None:
    move, mon = learning.new.facts.name, learning.pokemon
    if learning.question == "delete":
        return (
            f'The game asks: "Delete a move to make room for {move}?" '
            f"YES: the game lists {mon}'s moves so you pick one to forget for {move}. "
            f'NO or B: the game asks "Stop learning {move}?"'
        )
    if learning.question == "stop":
        return (
            f'The game asks: "Stop learning {move}?" '
            f'YES: the game says "{mon} did not learn {move}." and {mon} keeps the moves it knows. '
            f'NO or B: the game starts over with "{mon} is trying to learn {move}."'
        )
    return None


def comparison_lines(learning: MoveLearning) -> list[str]:
    def line(move: LearnMove) -> str:
        return f'{move_text(move.facts)} — "{move.description}"'

    return [
        "Moves (the game's move data and the summary screen's descriptions):",
        f"  {learning.pokemon} ({'/'.join(learning.types)}) knows:",
        *(f"  {index} {line(move)}" for index, move in enumerate(learning.known, 1)),
        f"  New move: {line(learning.new)}",
    ]
