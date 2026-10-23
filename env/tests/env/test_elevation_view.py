from dataclasses import replace

from test_readout import IN_GAME

from pokebench_env.adjacent_tiles import next_tiles
from pokebench_env.elevation_view import SWITCH, elevation_view
from pokebench_env.live_map import LocalMap, MapTile
from pokebench_env.readout import SERVER_FEATURES, features_off_from_env, format_readout
from pokebench_env.running import RunningPermission

ON_FOOT = 1
SURFING = 1 << 3

# Raw archive 21927 of run 2026-10-22T20-40-54_glm53-mac_0d5d (seq 126992, ROUTE110, turn 1097):
# (x, y) -> (collision, elevation, behavior). x=16-18 rows 66-68 are the raised road (elevation 4);
# rows 69-71 are bridge tiles (elevation 15) the player stands on at elevation 3.
ROUTE110 = {
    **{(x, y): (0, 4, 0x70) for x in (16, 17, 18) for y in (66, 67)},
    **{(x, 68): (0, 4, 0x7F) for x in (16, 17, 18)},
    **{(x, y): (0, 15, 0x70) for x in (16, 17, 18) for y in (69, 70, 71)},
    **{(15, y): (1, 0, 0x15) for y in (66, 67)},
    (15, 68): (1, 0, 0x00),
    **{(15, y): (0, 3, 0x00) for y in (69, 70, 71)},
    **{(19, y): (1, 0, 0x15) for y in (66, 67)},
    (19, 68): (1, 0, 0x00),
    **{(19, y): (0, 3, 0x00) for y in (69, 70, 71)},
}


def route110(player: tuple[int, int] = (17, 69)) -> LocalMap:
    tiles = tuple(
        MapTile(x, y, 0, c, b, e)
        for (x, y), (c, e, b) in sorted(ROUTE110.items(), key=lambda i: (i[0][1], i[0][0]))
    )
    rows = []
    for y in range(66, 72):
        row = ""
        for x in range(15, 20):
            c, _, _ = ROUTE110[(x, y)]
            row += "@" if (x, y) == player else "#" if c else "."
        rows.append(row)
    return LocalMap((15, 66), tuple(rows), tiles, (), ())


def adjacent(view: LocalMap, elevation: int | None) -> str:
    return next_tiles(
        view,
        (17, 69),
        coordinates=True,
        ledges=True,
        edge_walls=True,
        counters=True,
        warp_guidance=True,
        topology=None,
        on_foot=True,
        elevation=elevation,
    )


def test_the_raised_road_is_drawn_as_another_level_from_the_ground_under_it():
    original = route110()
    view, note = elevation_view(original, 3, ON_FOOT)
    assert view.rows[:3] == ("#LLL#", "#LLL#", "#LLL#")
    assert view.rows[3:] == ("..@..", ".....", ".....")
    assert note == (
        "Other levels (L): tiles at elevation 4, while you are at elevation 3. The game refuses"
        " a step onto a tile at an elevation other than yours; tiles at elevation 0 or 15 accept"
        " any elevation."
    )
    assert original.rows[0] == "#...#"
    line = adjacent(view, 3)
    assert (
        "up (17,68) another level (L), elevation 4 (yours is 3), cannot be entered from here"
        in line
    )
    assert "left (16,69) clear (.)" in line


def test_on_the_road_the_ground_below_is_the_other_level():
    view, note = elevation_view(route110(), 4, ON_FOOT)
    assert view.rows[:3] == ("#...#", "#...#", "#...#")
    assert view.rows[3] == "L.@.L"
    assert "tiles at elevation 3, while you are at elevation 4" in note


def test_no_view_while_surfing_at_elevation_zero_or_with_unknown_avatar_flags():
    original = route110()
    for elevation, flags in ((3, SURFING | ON_FOOT), (0, ON_FOOT), (3, None)):
        view, note = elevation_view(original, elevation, flags)
        assert view is original
        assert note == ""


