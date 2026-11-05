"""rotating-gate-regions-v1: areas lettered by the harness's own walking rules, all in memory."""

import pytest
from test_rotating_gate_readouts import GATE, MAPS, SWITCHES, gate_view, gym_memory, rendered

from pokebench_env.live_map import FullMap, LocalMap, MapTile
from pokebench_env.map_observation import build_observation, render_observation
from pokebench_env.map_observation_types import MapElement
from pokebench_env.map_regions import HEADER, gate_region_lines
from pokebench_env.map_sections import build_sections
from pokebench_env.exit_labels import RomMap

REGIONS = "rotating-gate-regions-v1"
FORTREE = (12, 1)
# In a corner of the test maps, on a wall, so an arm the test does not name separates nothing.
SPARE = (0, 0, 0, 1)
BEHAVIOR = {"v": 0x3B, "~": 0x10, "]": 0x30, "W": 0x65}


def view(rows, *, objects=(), warps=(), elevations=None):
    height, width = len(rows), len(rows[0])
    tiles = tuple(
        MapTile(
            x,
            y,
            0,
            1 if rows[y][x] in "#v" else 0,
            BEHAVIOR.get(rows[y][x], 0),
            (elevations or {}).get((x, y), 3),
        )
        for y in range(height)
        for x in range(width)
    )
    return FullMap(
        width,
        height,
        tuple(rows),
        tiles,
        tuple((i + 1, x, y) for i, (x, y) in enumerate(objects)),
        tuple((x, y, 0, 0) for x, y in warps),
    )


def arm(gate, edge):
    return MapElement(
        "rotating_gate",
        edge[0],
        edge[1],
        state="arm",
        direction="east",
        group=f"gate:{gate}",
        orientation=0,
        edge=edge,
    )


def observed(shown, arms=None, *, map_id=FORTREE, unavailable=()):
    named = arms or {}
    elements = tuple(arm(g, named.get(g, SPARE)) for g in range(8))
    return build_observation(shown, map_id, (), unavailable, anywhere=elements)


def lines(rows, position, arms=None, **kwargs):
    shown = view(rows, **kwargs)
    return gate_region_lines(shown, observed(shown, arms), position)


def test_an_arm_splits_a_corridor_and_is_named_between_the_two_areas():
    assert lines(["#####", "#...#", "#####"], (1, 1), {4: (2, 1, 3, 1)}) == (
        HEADER,
        " 0  # # # # #",
        " 1  # A A B #",
        " 2  # # # # #",
        "Gate 4 has an arm between area A and area B.",
    )


def test_the_header_is_the_wording_the_probe_measured():
    assert HEADER == (
        "Walkable areas with the gates as they stand now. Tiles with the same letter connect "
        "without turning any gate. You are in area A."
    )


def test_the_players_area_is_a_even_when_smaller_and_the_rest_go_by_size():
    text = lines(["#########", "#.......#", "#########"], (7, 1), {1: (2, 1, 3, 1), 2: (6, 1, 7, 1)})
    assert text[2] == " 1  # C C B B B B A #"
    assert text[-2:] == (
        "Gate 1 has an arm between area B and area C.",
        "Gate 2 has an arm between area A and area B.",
    )


def test_an_arm_with_the_same_area_on_both_sides_gets_no_line():
    text = lines(["####", "#..#", "#..#", "####"], (1, 1), {3: (1, 1, 2, 1)})
    assert text[2:4] == (" 1  # A A #", " 2  # A A #")
    assert not any(line.startswith("Gate") for line in text)


def test_a_ledge_is_a_one_way_hop_between_two_areas_not_a_wall():
    above = lines(["#.#", "#v#", "#.#"], (1, 0))
    assert above == (
        HEADER,
        " 0  # A #",
        " 1  # # #",
        " 2  # B #",
        "A one-way step leads from area A to area B.",
    )
    below = lines(["#.#", "#v#", "#.#"], (1, 2))
    assert below[-1] == "A one-way step leads from area B to area A."


def test_a_ledge_that_loops_back_keeps_both_sides_in_one_area():
    text = lines(["...", "#v#", "...", ], (0, 0), elevations=None)
    assert text[1:4] == (" 0  A A A", " 1  # # #", " 2  B B B")
    looped = lines(["..", "v.", ".."], (0, 0))
    assert looped[1:4] == (" 0  A A", " 1  # A", " 2  A A")


def test_an_arm_across_a_ledge_landing_stops_the_hop():
    text = lines(["#.#", "#v#", "#.#"], (1, 0), {5: (1, 1, 1, 2)})
    assert not any(line.startswith("A one-way") for line in text)


def test_an_edge_wall_refuses_the_crossing_it_walls():
    assert lines(["].."], (0, 0))[1] == " 0  A B B"


def test_water_and_collision_are_not_walkable():
    assert lines(["..~.", "..#."], (0, 0))[1:3] == (" 0  A A # B", " 1  A A # B")


def test_an_elevation_mismatch_separates_tiles_the_way_the_section_rules_do():
    assert lines(["..."], (0, 0), elevations={(2, 0): 4})[1] == " 0  A A B"
    assert lines(["..."], (0, 0), elevations={(1, 0): 0, (2, 0): 4})[1] == " 0  A A A"


def test_a_live_object_blocks_its_tile_and_can_split_a_corridor():
    assert lines(["....."], (0, 0), objects=[(2, 0)])[1] == " 0  A A # B B"


