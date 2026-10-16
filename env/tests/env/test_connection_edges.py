"""connection-edge-tiles-v1: map connections list the exact edge tiles you can walk off.

Grounded in pokeemerald fieldmap.c: the backup map (gBackupMapLayout) holds the connected map's
blocks in its 7-tile padding (FillNorthConnection and friends), every other padding block is
MAPGRID_UNDEFINED (impassable), and a connection covers `0 <= x - offset < destWidth`
(IsPosInConnectingMap). The real-RAM fixture is showcase run 2026-10-16T00-34-26_qwen36-gpu1_show,
turn 175 (state seq 3582, tool_result seq 3583), standing at (10,2) in LITTLEROOT TOWN.
"""

import json
import os
import struct
from pathlib import Path

import pytest
from test_live_map import Memory, loaded, tile

from pokebench_env import rerender
from pokebench_env.game_state import MapNames, read_game_state
from pokebench_env.readout import SERVER_FEATURES, features_off_from_env, state_json
from pokebench_env.rom import EMERALD_SHA1, RomError, resolve_rom
from pokebench_env.topology import edge_phrase, read_topology

ID = "connection-edge-tiles-v1"
MAP_GROUPS = 0x08486578
FIXTURE = json.loads(
    (Path(__file__).parent / "fixtures" / "connection-edges-show-t175.json").read_text()
)
OFF_NORTH = (
    "- NORTH -> ROUTE101 (map 0/16), offset 0; "
    "boundary continuation: walk across the matching edge in this direction"
)
ON_NORTH = (
    "- NORTH -> ROUTE101 (map 0/16), offset 0; walk off the map from (10,0) or (11,0):"
    " stand on one of these edge tiles and press UP"
)


def connected(
    m: Memory, direction: int, offset: int, dest_size: tuple[int, int], group: int = 0
) -> Memory:
    """One connection to map (group, 16) whose layout is dest_size, through gMapGroups."""
    m.put(0x02037324, struct.pack("<I", 0x0200A000))
    m.put(0x0200A000, struct.pack("<iI", 1, 0x0200B000))
    m.put(0x0200B000, struct.pack("<B3xiBB2x", direction, offset, group, 16))
    m.put(MAP_GROUPS + group * 4, struct.pack("<I", 0x08600000))
    m.put(0x08600000 + 16 * 4, struct.pack("<I", 0x08601000))
    m.put(0x08601000, struct.pack("<I", 0x08602000))
    m.put(0x08602000, struct.pack("<II", *dest_size))
    return m


def open_north_row(m: Memory) -> Memory:
    for x in range(5):
        tile(m, x, 0, 0)
        tile(m, x, -1, 0)
    return m


def north_edges(m: Memory) -> tuple[tuple[int, int], ...] | None:
    result = read_topology(m.read, MapNames({(0, 16): "ROUTE 101"}), edges=True)
    assert result is not None
    return result.connections[0].edges


def test_open_edge_lists_every_tile_inside_the_connected_span() -> None:
    m = connected(open_north_row(loaded()), 2, 1, (3, 9))
    assert north_edges(m) == ((1, 0), (2, 0), (3, 0))


def test_negative_offset_clips_to_the_current_map() -> None:
    m = connected(open_north_row(loaded()), 2, -3, (5, 9))
    assert north_edges(m) == ((0, 0), (1, 0))


@pytest.mark.parametrize(
    ("edge", "outside", "crossable"),
    [
        (0, 0, True),
        (0x400, 0, False),  # edge tile solid
        (0, 0x400, False),  # tile one step out solid
        (0, 0x3FF, False),  # MAPGRID_UNDEFINED: no connected block copied there
        (0, 520, False),  # surfable water one step out (behavior 0x10)
        (520, 0, False),  # standing in water: not a walk
        (0, 0x3005, False),  # edge wall on the entered tile's south side (0x33)
        (0x3006, 0, False),  # edge wall on the left tile's north side (0x32)
        (0x3000, 0x4000, False),  # elevation 3 into elevation 4
        (0x3000, 0x0000, True),  # elevation 0 never mismatches
        (0x3000, 0xF000, True),  # elevation 15 never mismatches
        (0x3002, 0x3000, True),  # an unrelated edge wall (0x30, east) does not block north
    ],
)
def test_crossing_rules(edge: int, outside: int, crossable: bool) -> None:
    m = open_north_row(loaded())
    m.put(0x02007000 + 2 * 2, struct.pack("<H", 0x30))
    m.put(0x02007000 + 2 * 5, struct.pack("<H", 0x33))
    m.put(0x02007000 + 2 * 6, struct.pack("<H", 0x32))
    tile(m, 2, 0, edge)
    tile(m, 2, -1, outside)
    connected(m, 2, 2, (1, 9))
    assert north_edges(m) == (((2, 0),) if crossable else ())


