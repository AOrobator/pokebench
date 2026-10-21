"""trainer-sight-check-v1: which planned route tiles an unbeaten trainer can see, by the game rule.

pret/pokeemerald 731ad5bf src/trainer_see.c (CheckForTrainersWantingBattle, CheckTrainer,
GetTrainerApproachDistance, CheckPathBetweenTrainerAndPlayer) and src/event_object_movement.c
(GetCollisionFlagsAtCoords, GetCollisionAtCoords, IsElevationMismatchAt, AreElevationsCompatible,
IsMetatileDirectionallyImpassable, DoesObjectCollideWithObjectAt). The synthetic memory lays out
an 8x8 map at elevation 3; the real-RAM fixture is b300's RUSTBORO CITY GYM at seq 15233.
"""

import functools
import json
import os
import struct
from pathlib import Path

import pytest
from fastapi import FastAPI
from test_checkpoint import post

from pokebench_env.game_state import MapNames
from pokebench_env.observation import install_observation
from pokebench_env.rom import EMERALD_SHA1, RomError, resolve_rom
from pokebench_env.trainer_sight import (
    MAX_ROUTE_TILES,
    SWITCH,
    movement_facings,
    sight_report,
)

SB1 = 0x02025A18
MAP = (11, 3)
LAYOUT = 0x02001000
BUFFER = 0x02005000
WIDTH, HEIGHT = 8, 8
SCRIPT = 0x08200000
SCRIPT_NONE = 0x08200100
ATTRIBUTES = 0x02007000


class Memory:
    def __init__(self) -> None:
        self.cells: dict[int, int] = {}

    def put(self, address: int, body: bytes) -> None:
        self.cells.update({address + i: b for i, b in enumerate(body)})

    def read(self, address: int, length: int) -> bytes:
        return bytes(self.cells.get(address + i, 0) for i in range(length))

    def __call__(self, address: int, length: int) -> bytes:
        return self.read(address, length)


def world() -> Memory:
    m = Memory()
    m.put(0x03005D8C, struct.pack("<II", SB1, 0x02024A6C))
    m.put(SB1, struct.pack("<hhBB", 0, 0, *MAP))
    m.put(0x03005DC0, struct.pack("<III", WIDTH + 15, HEIGHT + 14, BUFFER))
    m.put(0x02037318, struct.pack("<II", LAYOUT, 0x02002000))
    m.put(LAYOUT, struct.pack("<IIIIII", WIDTH, HEIGHT, 0, 0, 0x02003000, 0x02004000))
    m.put(0x02003010, struct.pack("<I", ATTRIBUTES))
    m.put(0x02004010, struct.pack("<I", 0x02008000))
    for y in range(HEIGHT):
        for x in range(WIDTH):
            block(m, x, y)
    # trainerbattle TRAINER_BATTLE_SINGLE, trainer 321; a double one at +8; a plain msgbox script.
    m.put(SCRIPT, bytes([0x5C, 0x00]) + struct.pack("<H", 321))
    m.put(SCRIPT + 8, bytes([0x5C, 0x04]) + struct.pack("<H", 322))
    m.put(SCRIPT_NONE, bytes([0x0F, 0x00, 0x00, 0x00]))
    return m


def block(
    m: Memory, x: int, y: int, *, collision: int = 0, elevation: int = 3, metatile: int = 0
) -> None:
    value = metatile | (collision << 10) | (elevation << 12)
    m.put(BUFFER + 2 * ((y + 7) * (WIDTH + 15) + x + 7), struct.pack("<H", value))


def behavior(m: Memory, metatile: int, value: int) -> None:
    m.put(ATTRIBUTES + 2 * metatile, struct.pack("<H", value))


def template(
    m: Memory,
    slot: int,
    local_id: int,
    x: int,
    y: int,
    *,
    movement: int = 0x09,
    trainer_type: int = 1,
    sight: int = 3,
    script: int = SCRIPT,
    hide: int = 0,
    elevation: int = 3,
    graphics: int = 35,
    range_xy: int = 0,
) -> None:
    entry = bytearray(24)
    entry[0], entry[1] = local_id, graphics
    struct.pack_into("<hh", entry, 4, x, y)
    entry[8], entry[9], entry[10] = elevation, movement, range_xy
    struct.pack_into("<HHIH", entry, 0x0C, trainer_type, sight, script, hide)
    m.put(SB1 + 0xC70 + slot * 24, bytes(entry))


