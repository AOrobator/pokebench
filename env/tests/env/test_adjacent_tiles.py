"""adjacent-tiles-v1: one line under the map names the four neighbouring tiles in words."""

import itertools
import re
from dataclasses import replace
from pathlib import Path

import pytest

from pokebench_env.adjacent_tiles import next_tiles
from pokebench_env.live_map import EDGE_WALLS, FullMap, LocalMap, MapTile, _symbol
from pokebench_env.readout import SERVER_FEATURES, features_off_from_env, format_readout
from pokebench_env.rerender import render
from pokebench_env.running import RunningPermission
from pokebench_env.topology import Connection, Topology
from tests.env.pocket import pocket_map, pocket_state, pocket_topology

FIXTURES = Path(__file__).resolve().parent / "fixtures"
POCKET = (
    "Next tiles: up (8,6) ledge (v), hops down only, cannot be entered from here;"
    " down (8,8) clear (.); left (7,7) clear (.); right (9,7) clear (.)"
)
SWITCHES = {
    "ledges": True,
    "edge_walls": True,
    "counters": True,
    "warp_guidance": True,
}


def line(shown, position, **kw) -> str:  # type: ignore[no-untyped-def]
    args = {
        "coordinates": True,
        **SWITCHES,
        "topology": None,
        "on_foot": True,
        **kw,
    }
    return next_tiles(shown, position, **args)


def grid(
    spec: dict[tuple[int, int], tuple[int, int]],
    position: tuple[int, int] = (5, 5),
    objects: tuple[tuple[int, int, int], ...] = (),
    warps: tuple[tuple[int, int, int, int], ...] = (),
) -> LocalMap:
    """A radius-1 window; unspecified in-map tiles are clear, (collision, behavior) otherwise."""
    px, py = position
    tiles = []
    rows = []
    for y in range(py - 1, py + 2):
        row = ""
        for x in range(px - 1, px + 2):
            if x < 0 or y < 0:
                row += "?"
                continue
            collision, behavior = spec.get((x, y), (0, 0))
            tiles.append(MapTile(x, y, 0, collision, behavior, 3))
            row += _symbol(
                (x, y),
                position,
                {(a, b) for _, a, b in objects},
                {(a, b) for a, b, _, _ in warps},
                collision,
                behavior,
            )
        rows.append(row)
    return LocalMap((px - 1, py - 1), tuple(rows), tuple(tiles), objects, warps)


def part(text: str, direction: str) -> str:
    body = text.removeprefix("Next tiles: ")
    return next(p for p in body.split("; ") if p.startswith(direction + " "))


# --- the showcase ledge pocket (turn 457, Route 101) ---------------------------------------


def test_showcase_ledge_pocket_names_the_ledge_above_and_three_clear_tiles() -> None:
    assert line(pocket_map(), (8, 7)) == POCKET


def test_on_line_sits_directly_under_the_grid_and_above_the_legend() -> None:
    text = format_readout(pocket_state(), adjacent_tiles=True)
    lines = text.split("\n")
    at = lines.index(POCKET)
    assert lines[at - 1].startswith("  14 "), lines[at - 1]
    assert lines[at + 1].startswith("@ player; N live object;"), lines[at + 1]


def test_off_readout_is_byte_identical_to_main() -> None:
    state = pocket_state()
    default_off = (FIXTURES / "adjacent-tiles-off-t457-ead18377.txt").read_text()
    all_on = (FIXTURES / "adjacent-tiles-off-all-on-t457-ead18377.txt").read_text()
    assert render(state, features_off_from_env({})) == default_off
    assert render(state, frozenset({"adjacent-tiles-v1"})) == all_on
    assert format_readout(state) == format_readout(state, frozenset(), adjacent_tiles=False)
    assert format_readout(state, frozenset({"adjacent-tiles-v1"}), adjacent_tiles=True) == (
        format_readout(state)
    )


def test_render_is_the_production_path_and_honors_the_switch() -> None:
    state = pocket_state()
    on = render(state, frozenset())
    assert POCKET in on.split("\n")
    assert on.replace(POCKET + "\n", "") == render(state, frozenset({"adjacent-tiles-v1"}))