def test_the_players_own_object_does_not_block_the_players_tile():
    assert lines(["..."], (0, 0), objects=[(0, 0)])[1] == " 0  A A A"


def test_a_warp_takes_the_area_it_opens_onto_and_nothing_walks_through_it():
    text = lines(["..W.."], (0, 0), warps=[(2, 0)])
    assert text[1] == " 0  A A # B B"
    assert lines(["##W##", "#...#"], (1, 1), warps=[(2, 0)])[1] == " 0  # # A # #"


def test_a_player_standing_on_a_warp_is_in_the_area_it_opens_onto():
    assert lines(["##W##", "#...#"], (2, 0), warps=[(2, 0)])[1:3] == (
        " 0  # # A # #",
        " 1  # A A A #",
    )


def test_a_player_with_no_section_gets_no_block():
    assert lines(["###"], (1, 0)) == ()


def test_more_areas_than_letters_stay_aligned():
    rows = ["." + "#." * 27]
    text = lines(rows, (0, 0))
    cells = text[1][4:].split()
    assert cells[0].strip() == "A" and cells[-1] == "AA"
    assert len({len(cell) for cell in cells}) == 1 or text[1].startswith(" 0   A")


@pytest.mark.parametrize("missing", [0, 7])
def test_a_gate_without_arms_read_means_no_block(missing):
    shown = view(["..."])
    observation = observed(shown)
    kept = tuple(e for e in observation.elements if e.group != f"gate:{missing}")
    partial = build_observation(shown, FORTREE, (), anywhere=kept)
    assert gate_region_lines(shown, partial, (0, 0)) == ()


def test_a_transitioning_gate_means_no_block():
    shown = view(["..."])
    moving = MapElement("rotating_gate", 0, 0, state="transitioning", group="gate:0")
    observation = observed(shown)
    both = build_observation(shown, FORTREE, (), anywhere=(*observation.elements, moving))
    assert gate_region_lines(shown, both, (0, 0)) == ()


def test_an_unavailable_reading_means_no_block():
    shown = view(["..."])
    observation = observed(shown, unavailable=("rotating gate memory unavailable",))
    assert gate_region_lines(shown, observation, (0, 0)) == ()


def test_only_a_gate_map_gets_a_block():
    shown = view(["..."])
    assert gate_region_lines(shown, observed(shown, map_id=(0, 9)), (0, 0)) == ()


def test_the_trick_house_puzzle_needs_its_own_eleven_gates():
    shown = view(["..."])
    assert gate_region_lines(shown, observed(shown, map_id=(29, 8)), (0, 0)) == ()
    elements = tuple(arm(g, SPARE) for g in range(11))
    every = build_observation(shown, (29, 8), (), anywhere=elements)
    assert gate_region_lines(shown, every, (0, 0))[1] == " 0  A A A"


def test_a_local_view_gets_no_block():
    shown = LocalMap((0, 0), ("...",), tuple(MapTile(x, 0, 0, 0, 0, 3) for x in range(3)), (), ())
    assert gate_region_lines(shown, observed(view(["..."])), (0, 0)) == ()


def test_the_section_builder_only_changes_when_given_arms():
    blocks = tuple((0, 0, 3, 0) for _ in range(3))
    rom = RomMap(3, 1, blocks, (), ())
    assert build_sections(rom).reaches((0, 0), (2, 0))
    cut = build_sections(rom, arms=frozenset({frozenset({(1, 0), (2, 0)})}))
    assert not cut.reaches((0, 0), (2, 0))
    assert not cut.reaches((2, 0), (0, 0))


def test_the_block_sits_right_after_the_map_key_and_before_the_element_legend():
    shown = gate_view()
    observation = build_observation(shown, FORTREE, GATE)
    plain = render_observation(shown, observation, compact=True, gate_lines=True)
    text = render_observation(
        shown, observation, compact=True, gate_lines=True, gate_regions=("first", "second")
    ).splitlines()
    at = next(i for i, line in enumerate(text) if line.startswith("Base glyph"))
    assert text[at + 1 : at + 3] == ["first", "second"]
    assert "\n".join(text[: at + 1] + text[at + 3 :]) == plain


def test_the_block_follows_the_old_key_line_too():
    shown = gate_view()
    observation = build_observation(shown, FORTREE, GATE)
    text = render_observation(shown, observation, gate_regions=("first",)).splitlines()
    assert text[text.index("first") - 1].startswith("Base glyph")


def test_production_path_honors_the_switch_and_off_is_the_same_text_without_the_block():
    memory = gym_memory()
    off = rendered(memory, SWITCHES)
    on = rendered(memory, SWITCHES | {REGIONS})
    assert HEADER not in off
    text = on.splitlines()
    at = text.index(HEADER)
    assert text[at - 1].startswith("Base glyph")
    end = at + 1
    while end < len(text) and text[end][:2].strip().isdigit():
        end += 1
    while text[end].startswith(("Gate ", "A one-way")) and " has an arm between area " in text[end]:
        end += 1
    assert "\n".join(text[:at] + text[end:]) == off


def test_the_rules_never_name_a_push():
    text = " ".join(lines(["#####", "#...#", "#####"], (1, 1), {4: (2, 1, 3, 1)}))
    for word in ("push", "should", "try", "north", "south", "east", "west"):
        assert word not in text.lower()
    assert MAPS.name(FORTREE) == "FORTREE CITY GYM"
