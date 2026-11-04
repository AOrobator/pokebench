import json
import os
from dataclasses import replace
from pathlib import Path

import pytest
from test_readout import IN_GAME, PRE_GAME

from pokebench_env.live_map import LocalMap, MapTile
from pokebench_env.raw_ram import ArchivedMemoryReader
from pokebench_env.readout import SERVER_FEATURES, features_off_from_env, format_readout
from pokebench_env.rom import EMERALD_SHA1, resolve_rom

SWITCH = "player-elevation-readout-v1"
FIXTURE = json.loads(
    (Path(__file__).parent / "fixtures/player-elevation-0d5d-21932.json").read_text()
)
OFF = frozenset(FIXTURE["off"]) | {
    "active-warp-exits-v1",
    "available-exits-presentation-v1",
    "map-observability-v1",
}
ON = OFF - {SWITCH}


@pytest.fixture(scope="module")
def memory():
    rom = resolve_rom(os.environ, EMERALD_SHA1).read_bytes()
    return ArchivedMemoryReader(
        [(w["address"], bytes.fromhex(w["hex"])) for w in FIXTURE["windows"]],
        tuple(FIXTURE["gprs"]),
        FIXTURE["cpsr"],
        {},
        rom,
    )


def position(text: str) -> str | None:
    return next((line for line in text.splitlines() if line.startswith("Position:")), None)


@pytest.mark.parametrize("tile_elevation", [0, 15, 3, 4])
def test_only_the_known_own_tile_zero_or_fifteen_adds_the_rule(tile_elevation):
    # pokeemerald 731ad5bf IsElevationMismatchAt, not AreElevationsCompatible for objects.
    shown = LocalMap(
        (7, 8),
        (".", "@"),
        (MapTile(7, 8, 0, 0, 0, 15), MapTile(7, 9, 0, 0, 0, tile_elevation)),
        (),
        (),
    )
    state = replace(IN_GAME, player_elevation=3, nearby=shown)
    line = "Position: X=7, Y=9, facing right, elevation 3"
    if tile_elevation in (0, 15):
        line += f", on a tile that accepts any elevation ({tile_elevation})"
    assert position(format_readout(state, ON)) == line


@pytest.mark.parametrize("height", [0, 3, 15])
def test_current_player_height_is_reported_without_a_map_or_other_levels(height):
    state = replace(IN_GAME, player_elevation=height, nearby=None)
    assert position(format_readout(state, ON)) == (
        f"Position: X=7, Y=9, facing right, elevation {height}"
    )


def test_an_omitted_current_tile_does_not_borrow_an_adjacent_tile_rule():
    shown = LocalMap((7, 8), (".",), (MapTile(7, 8, 0, 0, 0, 15),), (), ())
    state = replace(IN_GAME, player_elevation=3, nearby=shown, facing=None)
    assert position(format_readout(state, ON)) == "Position: X=7, Y=9, elevation 3"


def test_unavailable_position_or_pregame_cannot_acquire_a_default_height():
    unavailable = replace(IN_GAME, position=None, player_elevation=0)
    assert format_readout(unavailable, ON) == format_readout(unavailable, OFF)
    assert format_readout(PRE_GAME, ON) == format_readout(PRE_GAME, OFF)


def test_the_server_registers_the_switch_and_defaults_it_off():
    assert SWITCH in SERVER_FEATURES
    assert SWITCH in features_off_from_env({})
    assert SWITCH not in features_off_from_env({"POKEBENCH_FEATURES_OFF": ""})
