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
from pathlib import Path

import pytest
from test_field_moves import a8f9, fixture, operator_rom

from pokebench_env import rerender
from pokebench_env.exit_labels import arrival_text, read_rom_map, section_name
from pokebench_env.field_moves import (
    SWITCH,
    Capabilities,
    FieldObstacles,
    MapGates,
    Obstacle,
    capabilities,
    classify,
    map_gates,
    reachable,
    rom_object_obstacles,
    survey,
    terrain_obstacles,
)
from pokebench_env.game_state import MapNames
from pokebench_env.readout import SERVER_FEATURES, features_off_from_env, format_readout, state_json
from pokebench_env.rom import EMERALD_SHA1
from pokebench_env.world import InteractionTarget

ROM_START = 0x08000000
ALL_CLOSED = capabilities((), (), (), 0)
ALL_OPEN = Capabilities(tuple((gid, True) for gid, _ in ALL_CLOSED.open))
UNKNOWN = Capabilities(tuple((gid, None) for gid, _ in ALL_CLOSED.open))
ROCK_TEXT = "It's a rugged rock, but a POKéMON may be able to smash it."
ROCK_LINE = (
    "- BREAKABLE_ROCK at (24,4) and (24,5) close every way on foot to (29,16) -> VERDANTURF TOWN"
    " (map 0/14) and (18,20) -> ROUTE116 (map 0/31): it needs a field move you cannot use yet;"
    f' the game says: "{ROCK_TEXT}"'
)
HEADER = "Field obstacles on this map (from the map's own object list and its tiles):"
ROCK_NOTE = (
    "; not reachable on foot from where you stand: every way to it on this map passes"
    " BREAKABLE_ROCK at (24,4) or (24,5), which needs a field move you cannot use yet"
)


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


def test_a_slope_is_one_way_south_on_foot_until_the_mach_bike_opens_it() -> None:
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
    assert reachable(tiles, (1, 3), water=False, rules=opened) == set(tiles)


def test_cracked_floor_is_a_wall_only_on_maps_whose_step_callback_breaks_it() -> None:
    tiles = {(x, 0): (0, 0xD2 if x == 1 else 0) for x in range(3)}
    on_cave = map_gates(ALL_CLOSED, (), tiles, "GRANITE CAVE B1F").rules()
    assert reachable(tiles, (0, 0), water=False, rules=on_cave) == {(0, 0)}
    elsewhere = map_gates(ALL_CLOSED, (), tiles, "ROUTE104").rules()
    assert reachable(tiles, (0, 0), water=False, rules=elsewhere) == set(tiles)
    mach = map_gates(capabilities((), (), (), 1 << 1), (), tiles, "GRANITE CAVE B1F").rules()
    assert reachable(tiles, (0, 0), water=False, rules=mach) == set(tiles)


def test_rails_and_bumpy_slopes_block_walkers_until_a_bike_opens_them() -> None:
    tiles = {(x, 0): (0, {1: 0xD1, 3: 0xD5}.get(x, 0)) for x in range(5)}
    closed = map_gates(ALL_CLOSED, (), tiles, None).rules()
    assert reachable(tiles, (0, 0), water=False, rules=closed) == {(0, 0)}
    acro = map_gates(capabilities((), (), (), 1 << 2), (), tiles, None).rules()
    assert reachable(tiles, (0, 0), water=False, rules=acro) == set(tiles)
    # A Mach Bike rolls along a non-isolated rail, never up a bumpy slope.
    mach = capabilities((), (), (), 1 << 1)
    tiles[(1, 0)] = (0, 0)
    assert reachable(
        tiles, (0, 0), water=False, rules=map_gates(mach, (), tiles, None).rules()
    ) == set(tiles)


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


def rom_reader():
    rom = operator_rom()

    def read(address: int, length: int) -> bytes:
        if address >= ROM_START:
            return rom[address - ROM_START : address - ROM_START + length]
        return bytes(length)

    return read


def rom_tiles(map_id: tuple[int, int]):
    rom_map = read_rom_map(rom_reader(), map_id)
    assert rom_map is not None
    tiles = {
        (x, y): (block[1], block[3])
        for y in range(rom_map.height)
        for x in range(rom_map.width)
        if (block := rom_map.block(x, y)) is not None
    }
    return rom_map, tiles