def test_switch_is_a_default_off_server_feature() -> None:
    assert "adjacent-tiles-v1" in SERVER_FEATURES
    assert "adjacent-tiles-v1" in features_off_from_env({})
    assert "Next tiles:" not in render(pocket_state(), features_off_from_env({}))


def test_no_line_without_the_live_map() -> None:
    text = format_readout(pocket_state(), frozenset({"live-map-v1"}), adjacent_tiles=True)
    assert "Next tiles" not in text


def test_no_line_when_the_map_is_only_the_recorded_text() -> None:
    state = replace(pocket_state(), nearby=None)
    assert "Next tiles" not in format_readout(state, adjacent_tiles=True)


def test_position_hidden_names_directions_without_coordinates() -> None:
    text = format_readout(
        pocket_state(), frozenset({"live-player-position-v1"}), adjacent_tiles=True
    )
    assert (
        "Next tiles: up ledge (v), hops down only, cannot be entered from here;"
        " down clear (.); left clear (.); right clear (.)"
    ) in text.split("\n")


def test_above_the_ledge_pressing_down_is_the_hop() -> None:
    assert part(line(pocket_map((8, 5)), (8, 5)), "down") == (
        "down (8,6) ledge (v), hop over it moving down, landing 2 tiles on"
    )


def test_ledges_off_names_the_collision_the_map_draws_and_never_the_hop() -> None:
    below = line(pocket_map(), (8, 7), ledges=False)
    assert part(below, "up") == "up (8,6) collision (#), cannot be entered from here"
    above = line(pocket_map((8, 5)), (8, 5), ledges=False)
    assert part(above, "down") == "down (8,6) collision (#)"


def test_collision_free_ledge_from_the_side_makes_no_entry_claim() -> None:
    shown = grid({(5, 4): (0, 0x3B)})
    assert part(line(shown, (5, 5)), "up") == "up (5,4) ledge (v), hops down only"
    assert part(line(shown, (5, 5), ledges=False), "up") == "up (5,4) clear (.)"


def test_every_ledge_arrow_hops_only_its_own_way() -> None:
    for behavior, arrow, way in ((0x38, ">", "right"), (0x39, "<", "left"), (0x3A, "^", "up")):
        shown = grid({(5, 4): (1, behavior), (6, 5): (1, behavior)})
        up = part(line(shown, (5, 5)), "up")
        right = part(line(shown, (5, 5)), "right")
        if way == "up":
            assert up == "up (5,4) ledge (^), hop over it moving up, landing 2 tiles on"
        else:
            assert up == f"up (5,4) ledge ({arrow}), hops {way} only, cannot be entered from here"
        if way == "right":
            assert right == "right (6,5) ledge (>), hop over it moving right, landing 2 tiles on"


# --- terrain the map draws ------------------------------------------------------------------


def test_grass_clear_and_collision() -> None:
    shown = grid({(5, 4): (0, 2), (5, 6): (1, 0), (4, 5): (0, 3)})
    assert line(shown, (5, 5)) == (
        "Next tiles: up (5,4) grass (g); down (5,6) collision (#), cannot be entered from here;"
        " left (4,5) grass (g); right (6,5) clear (.)"
    )


def test_water_is_called_unwalkable_only_when_on_foot_is_verified() -> None:
    shown = grid({(5, 4): (0, 0x10)})
    assert part(line(shown, (5, 5)), "up") == "up (5,4) water (~), not walkable on foot"
    assert part(line(shown, (5, 5), on_foot=False), "up") == "up (5,4) water (~)"


@pytest.mark.parametrize(
    ("flags", "expected"),
    [
        (1, "water (~), not walkable on foot"),
        (8, "water (~)"),
        (9, "water (~)"),
        (None, "water (~)"),
    ],
)
def test_readout_reads_on_foot_from_the_avatar_flags(flags: int | None, expected: str) -> None:
    shown = grid({(5, 4): (0, 0x11)})
    state = replace(
        pocket_state(),
        position=(5, 5),
        nearby=shown,
        running=RunningPermission(True, True, "ok", avatar_flags=flags),
    )
    text = format_readout(state, adjacent_tiles=True)
    assert f"up (5,4) {expected};" in text