def loaded(
    m: Memory,
    slot: int,
    local_id: int,
    x: int,
    y: int,
    *,
    facing: int = 3,
    trainer_type: int = 1,
    sight: int = 3,
    previous: tuple[int, int] | None = None,
    movement: int = 0x09,
    elevation: int = 3,
    player: bool = False,
    map_id: tuple[int, int] = MAP,
) -> None:
    body = bytearray(0x24)
    body[0] = 1
    body[2] = int(player)
    body[6], body[7], body[8] = movement, trainer_type, local_id
    body[9], body[10] = map_id[1], map_id[0]
    body[0x0B] = elevation
    px, py = previous if previous is not None else (x, y)
    struct.pack_into("<hhhhhh", body, 0x0C, x + 7, y + 7, x + 7, y + 7, px + 7, py + 7)
    body[0x18] = facing
    body[0x1D] = sight
    m.put(0x02037350 + slot * 0x24, bytes(body))


def flag(m: Memory, number: int) -> None:
    address = SB1 + 0x1270 + number // 8
    m.put(address, bytes([m.read(address, 1)[0] | 1 << (number % 8)]))


def seen(m: Memory, route: list[tuple[int, int]]) -> list[tuple[int, int, tuple[int, int]]]:
    report = sight_report(m, MAP, route)
    assert report["available"] is True
    sightings = report["sightings"]
    assert isinstance(sightings, list)
    return [(s["local_id"], s["step"], tuple(s["tile"])) for s in sightings]


ROW = [(4, 2), (3, 2), (2, 2), (1, 2), (0, 2)]


def test_a_trainer_facing_left_sees_its_row_up_to_its_sight_range() -> None:
    m = world()
    template(m, 0, 3, 5, 2)
    assert seen(m, ROW) == [(3, 1, (4, 2))]
    assert seen(m, ROW[1:]) == [(3, 1, (3, 2))]
    assert seen(m, ROW[3:]) == []  # (1,2) is 4 tiles away; sight 3
    assert seen(m, [(5, 1), (6, 2), (5, 3)]) == []  # beside it and behind it


def test_the_report_names_the_trainer_with_its_template_tile_facing_and_sight() -> None:
    m = world()
    template(m, 0, 5, 1, 1, movement=0x08, graphics=55, range_xy=0x11)
    report = sight_report(m, MAP, [(1, 4), (1, 3)])
    assert report == {
        "available": True,
        "map_id": [11, 3],
        "trainers": [
            {
                "local_id": 5,
                "graphics_id": 55,
                "sprite_kind": "HIKER",
                "trainer_id": 321,
                "double": False,
                "x": 1,
                "y": 1,
                "facing": "DOWN",
                "sight": 3,
                "loaded": False,
            }
        ],
        "sightings": [{"local_id": 5, "step": 1, "tile": [1, 4], "from": [1, 1], "facing": "DOWN"}],
    }


@pytest.mark.parametrize(
    "between",
    [
        {"collision": 1},  # MapGridGetCollisionAt
        {"elevation": 4},  # IsElevationMismatchAt against the trainer's elevation 3
    ],
)
def test_collision_or_another_elevation_between_blocks_the_line(between: dict[str, int]) -> None:
    m = world()
    template(m, 0, 3, 5, 2)
    block(m, 3, 2, **between)
    assert seen(m, [(2, 2)]) == []
    assert seen(m, [(4, 2)]) == [(3, 1, (4, 2))]


@pytest.mark.parametrize("elevation", [0, 15])
def test_transition_and_multi_level_tiles_do_not_block(elevation: int) -> None:
    m = world()
    template(m, 0, 3, 5, 2)
    block(m, 3, 2, elevation=elevation)
    block(m, 2, 2, elevation=elevation)
    assert seen(m, [(2, 2)]) == [(3, 1, (2, 2))]


def test_the_players_tile_must_be_passable_at_the_trainers_elevation() -> None:
    m = world()
    template(m, 0, 3, 5, 2)
    block(m, 3, 2, elevation=4)
    block(m, 4, 2, collision=1)
    assert seen(m, [(3, 2), (4, 2)]) == []


