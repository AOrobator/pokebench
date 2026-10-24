"""battle-triage-guidance-v1: own-HP lines in battle and on the field.

Battles reuse the recorded raw-RAM fixtures of battle-details-v2 (runs c406 and c497); the
RUN rule is battle-details-v2's own `run_verdict`, not a second copy.
"""

import json
import struct
from dataclasses import replace

import pytest
from test_battle_details_v2 import FIXTURES, MONS, TYPE_FLAGS, recorded, rom, state, trainer
from test_readout import IN_GAME

from pokebench_env import rerender
from pokebench_env.battle_details import run_verdict
from pokebench_env.battle_triage import (
    SWITCH,
    battle_triage_lines,
    below_half,
    field_triage_line,
)
from pokebench_env.pokemon import PartyMon
from pokebench_env.readout import SERVER_FEATURES, features_off_from_env, format_readout

OFF = frozenset({SWITCH})
LOW = (
    "Your TORCHIC has 5/20 HP (below half). This is a wild battle: "
    "RUN is allowed (bottom-right of the battle menu)."
)
FIELD = (
    "Your TORCHIC has 9/20 HP (below half). Talking to the nurse at a POKéMON CENTER "
    "heals your whole party; so does talking to MOM at home."
)


def wild(hp: int, flags: int = 0x04):
    m = trainer()
    m.put(TYPE_FLAGS, struct.pack("<I", flags))
    m.put(MONS + 0x28, struct.pack("<H", hp))
    return m


def test_threshold_is_strictly_below_half_and_alive() -> None:
    assert below_half(9, 20) and below_half(1, 3) and below_half(5, 11)
    assert not below_half(10, 20) and not below_half(6, 11) and not below_half(20, 20)
    assert not below_half(0, 20) and not below_half(3, 0)


def test_wild_battle_below_half_names_run_and_where_it_is() -> None:
    text = format_readout(state(wild(5)))
    lines = text.split("\n")
    assert LOW in lines
    assert lines.index(LOW) < lines.index("Player: MAY")
    assert lines.index(LOW) > lines.index("Party (game party slots):")
    assert "Talking to the nurse" not in text


def test_off_is_byte_identical() -> None:
    current = state(wild(5))
    off = format_readout(current, OFF)
    assert LOW not in off
    assert off == "\n".join(line for line in format_readout(current).split("\n") if line != LOW)
    golden = (FIXTURES / "battle-details-v2-off-c406-00001266.txt").read_text()
    birch = state(recorded("battle-c406-00001266.json"))
    later = {
        "readout-truth-v1",
        "birch-speech-pages-v1",
        "blackout-readout-v1",
        "player-elevation-readout-v1",
    }
    assert format_readout(birch, frozenset({"battle-details-v2", SWITCH, *later})) == golden
    assert format_readout(birch, frozenset({"battle-details-v2", *later})) == golden
    field = replace(IN_GAME, party=(PartyMon("TORCHIC", 5, 9, 20),))
    assert format_readout(field, OFF) == format_readout(field).replace(f"\n{FIELD}", "")
    assert FIELD in format_readout(field)


def test_shown_with_battle_details_off() -> None:
    hidden = format_readout(state(wild(5)), frozenset({"battle-details-v2"}))
    assert LOW in hidden.split("\n") and "Battle details:" not in hidden


@pytest.mark.parametrize("hp", [10, 11, 20, 0])
def test_half_or_more_or_fainted_shows_nothing(hp: int) -> None:
    assert "below half" not in format_readout(state(wild(hp)))


@pytest.mark.parametrize(
    "flags",
    [
        0x0C,  # TRAINER: "No! There's no running from a TRAINER battle!"
        0x14,  # FIRST_BATTLE: the PROF. BIRCH rescue
        0x06,  # LINK
        0x84,  # SAFARI
        0x204,  # WALLY tutorial
        0x04 | (1 << 24),  # recorded battle playback
    ],
)
def test_battles_that_are_not_plain_wild_battles_show_nothing(flags: int) -> None:
    assert "below half" not in format_readout(state(wild(5, flags)))


def test_run_refused_or_unknown_by_the_shared_verdict_shows_nothing() -> None:
    m = wild(5)
    m.put(MONS + 0x58 + 0x20, bytes([23]))  # foe SHADOW TAG
    assert "below half" not in format_readout(state(m))
    m = wild(5)
    m.put(MONS + 0x50, struct.pack("<I", 1 << 13))  # wrapped
    assert "below half" not in format_readout(state(m))
    m = wild(5)
    m.put(MONS + 0x2E, struct.pack("<H", 175))  # ENIGMA BERRY: hold effect not read
    assert "below half" not in format_readout(state(m))
    m.put(MONS + 0x2E, struct.pack("<H", 193))  # SMOKE BALL always escapes
    assert LOW in format_readout(state(m))


