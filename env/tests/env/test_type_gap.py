"""type-gap-team-v1 on the real ROM and the 1331 raw-RAM archives (training-raw.provenance.json).

Game sources: pret/pokeemerald 731ad5bf src/battle_main.c gTypeEffectiveness and the gym guides'
advice texts in data/maps/*Gym*/scripts.inc (<map>_Text_GymGuideAdvice).
"""

from __future__ import annotations

import pytest

from pokebench_env import type_gap
from pokebench_env.readout import SERVER_FEATURES, features_off_from_env
from pokebench_env.type_gap import (
    SWITCH,
)

ON: frozenset[str] = frozenset()


@pytest.fixture(autouse=True)
def _fresh_chart(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(type_gap, "_chart", None)


# The type-naming sentence of each guide's advice, as one page joined into one line by the agent.
# packages/agent/src/type-gap-team.ts GUIDE_TYPE.


def test_switch_is_registered_and_off_by_default() -> None:
    assert SWITCH in SERVER_FEATURES
    assert SWITCH in features_off_from_env({})