def test_readout_without_running_state_does_not_claim_on_foot() -> None:
    state = replace(pocket_state(), position=(5, 5), nearby=grid({(5, 4): (0, 0x12)}), running=None)
    assert "up (5,4) water (~);" in format_readout(state, adjacent_tiles=True)


def test_counter_follows_counter_talk() -> None:
    shown = grid({(5, 4): (1, 0x80)})
    assert part(line(shown, (5, 5)), "up") == (
        "up (5,4) counter (=), cannot be walked onto, face it and press A to talk to someone"
        " behind it"
    )
    assert part(line(shown, (5, 5), counters=False), "up") == (
        "up (5,4) collision (#), cannot be entered from here"
    )


def test_edge_walls_on_the_next_tile_and_on_your_own_tile() -> None:
    facing = grid({(5, 4): (0, 0x33)})
    assert part(line(facing, (5, 5)), "up") == (
        "up (5,4) edge walls (+) on its south side, cannot be entered from here"
    )
    away = grid({(5, 4): (0, 0x34)})
    assert part(line(away, (5, 5)), "up") == "up (5,4) edge walls (+) on its north+east sides"
    own = grid({(5, 5): (0, 0x35)})
    text = line(own, (5, 5))
    assert part(text, "up") == (
        "up (5,4) clear (.), but your own tile is walled on its north side,"
        " so you cannot move up from here"
    )
    assert part(text, "left") == (
        "left (4,5) clear (.), but your own tile is walled on its west side,"
        " so you cannot move left from here"
    )
    assert part(text, "down") == "down (5,6) clear (.)"


def test_edge_walls_off_draws_and_names_clear_terrain_only() -> None:
    shown = grid({(5, 4): (0, 0x33), (5, 5): (0, 0x32)})
    assert part(line(shown, (5, 5), edge_walls=False), "up") == "up (5,4) clear (.)"


def test_a_collision_tile_with_an_edge_wall_behavior_is_only_collision() -> None:
    shown = grid({(5, 4): (1, 0x33), (5, 5): (1, 0x32)})
    assert part(line(shown, (5, 5)), "up") == "up (5,4) collision (#), cannot be entered from here"


# --- objects, warps and the map edge are described, never claimed as blockers --------------


def test_object_is_described_with_its_listed_id_and_not_called_a_blocker() -> None:
    shown = grid({}, objects=((3, 5, 4), (4, 5, 4)))
    assert part(line(shown, (5, 5)), "up") == "up (5,4) person or object (N, object id 3, 4)"


def test_warp_is_described_with_the_activation_the_map_lists() -> None:
    shown = grid({(5, 4): (0, 0x69)}, warps=((5, 4, 0, 9),))
    assert part(line(shown, (5, 5)), "up") == (
        "up (5,4) warp (W) [door: approach from below and press UP toward door]"
    )
    assert part(line(shown, (5, 5), warp_guidance=False), "up") == "up (5,4) warp (W)"


def test_map_edge_names_a_connection_only_when_topology_is_shown() -> None:
    shown = grid({}, position=(0, 0))
    plain = line(shown, (0, 0))
    assert part(plain, "up") == "up (0,-1) outside this map (?)"
    assert part(plain, "left") == "left (-1,0) outside this map (?)"
    north = Topology(20, 20, (Connection("NORTH", 0, (0, 10), "OLDALE TOWN"),))
    shown_topology = line(shown, (0, 0), topology=north)
    assert part(shown_topology, "up") == (
        "up (0,-1) outside this map (?), this map's north connection is OLDALE TOWN (map 0/10)"
    )
    assert part(shown_topology, "left") == (
        "left (-1,0) outside this map (?), no connection west, cannot be entered from here"
    )


