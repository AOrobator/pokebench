"""Cross-provider contract checks; these are not an independent review verdict."""

import json
import subprocess
import sys
from dataclasses import fields
from pathlib import Path

from pokebench_env.adjacent_tiles import next_tiles
from pokebench_env.live_map import LocalMap, MapTile
from pokebench_env.map_observation import (
    KIND_TOKENS,
    build_observation,
    element_label,
    element_token,
    observed_elements,
    render_observation,
)
from pokebench_env.map_observation_types import MapElement
from pokebench_env.map_terrain_elements import terrain_elements
from pokebench_env.map_tile_elements import tile_elements

ROOT = Path(__file__).resolve().parents[3]


def test_one_canonical_schema_covers_every_provider_and_both_generated_contracts():
    schema = json.loads((ROOT / "schemas/map-observation-v1.json").read_text())
    element = schema["properties"]["elements"]["items"]
    assert set(element["properties"]) == {field.name for field in fields(MapElement)}
    assert set(element["properties"]["kind"]["enum"]) == set(KIND_TOKENS)
    subprocess.run(
        [sys.executable, str(ROOT / "scripts/map-observation-schema.py"), "--check"],
        check=True,
        capture_output=True,
        text=True,
    )


def test_visible_semantic_signatures_have_no_cross_provider_token_collisions():
    terrain = tuple(
        element
        for behavior in range(0xF0)
        for element in terrain_elements(MapTile(0, 0, 0, 0, behavior))
    )
    puzzles = tuple(
        element
        for map_id, tile in [
            ((14, 0), MapTile(0, 0, 0x250, 0, 0)),
            ((14, 0), MapTile(0, 0, 0x254, 0, 0)),
            ((14, 0), MapTile(0, 0, 0x25C, 0, 0)),
            ((24, 53), MapTile(0, 0, 0x236, 0, 0)),
            ((24, 53), MapTile(0, 0, 0x24F, 0, 0)),
            ((8, 1), MapTile(1, 105, 0x220, 1, 0)),
            ((8, 1), MapTile(1, 105, 0x224, 1, 0)),
        ]
        for element in tile_elements(map_id, tile)
    )
    by_token: dict[str, str] = {}
    for element in terrain + puzzles:
        token, label = element_token(element), element_label(element)
        assert by_token.setdefault(token, label) == label, token
    assert element_token(MapElement("slippery_floor", 0, 0)) != element_token(
        MapElement("spin_mat", 0, 0)
    )
    assert (
        len(
            {
                element_token(MapElement(kind, 0, 0, direction=direction))
                for kind in ("forced_walk", "forced_slide", "current")
                for direction in ("north", "east", "south", "west")
            }
        )
        == 12
    )


def test_current_view_discards_outside_elements_without_erasing_an_occupant():
    shown = LocalMap((4, 7), ("@",), (MapTile(4, 7, 0x259, 0, 0),), (), ())
    observation = build_observation(
        shown,
        (29, 4),
        observed_elements(shown, (29, 4)) + (MapElement("switch", 30, 7, color="red"),),
    )
    assert len(observation.elements) == 1
    rendered = render_observation(shown, observation)
    assert "@/S:dn" in rendered and "red switch" not in rendered
    assert shown.rows == ("@",)


def test_edges_touching_the_top_or_left_of_a_local_view_are_drawn_at_its_boundary():
    shown = LocalMap((7, 7), ("@",), (MapTile(7, 7, 0, 0, 0),), (), ())
    for edge, mark in [((7, 6, 7, 7), "-"), ((6, 7, 7, 7), "|")]:
        observation = build_observation(
            shown,
            (12, 1),
            (MapElement("rotating_gate", 7, 7, state="arm", edge=edge),),
        )
        grid = render_observation(shown, observation).split("Base glyph", 1)[0]
        geometry = "\n".join(
            line for line in grid.splitlines() if not line.startswith("Current map")
        )
        assert mark in geometry


def test_transition_anchor_does_not_invent_a_pivot_at_the_anchor_coordinate():
    shown = LocalMap((7, 7), ("@",), (MapTile(7, 7, 0, 0, 0),), (), ())
    observation = build_observation(
        shown,
        (12, 1),
        (MapElement("rotating_gate", 7, 7, state="transitioning", group="gate:0"),),
    )
    text = render_observation(shown, observation)
    assert "*" not in text.split("Base glyph", 1)[0]
    assert "junction (7,7)" not in text
    assert "transitioning" in text


def test_adjacent_element_identity_preserves_collision_and_water_constraints():
    for behavior, collision, glyph, element, constraint in [
        (0x8D, 1, "#", MapElement("door", 0, 0, state="unlocked"), "collision set"),
        (0x10, 0, "~", MapElement("water", 0, 0, state="pond"), "not walkable on foot"),
    ]:
        shown = LocalMap(
            (0, 0),
            (glyph, "@"),
            (MapTile(0, 0, 0, collision, behavior), MapTile(0, 1, 0, 0, 0)),
            (),
            (),
        )
        observation = build_observation(shown, (1, 1), (element,))
        line = next_tiles(
            shown,
            (0, 1),
            coordinates=True,
            ledges=True,
            edge_walls=True,
            counters=True,
            warp_guidance=True,
            topology=None,
            on_foot=True,
            observation=observation,
        )
        assert element_label(element) in line
        assert constraint in line


def test_gate_junction_and_base_edge_wall_use_different_marks():
    shown = LocalMap((0, 0), ("+.", ".."), (MapTile(0, 0, 0, 0, 0x30),), (), ())
    observation = build_observation(
        shown, (12, 1), (MapElement("rotating_gate", 1, 1, state="pivot"),)
    )
    text = render_observation(shown, observation)
    grid = text.split("Base glyph", 1)[0]
    assert "+" in grid and "*" in grid, text
    assert "A + inside a cell remains a base edge wall" in text, text


def test_field_boundary_requires_current_closed_gate_and_retains_underlying_layers():
    from pokebench_env.field_moves import GATES, Capabilities, map_gates

    shown = LocalMap((11, 61), ("@",), (MapTile(11, 61, 0, 0, 0x21),), (), ())
    for available in (False, True, None):
        caps = Capabilities(tuple((g.id, available) for g in GATES))
        gates = map_gates(caps, (), {(11, 61): (0, 0x21)}, "ROUTE111")
        elements = observed_elements(shown, (0, 26), field_gates=gates)
        assert any(e.kind == "sandstorm_boundary" for e in elements) is (available is False), (
            elements
        )
        if available is False:
            text = render_observation(shown, build_observation(shown, (0, 26), elements))
            assert "@/Gr:sand/Ss:X" in text, text
            collision = LocalMap((11, 61), ("#",), (MapTile(11, 61, 0, 1, 0x21),), (), ())
            assert not any(
                e.kind == "sandstorm_boundary"
                for e in observed_elements(collision, (0, 26), field_gates=gates)
            )


def test_other_closed_field_obstacles_are_not_mislabeled_as_sandstorm():
    from pokebench_env.field_moves import GATES, Capabilities, MapGates, Obstacle

    shown = LocalMap((11, 61), (".",), (MapTile(11, 61, 0, 0, 0),), (), ())
    gates = MapGates(
        Capabilities(tuple((g.id, False) for g in GATES)),
        (Obstacle("mach_bike", "rail", ((11, 61),), None, None),),
    )
    assert gates.closed(gates.obstacles[0])
    assert not any(
        e.kind == "sandstorm_boundary" for e in observed_elements(shown, (0, 26), field_gates=gates)
    )
