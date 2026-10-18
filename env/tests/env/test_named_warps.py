"""named-warp-destinations-v1: warps use only game-displayed destination names."""

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
from tests.env.test_game_state import MAPS, SB1

DOOR = "[door: approach from below and press UP toward door]"
NAMED = f"Warps: (0,1) -> LITTLEROOT TOWN (map 0/9) {DOOR}"
PLAIN = f"Warps: (0,1) -> map 0/9 {DOOR}"
VENDOR_MAPS = (
    Path(__file__).resolve().parents[2] / "vendor/continual-harness/pokemon_env/porymap/data/maps"
)


def lines(text: str) -> list[str]:
    return text.split("\n")


OFF_GUIDANCE = (
    "Warp destinations are map group/number IDs, not warp indexes. Activation also requires"
    " matching elevation and available field controls; W alone does not guarantee a transition."
    " After a transition, check the new map and position."
)
ON_GUIDANCE = (
    "Warp destinations are the map you arrive on: a name the game displays when one is"
    " available, then its group/number ID in parentheses; not warp indexes. Activation also requires"
    " matching elevation and available field controls; W alone does not guarantee a transition."
    " After a transition, check the new map and position."
)
FIXTURES = Path(__file__).resolve().parent / "fixtures"


# Switches registered after 224ee68; OFF is their previous behavior.
LATER = ("readout-truth-v1", "birch-speech-pages-v1", "blackout-readout-v1")


def test_off_equals_the_readout_rendered_by_the_previous_commit() -> None:
    # Goldens were rendered by env/pokebench_env at 224ee68 from this same memory fixture.
    for kw, golden in (({}, "local"), ({"full_map_enabled": True}, "whole")):
        state = read_game_state(map_memory().read, MAPS, **kw)
        expected = (FIXTURES / f"named-warps-off-{golden}-224ee68.txt").read_text()
        for off, named in (
            (frozenset({"character-presence-v1", *LATER}), False),
            (frozenset({"named-warp-destinations-v1", "character-presence-v1", *LATER}), True),
        ):
            text = format_readout(state, off, named_interactions=True, named_warps=named)
            assert text == expected
        assert OFF_GUIDANCE in lines(expected) and PLAIN in lines(expected)


def test_on_keeps_an_internal_only_destination_unnamed() -> None:
    for state in (
        read_game_state(map_memory().read, MAPS),
        read_game_state(map_memory().read, MAPS, full_map_enabled=True),
    ):
        text = format_readout(state, named_warps=True)
        assert PLAIN in lines(text) and NAMED not in lines(text)
        assert ON_GUIDANCE in lines(text) and OFF_GUIDANCE not in lines(text)
        named = format_readout(state, named_warps=True, named_interactions=True)
        assert any(line.startswith("Warp to map 0/9 at (0,1)") for line in lines(named)), named


def test_on_uses_a_destination_name_the_game_displays() -> None:
    state = replace(
        read_game_state(map_memory().read, MAPS),
        displayed_places=((0, 9, "LITTLEROOT TOWN"),),
    )
    before = lines(format_readout(state, named_interactions=True))
    after = lines(format_readout(state, named_interactions=True, named_warps=True))
    candidate = (
        " at (0,1), elevation 0; movement; activation depends on metatile (see local map);"
        " conditional; destination "
    )
    assert [(a, b) for a, b in zip(before, after, strict=True) if a != b] == [
        (PLAIN, NAMED),
        (OFF_GUIDANCE, ON_GUIDANCE),
        (
            f"Warp to map 0/9{candidate}map 0/9 warp 0",
            f"Warp to LITTLEROOT TOWN (map 0/9){candidate}LITTLEROOT TOWN (map 0/9) warp 0",
        ),
    ]


def test_unknown_and_dynamic_destinations_are_never_named() -> None:
    state = read_game_state(map_memory().read, MapNames({}))
    assert state.destination_names == ((0, 9, "unknown map 0/9"),)
    text = format_readout(state, named_warps=True)
    assert PLAIN in lines(text) and ON_GUIDANCE in lines(text)
    assert "destination map 0/9 warp 0" in text and "unknown map 0/9" not in text
    named = format_readout(state, named_warps=True, named_interactions=True)
    assert any(line.startswith("Warp to map 0/9 at (0,1)") for line in lines(named)), named
    dynamic = InteractionTarget("warp", 3, 4, 0, "movement", destination=(127, 127, 0))
    assert dynamic.text(destinations={(127, 127): "LITTLEROOT TOWN"}).endswith(
        "; dynamic destination"
    )
    assert PLAIN in lines(format_readout(replace(state, destination_names=()), named_warps=True))


def test_the_internal_name_is_not_enough_to_name_a_destination() -> None:
    maps = MapNames.load(VENDOR_MAPS)
    # The fixture's warp leads to map 0/9, the map the fixture stands on, so the readout's own
    # Location line is what the game reports after arriving there.
    text = format_readout(read_game_state(map_memory().read, maps), named_warps=True)
    location = next(line for line in lines(text) if line.startswith("Location: "))
    assert location == "Location: LITTLEROOT TOWN"
    assert f"Warps: (0,1) -> map 0/9 {DOOR}" in lines(text)
    # The 2x2 runs' doors: (14,8) -> 1/2 was recorded as LITTLEROOT TOWN MAYS HOUSE 1F on arrival.
    assert maps.name((1, 2)) == "LITTLEROOT TOWN MAYS HOUSE 1F"
    assert maps.name((1, 0)) == "LITTLEROOT TOWN BRENDANS HOUSE 1F"
    assert maps.name((1, 4)) == "LITTLEROOT TOWN PROFESSOR BIRCHS LAB"


