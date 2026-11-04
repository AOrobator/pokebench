"""field-move-gates-v1: the gated flood, exit labels, field_obstacles and the readout.

The flood stays a superset of the walkable tiles: people are ignored, an obstacle closes only
when its gate is known closed (a None capability keeps it open), a closed obstacle object is a
wall, a slope (MB_MUDDY_SLOPE, ForcedMovement_MuddySlope) and a sandstorm trigger let you leave
only the way they push you, and cracked floor on the maps that set STEP_CB_CRACKED_FLOOR is a
wall (CrackedFloorPerStepCallback drops a walker through it).

Real RAM: field-moves-a8f9.json.gz (see test_field_moves.py). ROM layouts: GRANITE CAVE B1F
(24/8), ROUTE115 (0/30), RUSTURF TUNNEL (24/4), read with exit_labels.read_rom_map.
"""

import random
from dataclasses import replace

import pytest

from pokebench_env.field_moves import (
    SWITCH,
    Capabilities,
    FieldObstacles,
    MapGates,
    Obstacle,
    capabilities,
    map_gates,
    reachable,
    rom_object_obstacles,
    survey,
    terrain_obstacles,
)
from pokebench_env.readout import SERVER_FEATURES, features_off_from_env

ALL_CLOSED = capabilities((), (), (), 0)
ALL_OPEN = Capabilities(tuple((gid, True) for gid, _ in ALL_CLOSED.open))
UNKNOWN = Capabilities(tuple((gid, None) for gid, _ in ALL_CLOSED.open))
ROCK_TEXT = "It's a rugged rock, but a POKéMON may be able to smash it."
HEADER = "Field obstacles on this map (from the map's own object list and its tiles):"


def floor(width: int, height: int) -> dict[tuple[int, int], tuple[int, int]]:
    return {(x, y): (0, 0) for x in range(width) for y in range(height)}


def rock(x: int, y: int, local_id: int = 1) -> Obstacle:
    return Obstacle("rock_smash", "BREAKABLE_ROCK", ((x, y),), local_id, False)


def test_without_rules_the_flood_is_exit_reachability_v1() -> None:
    rng = random.Random(7)
    for _ in range(50):
        tiles = {
            (x, y): (int(rng.random() < 0.3), rng.choice([0, 0, 0, 0x10, 0x38, 0x3B, 0xD0]))
            for x in range(9)
            for y in range(7)
        }
        tiles[(4, 3)] = (0, 0)
        gates = map_gates(UNKNOWN, (), tiles, None)
        assert reachable(tiles, (4, 3), water=False, rules=gates.rules()) == reachable(
            tiles, (4, 3), water=False
        )


def test_a_closed_rock_is_a_wall_and_an_open_or_unknown_one_is_not() -> None:
    tiles = floor(5, 2)
    # x=2 is the only way east: two rocks fill it.
    rocks = (rock(2, 0, 1), rock(2, 1, 2))
    closed = map_gates(ALL_CLOSED, rocks, tiles, None)
    assert reachable(tiles, (0, 0), water=False, rules=closed.rules()) == {
        (0, 0),
        (1, 0),
        (0, 1),
        (1, 1),
    }
    for caps in (ALL_OPEN, UNKNOWN):
        opened = map_gates(caps, rocks, tiles, None)
        assert reachable(tiles, (0, 0), water=False, rules=opened.rules()) == set(tiles)


def test_the_gated_flood_is_always_inside_the_ungated_one() -> None:
    rng = random.Random(11)
    for _ in range(200):
        tiles = {
            (x, y): (int(rng.random() < 0.25), rng.choice([0, 0, 0, 0x10, 0x3B, 0xD0, 0xD1, 0xD5]))
            for x in range(8)
            for y in range(8)
        }
        tiles[(0, 0)] = (0, 0)
        objects = tuple(
            rock(rng.randrange(8), rng.randrange(8), i) for i in range(rng.randrange(4))
        )
        for caps in (ALL_CLOSED, ALL_OPEN, UNKNOWN):
            gates = map_gates(caps, objects, tiles, "GRANITE CAVE B1F")
            for water in (False, True):
                assert reachable(tiles, (0, 0), water=water, rules=gates.rules()) <= reachable(
                    tiles, (0, 0), water=water
                )


