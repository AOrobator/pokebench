"""post-battle-readout-v1: the battle block after the battle, and the learn-move box Interface.

Run 2026-10-21T13-33-54_qwen36-gpu0_ea04:
- seq 20991 (screen evolution, battle phase finishing): the battle block still read "Your moves
  ... 1 SCRATCH" and "You TORCHIC" from the battle struct after DOUBLE KICK replaced SCRATCH and
  TORCHIC became COMBUSKEN; the party block already showed DOUBLE KICK.
- seq 20256 (screen battle, BattleScript_AskToLearnMove yesnoboxlearnmove 0x5A ready): the
  Interface line said "battle_resolving; input not ready" while the Menu line said
  "learn_move; selected YES".
The states below are built from those recorded states (party, moves, phase, prompt). OFF is
pinned to the readout the code wrote before the switch existed (fixtures/post_battle_off.json).
"""

import json
from dataclasses import replace
from pathlib import Path

from test_readout import IN_GAME

from pokebench_env.battle_details import BattleDetails, MemberFacts, MoveFacts
from pokebench_env.battle_state import BattleBattler, BattleInput, BattleMove, BattleState
from pokebench_env.battle_text import BattleMessage, BattlePrompt
from pokebench_env.pokemon import PartyMon
from pokebench_env.readout import SERVER_FEATURES, features_off_from_env, format_readout
from pokebench_env.ui_state import ActiveUi

SWITCH = "post-battle-readout-v1"
GOLDEN = Path(__file__).parent / "fixtures" / "post_battle_off.json"
IDENTITY = "060d1a55:4323d098"

# pokeemerald src/data/battle_moves.h: (id, name, type, power, accuracy, max pp)
SCRATCH = (10, "SCRATCH", 0, 40, 100, 35)
GROWL = (45, "GROWL", 0, 0, 100, 40)
FOCUS = (116, "FOCUS ENERGY", 0, 0, 0, 30)
EMBER = (52, "EMBER", 10, 40, 100, 25)
DOUBLE_KICK = (24, "DOUBLE KICK", 1, 30, 100, 30)
PP = {10: 34, 45: 40, 116: 30, 52: 20, 24: 30}


def battle_move(slot: int, row: tuple[int, str, int, int, int, int]) -> BattleMove:
    move_id, name, kind, power, accuracy, max_pp = row
    return BattleMove(slot, move_id, name, PP[move_id], max_pp, kind, power, accuracy, 0)


def facts(row: tuple[int, str, int, int, int, int]) -> MoveFacts:
    move_id, name, kind, power, accuracy, max_pp = row
    return MoveFacts(move_id, name, kind, power, accuracy, PP[move_id], max_pp)


def battler(
    slot: int,
    position: int,
    species: str,
    level: int,
    hp: int,
    max_hp: int,
    types: tuple[int, int],
    moves: tuple[tuple[int, str, int, int, int, int], ...],
    identity: str,
) -> BattleBattler:  # noqa: E501
    return BattleBattler(
        battler=position, position=position, party_slot=slot, identity=identity, species_id=280,
        species=species, level=level, hp=hp, max_hp=max_hp, status1=0, status2=0, status3=0,
        stat_stages=(6,) * 8, stats=(25, 23, 24, 28, 25), types=types, ability=66, held_item=0,
        moves=tuple(battle_move(i, m) for i, m in enumerate(moves))
        + tuple(BattleMove(i, 0, None, 0, 0, None, None, None, None) for i in range(len(moves), 4)),
        absent=False,
    )  # fmt: skip


PLAYER = battler(0, 0, "TORCHIC", 16, 36, 41, (10, 10), (SCRATCH, GROWL, FOCUS, EMBER), IDENTITY)
FOE = battler(1, 1, "NINCADA", 8, 0, 23, (6, 4), (SCRATCH,), "0015c688:f8e9ca31")
FINISHING = BattleState(
    active=True, initialized=True, phase="finishing", ready=False, battle_type=12, turn=2,
    outcome_code=1, outcome="won", battlers=(PLAYER, FOE),
    player_inputs=(BattleInput(0, 0, "controller_busy", False),),
    message=BattleMessage("idle"), prompt=None, text_phase="screen",
)  # fmt: skip
EVOLVED = MemberFacts(
    0, IDENTITY, "COMBUSKEN", 16, 41, 46, 0, False, (10, 1), 66, None,
    tuple(facts(m) for m in (DOUBLE_KICK, GROWL, FOCUS, EMBER)),
)  # fmt: skip
DETAILS = BattleDetails(party=(EVOLVED,), bag=(), held=(), storage_full=False)
EVOLUTION_UI = ActiveUi(
    "evolution_move_learning", None, True,
    "A or B advances the waiting move-learning text; inspect the next choice",
)  # fmt: skip
AFTER = replace(
    IN_GAME, screen="evolution", in_battle=True, location="ROUTE116", map_id=(0, 31),
    party=(PartyMon("COMBUSKEN", 16, 41, 46),), active_ui=EVOLUTION_UI, battle=FINISHING,
    battle_details=DETAILS,
)  # fmt: skip
ASKING = replace(
    AFTER, screen="battle",
    active_ui=ActiveUi("battle_resolving", None, False, "Use the game-owned battle input and selected control when ready"),  # noqa: E501
    battle=replace(
        FINISHING, phase="resolving", outcome=None, outcome_code=None, text_phase="prompt",
        prompt=BattlePrompt("learn_move", True, "YES"),
    ),
    battle_details=replace(DETAILS, party=(replace(EVOLVED, name="TORCHIC", types=(10, 10), moves=tuple(facts(m) for m in (SCRATCH, GROWL, FOCUS, EMBER))),)),  # noqa: E501
)  # fmt: skip
SUMMARY = replace(
    AFTER,
    screen="pokemon_summary",
    active_ui=ActiveUi(
        "summary_move_forget", "SCRATCH", True, "UP/DOWN selects a move; A forgets it"
    ),
)  # noqa: E501
STATES = {"after": AFTER, "asking": ASKING, "summary": SUMMARY}
# Every other server switch on, as the bundle arm has them for this readout.
OFF = frozenset({SWITCH})
ON: frozenset[str] = frozenset()