def test_granite_cave_b1f_upper_ladders_need_the_mach_bike() -> None:
    rom_map, tiles = rom_tiles((24, 8))
    warps = [w[:2] for w in rom_map.warps]
    assert warps == [(25, 13), (4, 21), (29, 13), (28, 21), (8, 5), (12, 3), (29, 2)]
    # The west half: ladder #1 (4,21) from 1F; #0 and #2 are a separate east room.
    gated = map_gates(ALL_CLOSED, (), tiles, "GRANITE CAVE B1F")
    labels = dict(classify(tiles, (4, 21), warps=warps, connections={}, rules=gated.rules()).warps)
    assert [labels[w] for w in warps] == ["none", "foot", "none", "foot", "none", "none", "none"]
    ungated = dict(classify(tiles, (4, 21), warps=warps, connections={}).warps)
    assert [ungated[w] for w in warps] == ["none", "foot", "none", "foot", "foot", "foot", "foot"]
    opened = map_gates(ALL_OPEN, (), tiles, "GRANITE CAVE B1F")
    labels = dict(classify(tiles, (4, 21), warps=warps, connections={}, rules=opened.rules()).warps)
    assert labels == ungated
    # From the top ladder #4 (8,5) the slope slides you down to the lower ladders.
    top = dict(classify(tiles, (8, 5), warps=warps, connections={}, rules=gated.rules()).warps)
    assert [top[w] for w in warps] == ["none", "foot", "none", "foot", "foot", "none", "none"]
    slopes = [o for o in gated.obstacles if o.name.startswith("slope")]
    assert [o.tiles for o in slopes] == [((9, 9), (9, 10))]
    cracked = [t for o in gated.obstacles if o.name.startswith("cracked") for t in o.tiles]
    assert len(cracked) == 62


def test_route115_slope_lets_a_walker_down_but_not_back_up() -> None:
    _, tiles = rom_tiles((0, 30))
    gated = map_gates(ALL_CLOSED, (), tiles, "ROUTE115")
    slopes = [o.tiles for o in gated.obstacles if o.name.startswith("slope")]
    assert slopes == [((28, 8), (28, 9))]
    above = reachable(tiles, (28, 7), water=False, rules=gated.rules())
    below = reachable(tiles, (28, 10), water=False, rules=gated.rules())
    assert (28, 10) in above and (28, 7) not in below
    assert (28, 7) in reachable(tiles, (28, 10), water=False)