def test_a_trainer_at_elevation_zero_sees_across_any_height() -> None:
    m = world()
    template(m, 0, 3, 5, 2, elevation=0)
    block(m, 3, 2, elevation=4)
    assert seen(m, [(2, 2)]) == [(3, 1, (2, 2))]


def test_objects_between_block_the_line_at_their_tile_now_or_their_previous_tile() -> None:
    m = world()
    template(m, 0, 3, 5, 2)
    loaded(m, 0, 7, 0, 0, previous=(3, 2))
    assert seen(m, [(2, 2)]) == []
    loaded(m, 0, 7, 3, 2, elevation=4)  # AreElevationsCompatible(3, 4) is false
    assert seen(m, [(2, 2)]) == [(3, 1, (2, 2))]


def test_an_object_not_loaded_never_blocks_the_line() -> None:
    # DoesObjectCollideWithObjectAt walks only the active gObjectEvents.
    m = world()
    template(m, 0, 3, 5, 2)
    template(m, 1, 8, 3, 2, trainer_type=0, script=SCRIPT_NONE)
    assert seen(m, [(2, 2)]) == [(3, 1, (2, 2))]
    loaded(m, 0, 8, 3, 2)
    assert seen(m, [(2, 2)]) == []


def test_a_wandering_template_with_range_zero_wanders_one_tile_as_it_spawns() -> None:
    # sMovementTypeHasRange: a range of 0 becomes 1 when the object is loaded.
    m = world()
    template(m, 0, 3, 4, 4, movement=0x05, range_xy=0x00)  # WANDER_LEFT_AND_RIGHT
    assert seen(m, [(0, 3)]) == [(3, 1, (0, 3))]
    m = world()
    template(m, 0, 3, 4, 4, movement=0x09, range_xy=0x00)  # FACE_LEFT does not move
    assert seen(m, [(1, 3)]) == []


def test_the_player_never_blocks_the_line() -> None:
    m = world()
    template(m, 0, 3, 5, 2)
    loaded(m, 0, 0xFF, 3, 2, player=True)
    assert seen(m, [(2, 2)]) == [(3, 1, (2, 2))]


def test_directional_walls_block_by_the_side_entered_and_the_trainers_own_tile() -> None:
    m = world()
    template(m, 0, 3, 5, 2)
    behavior(m, 1, 0x30)  # MB_IMPASSABLE_EAST: looking west, a step enters its east side
    block(m, 3, 2, metatile=1)
    assert seen(m, [(2, 2)]) == []
    m = world()
    template(m, 0, 3, 5, 2)
    behavior(m, 2, 0x31)  # MB_IMPASSABLE_WEST under the trainer: it cannot look out west
    block(m, 5, 2, metatile=2)
    assert seen(m, [(4, 2)]) == []


def test_beaten_hidden_and_non_seeing_trainers_are_left_out() -> None:
    m = world()
    template(m, 0, 3, 5, 2)
    flag(m, 0x500 + 321)  # GetTrainerFlagFromScriptPointer: beaten
    assert seen(m, ROW) == []
    for kwargs in [
        {"trainer_type": 0},
        {
            "trainer_type": 2
        },  # TRAINER_TYPE_SEE_ALL_DIRECTIONS: CheckForTrainersWantingBattle skips it
        {"script": SCRIPT_NONE},
        {"script": 0x02000000},
        {"hide": 0x21},
    ]:
        m = world()
        flag(m, 0x21)
        template(m, 0, 3, 5, 2, **kwargs)  # type: ignore[arg-type]
        assert sight_report(m, MAP, ROW)["trainers"] == []


def test_a_buried_trainer_looks_all_four_ways() -> None:
    m = world()
    template(m, 0, 3, 4, 4, trainer_type=3, movement=0x3F)
    assert seen(m, [(4, 6), (0, 4)]) == [(3, 1, (4, 6))]
    assert seen(m, [(0, 4), (7, 4), (4, 1)]) == [(3, 2, (7, 4))]


