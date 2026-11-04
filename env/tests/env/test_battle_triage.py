"""battle-triage-guidance-v1: own-HP lines in battle and on the field.

Battles reuse the recorded raw-RAM fixtures of battle-details-v2 (runs c406 and c497); the
RUN rule is battle-details-v2's own `run_verdict`, not a second copy.
"""

from dataclasses import replace

from test_readout import IN_GAME

from pokebench_env.battle_triage import (
    SWITCH,
    below_half,
    field_triage_line,
)
from pokebench_env.pokemon import PartyMon
from pokebench_env.readout import SERVER_FEATURES, features_off_from_env, format_readout

FIELD = (
    "Your TORCHIC has 9/20 HP (below half). Talking to the nurse at a POKéMON CENTER "
    "heals your whole party; so does talking to MOM at home."
)


def test_threshold_is_strictly_below_half_and_alive() -> None:
    assert below_half(9, 20) and below_half(1, 3) and below_half(5, 11)
    assert not below_half(10, 20) and not below_half(6, 11) and not below_half(20, 20)
    assert not below_half(0, 20) and not below_half(3, 0)


def test_field_line_for_the_first_pokemon_able_to_battle() -> None:
    torchic = PartyMon("TORCHIC", 5, 9, 20)
    assert field_triage_line((torchic,), "player") == FIELD
    lines = format_readout(replace(IN_GAME, party=(torchic,))).split("\n")
    assert lines[lines.index(FIELD) - 1] == "Party (player): TORCHIC Lv5 HP 9/20"
    egg = PartyMon("EGG", None, 9, 20, is_egg=True)
    fainted = PartyMon("POOCHYENA", 3, 0, 12)
    assert field_triage_line((egg, fainted, torchic), "player") == FIELD
    assert field_triage_line((PartyMon("TORCHIC", 5, 10, 20), torchic), "player") is None
    assert field_triage_line((fainted,), "player") is None
    assert field_triage_line((), "player") is None
    assert field_triage_line(None, "player") is None
    assert field_triage_line((torchic,), "tutorial") is None
    assert field_triage_line((replace(torchic, diagnostic="checksum"),), "player") is None
    assert field_triage_line((PartyMon(None, None, None, None),), "player") is None
    assert field_triage_line((PartyMon(None, 5, 9, 20),), "player") == FIELD.replace(
        "TORCHIC", "UNKNOWN"
    )


def test_switch_is_registered_server_side_and_default_off() -> None:
    assert SWITCH == "battle-triage-guidance-v1"
    assert SWITCH in SERVER_FEATURES
    assert SWITCH in features_off_from_env({})