def test_a_slope_is_one_way_south_even_when_a_bike_is_owned() -> None:
    # A one-tile-wide passage at x=1 with slope tiles at (1,1) and (1,2).
    tiles = {(1, y): (0, 0xD0 if y in (1, 2) else 0) for y in range(4)}
    slope = terrain_obstacles(tiles, None)
    assert slope == (
        Obstacle(
            "mach_bike",
            "slope tiles (metatile behavior 0xD0)",
            ((1, 1), (1, 2)),
            None,
            None,
            (0, 1),
        ),
    )
    closed = map_gates(ALL_CLOSED, (), tiles, None).rules()
    assert reachable(tiles, (1, 0), water=False, rules=closed) == set(tiles)
    # Stepping up onto the slope is allowed; it slides you straight back down.
    assert reachable(tiles, (1, 3), water=False, rules=closed) == {(1, 2), (1, 3)}
    opened = map_gates(ALL_OPEN, (), tiles, None).rules()
    assert reachable(tiles, (1, 3), water=False, rules=opened) == {(1, 2), (1, 3)}


def test_cracked_floor_is_a_wall_only_on_maps_whose_step_callback_breaks_it() -> None:
    tiles = {(x, 0): (0, 0xD2 if x == 1 else 0) for x in range(3)}
    on_cave = map_gates(ALL_CLOSED, (), tiles, "GRANITE CAVE B1F").rules()
    assert reachable(tiles, (0, 0), water=False, rules=on_cave) == {(0, 0)}
    elsewhere = map_gates(ALL_CLOSED, (), tiles, "ROUTE104").rules()
    assert reachable(tiles, (0, 0), water=False, rules=elsewhere) == set(tiles)
    mach = map_gates(capabilities((), (), (), 1 << 1), (), tiles, "GRANITE CAVE B1F").rules()
    assert reachable(tiles, (0, 0), water=False, rules=mach) == {(0, 0)}


def test_rails_and_bumpy_slopes_are_not_opened_to_walking_by_bike_ownership() -> None:
    tiles = {(x, 0): (0, {1: 0xD1, 3: 0xD5}.get(x, 0)) for x in range(5)}
    closed = map_gates(ALL_CLOSED, (), tiles, None).rules()
    assert reachable(tiles, (0, 0), water=False, rules=closed) == {(0, 0)}
    acro = map_gates(capabilities((), (), (), 1 << 2), (), tiles, None).rules()
    assert reachable(tiles, (0, 0), water=False, rules=acro) == {(0, 0)}
    # A Mach Bike rolls along a non-isolated rail, never up a bumpy slope.
    mach = capabilities((), (), (), 1 << 1)
    tiles[(1, 0)] = (0, 0)
    assert reachable(
        tiles, (0, 0), water=False, rules=map_gates(mach, (), tiles, None).rules()
    ) == {(0, 0), (1, 0), (2, 0)}


def test_a_waterfall_pushes_a_surfer_back_south_until_waterfall_is_usable() -> None:
    tiles = {(0, y): (0, 0x13 if y == 1 else 0x10) for y in range(3)}
    closed = map_gates(ALL_CLOSED, (), tiles, None).rules()
    assert reachable(tiles, (0, 2), water=True, rules=closed) == {(0, 1), (0, 2)}
    assert reachable(tiles, (0, 0), water=True, rules=closed) == set(tiles)
    opened = map_gates(ALL_OPEN, (), tiles, None).rules()
    assert reachable(tiles, (0, 2), water=True, rules=opened) == set(tiles)


