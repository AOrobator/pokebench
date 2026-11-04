"""exit-reachability-v1: every warp and map connection is labelled foot, water or none.

The flood (surf_gate.reachable) over-approximates walking: it ignores elevation, one-way tiles
and objects, so a tile it never reaches cannot be walked to, and `none` (reachable neither on
foot nor across water) is safe to say. Anything unread keeps the exit listed.

Real-RAM fixtures:
- surf-gate-4caa.json.gz, ROUTE103 (4caa tool results 4770 and 16069): Altering Cave and the
  EAST edge are across water, the SOUTH edge is walkable.
- exit-reach-0e05.json.gz, ROUTE104 (0/19) from the south half (0e05 tool results 22580 at
  (18,42) and 25575 at (19,42)): the flood reaches 546 tiles, none at y=0, so the NORTH edge to
  RUSTBORO CITY is `none`; rows 31-37 are solid wall and the north half is reached only through
  PETALBURG WOODS. Both readouts said "call navigate_to again to continue to (12,0)".
"""

import functools
import gzip
import json
import os
from pathlib import Path
from typing import Any

import pytest

from pokebench_env import rerender
from pokebench_env.exit_reach import SWITCH, ExitReach, build_exit_reach
from pokebench_env.game_state import MapNames
from pokebench_env.readout import (
    SERVER_FEATURES,
    connection_notes,
    features_off_from_env,
)
from pokebench_env.rom import EMERALD_SHA1, RomError, resolve_rom
from pokebench_env.surf_gate import FloodInputs, classify
from pokebench_env.topology import Connection, Topology

ID = "exit-reachability-v1"
FIXTURES = Path(__file__).parent / "fixtures"
ROM_START = 0x08000000
NORTH_ON = (
    "- NORTH -> RUSTBORO CITY (map 0/3), offset 0; not reachable on foot from where you stand:"
    " no walkable way on this map leads from your tile to this edge"
)
WARP_ON = (
    "; not reachable on foot from where you stand: no walkable way on this map leads from your"
    " tile to it"
)
DEST_ON = " (not reachable on foot from where you stand)"
# ROUTE104 warps the south half cannot walk to: the flower shop, the woods' north mouths and
# the woods' east mouth (above one-way ledges).
NONE_WARPS = [(5, 18), (10, 30), (11, 30), (32, 42), (33, 42)]


@functools.cache
def _rom() -> bytes | None:
    try:
        return resolve_rom(os.environ, EMERALD_SHA1).read_bytes()
    except RomError:
        return None


def operator_rom() -> bytes:
    rom = _rom()
    if rom is None:
        pytest.skip("POKEBENCH_ROM is not set to the Emerald ROM")
    return rom


@functools.cache
def maps() -> MapNames:
    return MapNames.load(rerender.PORYMAP_MAPS)


@functools.cache
def fixture(name: str) -> dict[str, Any]:
    body: dict[str, Any] = json.loads(gzip.decompress((FIXTURES / name).read_bytes()))
    return body


def recorded_off(name: str) -> list[str]:
    features = fixture(name)["harness_features"]
    return [f for f in SERVER_FEATURES if f not in features and f != ID]


@functools.cache
def cells_of(name: str, seq: int) -> dict[int, int]:
    case = next(c for c in fixture(name)["cases"] if c["tool_result_seq"] == seq)
    cells: dict[int, int] = {}
    for window in case["windows"]:
        start = int(window["address"], 16)
        for offset, value in enumerate(bytes.fromhex(window["hex"])):
            cells[start + offset] = value
    return cells


def reader(name: str, seq: int):
    rom, cells = operator_rom(), cells_of(name, seq)

    def read(address: int, length: int) -> bytes:
        if address >= ROM_START:
            return rom[address - ROM_START : address - ROM_START + length]
        return bytes(cells[address + i] for i in range(length))

    return read


def readout(name: str, seq: int, off: list[str]) -> str:
    read = reader(name, seq)
    env = {"POKEBENCH_FEATURES_OFF": ",".join(off), "POKEBENCH_ACTIVE_UI": "1"}
    return rerender.rerender(
        Path("/run"), [rerender.RawRef("a", "s")], lambda _p, _s: read, maps(), env
    )[0]


def state(name: str, seq: int, off: list[str]):
    return rerender.read_state(reader(name, seq), maps(), active_ui=True, off=frozenset(off))


ROUTE103 = "surf-gate-4caa.json.gz"
ROUTE104 = "exit-reach-0e05.json.gz"


def test_registered_server_switch_default_off() -> None:
    assert SWITCH == ID
    assert ID in SERVER_FEATURES
    assert ID in features_off_from_env({})