@pytest.mark.parametrize(
    ("direction", "inside", "outside", "expected"),
    [
        (1, (1, 4), (1, 5), (1, 4)),  # SOUTH: bottom row, one step down
        (3, (0, 2), (-1, 2), (0, 2)),  # WEST: left column, one step left
        (4, (4, 3), (5, 3), (4, 3)),  # EAST: right column, one step right
    ],
)
def test_each_direction_reads_its_own_edge(
    direction: int, inside: tuple[int, int], outside: tuple[int, int], expected: tuple[int, int]
) -> None:
    m = loaded()
    for x in range(-1, 6):
        for y in range(-1, 6):
            tile(m, x, y, 0x400)
    tile(m, *inside, 0)
    tile(m, *outside, 0)
    connected(m, direction, 0, (5, 5))
    result = read_topology(m.read, MapNames({}), edges=True)
    assert result is not None and result.connections[0].edges == (expected,)


def test_dive_and_unreadable_destinations_list_no_tiles() -> None:
    m = connected(open_north_row(loaded()), 5, 0, (5, 5))
    result = read_topology(m.read, MapNames({}), edges=True)
    assert result is not None and result.connections[0].edges is None
    assert "requires the corresponding field ability" in result.text()
    for group_pointer in (0, 0x08600001):
        m = connected(open_north_row(loaded()), 2, 0, (5, 5))
        m.put(MAP_GROUPS, struct.pack("<I", group_pointer))
        result = read_topology(m.read, MapNames({}), edges=True)
        assert result is not None and result.connections[0].edges is None
    m = connected(open_north_row(loaded()), 2, 0, (0, 5))
    assert north_edges(m) is None
    m = connected(open_north_row(loaded()), 2, 0, (5, 5), group=40)
    assert north_edges(m) is None


def test_unread_destination_falls_back_to_todays_line() -> None:
    m = connected(open_north_row(loaded()), 2, 0, (5, 5))
    m.put(MAP_GROUPS, struct.pack("<I", 0))
    result = read_topology(m.read, MapNames({(0, 16): "ROUTE 101"}), edges=True)
    assert result is not None
    assert (
        "- NORTH -> ROUTE 101 (map 0/16), offset 0; boundary continuation:"
        " walk across the matching edge in this direction" in result.text().split("\n")
    )


@pytest.mark.parametrize(
    ("tiles", "phrase"),
    [
        (((4, 0),), "(4,0)"),
        (((10, 0), (11, 0)), "(10,0) or (11,0)"),
        (((3, 0), (4, 0), (5, 0)), "any tile from (3,0) to (5,0)"),
        (
            ((0, 2), (0, 4), (0, 5), (0, 6), (0, 9)),
            "(0,2), any tile from (0,4) to (0,6) or (0,9)",
        ),
        (((1, 0), (3, 0)), "(1,0) or (3,0)"),
    ],
)
def test_edge_phrase_names_every_tile(tiles: tuple[tuple[int, int], ...], phrase: str) -> None:
    assert edge_phrase(tiles) == phrase


