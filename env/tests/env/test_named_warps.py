"""named-warp-destinations-v1: warps name the map they lead to, from the game's map table."""

import json
import struct
from dataclasses import replace
from pathlib import Path

import pytest
from fastapi import FastAPI
from test_view import get

from pokebench_env.game_state import MapNames, read_game_state
from pokebench_env.observation import install_observation
from pokebench_env.readout import SERVER_FEATURES, features_off_from_env, format_readout
from pokebench_env.world import InteractionTarget
from tests.env.test_feature_switches import _Shot, map_memory
from tests.env.test_game_state import MAPS

NAMED = "Warps: (0,1) -> LITTLEROOT TOWN (map 0/9) [door: approach from below and press UP toward door]"
PLAIN = "Warps: (0,1) -> map 0/9 [door: approach from below and press UP toward door]"
VENDOR_MAPS = (
    Path(__file__).resolve().parents[2] / "vendor/continual-harness/pokemon_env/porymap/data/maps"
)


def lines(text: str) -> list[str]:
    return text.split("\n")


def test_off_is_byte_identical_to_the_existing_readout() -> None:
    for state in (
        read_game_state(map_memory().read, MAPS),
        read_game_state(map_memory().read, MAPS, full_map_enabled=True),
    ):
        base = format_readout(state)
        assert format_readout(state, named_warps=False) == base
        assert PLAIN in lines(base) and "LITTLEROOT TOWN (map" not in base
        assert (
            format_readout(state, frozenset({"named-warp-destinations-v1"}), named_warps=True)
            == base
        )


def test_on_names_the_destination_in_the_warps_line_and_candidates() -> None:
    for state in (
        read_game_state(map_memory().read, MAPS),
        read_game_state(map_memory().read, MAPS, full_map_enabled=True),
    ):
        text = format_readout(state, named_warps=True)
        assert NAMED in lines(text) and PLAIN not in lines(text)
        assert (
            "Warp destinations name the map you arrive on, with its group/number ID in"
            " brackets; they are not warp indexes." in text
        )
        assert "Warp destinations are map group/number IDs" not in text
        assert (
            "warp at (0,1), elevation 0; movement; activation depends on metatile (see local map);"
            " conditional; destination LITTLEROOT TOWN (map 0/9) warp 0" in lines(text)
        )
        named = format_readout(state, named_warps=True, named_interactions=True)
        assert any(
            line.startswith("Warp to LITTLEROOT TOWN (map 0/9) at (0,1)") for line in lines(named)
        ), named


def test_only_warp_lines_change() -> None:
    state = read_game_state(map_memory().read, MAPS)
    before, after = lines(format_readout(state)), lines(format_readout(state, named_warps=True))
    assert len(before) == len(after)
    changed = [(a, b) for a, b in zip(before, after, strict=True) if a != b]
    assert [a.split(" ", 1)[0] for a, _ in changed] == ["Warps:", "Warp", "warp"], changed


def test_unknown_and_dynamic_destinations_are_never_named() -> None:
    state = read_game_state(map_memory().read, MapNames({}))
    assert state.destination_names == ((0, 9, "unknown map 0/9"),)
    text = format_readout(state, named_warps=True)
    assert PLAIN in lines(text)
    assert "destination map 0/9 warp 0" in text and "unknown map" not in text
    dynamic = InteractionTarget("warp", 3, 4, 0, "movement", destination=(127, 127, 0))
    assert dynamic.text(destinations={(127, 127): "LITTLEROOT TOWN"}).endswith(
        "; dynamic destination"
    )
    assert PLAIN in lines(format_readout(replace(state, destination_names=()), named_warps=True))


def test_the_name_is_the_location_the_game_reports_on_arrival() -> None:
    maps = MapNames.load(VENDOR_MAPS)
    # Recorded 2x2 runs: the (14,8) door in Littleroot leads to map 1/2, and the location line read
    # after walking through it was LITTLEROOT TOWN MAYS HOUSE 1F.
    assert maps.name((1, 2)) == "LITTLEROOT TOWN MAYS HOUSE 1F"
    assert maps.name((1, 0)) == "LITTLEROOT TOWN BRENDANS HOUSE 1F"
    assert maps.name((1, 4)) == "LITTLEROOT TOWN PROFESSOR BIRCHS LAB"
    target = InteractionTarget("warp", 14, 8, 0, "movement", destination=(1, 2, 1))
    assert target.text(destinations={(1, 2): "LITTLEROOT TOWN MAYS HOUSE 1F"}).endswith(
        "; destination LITTLEROOT TOWN MAYS HOUSE 1F (map 1/2) warp 1"
    )


def test_observation_route_applies_the_switch_from_env(monkeypatch: pytest.MonkeyPatch) -> None:
    texts = {}
    for off in ("", "named-warp-destinations-v1"):
        monkeypatch.setenv("POKEBENCH_FEATURES_OFF", off)
        app = FastAPI()
        install_observation(app, lambda: _Shot(), map_memory().read, MAPS)
        _, _, body = get(app, "/pokebench/observation")
        texts[off] = json.loads(body)["state_text"]
    assert "LITTLEROOT TOWN (map 0/9)" in texts[""]
    assert "LITTLEROOT TOWN (map 0/9)" not in texts["named-warp-destinations-v1"]
    assert "(map 0/9)" not in texts["named-warp-destinations-v1"]


def test_switch_is_a_default_off_server_feature() -> None:
    assert "named-warp-destinations-v1" in SERVER_FEATURES
    assert "named-warp-destinations-v1" in features_off_from_env({})
    assert "named-warp-destinations-v1" not in features_off_from_env({"POKEBENCH_FEATURES_OFF": ""})


def test_json_state_is_unchanged_by_the_switch(monkeypatch: pytest.MonkeyPatch) -> None:
    states = []
    for off in ("", "named-warp-destinations-v1"):
        monkeypatch.setenv("POKEBENCH_FEATURES_OFF", off)
        app = FastAPI()
        install_observation(app, lambda: _Shot(), map_memory().read, MAPS)
        _, _, body = get(app, "/pokebench/observation")
        states.append(json.loads(body)["state"])
    assert states[0] == states[1]


def test_memory_fixture_has_the_one_warp_these_tests_rely_on() -> None:
    m = map_memory()
    assert m.read(0x02009000, 8) == struct.pack("<hhBBBB", 0, 1, 0, 0, 9, 0)
