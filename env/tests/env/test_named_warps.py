"""named-warp-destinations-v1: warps use only game-displayed destination names."""

import struct
from dataclasses import replace

from pokebench_env.game_state import MapNames, read_game_state
from pokebench_env.readout import SERVER_FEATURES, features_off_from_env, format_readout
from pokebench_env.world import InteractionTarget
from tests.env.test_feature_switches import map_memory
from tests.env.test_game_state import MAPS

DOOR = "[door: approach from below and press UP toward door]"
NAMED = f"Warps: (0,1) -> LITTLEROOT TOWN (map 0/9) {DOOR}"
PLAIN = f"Warps: (0,1) -> map 0/9 {DOOR}"


def lines(text: str) -> list[str]:
    return text.split("\n")


OFF_GUIDANCE = (
    "Warp destinations are map group/number IDs, not warp indexes. Activation also requires"
    " matching elevation and available field controls; W alone does not guarantee a transition."
    " After a transition, check the new map and position."
)
ON_GUIDANCE = (
    "Warp destinations are the map you arrive on: a name the game displays when one is"
    " available, then its group/number ID in parentheses; not warp indexes. Activation also"
    " requires matching elevation and available field controls; W alone does not guarantee a"
    " transition. After a transition, check the new map and position."
)


# Switches registered after 224ee68; OFF is their previous behavior.
# semantic-navigation-v2 postdates the ON expectations below, which pin named-warp text only.
NO_SEMNAV2 = frozenset({"semantic-navigation-v2"})


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
        world = format_readout(state, named_warps=True, world_destinations=True)
        assert "Warp destination at (0,1): map 0/9" in lines(world), world
        assert "Warp destination at (0,1): LITTLEROOT TOWN" not in lines(world), world


def test_on_uses_a_destination_name_the_game_displays() -> None:
    state = replace(
        read_game_state(map_memory().read, MAPS),
        displayed_places=((0, 9, "LITTLEROOT TOWN"),),
    )
    before = lines(format_readout(state, NO_SEMNAV2, named_interactions=True))
    after = lines(format_readout(state, NO_SEMNAV2, named_interactions=True, named_warps=True))
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
    world = format_readout(state, named_warps=True, world_destinations=True)
    assert "Warp destination at (0,1): LITTLEROOT TOWN" in lines(world), world


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


def test_switch_is_a_default_off_server_feature() -> None:
    assert "named-warp-destinations-v1" in SERVER_FEATURES
    assert "named-warp-destinations-v1" in features_off_from_env({})
    assert "named-warp-destinations-v1" not in features_off_from_env({"POKEBENCH_FEATURES_OFF": ""})


def test_memory_fixture_has_the_one_warp_these_tests_rely_on() -> None:
    m = map_memory()
    assert m.read(0x02009000, 8) == struct.pack("<hhBBBB", 0, 1, 0, 0, 9, 0)