def test_two_connections_on_one_side_are_both_named() -> None:
    both = Topology(
        20,
        20,
        (Connection("NORTH", 0, (0, 10), "A"), Connection("NORTH", 10, (0, 11), "B")),
    )
    assert part(line(grid({}, position=(0, 0)), (0, 0), topology=both), "up") == (
        "up (0,-1) outside this map (?), this map's north connections are A (map 0/10)"
        " and B (map 0/11)"
    )


def test_readout_passes_topology_only_with_world_destinations() -> None:
    state = replace(pocket_state(), position=(0, 0), nearby=grid({}, position=(0, 0)))
    hidden = format_readout(state, adjacent_tiles=True)
    shown = format_readout(state, adjacent_tiles=True, world_destinations=True)
    assert "up (0,-1) outside this map (?); down" in hidden
    assert "left (-1,0) outside this map (?), no connection west" in shown
    assert "world-destinations-v1" in features_off_from_env({})
    assert "no connection" not in format_readout(
        state, frozenset({"world-destinations-v1"}), adjacent_tiles=True, world_destinations=True
    )


def test_pocket_up_edge_with_topology_names_oldale() -> None:
    shown = pocket_map((8, 0))
    assert part(line(shown, (8, 0), topology=pocket_topology()), "up") == (
        "up (8,-1) outside this map (?), this map's north connection is OLDALE TOWN (map 0/10)"
    )


# --- the whole-map view ----------------------------------------------------------------------


def whole() -> FullMap:
    rows = ("#v#", "#@.", "...")
    kinds = {"#": (1, 0), "v": (1, 0x3B)}
    tiles = tuple(
        MapTile(x, y, 0, *kinds.get(rows[y][x], (0, 0)), 3) for y in range(3) for x in range(3)
    )
    return FullMap(3, 3, rows, tiles, (), ())


def test_whole_map_line_uses_its_own_tiles_and_sits_under_its_grid() -> None:
    state = replace(pocket_state(), position=(1, 1), full_map=whole())
    text = format_readout(state, adjacent_tiles=True)
    lines = text.split("\n")
    at = next(i for i, s in enumerate(lines) if s.startswith("Next tiles"))
    assert lines[at] == (
        "Next tiles: up (1,0) ledge (v), hops down only, cannot be entered from here;"
        " down (1,2) clear (.); left (0,1) collision (#), cannot be entered from here;"
        " right (2,1) clear (.)"
    )
    assert lines[at - 1] == "   2 ...", lines[at - 1]
    assert lines[at + 1].startswith("@ player;")


def test_whole_map_edge_has_no_question_mark_glyph() -> None:
    shown = FullMap(1, 1, ("@",), (MapTile(0, 0, 0, 0, 0, 3),), (), ())
    assert line(shown, (0, 0)) == (
        "Next tiles: up (0,-1) outside this map; down (0,1) outside this map;"
        " left (-1,0) outside this map; right (1,0) outside this map"
    )


# --- parity: the line never names a glyph the map does not draw ------------------------------


BEHAVIORS = (0x00, 0x02, 0x10, 0x3B, 0x3A, 0x38, 0x39, 0x80, 0x69, *EDGE_WALLS)


@pytest.mark.parametrize("behavior", BEHAVIORS)
@pytest.mark.parametrize("collision", [0, 1])
def test_each_named_glyph_is_the_glyph_the_map_draws(behavior: int, collision: int) -> None:
    for flags in itertools.product([True, False], repeat=4):
        switches = dict(zip(SWITCHES, flags, strict=True))
        shown = grid({(5, 4): (collision, behavior), (6, 5): (collision, behavior)})
        cells = [row.split() for row in shown.text(**switches).split("\n")[2:5]]
        text = line(shown, (5, 5), **switches)
        for direction, (gx, gy) in (("up", (1, 0)), ("right", (2, 1)), ("down", (1, 2))):
            glyph = re.search(r"\((.)[,)]", part(text, direction).split(") ", 1)[1])
            assert glyph is not None, text
            assert glyph.group(1) == cells[gy][gx + 1], (direction, text, cells)
        assert "elevation" not in text and "blocked by" not in text
