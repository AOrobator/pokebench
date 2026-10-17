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
from pokebench_env.readout import SERVER_FEATURES, features_off_from_env, state_json
from pokebench_env.rom import EMERALD_SHA1, RomError, resolve_rom
from pokebench_env.surf_gate import FloodInputs, classify

ID = "exit-reachability-v1"
FIXTURES = Path(__file__).parent / "fixtures"
ROM_START = 0x08000000
NOTE = "not reachable on foot from where you stand"
NORTH_OFF = (
    "- NORTH -> RUSTBORO CITY (map 0/3), offset 0; walk off the map from any tile from (12,0)"
    " to (19,0) or (33,0): stand on one of these edge tiles and press UP"
)
NORTH_ON = (
    "- NORTH -> RUSTBORO CITY (map 0/3), offset 0; not reachable on foot from where you stand:"
    " no walkable way on this map leads from your tile to this edge (walls, ledges or water cut"
    " it off; another map may lead there)"
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


def changed(before: str, after: str) -> list[tuple[str, str]]:
    a, b = before.split("\n"), after.split("\n")
    assert len(a) == len(b)
    return [(x, y) for x, y in zip(a, b, strict=True) if x != y]


ROUTE103 = "surf-gate-4caa.json.gz"
ROUTE104 = "exit-reach-0e05.json.gz"
SEQS_103 = [4770, 16069]
SEQS_104 = [22580, 25575]


def test_registered_server_switch_default_off() -> None:
    assert SWITCH == ID
    assert ID in SERVER_FEATURES
    assert ID in features_off_from_env({})


@pytest.mark.parametrize("seq", SEQS_103)
def test_route103_altering_cave_and_east_edge_are_water_south_is_foot(seq: int) -> None:
    reach = state(ROUTE103, seq, recorded_off(ROUTE103)).exit_reach
    assert reach is not None
    assert reach.warps == (((45, 6), "water"),)
    assert reach.connections == (("SOUTH", "foot"), ("EAST", "water"))
    # Across water is surf-gated-exits-v1's to say; nothing here is `none`, so the readout is
    # unchanged with only this switch on.
    off = [*recorded_off(ROUTE103), "surf-gated-exits-v1"]
    assert readout(ROUTE103, seq, off) == readout(ROUTE103, seq, [*off, ID])


@pytest.mark.parametrize("seq", SEQS_104)
def test_off_reproduces_the_recorded_0e05_readout_byte_for_byte(seq: int) -> None:
    case = next(c for c in fixture(ROUTE104)["cases"] if c["tool_result_seq"] == seq)
    assert "call navigate_to again to continue to" in case["navigation_line"]
    assert "NORTH edge -> RUSTBORO CITY (map 0/3)" in case["untaken_line"]
    off = readout(ROUTE104, seq, [*recorded_off(ROUTE104), ID])
    assert off == case["readout"]
    assert NORTH_OFF in off.split("\n")


@pytest.mark.parametrize("seq", SEQS_104)
def test_on_route104_north_edge_and_woods_north_warps_say_not_reachable_on_foot(seq: int) -> None:
    case = next(c for c in fixture(ROUTE104)["cases"] if c["tool_result_seq"] == seq)
    on = readout(ROUTE104, seq, recorded_off(ROUTE104))
    lines = case["readout"].split("\n")
    expected = [(NORTH_OFF, NORTH_ON)]
    for x, y in NONE_WARPS:
        warp = next(
            line for line in lines if line.startswith("Warp to ") and f"at ({x},{y})," in line
        )
        dest = next(line for line in lines if line.startswith(f"Warp destination at ({x},{y}):"))
        expected += [(warp, warp + WARP_ON), (dest, dest + DEST_ON)]
    assert sorted(changed(case["readout"], on)) == sorted(expected)
    # No Surf or badge wording on a land case.
    assert "Surf" not in NORTH_ON and "Badge" not in WARP_ON


@pytest.mark.parametrize("seq", SEQS_104)
def test_on_state_json_carries_labels_and_foot_rows_off_has_no_field(seq: int) -> None:
    off = recorded_off(ROUTE104)
    body = state_json(state(ROUTE104, seq, off))
    reach = body["exit_reach"]
    assert isinstance(reach, dict)
    labels = {(w["x"], w["y"]): w["reach"] for w in reach["warps"]}
    assert labels == {
        (17, 50): "foot",
        (5, 18): "none",
        (10, 30): "none",
        (11, 30): "none",
        (10, 38): "foot",
        (11, 38): "foot",
        (32, 42): "none",
        (33, 42): "none",
    }
    assert reach["connections"] == [
        {"direction": "NORTH", "reach": "none"},
        {"direction": "SOUTH", "reach": "water"},
        {"direction": "EAST", "reach": "foot"},
    ]
    foot = reach["foot"]
    assert (foot["width"], foot["height"]) == (40, 80)
    rows = foot["rows"]
    assert len(rows) == 80 and all(len(r) == 10 for r in rows)
    tiles = {
        (x, y)
        for y, row in enumerate(rows)
        for x in range(40)
        if int(row[x // 4], 16) >> (3 - x % 4) & 1
    }
    assert len(tiles) == 546
    assert min(y for _, y in tiles) == 38
    x, y = body["position"]["x"], body["position"]["y"]  # type: ignore[index]
    assert (x, y) in tiles and (39, 62) in tiles
    assert "exit_reach" not in state_json(state(ROUTE104, seq, [*off, ID]))


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
    return FloodInputs(tiles, start, ((6, 0), (9, 9)), {"NORTH": ((), ())}, width, height)


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
    assert reach.blocks_connection("NORTH") and not reach.blocks_connection("EAST")
    assert reach.connection_note() == NORTH_ON.split("offset 0; ", 1)[1]
    assert reach.warp_note() == WARP_ON
    assert reach.destination_note() == DEST_ON
    assert reach.json()["warps"] == [
        {"x": 6, "y": 0, "reach": "water"},
        {"x": 9, "y": 9, "reach": "none"},
    ]
    assert reach.json()["connections"] == [{"direction": "NORTH", "reach": "none"}]
