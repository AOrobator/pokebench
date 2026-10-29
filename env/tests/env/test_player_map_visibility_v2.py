from dataclasses import replace

import pytest
from test_player_map_visibility import field, state

from pokebench_env.player_map_visibility import MapMemory
from pokebench_env.readout import state_json


def test_v2_reveals_whole_fully_lit_current_map_beyond_camera():
    old = MapMemory().project(field(0).read, state())
    new = MapMemory().project(field(0).read, state(), whole_lit=True)
    assert len(old.full_map.tiles) < 625
    assert len(new.full_map.tiles) == 625
    assert len(new.map_visibility.visible) == 625
    assert new.full_map.rows[0][0] == "."
    assert len(new.nearby.tiles) == 625


@pytest.mark.parametrize("level", range(1, 8))
def test_v2_keeps_exact_v1_darkness_projection(level):
    old = MapMemory().project(field(level).read, state())
    new = MapMemory().project(field(level).read, state(), whole_lit=True)
    assert state_json(old) == state_json(new)
    assert len(new.full_map.tiles) < 625


def test_v2_remembers_but_does_not_refresh_hidden_terrain_when_darkness_returns():
    memory = MapMemory()
    first = memory.project(field(0).read, state(), whole_lit=True)
    assert len(first.full_map.tiles) == 625
    base = state()
    changed = replace(base, full_map=replace(base.full_map, tiles=tuple(
        replace(t, collision=1) if (t.x, t.y) == (0, 0) else t for t in base.full_map.tiles
    )))
    hidden = memory.project(field(7).read, changed, whole_lit=True)
    assert next(t for t in hidden.full_map.tiles if (t.x, t.y) == (0, 0)).collision == 0
    assert (0, 0) in hidden.map_visibility.known
    assert (0, 0) not in hidden.map_visibility.visible


@pytest.mark.parametrize("invalid", ["menu", "locked", "hidden_player", "bad_light"])
def test_v2_never_assumes_daylight_when_state_is_unverified(invalid):
    m, current = field(0), state()
    if invalid == "menu":
        current = replace(current, screen="party")
    elif invalid == "locked":
        current = replace(current, field_controls_locked=True)
    elif invalid == "hidden_player":
        m.put(0x02020630 + 0x3E, b"\x05")
    else:
        m.put(0x02010030, b"\xff")
    result = MapMemory().project(m.read, current, whole_lit=True)
    assert not result.full_map.tiles


def test_v2_whole_lit_map_exposes_static_exit_but_not_hidden_actor():
    from pokebench_env.world_context import LiveObject, WorldContext

    base = state()
    # Remote static geometry is visible in a lit map; live actors still require screen/light proof.
    current = replace(base, world_context=WorldContext((LiveObject(9, (24, 46), 1, "PERSON", 0, 0),), (), None))
    result = MapMemory().project(field(0).read, current, whole_lit=True)
    assert result.world_context.objects == ()
