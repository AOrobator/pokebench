from dataclasses import replace

import pytest
from test_readout import IN_GAME

from pokebench_env.adjacent_tiles import next_tiles
from pokebench_env.field_moves import Capabilities, GATES, map_gates, reachable
from pokebench_env.live_map import LocalMap, MapTile
from pokebench_env.readout import format_readout
from pokebench_env.terrain_visibility import terrain_view


def shown(behavior: int) -> LocalMap:
    return LocalMap((0, 0), ('.', '@'), (MapTile(0, 0, 0, 0, behavior, 3), MapTile(0, 1, 0, 0, 0, 3)), (), ())


@pytest.mark.parametrize('behavior,word', [(0xD0, 'slope'), (0xD1, 'bumpy'), (0xD2, 'cracked floor'), (0x66, 'hole'), (0x0F, 'hole'), (0xD3, 'rail'), (0xD6, 'rail'), (0x20, 'ice'), (0x26, 'thin ice'), (0x27, 'cracked ice'), (0x48, 'spin'), (0x51, 'current'), (0x13, 'waterfall')])
def test_special_terrain_is_drawn_and_named_in_the_same_adjacent_readout(behavior, word):
    original = shown(behavior)
    view, note = terrain_view(original, None)
    assert view.rows[0] != '.'
    assert word in note
    line = next_tiles(view, (0, 1), coordinates=True, ledges=True, edge_walls=True, counters=True, warp_guidance=True, topology=None, on_foot=True, terrain=True)
    assert word in line
    assert 'up (0,0) clear' not in line
    assert original.rows == ('.', '@')


def test_the_readout_factory_honors_the_switch_and_keeps_off_bytes():
    local = shown(0xD0)
    s = replace(IN_GAME, position=(0, 1), nearby=local, local_map='legacy fallback')
    off = format_readout(s, off=frozenset({'field-move-gates-v1', 'full-map-navigation-v1'}))
    on = format_readout(s, off=frozenset({'full-map-navigation-v1'}))
    assert 'up (0,0) clear (.)' in off
    assert 'Special terrain' not in off
    assert 'up (0,0) muddy slope' in on
    assert 'Special terrain' in on


def test_bike_ownership_never_opens_a_walking_route_up_a_slope_or_across_fragile_floor():
    caps = Capabilities(tuple((g.id, True) for g in GATES))
    for behavior in (0xD0, 0xD1, 0xD2, 0xD3, 0xD6, 0x66):
        tiles = {(0, 0): (0, 0), (0, 1): (0, behavior), (0, 2): (0, 0)}
        gates = map_gates(caps, (), tiles, 'GRANITE CAVE B1F')
        assert (0, 0) not in reachable(tiles, (0, 2), water=False, rules=gates.rules())
        assert gates.caps.of('mach_bike') is True


def test_empty_terrain_note_and_overlay_priority():
    local = shown(0)
    assert terrain_view(local, None) == (local, '')
    local = replace(shown(0xD0), rows=('W', '@'))
    view, note = terrain_view(local, None)
    assert view.rows == ('W', '@')
    assert 'slope' in note