def test_the_readout_factory_honors_the_switch_and_keeps_off_bytes():
    s = replace(
        IN_GAME,
        position=(17, 69),
        nearby=route110(),
        local_map="legacy fallback",
        player_elevation=3,
        running=RunningPermission(True, True, "test", avatar_flags=ON_FOOT),
    )
    base = frozenset({"full-map-navigation-v1"})
    off = format_readout(s, adjacent_tiles=True, off=base | {SWITCH})
    on = format_readout(s, adjacent_tiles=True, off=base)
    assert "up (17,68) clear (.)" in off
    assert "Other levels" not in off and " L " not in off
    assert "up (17,68) another level (L)" in on
    assert "Other levels (L): tiles at elevation 4" in on
    # OFF ignores the state the switch reads: no player elevation or avatar flags gives the same bytes.
    plain = replace(s, player_elevation=0, running=None)
    assert off == format_readout(plain, adjacent_tiles=True, off=base | {SWITCH})


def test_switch_is_registered_server_side_and_default_off():
    assert SWITCH == "elevation-aware-map-v1"
    assert SWITCH in SERVER_FEATURES
    assert SWITCH in features_off_from_env({})


def test_state_json_gives_each_grid_object_its_elevation_only_when_read():
    from pokebench_env.readout import state_json

    local = replace(route110(), objects=((8, 16, 71),))
    s = replace(IN_GAME, position=(17, 69), nearby=local, player_elevation=3)
    off = state_json(s)["navigation_grid"]
    on = state_json(replace(s, object_elevations=((16, 71, 4),)))["navigation_grid"]
    assert off["objects"] == [{"x": 16, "y": 71}]
    assert on["objects"] == [{"x": 16, "y": 71, "elevation": 4}]
    # Stacked objects keep one entry each, in either order; tiles beyond the window are left out.
    for stack in (((16, 71, 3), (16, 71, 4)), ((16, 71, 4), (16, 71, 3))):
        grid = state_json(replace(s, object_elevations=(*stack, (30, 90, 3))))["navigation_grid"]
        assert sorted(o["elevation"] for o in grid["objects"]) == [3, 4]


def test_object_elevations_come_from_each_loaded_objects_current_elevation():
    import struct

    from pokebench_env.elevation_view import read_object_elevations

    cells = bytearray(16 * 0x24)
    objects = ((1, 8, 16, 71, 16, 72, 4), (0, 9, 1, 1, 1, 1, 3), (1, 3, 14, 70, 14, 70, 3))
    for slot, (active, local, x, y, px, py, elevation) in enumerate(objects):
        body = bytearray(0x24)
        body[0] = active
        body[8], body[9], body[10] = local, 25, 0
        body[0x0B] = (elevation << 4) | elevation
        struct.pack_into("<hhhh", body, 0x10, x + 7, y + 7, px + 7, py + 7)
        cells[slot * 0x24 : (slot + 1) * 0x24] = body

    def read(address: int, size: int) -> bytes:
        offset = address - 0x02037350
        return bytes(cells[offset : offset + size])

    # A cyclist mid-step also holds its previous tile (DoesObjectCollideWithObjectAt).
    assert read_object_elevations(read, (0, 25)) == ((16, 71, 4), (16, 72, 4), (14, 70, 3))


def test_an_other_level_tile_above_a_directional_warp_is_not_called_shut():
    base = route110()
    tiles = tuple(replace(t, behavior=0x64) if (t.x, t.y) == (17, 69) else t for t in base.tiles)
    on_warp = replace(base, tiles=tiles, warps=((17, 69, 0, 1),))
    view, _ = elevation_view(on_warp, 3, ON_FOOT)
    up = adjacent(view, 3).split("; ")[0]
    assert up == (
        "Next tiles: up (17,68) another level (L), elevation 4 (yours is 3), but you stand on a"
        " warp whose listed activation is pressing up"
    )


def test_state_json_gives_whole_map_objects_their_elevations_only_when_read():
    from pokebench_env.live_map import FullMap
    from pokebench_env.readout import state_json

    tiles = tuple(MapTile(x, 0, 0, 0, 0, 3) for x in range(4))
    full = FullMap(4, 1, ("@...",), tiles, ((8, 2, 0),), ())
    s = replace(IN_GAME, position=(0, 0), nearby=None, full_map=full, player_elevation=3)
    assert state_json(s)["map_grid"]["objects"] == [{"x": 2, "y": 0}]
    on = state_json(replace(s, object_elevations=((2, 0, 4), (40, 99, 3))))["map_grid"]
    assert on["objects"] == [{"x": 2, "y": 0, "elevation": 4}, {"x": 40, "y": 99, "elevation": 3}]