def test_turning_and_wandering_movement_types_cover_every_way_they_face() -> None:
    assert movement_facings(0x0D) == (1, 2)  # FACE_DOWN_AND_UP
    assert movement_facings(0x08) == (1,)
    assert movement_facings(0x4A) == (3,)  # RUN_IN_PLACE_LEFT
    assert movement_facings(0x3F) == (1,)  # BURIED faces south
    m = world()
    template(m, 0, 3, 4, 4, movement=0x0D)
    assert seen(m, [(4, 2)]) == [(3, 1, (4, 2))]
    assert seen(m, [(4, 6)]) == [(3, 1, (4, 6))]
    assert seen(m, [(2, 4), (6, 4)]) == []
    m = world()
    template(m, 0, 3, 4, 4, movement=0x05, range_xy=0x01)  # WANDER_LEFT_AND_RIGHT, range x 1
    report = sight_report(m, MAP, [(0, 4)])
    assert report["sightings"] == [
        {"local_id": 3, "step": 1, "tile": [0, 4], "from": [3, 4], "facing": "LEFT"}
    ]


def test_a_loaded_trainer_is_tested_at_its_tile_now_with_its_facing_now() -> None:
    m = world()
    template(m, 0, 3, 5, 2)
    loaded(m, 1, 3, 5, 5, facing=2, movement=0x09)  # moved to (5,5), facing UP
    report = sight_report(m, MAP, [(5, 3), (2, 5)])
    trainers = report["trainers"]
    assert isinstance(trainers, list)
    assert trainers[0]["loaded"] is True
    assert (trainers[0]["x"], trainers[0]["y"], trainers[0]["facing"]) == (5, 5, "UP")
    assert seen(m, [(5, 3), (2, 5)]) == [(3, 1, (5, 3))]
    loaded(m, 1, 3, 5, 5, facing=2, trainer_type=0)  # the live trainerType wins
    assert sight_report(m, MAP, [(5, 3)])["trainers"] == []


def test_double_battle_trainers_are_marked_for_the_agent_to_judge() -> None:
    m = world()
    template(m, 0, 4, 5, 2, script=SCRIPT + 8)
    trainers = sight_report(m, MAP, ROW)["trainers"]
    assert isinstance(trainers, list)
    assert (trainers[0]["trainer_id"], trainers[0]["double"]) == (322, True)


def test_no_report_off_this_map_or_when_memory_cannot_be_read() -> None:
    m = world()
    assert sight_report(m, (0, 3), ROW) == {
        "available": False,
        "reason": "the player is on map 11/3, not 0/3",
    }
    m.put(0x03005D8C, struct.pack("<I", 0x01000000))
    assert sight_report(m, MAP, ROW) == {"available": False, "reason": "save data unreadable"}
    m = world()
    m.put(0x03005DC0, struct.pack("<III", 1, 1, BUFFER))
    assert sight_report(m, MAP, ROW) == {"available": False, "reason": "map grid unreadable"}

    def broken(address: int, length: int) -> bytes:
        if address == SB1 + 0xC70:
            raise ValueError("read outside archived memory")
        return world().read(address, length)

    assert sight_report(broken, MAP, ROW) == {
        "available": False,
        "reason": "game memory unreadable",
    }


def test_the_endpoint_serves_the_report_under_the_memory_lock_and_bounds_the_route() -> None:
    m = world()
    template(m, 0, 3, 5, 2)
    entered: list[str] = []

    class Lock:
        def __enter__(self) -> None:
            entered.append("in")

        def __exit__(self, *_: object) -> None:
            entered.append("out")

    app = FastAPI()
    install_observation(app, lambda: None, m.read, MapNames({}), Lock())  # type: ignore[arg-type,return-value]
    body = json.dumps({"map_id": [11, 3], "tiles": [[4, 2]]}).encode()
    status, reply = post(app, "/pokebench/trainer-sight", body)
    assert status == 200
    assert json.loads(reply)["sightings"] == [
        {"local_id": 3, "step": 1, "tile": [4, 2], "from": [5, 2], "facing": "LEFT"}
    ]
    assert entered == ["in", "out"]
    too_long = {"map_id": [11, 3], "tiles": [[0, 0]] * (MAX_ROUTE_TILES + 1)}
    assert post(app, "/pokebench/trainer-sight", json.dumps(too_long).encode())[0] == 422
    short = json.dumps({"map_id": [11], "tiles": []}).encode()
    assert post(app, "/pokebench/trainer-sight", short)[0] == 422


def test_the_switch_id() -> None:
    assert SWITCH == "trainer-sight-check-v1"


