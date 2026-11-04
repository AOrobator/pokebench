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
