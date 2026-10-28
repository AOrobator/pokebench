import json
import struct
from dataclasses import replace

import pytest

from pokebench_env.game_state import GameState
from pokebench_env.live_map import FullMap, LocalMap, MapTile
from pokebench_env.player_map_visibility import MapMemory, illumination
from pokebench_env.readout import state_json
from test_map_layout import context_memory


def field(level=7):
    m = context_memory()
    m.put(0x02010030, bytes([level]))
    body = bytearray(0x24)
    body[0] = 1
    body[2] = 1
    body[4] = 0
    body[8:11] = bytes([255, 46, 24])
    struct.pack_into('<hhhh', body, 0x10, 17, 17, 17, 17)
    m.put(0x02037350, body)
    sprite = bytearray(0x44)
    # 16x32 rendered player, feet in tile centered at (120,80).
    struct.pack_into('<HH', sprite, 0, 0x8000 | 56, 0x8000 | 112)
    sprite[0x3E] = 1
    m.put(0x02020630, sprite)
    return m


def state():
    tiles = tuple(MapTile(x, y, 0, 0, 0, 3) for y in range(25) for x in range(25))
    full = FullMap(25, 25, tuple('.' * 25 for _ in range(25)), tiles, (), ())
    return GameState('overworld', True, 'A', 'CAVE', (24, 46), (10, 10), 'up', False,
                     (), 0, (), (0, 0, 0), field_controls_locked=False,
                     full_map=full, nearby=LocalMap((0, 0), full.rows, tiles, (), ()))


def test_darkness_hides_remote_tiles_in_text_and_both_navigation_grids():
    result = MapMemory().project(field().read, state())
    payload = state_json(result)
    assert result.full_map is not None
    assert result.full_map.rows[3][4] == '?'
    assert payload['map_grid']['rows'][3][16:20] == 'ffff'
    assert not any(t['x'] == 4 and t['y'] == 3 for t in payload['navigation_grid']['tiles'])
    assert payload['map_visibility']['known']
    assert result.map_visibility is not None


def test_remembered_terrain_is_not_refreshed_when_hidden_and_maps_do_not_share_memory():
    memory = MapMemory()
    first = memory.project(field(0).read, state())
    assert first.full_map.rows[10][14] == '.'
    changed = replace(state(), full_map=replace(state().full_map,
                      tiles=tuple(replace(t, collision=1) if (t.x,t.y)==(14,10) else t
                                  for t in state().full_map.tiles)))
    hidden = memory.project(field(7).read, changed)
    tile = next(t for t in hidden.full_map.tiles if (t.x,t.y)==(14,10))
    assert tile.collision == 0
    other = memory.project(field(7).read, replace(changed, map_id=(24, 47)))
    assert all(c == '?' for row in other.full_map.rows for c in row)


@pytest.mark.parametrize('level', range(1, 8))
def test_game_flash_levels_expand_visibility_without_revealing_whole_map(level):
    narrow = MapMemory().project(field(level).read, state())
    wide = MapMemory().project(field(level - 1).read, state())
    assert len(narrow.full_map.tiles) <= len(wide.full_map.tiles)
    assert len(wide.full_map.tiles) < 25 * 25


def test_unverified_layout_or_hidden_player_never_defaults_to_full_visibility():
    m = field(0)
    m.put(0x02020630 + 0x3E, b'\x05')
    result = MapMemory().project(m.read, state())
    assert not result.full_map.tiles
    assert result.map_visibility.diagnostic
    m = field(0)
    m.put(0x02010030, b'\xff')
    assert illumination(m.read, (24,46)) is None


def test_no_fresh_geometry_is_learned_under_menus_or_locked_field():
    for current in (replace(state(), screen='party'), replace(state(), field_controls_locked=True)):
        result = MapMemory().project(field(0).read, current)
        assert not result.full_map.tiles


def test_projection_removes_template_reachability_and_offscreen_bypasses():
    from pokebench_env.heal_trainers import HealFacts, MapTrainer
    from pokebench_env.offscreen_objects import MapObject
    from pokebench_env.world_context import LiveObject, WorldContext
    current = state()
    trainer = MapTrainer(1, 4, 3, 126, 'BRAWLY', 1, False, False)
    current = replace(current,
        heal_trainers=HealFacts((trainer,), (), None, None, False, True),
        world_context=WorldContext((LiveObject(1,(24,46),126,'BRAWLY',4,3),), (), None),
        offscreen_objects=(MapObject(1,126,'BRAWLY',4,3,False),))
    result = MapMemory().project(field().read, current)
    text = json.dumps(state_json(result))
    assert 'BRAWLY' not in text
    assert not result.heal_trainers.trainers
    assert result.offscreen_objects == ()