def test_run_verdict_is_one_owner_for_both_switches() -> None:
    base = state(wild(5))
    battle, details = base.battle, base.battle_details
    assert battle is not None and details is not None and battle.battlers is not None
    actor = battle.battlers[0]
    verdict = run_verdict(battle, actor, None)
    assert verdict.allowed is True and verdict.text.startswith("RUN allowed")
    assert verdict.text in "\n".join(details.lines(battle))
    trainer_battle = replace(battle, battle_type=0x0C)
    refused = run_verdict(trainer_battle, actor, None)
    assert refused.allowed is False and refused.text.startswith("RUN REFUSED")
    assert run_verdict(replace(battle, battle_type=0x0C | (1 << 8)), actor, None).allowed is False
    assert run_verdict(battle, actor, replace(details.held[0], hold_effect=None)).allowed is None


def test_needs_an_open_battle_menu_and_readable_details() -> None:
    base = state(wild(5))
    battle, details = base.battle, base.battle_details
    assert battle is not None and details is not None
    assert battle_triage_lines(battle, details) == [LOW]
    assert battle_triage_lines(battle, None) == []
    assert battle_triage_lines(battle, replace(details, diagnostic="harness bug: x")) == []
    assert battle_triage_lines(replace(battle, player_inputs=(), phase="resolving"), details) == []
    assert battle_triage_lines(replace(battle, player_inputs=None), details) == []
    (choice,) = battle.player_inputs or ()
    assert (
        battle_triage_lines(replace(battle, player_inputs=(replace(choice, ready=False),)), details)
        == []
    )
    for phase, shown in (("move", True), ("yes_no", False), ("target", False)):
        inputs = (replace(choice, phase=phase),)
        assert (
            battle_triage_lines(replace(battle, player_inputs=inputs), details) == [LOW]
        ) is shown
    gone = tuple(replace(b, absent=True) for b in battle.battlers or ())
    assert battle_triage_lines(replace(battle, battlers=gone), details) == []
    assert battle_triage_lines(replace(battle, battlers=None), details) == []
    assert battle_triage_lines(replace(battle, battle_type=None), details) == [LOW]


def test_move_select_from_recorded_raw_ram() -> None:
    m = recorded("battle-c406-00001269.json")
    m.put(TYPE_FLAGS, struct.pack("<I", 0x04))
    m.put(MONS + 0x28, struct.pack("<H", 3))
    assert "Your TORCHIC has 3/20 HP (below half)." in format_readout(state(m))


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


def test_field_line_only_off_battle() -> None:
    low = replace(IN_GAME, party=(PartyMon("TORCHIC", 5, 9, 20),))
    assert FIELD in format_readout(low)
    assert FIELD not in format_readout(replace(low, in_battle=True))
    assert FIELD not in format_readout(state(wild(5)))
    assert "below half" not in format_readout(IN_GAME)


def test_switch_is_registered_server_side_and_default_off() -> None:
    assert SWITCH == "battle-triage-guidance-v1"
    assert SWITCH in SERVER_FEATURES
    assert SWITCH in features_off_from_env({})


def test_rerender_reads_battle_details_when_either_switch_is_on() -> None:
    m = wild(5)
    seen: list[bool] = []

    def fake(*_args: object, battle_details_enabled: bool, **_kwargs: object) -> None:
        seen.append(battle_details_enabled)

    original = rerender.read_game_state
    rerender.read_game_state = fake  # type: ignore[assignment]
    try:
        for off in (
            frozenset(),
            frozenset({"battle-details-v2"}),
            OFF,
            frozenset({"battle-details-v2", SWITCH, "battle-effective-damage-v1"}),
        ):
            rerender.read_state(m.read, None, active_ui=True, off=off)  # type: ignore[arg-type]
    finally:
        rerender.read_game_state = original
    assert seen == [True, True, True, False]


def test_production_observation_route_honours_the_switch(monkeypatch: pytest.MonkeyPatch) -> None:
    from fastapi import FastAPI
    from test_feature_switches import _Shot
    from test_game_state import MAPS, game
    from test_view import get

    from pokebench_env.observation import install_observation

    m = game((0x0, 0x0803CAFE))
    data = json.loads((FIXTURES / "battle-c406-00001266.json").read_text())
    for window in data["windows"]:
        m.put(int(window["address"], 16), bytes.fromhex(window["hex"]))
    rom(m)
    m.put(TYPE_FLAGS, struct.pack("<I", 0x04))
    m.put(MONS + 0x28, struct.pack("<H", 5))
    texts = {}
    for off in ("battle-details-v2", f"battle-details-v2,{SWITCH}"):
        monkeypatch.setenv("POKEBENCH_FEATURES_OFF", off + ",coherent-battle-observation-v1")
        app = FastAPI()
        install_observation(app, lambda: _Shot(), m.read, MAPS)
        status, _, body = get(app, "/pokebench/observation")
        assert status == 200, body
        texts[off] = json.loads(body)["state_text"]
    assert LOW in texts["battle-details-v2"].split("\n")
    assert LOW not in texts[f"battle-details-v2,{SWITCH}"]
    assert texts[f"battle-details-v2,{SWITCH}"] == texts["battle-details-v2"].replace(
        f"\n{LOW}", ""
    )