def test_on_text_and_json_off_unchanged() -> None:
    m = connected(open_north_row(loaded()), 2, 1, (3, 9))
    names = MapNames({(0, 16): "ROUTE 101"})
    on = read_topology(m.read, names, edges=True)
    off = read_topology(m.read, names)
    assert on is not None and off is not None
    assert (
        "- NORTH -> ROUTE 101 (map 0/16), offset 1; walk off the map from any tile from (1,0)"
        " to (3,0): stand on one of these edge tiles and press UP" in on.text().split("\n")
    )
    assert (
        "- NORTH -> ROUTE 101 (map 0/16), offset 1; boundary continuation:"
        " walk across the matching edge in this direction" in off.text().split("\n")
    )
    assert off.json() == {
        "width": 5,
        "height": 5,
        "connections": (
            {
                "direction": "NORTH",
                "offset": 1,
                "destination": (0, 16),
                "destination_name": "ROUTE 101",
            },
        ),
    }
    assert on.json()["connections"] == (
        {
            "direction": "NORTH",
            "offset": 1,
            "destination": (0, 16),
            "destination_name": "ROUTE 101",
            "edges": [{"x": 1, "y": 0}, {"x": 2, "y": 0}, {"x": 3, "y": 0}],
        },
    )


def test_blocked_edge_says_no_tile_can_be_walked_across() -> None:
    m = connected(loaded(), 2, 0, (5, 5))
    for x in range(5):
        tile(m, x, -1, 0x400)
    result = read_topology(m.read, MapNames({(0, 16): "ROUTE 101"}), edges=True)
    assert result is not None
    assert (
        "- NORTH -> ROUTE 101 (map 0/16), offset 0; no tile on this edge can be walked across"
        " (solid, water, a wall or outside the connected map)" in result.text().split("\n")
    )


def test_registered_server_switch_default_off() -> None:
    assert ID in SERVER_FEATURES
    assert ID in features_off_from_env({})


def test_reader_threads_the_switch() -> None:
    from test_game_state import MAPS, OVERWORLD, game

    m = game(OVERWORLD)
    m.cells.update(connected(open_north_row(loaded()), 2, 0, (5, 5)).cells)
    off = read_game_state(m.read, MAPS)
    on = read_game_state(m.read, MAPS, connection_edges_enabled=True)
    assert off.topology is not None and off.topology.connections[0].edges is None
    assert on.topology is not None and on.topology.connections[0].edges is not None
    assert "edges" not in state_json(off)["topology"]["connections"][0]  # type: ignore[index]


# --- the real showcase turn (needs the operator ROM for map headers and names) ---

ROM_START = 0x08000000


def operator_rom() -> bytes:
    try:
        return resolve_rom(os.environ, EMERALD_SHA1).read_bytes()
    except RomError:
        pytest.skip("POKEBENCH_ROM is not set to the Emerald ROM")


def showcase_reader(rom: bytes):
    cells: dict[int, int] = {}
    for window in FIXTURE["windows"]:
        start = int(window["address"], 16)
        for offset, value in enumerate(bytes.fromhex(window["hex"])):
            cells[start + offset] = value

    def read(address: int, length: int) -> bytes:
        if address >= ROM_START:
            return rom[address - ROM_START : address - ROM_START + length]
        return bytes(cells[address + i] for i in range(length))

    return read


def showcase(off: list[str]) -> str:
    read = showcase_reader(operator_rom())
    env = {"POKEBENCH_FEATURES_OFF": ",".join(off), "POKEBENCH_ACTIVE_UI": "1"}
    return rerender.rerender(
        Path("/run"),
        [rerender.RawRef("a", "s")],
        lambda _p, _s: read,
        MapNames.load(rerender.PORYMAP_MAPS),
        env,
    )[0]


def test_showcase_off_reproduces_the_recorded_readout_byte_for_byte() -> None:
    assert OFF_NORTH in FIXTURE["readout"].split("\n")
    assert showcase([*FIXTURE["recorded_off"], ID]) == FIXTURE["readout"]


def test_showcase_on_names_the_north_exit_tiles_and_changes_nothing_else() -> None:
    on = showcase(FIXTURE["recorded_off"])
    before, after = FIXTURE["readout"].split("\n"), on.split("\n")
    assert len(before) == len(after)
    assert [(a, b) for a, b in zip(before, after, strict=True) if a != b] == [(OFF_NORTH, ON_NORTH)]