def grid(rows: list[str]) -> dict[tuple[int, int], tuple[int, int]]:
    cells = {".": (0, 0), "~": (0, 0x10), "#": (1, 0), "J": (1, 0x38)}
    return {(x, y): cells[c] for y, row in enumerate(rows) for x, c in enumerate(row)}


# Land on the left, a pond (~) in the middle, land on the right; J hops east.
POND = ["..~~~..", "..~~~..", "..#~#..", ".J.~...", "##~~~#."]


def test_classify_labels_foot_water_and_none() -> None:
    tiles = grid(POND)
    reached = classify(
        tiles,
        (0, 0),
        warps=[(6, 0), (1, 1), (9, 9), (6, 0)],
        connections={
            "EAST": (((6, 1),), ((6, 1),)),
            "WEST": (((0, 1),), ((0, 1),)),
            "SOUTH": ((), ((3, 4),)),
            "NORTH": ((), ()),
        },
    )
    assert reached.warps == (((6, 0), "water"), ((1, 1), "foot"), ((9, 9), "none"))
    assert reached.connections == (
        ("EAST", "water"),
        ("WEST", "foot"),
        ("SOUTH", "water"),
        ("NORTH", "none"),
    )
    assert (1, 1) in reached.foot and (6, 0) not in reached.foot
    assert (6, 0) in reached.wet


def inputs(start: tuple[int, int], rows: list[str] = POND) -> FloodInputs:
    tiles = grid(rows)
    width, height = len(rows[0]), len(rows)
    north = {("NORTH", (0, 3), 0): ((), ())}
    return FloodInputs(tiles, start, ((6, 0), (9, 9)), north, width, height)


def test_exit_reach_rows_pack_four_tiles_per_hex_digit() -> None:
    reach = build_exit_reach(inputs((0, 0), [".....", "#.###"]))
    assert reach is not None
    assert reach.rows() == ("f8", "40")
    assert reach.json()["foot"] == {"width": 5, "height": 2, "rows": ["f8", "40"]}


def test_exit_reach_needs_the_player_on_the_map() -> None:
    assert build_exit_reach(inputs((9, 9))) is None


def test_only_none_is_blocked_and_notes_are_plain() -> None:
    reach = build_exit_reach(inputs((0, 0)))
    assert isinstance(reach, ExitReach)
    assert reach.warps == (((6, 0), "water"), ((9, 9), "none"))
    assert not reach.blocks_warp(6, 0) and reach.blocks_warp(9, 9) and not reach.blocks_warp(1, 1)
    assert reach.blocks_connection("NORTH", (0, 3), 0)
    assert not reach.blocks_connection("EAST", (0, 3), 0)
    assert not reach.blocks_connection("NORTH", (0, 4), 0)
    assert reach.connection_note() == NORTH_ON.split("offset 0; ", 1)[1]
    assert reach.warp_note() == WARP_ON
    assert reach.destination_note() == DEST_ON
    assert reach.json()["warps"] == [
        {"x": 6, "y": 0, "reach": "water"},
        {"x": 9, "y": 9, "reach": "none"},
    ]
    assert reach.json()["connections"] == [
        {"direction": "NORTH", "destination": [0, 3], "offset": 0, "reach": "none"}
    ]


# Route 111 has two WEST connections and Route 124 two EAST ones: each is labelled on its own.
TWO_WEST = [
    Connection("WEST", 0, (0, 1), "ROUTE A", ((0, 0),)),
    Connection("WEST", 2, (0, 2), "ROUTE B", ((0, 2),)),
]


def test_two_same_direction_connections_are_labelled_and_noted_separately() -> None:
    tiles = grid(["..", "##", ".."])
    flood = FloodInputs(
        tiles,
        (0, 0),
        (),
        {("WEST", (0, 1), 0): (((0, 0),), ((0, 0),)), ("WEST", (0, 2), 2): (((0, 2),), ((0, 2),))},
        2,
        3,
    )
    reach = build_exit_reach(flood)
    assert reach is not None
    assert reach.connections == ((("WEST", (0, 1), 0), "foot"), (("WEST", (0, 2), 2), "none"))
    assert not reach.blocks_connection("WEST", (0, 1), 0)
    assert reach.blocks_connection("WEST", (0, 2), 2)
    topology = Topology(2, 3, tuple(TWO_WEST))
    notes = connection_notes(topology, None, reach)
    assert notes == {1: reach.connection_note()}
    lines = topology.text(notes).split("\n")
    assert lines[2].startswith("- WEST -> ROUTE A (map 0/1), offset 0; walk off the map from (0,0)")
    assert lines[3] == f"- WEST -> ROUTE B (map 0/2), offset 2; {reach.connection_note()}"
    # The Surf gate keys connections by direction, as before this switch; nothing else changes.
    assert connection_notes(topology, None, None) == {}
