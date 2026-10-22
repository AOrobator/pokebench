"""map-wide-triggers-v1: the state lists every coordinate trigger on the map.

The readout text still lists only the nearby ones. GLM run 2026-10-21T01-16-23_glm53-mac_e9ee
(seq 1985-2017) planned an 8-tile stride from LITTLEROOT TOWN (10,17) to (10,9): the trigger at
(10,9) was 8 rows away, outside the 7-tile list, so the planner did not see it and the stride
executor stopped at (10,10) when it came into range. The same window made the trigger-avoiding
route flip east and west (seq 7063-7116) as the listed set changed.
"""

import struct

from pokebench_env.game_state import decode_text, read_game_state
from pokebench_env.readout import SERVER_FEATURES, features_off_from_env
from pokebench_env.rerender import read_state
from pokebench_env.world_context import read_world_context
from tests.env.test_world_context import COORDS, SAVE, world

SWITCH = "map-wide-triggers-v1"


def test_off_keeps_the_seven_tile_window() -> None:
    c = read_world_context(world().read, (10, 17), (0, 9), SAVE, decode_text)
    assert c is not None and c.triggers == ()


def test_on_lists_a_far_trigger_in_the_state_but_not_in_the_text() -> None:
    near = read_world_context(world().read, (10, 17), (0, 9), SAVE, decode_text)
    wide = read_world_context(
        world().read, (10, 17), (0, 9), SAVE, decode_text, map_wide_triggers=True
    )
    assert near is not None and wide is not None
    assert [(t.x, t.y) for t in wide.triggers] == [(10, 1)]
    assert wide.text() == near.text()
    assert "trigger_origin" not in wide.json()
    assert wide.json()["triggers"] != near.json()["triggers"]


def test_on_still_lists_a_nearby_trigger_in_the_text() -> None:
    off = read_world_context(world().read, (10, 2), (0, 9), SAVE, decode_text)
    on = read_world_context(
        world().read, (10, 2), (0, 9), SAVE, decode_text, map_wide_triggers=True
    )
    assert off is not None and on is not None
    assert on.text() == off.text() and "(10,1)" in on.text()
    assert on.json() == off.json()


def test_bad_script_pointers_stay_out_either_way() -> None:
    m = world()
    m.put(COORDS + 12, bytes(4))
    c = read_world_context(m.read, (10, 17), (0, 9), SAVE, decode_text, map_wide_triggers=True)
    assert c is not None and c.triggers == ()
    m = world()
    m.put(COORDS, struct.pack("<h", 100))
    c = read_world_context(m.read, (10, 2), (0, 9), SAVE, decode_text, map_wide_triggers=True)
    assert c is not None and [(t.x, t.y) for t in c.triggers] == [(100, 1)]


def test_production_reader_and_rerender_follow_the_switch() -> None:
    from tests.env.test_game_state import MAPS, OVERWORLD, SB1, game

    # test_world_context's production fixture, the trigger moved 30 rows down,
    # out of the 7-tile window.
    m = game(OVERWORLD)
    context = world()
    context.put(COORDS + 2, struct.pack("<h", 30))
    m.cells.update(context.cells)
    m.put(0x02037350, bytes(16 * 0x24))
    m.put(0x02037350, b"\x01\x00\x01")
    m.put(0x02037350 + 0x10, struct.pack("<hh", 17, 9))
    m.put(0x02037350 + 0x18, b"\x44")
    m.put(0x02037350 + 0x24, context.read(0x02037350, 0x24))
    m.put(SB1 + 0x139C + (0x4050 - 0x4000) * 2, struct.pack("<H", 0))
    assert read_game_state(m.read, MAPS).world_context.triggers == ()  # type: ignore[union-attr]
    on = read_game_state(m.read, MAPS, map_wide_triggers_enabled=True).world_context
    assert on is not None and [(t.x, t.y) for t in on.triggers] == [(10, 30)]
    rendered_on = read_state(m.read, MAPS, active_ui=True, off=frozenset())
    rendered_off = read_state(m.read, MAPS, active_ui=True, off=frozenset({SWITCH}))
    assert rendered_on.world_context is not None and rendered_off.world_context is not None
    assert len(rendered_on.world_context.triggers) == 1
    assert rendered_off.world_context.triggers == ()


def test_server_switch_is_registered_and_off_by_default() -> None:
    assert SERVER_FEATURES[-5] == SWITCH
    assert SWITCH in features_off_from_env({})