# --- real RAM: b300's RUSTBORO CITY GYM, with the operator's ROM ------------------------------
# The fixture holds the RAM windows (never ROM bytes) sight_report read from b300's raw-RAM archive
# 6600, the state of seq 15233 (turn 501, before navigate_to to (5,2)), and the route the agent's
# planner gives from (5,15). pokeemerald data/maps/RustboroCity_Gym/map.json places YOUNGSTER
# TOMMY (object 3, TRAINER_TOMMY 321) at (3,9) facing left with sight 3 and HIKER MARC (object 5,
# TRAINER_MARC 571) at (1,6) facing down with sight 3; JOSH (object 2, 320) was already beaten.

B300 = json.loads((Path(__file__).parent / "fixtures/trainer-sight-b300.json").read_text())
ROM_START = 0x08000000


@functools.cache
def operator_rom() -> bytes:
    try:
        return resolve_rom(os.environ, EMERALD_SHA1).read_bytes()
    except RomError:
        pytest.skip("POKEBENCH_ROM is not set to the Emerald ROM")


def b300(seq: int, *, beaten: tuple[int, ...] = ()):  # type: ignore[no-untyped-def]
    frame = next(f for f in B300["frames"] if f["seq"] == seq)
    cells: dict[int, int] = {}
    for window in frame["windows"]:
        start = int(window["address"], 16)
        for offset, value in enumerate(bytes.fromhex(window["hex"])):
            cells[start + offset] = value
    save1 = int.from_bytes(bytes(cells[0x03005D8C + i] for i in range(4)), "little")
    for trainer in beaten:
        number = 0x500 + trainer
        cells[save1 + 0x1270 + number // 8] |= 1 << (number % 8)
    rom = operator_rom()

    def read(address: int, length: int) -> bytes:
        if address >= ROM_START:
            return rom[address - ROM_START : address - ROM_START + length]
        return bytes(cells[address + i] for i in range(length))

    return read, frame


def test_b300_turn_501_route_walks_into_tommy_and_marc_at_1_9() -> None:
    read, frame = b300(15233)
    report = sight_report(read, (11, 3), [tuple(t) for t in frame["route"]])
    assert report == frame["report"]
    trainers = report["trainers"]
    assert isinstance(trainers, list)
    assert [
        (
            t["local_id"],
            t["sprite_kind"],
            t["trainer_id"],
            t["x"],
            t["y"],
            t["facing"],
            t["sight"],
            t["loaded"],
        )
        for t in trainers
    ] == [
        (3, "YOUNGSTER", 321, 3, 9, "LEFT", 3, True),
        (5, "HIKER", 571, 1, 6, "DOWN", 3, False),
    ]
    assert report["sightings"] == [
        {"local_id": 3, "step": 12, "tile": [1, 9], "from": [3, 9], "facing": "LEFT"},
        {"local_id": 5, "step": 12, "tile": [1, 9], "from": [1, 6], "facing": "DOWN"},
    ]


def test_b300_with_tommy_beaten_marc_sees_the_next_tile_up_from_1_9() -> None:
    read, frame = b300(15233, beaten=(321,))
    tail = [tuple(t) for t in frame["route"][12:]]
    assert tail[0] == (1, 8)
    report = sight_report(read, (11, 3), tail)
    assert report["sightings"] == [
        {"local_id": 5, "step": 1, "tile": [1, 8], "from": [1, 6], "facing": "DOWN"}
    ]


def test_a_loaded_buried_trainer_looks_all_ways_and_a_bad_facing_falls_back() -> None:
    m = world()
    template(m, 0, 3, 4, 4, trainer_type=3, movement=0x3F)
    loaded(m, 1, 3, 4, 4, facing=1, trainer_type=3, movement=0x3F)
    assert seen(m, [(4, 2)]) == [(3, 1, (4, 2))]
    m = world()
    template(m, 0, 3, 4, 4, movement=0x08)
    loaded(m, 1, 3, 4, 4, facing=0, movement=0x08)  # facing 0 is DIR_NONE
    trainers = sight_report(m, MAP, [(4, 6)])["trainers"]
    assert isinstance(trainers, list)
    assert trainers[0]["facing"] == "DOWN"


def test_a_short_template_read_gives_no_report() -> None:
    m = world()

    def short(address: int, length: int) -> bytes:
        data = m.read(address, length)
        return data[:-1] if address == SB1 + 0xC70 else data

    assert sight_report(short, MAP, ROW) == {
        "available": False,
        "reason": "game memory unreadable",
    }