def test_observation_route_applies_the_switch_from_env(monkeypatch: pytest.MonkeyPatch) -> None:
    texts = {}
    for off in ("", "named-warp-destinations-v1"):
        monkeypatch.setenv("POKEBENCH_FEATURES_OFF", off)
        app = FastAPI()
        install_observation(app, lambda: _Shot(), map_memory().read, MAPS)
        _, _, body = get(app, "/pokebench/observation")
        texts[off] = json.loads(body)["state_text"]
    assert "LITTLEROOT TOWN (map 0/9)" not in texts[""]
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


EXIT = "[directional exit: stand on tile, then press RIGHT]"
DYNAMIC = "LITTLEROOT TOWN (dynamic warp; map 0/9)"


def truck(dynamic: tuple[int, int, int] | None = (0, 9, -1), location: tuple[int, int] = (25, 40)):  # type: ignore[no-untyped-def]
    # InsideOfTruck: its exit warps are MAP_DYNAMIC (map.json); the intro script runs
    # `setdynamicwarp MAP_LITTLEROOT_TOWN, 3, 10` (InsideOfTruck/scripts.inc:33), which
    # SetDynamicWarpWithCoords stores in SaveBlock1.dynamicWarp (0x14, include/global.h).
    m = map_memory()
    m.put(SB1, struct.pack("<hhbb", 1, 1, *location))
    m.put(0x02009000, struct.pack("<hhBBBB", 0, 1, 0, 127, 127, 127))
    m.put(0x02007000, struct.pack("<H", 0x62))
    if dynamic is not None:
        m.put(SB1 + 0x14, struct.pack("<bbbhh", *dynamic, 3, 10))
    return m


def test_the_truck_exit_does_not_reveal_the_internal_dynamic_warp_name() -> None:
    maps = MapNames.load(VENDOR_MAPS)
    state = read_game_state(truck().read, maps)
    assert state.location == "INSIDE OF TRUCK"
    assert state.dynamic_warp == (0, 9, "LITTLEROOT TOWN")
    text = format_readout(state, named_warps=True, world_destinations=True)
    assert f"Warps: (0,1) -> dynamic destination {EXIT}" in lines(text)
    assert (
        "warp at (0,1), elevation 0; movement; activation depends on metatile (see local map);"
        " conditional; dynamic destination" in lines(text)
    )
    assert "Warp destination at (0,1): dynamic destination" in lines(text)
    named = format_readout(state, named_warps=True, named_interactions=True)
    assert any(line.startswith("Dynamic warp at (0,1)") for line in lines(named)), named
    full = read_game_state(truck().read, maps, full_map_enabled=True)
    assert f"Warps: (0,1) -> dynamic destination {EXIT}" in lines(
        format_readout(full, named_warps=True)
    )


def test_switch_off_keeps_dynamic_destination_byte_for_byte() -> None:
    maps = MapNames.load(VENDOR_MAPS)
    state = read_game_state(truck().read, maps)
    plain = replace(state, dynamic_warp=None)
    for kw in ({}, {"named_interactions": True, "world_destinations": True}):
        off = format_readout(
            state, frozenset({"named-warp-destinations-v1"}), named_warps=True, **kw
        )
        assert off == format_readout(plain, **kw)
        assert f"Warps: (0,1) -> dynamic destination {EXIT}" in lines(off)
        assert DYNAMIC not in off


def test_an_unset_or_unknown_dynamic_warp_keeps_dynamic_destination() -> None:
    maps = MapNames.load(VENDOR_MAPS)
    for dynamic in ((-1, -1, -1), (127, 127, 127), (60, 1, 0)):
        state = read_game_state(truck(dynamic).read, maps)
        assert state.dynamic_warp is None, dynamic
        text = format_readout(state, named_warps=True, world_destinations=True)
        assert f"Warps: (0,1) -> dynamic destination {EXIT}" in lines(text)
        assert "Warp destination at (0,1): dynamic destination" in lines(text)
        assert any(line.endswith("; dynamic destination") for line in lines(text)), text


def test_the_dynamic_warp_is_read_only_where_a_dynamic_warp_exists() -> None:
    maps = MapNames.load(VENDOR_MAPS)
    m = map_memory()
    m.put(SB1 + 0x14, struct.pack("<bbbhh", 0, 9, 0, 3, 10))
    assert read_game_state(m.read, maps).dynamic_warp is None


def test_off_the_dynamic_warp_is_never_read_on_the_observation_route(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Round-5 review: OFF must not perform the new SaveBlock1.dynamicWarp read at all.
    maps = MapNames.load(VENDOR_MAPS)
    memory = truck()
    reads: list[int] = []

    def read(address: int, size: int) -> bytes:
        if address == SB1 + 0x14:
            reads.append(address)
            raise OSError("dynamic warp read refused")
        return memory.read(address, size)

    for route in ("/pokebench/observation", "/pokebench/state"):
        monkeypatch.setenv("POKEBENCH_FEATURES_OFF", "named-warp-destinations-v1")
        app = FastAPI()
        install_observation(app, lambda: _Shot(), read, maps)
        status, _, body = get(app, route)
        assert status == 200, (route, body)
        assert reads == [], route
    monkeypatch.setenv("POKEBENCH_FEATURES_OFF", "")
    app = FastAPI()
    install_observation(app, lambda: _Shot(), memory.read, maps)
    status, _, body = get(app, "/pokebench/observation")
    assert status == 200 and DYNAMIC not in json.loads(body)["state_text"]