def readout(state: object, off: frozenset[str]) -> str:
    assert isinstance(state, type(IN_GAME))
    return format_readout(state, off)


def test_registered_server_feature_default_off() -> None:
    assert SERVER_FEATURES[-5] == SWITCH
    assert SWITCH in features_off_from_env({})


def test_off_keeps_the_readout_bytes() -> None:
    golden = json.loads(GOLDEN.read_text())
    assert {name: readout(state, OFF) for name, state in STATES.items()} == golden


def test_on_after_the_battle_labels_the_block_ended_and_takes_moves_from_the_party() -> None:
    text = readout(AFTER, ON)
    assert "Battle details: TRAINER single · turn 2 · ended (outcome won)" in text
    assert "finishing (outcome won)" not in text
    assert (
        "You COMBUSKEN Lv16 · FIRE/FIGHTING · HP 41/46 · status OK (from the party; the battle has ended)"  # noqa: E501
        in text
    )
    assert "You TORCHIC" not in text
    assert "Your moves (from the party; the battle has ended):" in text
    assert "  1 DOUBLE KICK FIGHTING physical pow 30 acc 100 PP 30/30" in text
    assert "Your moves (2×2" not in text
    assert "1 SCRATCH" not in text
    assert "Actions (2×2 FIGHT BAG" not in text
    assert "Party (game party slots):" in text
    assert "Foe NINCADA" in text
    summary = readout(SUMMARY, ON)
    assert "ended (outcome won)" in summary
    assert "Your moves (from the party; the battle has ended):" in summary


def test_on_in_battle_the_ready_learn_move_box_is_the_interface() -> None:
    text = readout(ASKING, ON)
    assert (
        "Interface: learn_move; input ready; selected YES; UP or DOWN moves the cursor, "
        "A answers the highlighted choice, B answers NO"
    ) in text
    assert "battle_resolving; input not ready" not in text
    stop = replace(
        ASKING, battle=replace(ASKING.battle, prompt=BattlePrompt("stop_learning_move", True, "NO"))
    )  # noqa: E501
    assert "Interface: stop_learning_move; input ready; selected NO;" in readout(stop, ON)
    # A box that is not ready, or another YES/NO box, keeps the battle interface line.
    unready = replace(
        ASKING, battle=replace(ASKING.battle, prompt=BattlePrompt("learn_move", False, "YES"))
    )  # noqa: E501
    assert "Interface: battle_resolving; input not ready" in readout(unready, ON)
    other = replace(
        ASKING, battle=replace(ASKING.battle, prompt=BattlePrompt("yes_no", True, "YES"))
    )  # noqa: E501
    assert "Interface: battle_resolving; input not ready" in readout(other, ON)


def test_on_mid_battle_and_without_details_nothing_changes() -> None:
    resolving = replace(FINISHING, phase="resolving", outcome=None)
    mid = replace(AFTER, screen="battle", battle=resolving)
    assert readout(mid, ON) == readout(mid, OFF)
    plain = replace(AFTER, battle_details=None)
    assert readout(plain, ON) == readout(plain, OFF)


def test_on_after_the_battle_an_unmatched_party_is_a_harness_bug_not_the_battle_copy() -> None:
    # Review round 1 (GPT, Astra): with no party member matching the battler, the ended block must
    # not fall back to the battle struct's POKéMON, moves and action menu.
    cases = {
        "no party": None,
        "mismatched identity": (replace(EVOLVED, identity="x"),),
        "no identity": (replace(EVOLVED, identity=None),),
    }
    for name, party in cases.items():
        text = readout(replace(AFTER, battle_details=replace(DETAILS, party=party)), ON)
        assert "ended (outcome won)" in text, name
        assert (
            "You · HARNESS BUG: no party member matches the player's battler; "
            "the battle has ended, so its own copy is not shown"
        ) in text, name
        for stale in ("You TORCHIC", "Your moves (2×2", "1 SCRATCH", "Actions (2×2 FIGHT BAG"):
            assert stale not in text, (name, stale)


def test_on_an_unreadable_party_member_is_a_visible_harness_bug() -> None:
    broken = replace(EVOLVED, types=None, diagnostic="species unavailable")
    text = readout(replace(AFTER, battle_details=replace(DETAILS, party=(broken,))), ON)
    assert "You COMBUSKEN · HARNESS BUG: species unavailable" in text
    assert "Your moves (from the party" not in text


def test_on_after_the_battle_an_absent_battler_is_named_from_the_party_or_omitted() -> None:
    # Review round 2 (GPT): an absent player battler in the ended block must not show the battle
    # struct's species (TORCHIC) when the party member has since evolved (COMBUSKEN).
    gone = replace(FINISHING, battlers=(replace(PLAYER, absent=True), FOE))
    state = replace(AFTER, battle=gone)
    assert "You TORCHIC · absent (fainted or switched out)" in readout(state, OFF)
    text = readout(state, ON)
    assert "You COMBUSKEN · absent (fainted or switched out)" in text
    assert "You TORCHIC" not in text
    stranger = (replace(EVOLVED, identity="x"),)
    unmatched = replace(state, battle_details=replace(DETAILS, party=stranger))
    text = readout(unmatched, ON)
    assert "ended (outcome won)" in text
    assert "You TORCHIC" not in text
    assert "absent (fainted or switched out)" not in text