def test_the_route111_sandstorm_pushes_back_without_the_go_goggles() -> None:
    # The down triggers on row 61 (x 11..14) push a walker back south.
    tiles = {(12, y): (0, 0) for y in range(59, 64)}
    closed = map_gates(ALL_CLOSED, (), tiles, "ROUTE111").rules()
    assert reachable(tiles, (12, 63), water=False, rules=closed) == {(12, 61), (12, 62), (12, 63)}
    assert reachable(tiles, (12, 59), water=False, rules=closed) == set(tiles)
    goggles = map_gates(capabilities((), (), None, None), (), tiles, "ROUTE111")
    assert goggles.caps.of("go_goggles") is None
    assert reachable(tiles, (12, 63), water=False, rules=goggles.rules()) == set(tiles)
    # VAR_TEMP_3 = 1: the trigger already passed this visit.
    done = map_gates(ALL_CLOSED, (), tiles, "ROUTE111", sandstorm=False).rules()
    assert reachable(tiles, (12, 63), water=False, rules=done) == set(tiles)


def test_survey_names_the_obstacles_every_cut_off_way_passes() -> None:
    tiles = floor(6, 2)
    rocks = (rock(2, 0, 1), rock(2, 1, 2), rock(4, 0, 3))
    gates = map_gates(ALL_CLOSED, rocks, tiles, None)
    found = survey(tiles, (0, 0), gates, warps=((5, 1),), connections={})
    assert found.gated.warps == (((5, 1), "none"),)
    assert found.open.warps == (((5, 1), "foot"),)
    # The rock at (4,0) is behind the others, so it is not on the frontier.
    assert found.warp_blocks == {(5, 1): (0, 1)}
    assert set(found.beyond) == {0, 1}
    assert (5, 1) in found.beyond[0] and (2, 0) in found.beyond[0]


def test_survey_names_nothing_when_no_gate_is_closed() -> None:
    tiles = floor(6, 2)
    gates = map_gates(UNKNOWN, (rock(2, 0), rock(2, 1, 2)), tiles, None)
    found = survey(tiles, (0, 0), gates, warps=((5, 1),), connections={})
    assert found.gated == found.open and found.warp_blocks == {} and found.beyond == {}


# ---- ROM layouts ------------------------------------------------------------------------------


# ---- the a8f9 server state and readout ------------------------------------------------------


def test_switch_is_a_default_off_server_feature() -> None:
    assert SWITCH == "field-move-gates-v1" and SWITCH in SERVER_FEATURES
    assert SWITCH in features_off_from_env({})


def test_rock_smash_usable_opens_the_rocks() -> None:
    tiles = floor(6, 2)
    caps = capabilities(
        (),
        ("DYNAMO",),
        (),
        0,
    )
    assert caps.of("rock_smash") is False  # an empty party knows nothing
    gates = map_gates(ALL_OPEN, (rock(2, 0), rock(2, 1, 2)), tiles, None)
    assert isinstance(gates, MapGates) and not any(gates.closed(o) for o in gates.obstacles)


@pytest.mark.parametrize(
    "location",
    [
        "GRANITE CAVE B1F",
        "MIRAGE TOWER 2F",
        "MIRAGE TOWER 3F",
        "MT PYRE 2F",
        "SKY PILLAR 2F",
        "SKY PILLAR 4F",
    ],
)
def test_cracked_floor_maps_are_the_ones_that_set_the_step_callback(location: str) -> None:
    tiles = {(0, 0): (0, 0), (1, 0): (0, 0xD2)}
    assert [o.gate for o in map_gates(ALL_CLOSED, (), tiles, location).obstacles] == ["mach_bike"]


def test_a_rock_on_the_only_water_way_cuts_a_surf_exit_off_too() -> None:
    # (0,0) land, then water; a rock object sits on (2,0); the warp (4,0) is on the far shore.
    tiles = {
        (0, 0): (0, 0),
        (1, 0): (0, 0x10),
        (2, 0): (0, 0x10),
        (3, 0): (0, 0x10),
        (4, 0): (0, 0),
    }
    gates = map_gates(ALL_CLOSED, (rock(2, 0),), tiles, None)
    found = survey(tiles, (0, 0), gates, warps=((4, 0),), connections={})
    assert found.open.warps == (((4, 0), "water"),) and found.gated.warps == (((4, 0), "none"),)
    assert found.warp_blocks == {(4, 0): (0,)}
    # Nothing past the rock on foot: it lies in water.
    assert found.beyond == {}