def test_destination_templates_close_the_rusturf_rocks_on_arrival() -> None:
    read = a8f9()
    save1 = int.from_bytes(read(0x03005D8C, 4), "little")
    rusturf = read_rom_map(read, (24, 4))
    assert rusturf is not None
    rocks = rom_object_obstacles(
        rusturf.objects,
        lambda flag: bool(read(save1 + 0x1270 + flag // 8, 1)[0] >> flag % 8 & 1),
        "RUSTURF TUNNEL",
    )
    assert sorted(o.tiles for o in rocks) == [((24, 4),), ((24, 5),)]
    here = read_rom_map(read, (0, 31))
    assert here is not None
    maps = MapNames.load(rerender.PORYMAP_MAPS)

    def shown(m: tuple[int, int]) -> str | None:
        return section_name(read, m)

    off = arrival_text(read, (0, 31), here, (24, 4, 0), shown, {})
    gates = (capabilities((), (), (), 1), save1, maps.name)
    on = arrival_text(read, (0, 31), here, (24, 4, 0), shown, {}, gates=gates)
    assert off is not None and "(29,16)" in off and "(18,20)" in off
    assert on == ", arriving at (4,10); from there, on foot: (4,10) -> this map at (47,8)"


# ---- the a8f9 server state and readout ------------------------------------------------------


def run_off(*, gates: bool) -> frozenset[str]:
    on = set(fixture()["harness_features"]) | ({SWITCH} if gates else set())
    return frozenset(f for f in SERVER_FEATURES if f not in on)


def a8f9_state(*, gates: bool):
    maps = MapNames.load(rerender.PORYMAP_MAPS)
    return rerender.read_state(a8f9(), maps, active_ui=True, off=run_off(gates=gates))


def a8f9_readout(*, gates: bool) -> str:
    off = run_off(gates=gates)
    env = {"POKEBENCH_FEATURES_OFF": ",".join(sorted(off)), "POKEBENCH_ACTIVE_UI": "1"}
    read = a8f9()
    maps = MapNames.load(rerender.PORYMAP_MAPS)
    return rerender.rerender(
        Path("/run"), [rerender.RawRef("a", "s")], lambda _p, _s: read, maps, env
    )[0]


def test_switch_is_a_default_off_server_feature() -> None:
    assert SWITCH == "field-move-gates-v1" and SWITCH in SERVER_FEATURES
    assert SWITCH in features_off_from_env({})


def test_off_is_the_recorded_a8f9_readout_and_state_byte_for_byte() -> None:
    recorded = fixture()["cases"][0]["readout"].split("\n")
    # The agent adds the untaken-exits, people-ledger and story-character lines after Position.
    added = recorded[8:12]
    assert added[0].startswith("Exits here you have not taken:")
    assert added[1].startswith("People and objects here")
    assert added[3].startswith("Story characters here: none.")
    assert a8f9_readout(gates=False) == "\n".join(recorded[:8] + recorded[12:])
    body = state_json(a8f9_state(gates=False))
    assert "field_obstacles" not in body
    assert body["exit_reach"] == fixture()["cases"][0]["exit_reach"]


def test_on_the_rocks_cut_off_verdanturf_and_the_route116_pocket() -> None:
    body = state_json(a8f9_state(gates=True))
    reach = body["exit_reach"]
    assert isinstance(reach, dict)
    assert reach["warps"] == [
        {"x": 4, "y": 10, "reach": "foot"},
        {"x": 29, "y": 16, "reach": "none", "blocked_by": [0, 1]},
        {"x": 18, "y": 20, "reach": "none", "blocked_by": [0, 1]},
    ]
    rows = reach["foot"]["rows"]
    bit = lambda x, y: int(rows[y][x // 4], 16) >> (3 - x % 4) & 1  # noqa: E731
    assert bit(23, 4) == 1 and bit(24, 4) == 0 and bit(25, 4) == 0 and bit(29, 16) == 0
    field = body["field_obstacles"]
    assert isinstance(field, dict)
    assert field["capabilities"]["rock_smash"] is False
    obstacles = field["obstacles"]
    assert [
        (o["id"], o["gate"], o["name"], o["kind"], o["local_id"], o["tiles"], o["open"])
        for o in obstacles
    ] == [
        (0, "rock_smash", "BREAKABLE_ROCK", "object", 2, [{"x": 24, "y": 5}], False),
        (1, "rock_smash", "BREAKABLE_ROCK", "object", 8, [{"x": 24, "y": 4}], False),
    ]
    for o in obstacles:
        assert o["text"] == ROCK_TEXT and o["needs"] == "a field move you cannot use yet"
        assert o["loaded"] is False and o["beyond"]["width"] == 36 and o["beyond"]["height"] == 24


def test_on_the_readout_names_the_rocks_and_notes_the_cut_off_warps() -> None:
    off = a8f9_readout(gates=False).split("\n")
    on = a8f9_readout(gates=True).split("\n")
    added = [line for line in on if line not in off]
    assert added == [
        HEADER,
        ROCK_LINE,
        "Warp to map 0/14 at (29,16), elevation 3; movement; activation depends on metatile (see"
        " local map); conditional; destination map 0/14 warp 4" + ROCK_NOTE,
        "Warp to map 0/31 at (18,20), elevation 3; movement; activation depends on metatile (see"
        " local map); conditional; destination map 0/31 warp 2" + ROCK_NOTE,
        "Warp destination at (29,16): VERDANTURF TOWN (not reachable on foot from where you stand)",
        "Warp destination at (18,20): ROUTE116 (not reachable on foot from where you stand)",
    ]
    assert (
        on.index(HEADER)
        == on.index("Map interaction candidates (world coordinates; flags/scripts may gate use):")
        - 2
    )


def test_without_exit_reachability_the_switch_adds_nothing() -> None:
    maps = MapNames.load(rerender.PORYMAP_MAPS)
    off = run_off(gates=True) | {"exit-reachability-v1"}
    state = rerender.read_state(a8f9(), maps, active_ui=True, off=off)
    assert state.field_obstacles is None and state.exit_reach is None


def test_rom_reader_needs_the_operator_rom() -> None:
    assert EMERALD_SHA1 and operator_rom()


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


def test_terrain_is_named_only_when_it_cuts_off_an_exit_and_mixed_needs_say_so() -> None:
    # A corridor: rock at (1,0) or the slope column at x=3 must be passed to reach the warp (5,0).
    tiles = {(x, 0): (0, 0) for x in range(6)}
    tiles[(3, 0)] = (0, 0xD0)
    gates = map_gates(ALL_CLOSED, (rock(1, 0),), tiles, None)
    found = survey(tiles, (0, 0), gates, warps=((5, 0),), connections={})
    field = FieldObstacles(gates, found, 6, 1)
    # The rock is on the frontier; the slope lies past it.
    assert found.warp_blocks == {(5, 0): (0,)}
    assert [line.split(" close")[0] for line in field.lines(str, str)] == [
        HEADER,
        "- BREAKABLE_ROCK at (1,0)",
    ]
    mixed = FieldObstacles(gates, replace(found, warp_blocks={(5, 0): (0, 1)}), 6, 1)
    note = mixed.warp_note(5, 0)
    assert note is not None and note.endswith(
        "passes BREAKABLE_ROCK at (1,0) or slope tiles (metatile behavior 0xD0) at (3,0), which"
        " needs a field move or an item you cannot use yet"
    )
    slope_only = map_gates(ALL_CLOSED, (), tiles, None)
    alone = survey(tiles, (5, 0), slope_only, warps=((0, 0),), connections={})
    lines = FieldObstacles(slope_only, alone, 6, 1).lines(str, str)
    assert lines == [
        HEADER,
        "- slope tiles (metatile behavior 0xD0) at (3,0), which you slide down to the south on"
        " foot, closes every way on foot to (0, 0): it needs an item you do not have yet; the game"
        " shows no message there",
    ]
    assert FieldObstacles(map_gates(ALL_OPEN, (), tiles, None), alone, 6, 1).lines(str, str) == []


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


def test_readout_names_unknown_dynamic_warps_and_connections_it_cuts_off() -> None:
    state = a8f9_state(gates=True)
    field = state.field_obstacles
    assert field is not None
    dynamic = InteractionTarget("warp", 7, 7, 3, "movement", destination=(127, 127, 0))
    blocks = {(29, 16): (0,), (7, 7): (0,), (99, 99): (0,)}
    reshaped = FieldObstacles(
        field.gates,
        replace(field.survey, warp_blocks=blocks, connection_blocks={("NORTH", (0, 3), 0): (1,)}),
        field.width,
        field.height,
    )
    targets = (*(state.interaction_targets or ()), dynamic)
    text = format_readout(
        replace(state, field_obstacles=reshaped, interaction_targets=targets),
        run_off(gates=True),
    )
    assert (
        "- BREAKABLE_ROCK at (24,5) closes every way on foot to (29,16) -> VERDANTURF TOWN"
        " (map 0/14), (7,7) -> dynamic destination and (99,99): it needs a field move"
    ) in text
    assert (
        "- BREAKABLE_ROCK at (24,4) closes every way on foot to NORTH edge -> map 0/3 (map 0/3)"
        in text
    )


def test_unreadable_templates_leave_the_flood_ungated() -> None:
    maps = MapNames.load(rerender.PORYMAP_MAPS)
    read = a8f9()
    save1 = int.from_bytes(read(0x03005D8C, 4), "little")

    def blind(address: int, length: int) -> bytes:
        if save1 + 0xC70 <= address < save1 + 0xC70 + 64 * 24:
            raise ValueError("templates unreadable")
        return read(address, length)

    state = rerender.read_state(blind, maps, active_ui=True, off=run_off(gates=True))
    assert state.field_obstacles is None and state.exit_reach is not None
    assert [how for _, how in state.exit_reach.warps] == ["foot", "foot", "foot"]
