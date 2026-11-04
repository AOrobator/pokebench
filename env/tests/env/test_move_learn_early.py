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
from pathlib import Path

from pokebench_env.move_learn import (
    EARLY_SWITCH,
)
from pokebench_env.readout import SERVER_FEATURES, features_off_from_env

FIXTURES = Path(__file__).parent / "fixtures"
PROVENANCE = json.loads((FIXTURES / "move-learn-early.provenance.json").read_text())


# --- the recorded states ------------------------------------------------------------------


# --- ON: the block on the pages, no question yet ------------------------------------------


# --- OFF parity, dependency, typed state --------------------------------------------------


# --- registration -------------------------------------------------------------------------


def test_registered_server_side_last_and_default_off() -> None:
    assert SERVER_FEATURES[72] == EARLY_SWITCH
    assert EARLY_SWITCH in features_off_from_env({})
    assert features_off_from_env({"POKEBENCH_FEATURES_OFF": ""}) == frozenset()