def test_a_cut_off_map_connection_carries_the_obstacles_and_a_note() -> None:
    tiles = floor(6, 3)
    rocks = tuple(rock(2, y, y + 1) for y in range(3))
    slope = {(1, y): (0, 0) for y in range(3)}
    tiles.update(slope)
    key = ("EAST", (0, 3), 0)
    edges = (((5, 0), (5, 1), (5, 2)), ((5, 0), (5, 1), (5, 2)))
    gates = map_gates(ALL_CLOSED, rocks, tiles, None)
    found = survey(tiles, (0, 0), gates, warps=(), connections={key: edges})
    assert found.connection_blocks == {key: (0, 1, 2)}
    field = FieldObstacles(gates, found, 6, 3)
    assert field.connection_note(key) == (
        "not reachable on foot from where you stand: every way on this map to this edge passes"
        " BREAKABLE_ROCK at (2,0), (2,1) or (2,2), which needs a field move you cannot use yet"
    )
    assert field.connection_note(("WEST", (0, 3), 0)) is None and field.warp_note(0, 0) is None
    assert field.lines(str, lambda k: f"{k[0]} edge") == [
        HEADER,
        "- BREAKABLE_ROCK at (2,0), (2,1) and (2,2) close every way on foot to EAST edge: it needs"
        f' a field move you cannot use yet; the game says: "{ROCK_TEXT}"',
    ]


def test_terrain_is_also_named_when_it_cuts_off_no_exit_and_mixed_needs_say_so() -> None:
    # A corridor: rock at (1,0) or the slope column at x=3 must be passed to reach the warp (5,0).
    tiles = {(x, 0): (0, 0) for x in range(6)}
    tiles[(3, 0)] = (0, 0xD0)
    gates = map_gates(ALL_CLOSED, (rock(1, 0),), tiles, None)
    found = survey(tiles, (0, 0), gates, warps=((5, 0),), connections={})
    field = FieldObstacles(gates, found, 6, 1)
    # The rock is on the frontier; the slope lies past it.
    assert found.warp_blocks == {(5, 0): (0,)}
    assert [line.split(" close")[0] for line in field.lines(str, str)[:2]] == [
        HEADER,
        "- BREAKABLE_ROCK at (1,0)",
    ]
    mixed = FieldObstacles(gates, replace(found, warp_blocks={(5, 0): (0, 1)}), 6, 1)
    note = mixed.warp_note(5, 0)
    assert note is not None and note.endswith(
        "passes BREAKABLE_ROCK at (1,0) or slope tiles (metatile behavior 0xD0) at (3,0), which"
        " needs a field move, an item, or special movement unavailable to walking navigation"
    )
    slope_only = map_gates(ALL_CLOSED, (), tiles, None)
    alone = survey(tiles, (5, 0), slope_only, warps=((0, 0),), connections={})
    lines = FieldObstacles(slope_only, alone, 6, 1).lines(str, str)
    assert lines == [
        HEADER,
        "- slope tiles (metatile behavior 0xD0) at (3,0), which you slide down to the south on"
        " foot, closes every way on foot to (0, 0): it needs special movement that walking"
        " navigation"
        " does not perform; the game"
        " shows no message there",
    ]
    assert (
        FieldObstacles(map_gates(ALL_OPEN, (), tiles, None), alone, 6, 1).lines(str, str) == lines
    )


def test_rom_templates_skip_hidden_flags_other_sprites_and_the_bridge_kecleon() -> None:
    objects = [
        (1, 86, 4, 4, 0x3A3),  # BREAKABLE_ROCK, flag set below
        (2, 86, 5, 5, 0),
        (3, 59, 6, 6, 0),  # ITEM_BALL
        (4, 204, 12, 16, 0),  # the bridge Kecleon
        (5, 204, 20, 11, 0),
    ]
    found = rom_object_obstacles(objects, lambda flag: flag == 0x3A3, "ROUTE120")
    assert [(o.gate, o.tiles) for o in found] == [
        ("rock_smash", ((5, 5),)),
        ("devon_scope", ((20, 11),)),
    ]
    assert [o.gate for o in rom_object_obstacles(objects, lambda _f: False, "ROUTE104")] == [
        "rock_smash",
        "rock_smash",
    ]
