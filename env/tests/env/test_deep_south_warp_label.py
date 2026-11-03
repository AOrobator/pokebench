"""deep-south-warp-label-v1: metatile behavior 0x6E is a doorway, not water.

Source: pokeemerald 731ad5b include/constants/metatile_behaviors.h (MB_DEEP_SOUTH_WARP = 0x6E),
src/metatile_behavior.c MetatileBehavior_IsNonAnimDoor (0x6E is a non-animated door) and
sTileBitAttributes (no TILE_FLAG_SURFABLE), src/overworld.c GetAdjustedInitialDirection.
Native case: fixture exit-labels-b300 seq 18834, ROUTE 104 with the PETALBURG WOODS entrances at
(10,30) and (11,30); run 2026-11-01T01-37-02_hyperqwen-gpu0_7da5 read them as `deep_water_exit`
in 368 turns and reasoned about an underwater forest.
"""

import json

from pokebench_env import rerender
from pokebench_env.readout import SERVER_FEATURES, features_off_from_env, state_json
from tests.env.test_exit_labels import maps, reader

SWITCH = "deep-south-warp-label-v1"
ON = {"ram-state-v1", "live-map-v1", "world-targets-v1", "map-observability-v1"}
ON |= {"full-map-navigation-v1"}


def observe(switch: bool):
    off = frozenset(SERVER_FEATURES) - ON - ({SWITCH} if switch else set())
    state = rerender.read_state(reader("18834"), maps(), active_ui=True, off=off)
    return state, rerender.render(state, off), json.dumps(state_json(state))


def test_switch_is_a_default_off_server_feature():
    assert SWITCH in SERVER_FEATURES
    assert SWITCH in features_off_from_env({})


def test_off_keeps_the_previous_label_byte_for_byte():
    state, text, body = observe(False)
    entrances = [e for e in state.map_observation.elements if e.state == "deep_water_exit"]
    assert [(e.kind, e.x, e.y) for e in entrances] == [("warp", 10, 30), ("warp", 11, 30)]
    assert "Wp:deep_water_exit = warp (deep water exit)" in text
    assert '"state": "deep_water_exit"' in body


def test_on_names_the_tile_an_entrance_and_mentions_no_water_exit():
    state, text, body = observe(True)
    entrances = [e for e in state.map_observation.elements if e.state == "entrance"]
    assert [(e.kind, e.x, e.y) for e in entrances] == [("warp", 10, 30), ("warp", 11, 30)]
    assert "Wp:entrance = warp (entrance)" in text
    for words in ("deep_water_exit", "deep water exit"):
        assert words not in text
        assert words not in body


def test_on_changes_nothing_but_those_two_elements():
    before, _, _ = observe(False)
    after, _, _ = observe(True)
    assert len(before.map_observation.elements) == len(after.map_observation.elements)
    pairs = zip(before.map_observation.elements, after.map_observation.elements, strict=True)
    changed = [(a, b) for a, b in pairs if a != b]
    assert [(a.x, a.y, a.state, b.state) for a, b in changed] == [
        (10, 30, "deep_water_exit", "entrance"),
        (11, 30, "deep_water_exit", "entrance"),
    ]
