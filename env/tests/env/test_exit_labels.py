"""exit-labels-v2: every warp names its destination as the game's location popup does, plus the
map ID; exits that share a name add what is reachable on foot from their arrival tile.

Grounding (pret/pokeemerald 731ad5b): ShowMapNamePopUpWindow (src/map_name_popup.c) prints
GetMapName(gMapHeader.regionMapSectionId) (src/region_map.c), i.e. gRegionMapEntries[mapsec].name;
MapHeader.regionMapSectionId is at +0x14 (include/global.fieldmap.h). gRegionMapEntries is at
0x085A147C on the pinned US ROM (found by its LITTLEROOT TOWN / OLDALE TOWN entries).

Real-RAM fixtures: b300 (2026-10-20T13-54-28_qwen36-gpu0_b300) raw-RAM archives 7745 (state seq
18814, PETALBURG WOODS at (17,38)) and 7751 (state seq 18834, ROUTE104 at (11,39)), with b300's
server feature set. off_readout is today's readout of each, rendered before this switch existed.
"""

import functools
import json
import struct
from collections.abc import Callable
from pathlib import Path
from typing import Any

import pytest

from pokebench_env import rerender
from pokebench_env.exit_labels import (
    MAPSEC_NONE,
    MAPSEC_SECRET_BASE,
    REGION_MAP_ENTRIES,
    SWITCH,
    ExitLabels,
    RomMap,
    arrival_text,
    read_exit_labels,
    read_rom_map,
    section_name,
)
from pokebench_env.game_state import MapNames
from pokebench_env.raw_ram import load_raw_ram
from pokebench_env.readout import SERVER_FEATURES, features_off_from_env, state_json
from pokebench_env.topology import MAP_GROUPS
from pokebench_env.world import InteractionTarget
from tests.env.test_exit_reach import operator_rom

FIXTURES = Path(__file__).parent / "fixtures"
BODY: dict[str, Any] = json.loads((FIXTURES / "exit-labels-b300.json").read_text())
WOODS, ROUTE104 = "18814", "18834"


@functools.cache
def maps() -> MapNames:
    return MapNames.load(rerender.PORYMAP_MAPS)


def off(switch: bool) -> list[str]:
    on = set(BODY["harness_server_features"]) | ({SWITCH} if switch else set())
    return [f for f in SERVER_FEATURES if f not in on]


def reader(seq: str) -> Callable[[int, int], bytes]:
    case = BODY["cases"][seq]
    return load_raw_ram(FIXTURES / case["raw_ram"], case["sha256"], rom=operator_rom())


def readout(seq: str, *, switch: bool) -> str:
    read = reader(seq)
    env = {"POKEBENCH_FEATURES_OFF": ",".join(off(switch)), "POKEBENCH_ACTIVE_UI": "1"}
    return rerender.rerender(
        FIXTURES, [rerender.RawRef("a", "s")], lambda _p, _s: read, maps(), env
    )[0]


def line(text: str, prefix: str) -> str:
    return next(x for x in text.split("\n") if x.startswith(prefix))


def test_registered_server_switch_default_off() -> None:
    assert SWITCH == "exit-labels-v2"
    assert SWITCH in SERVER_FEATURES
    assert SWITCH in features_off_from_env({})


@pytest.mark.parametrize("seq", [WOODS, ROUTE104])
def test_off_is_todays_readout_byte_for_byte(seq: str) -> None:
    assert readout(seq, switch=False) == BODY["cases"][seq]["off_readout"]


@pytest.mark.parametrize("seq", [WOODS, ROUTE104])
def test_off_state_has_no_exit_labels(seq: str) -> None:
    state = rerender.read_state(reader(seq), maps(), active_ui=True, off=frozenset(off(False)))
    assert state.exit_labels is None
    on = rerender.read_state(reader(seq), maps(), active_ui=True, off=frozenset(off(True)))
    assert on.exit_labels is not None
    # The typed state JSON is unchanged either way.
    assert state_json(on).keys() == state_json(state).keys()


@pytest.mark.parametrize("seq", [WOODS, ROUTE104])
def test_on_no_warp_prints_a_bare_map_id(seq: str) -> None:
    text = readout(seq, switch=True)
    warps = line(text, "Warps: ")
    assert "-> map " not in warps
    for x in text.split("\n"):
        if x.startswith("Warp to ") or x.startswith("Warp destination at "):
            assert not x.split(":", 1)[1].lstrip().startswith("map ")
            assert "Warp to map" not in x and "destination map " not in x


def test_on_woods_names_route_104_with_map_id_everywhere() -> None:
    text = readout(WOODS, switch=True)
    assert "(14,5) -> ROUTE 104 (map 0/19) [" in line(text, "Warps: ")
    assert line(text, "Warp to ROUTE 104 (map 0/19) at (14,5)").endswith(
        "destination ROUTE 104 (map 0/19) warp 2"
    )


def test_on_woods_north_exit_reaches_rustboro_south_exit_does_not() -> None:
    text = readout(WOODS, switch=True)
    north = line(text, "Warp destination at (14,5): ")
    assert north.startswith(
        "Warp destination at (14,5): ROUTE 104 (map 0/19), arriving at (10,30); from there, on foot:"
    )
    assert "NORTH edge -> RUSTBORO CITY (map 0/3)" in north
    assert "(10,30) or (11,30) -> this map at (14,5) or (15,5)" in north
    south = line(text, "Warp destination at (16,38): ")
    assert south.startswith(
        "Warp destination at (16,38): ROUTE 104 (map 0/19), arriving at (10,38); from there,"
    )
    assert "EAST edge -> PETALBURG CITY (map 0/0)" in south
    assert "RUSTBORO" not in south
    assert "NORTH edge" not in south


def test_on_route104_woods_doors_say_where_the_woods_lead_back() -> None:
    text = readout(ROUTE104, switch=True)
    door = line(text, "Warp destination at (10,38): ")
    assert door.startswith(
        "Warp destination at (10,38): PETALBURG WOODS (map 24/11), arriving at (16,38);"
        " from there, on foot: "
    )
    assert "-> this map at (10,30) or (11,30)" in door
    # exit-reachability-v1's note stays on the woods' north mouths.
    north = line(text, "Warp destination at (10,30): ")
    assert north.startswith(
        "Warp destination at (10,30): PETALBURG WOODS (map 24/11)"
        " (not reachable on foot from where you stand), arriving at (14,5);"
    )


def test_on_wording_states_map_facts_only() -> None:
    for seq in (WOODS, ROUTE104):
        text = readout(seq, switch=True)
        added = [
            x for x in text.split("\n") if x not in BODY["cases"][seq]["off_readout"].split("\n")
        ]
        assert added
        for x in added:
            for word in ("goal", "should", "story", "head for", "go to", "toward"):
                assert word not in x.lower()


# --- synthetic ROM: one table, unit behaviour without the operator ROM --------------------------


class Mem:
    def __init__(self) -> None:
        self.cells: dict[int, int] = {}
        self.next = 0x08100000

    def put(self, address: int, data: bytes) -> None:
        for i, b in enumerate(data):
            self.cells[address + i] = b

    def alloc(self, data: bytes) -> int:
        address = self.next
        self.put(address, data)
        self.next += (len(data) + 3) & ~3 or 4
        return address

    def read(self, address: int, length: int) -> bytes:
        return bytes(self.cells.get(address + i, 0) for i in range(length))


def text_bytes(s: str) -> bytes:
    table = {" ": 0x00, **{chr(ord("A") + i): 0xBB + i for i in range(26)}}
    table.update({str(i): 0xA1 + i for i in range(10)})
    return bytes(table[c] for c in s) + b"\xff"


# Metatile 0 is floor, metatile 1 is a wall (collision set in the block), 2 is water (behavior).
FLOOR, WALL, WATER = 0x000, 0x401, 0x002


def build_map(
    mem: Mem,
    rows: list[list[int]],
    warps: list[tuple[int, int, int, int, int]],
    connections: list[tuple[int, int, int, int]] = (),  # type: ignore[assignment]
    mapsec: int = 0,
) -> int:
    height, width = len(rows), len(rows[0])
    blocks = mem.alloc(b"".join(struct.pack("<H", b) for row in rows for b in row))
    attributes = mem.alloc(struct.pack("<HHH", 0x00, 0x00, 0x10))
    tileset = mem.alloc(bytes(0x10) + struct.pack("<I", attributes) + bytes(8))
    layout = mem.alloc(struct.pack("<iiIIII", width, height, 0, blocks, tileset, tileset))
    warp_bytes = mem.alloc(
        b"".join(struct.pack("<hhBBBB", x, y, 0, wid, n, g) for x, y, wid, g, n in warps) or b"\0"
    )
    events = mem.alloc(bytes([0, len(warps), 0, 0]) + struct.pack("<III", 0, warp_bytes, 0) + bytes(4))
    table = 0
    if connections:
        entries = mem.alloc(
            b"".join(struct.pack("<B3xiBB2x", d, o, g, n) for d, o, g, n in connections)
        )
        table = mem.alloc(struct.pack("<iI", len(connections), entries))
    header = mem.alloc(
        struct.pack("<IIII", layout, events, 0, table) + bytes(4) + bytes([mapsec]) + bytes(7)
    )
    return header


def install(mem: Mem, headers: dict[tuple[int, int], int]) -> None:
    groups: dict[int, dict[int, int]] = {}
    for (g, n), header in headers.items():
        groups.setdefault(g, {})[n] = header
    for g, numbers in groups.items():
        table = mem.alloc(
            b"".join(struct.pack("<I", numbers.get(n, 0)) for n in range(max(numbers) + 1))
        )
        mem.put(MAP_GROUPS + 4 * g, struct.pack("<I", table))


def name_sections(mem: Mem, names: dict[int, str]) -> None:
    for mapsec, name in names.items():
        pointer = mem.alloc(text_bytes(name))
        mem.put(REGION_MAP_ENTRIES + 8 * mapsec, bytes(4) + struct.pack("<I", pointer))


def target(x: int, y: int, dest: tuple[int, int, int]) -> InteractionTarget:
    return InteractionTarget("warp", x, y, 0, "movement", destination=dest)


def test_section_name_reads_the_popup_table_and_refuses_what_it_cannot_name() -> None:
    mem = Mem()
    install(
        mem,
        {
            (0, 0): build_map(mem, [[FLOOR]], [], mapsec=19),
            (0, 1): build_map(mem, [[FLOOR]], [], mapsec=MAPSEC_SECRET_BASE),
            (0, 2): build_map(mem, [[FLOOR]], [], mapsec=MAPSEC_NONE),
            (0, 3): build_map(mem, [[FLOOR]], [], mapsec=20),
        },
    )
    name_sections(mem, {19: "ROUTE 104"})
    mem.put(REGION_MAP_ENTRIES + 8 * 20 + 4, struct.pack("<I", 0x02000000))
    assert section_name(mem.read, (0, 0)) == "ROUTE 104"
    assert section_name(mem.read, (0, 1)) is None
    assert section_name(mem.read, (0, 2)) is None
    assert section_name(mem.read, (0, 3)) is None
    assert section_name(mem.read, (0, 99)) is None
    assert section_name(mem.read, (99, 0)) is None


def test_read_rom_map_rejects_bad_layouts() -> None:
    mem = Mem()
    good = build_map(mem, [[FLOOR, WALL]], [(0, 0, 0, 0, 1)])
    bad_layout = mem.alloc(struct.pack("<IIII", 0x02000001, 0, 0, 0) + bytes(12))
    huge = mem.alloc(struct.pack("<iiIIII", 0, 5, 0, 0, 0, 0))
    huge_header = mem.alloc(struct.pack("<IIII", huge, 0, 0, 0) + bytes(12))
    install(mem, {(0, 0): good, (0, 1): bad_layout, (0, 2): huge_header})
    found = read_rom_map(mem.read, (0, 0))
    assert isinstance(found, RomMap)
    assert (found.width, found.height) == (2, 1)
    assert found.block(1, 0) == (1, 1, 0, 0)
    assert found.block(2, 0) is None
    assert found.warps == ((0, 0, 0, 0, 1),)
    assert read_rom_map(mem.read, (0, 1)) is None
    assert read_rom_map(mem.read, (0, 2)) is None
    assert read_rom_map(mem.read, (5, 0)) is None


def two_rooms() -> tuple[Mem, Callable[[tuple[int, int]], str | None]]:
    """Map A (0/0) has two doors into map B (0/1); B's halves are split by a wall.

    A: 4x1 floor, warps (0,0)->B warp 0 and (3,0)->B warp 1.
    B: 5x3, wall column x=2; west half has warp 0 at (0,1) back to A warp 0 and the NORTH edge to
    C (0/2); east half has warp 1 at (4,1) back to A warp 1 and warp 2 at (4,2) to D (0/3).
    """
    mem = Mem()
    a = build_map(mem, [[FLOOR] * 4], [(0, 0, 0, 0, 1), (3, 0, 1, 0, 1)], mapsec=1)
    b_rows = [[FLOOR, FLOOR, WALL, FLOOR, FLOOR] for _ in range(3)]
    b = build_map(
        mem,
        b_rows,
        [(0, 1, 0, 0, 0), (4, 1, 1, 0, 0), (4, 2, 0, 0, 3)],
        connections=[(2, 0, 0, 2), (1, 0, 0, 4)],
        mapsec=2,
    )
    c = build_map(mem, [[FLOOR] * 5, [FLOOR, FLOOR, FLOOR, WALL, WALL]], [], mapsec=3)
    d = build_map(mem, [[FLOOR]], [], mapsec=4)
    # SOUTH of B is map 0/4, whose top row is all wall: nothing can be walked across.
    e = build_map(mem, [[WALL] * 5], [], mapsec=5)
    install(mem, {(0, 0): a, (0, 1): b, (0, 2): c, (0, 3): d, (0, 4): e})
    name_sections(mem, {1: "TOWN A", 2: "CAVE", 3: "ROUTE 1", 4: "HOUSE", 5: "SEA"})

    def shown(map_id: tuple[int, int]) -> str | None:
        return section_name(mem.read, map_id)

    return mem, shown


def test_read_exit_labels_adds_arrival_reach_only_for_shared_names() -> None:
    mem, shown = two_rooms()
    targets = (
        target(0, 0, (0, 1, 0)),
        target(3, 0, (0, 1, 1)),
        InteractionTarget("object", 1, 0, 0, "A"),
        target(2, 0, (127, 127, 0)),
    )
    labels = read_exit_labels(mem.read, (0, 0), targets, None, shown)
    assert isinstance(labels, ExitLabels)
    assert labels.name_map() == {(0, 1): "CAVE"}
    assert labels.arrival(0, 0) == (
        ", arriving at (0,1); from there, on foot: (0,1) -> this map at (0,0);"
        " NORTH edge -> ROUTE 1 (map 0/2)"
    )
    assert labels.arrival(3, 0) == (
        ", arriving at (4,1); from there, on foot: (4,1) -> this map at (3,0);"
        " (4,2) -> HOUSE (map 0/3)"
    )
    assert labels.arrival(2, 0) is None
    single = read_exit_labels(mem.read, (0, 0), targets[:1], None, shown)
    assert single.arrival(0, 0) is None
    assert single.name_map() == {(0, 1): "CAVE"}


def test_arrival_text_handles_unreadable_and_out_of_range() -> None:
    mem, shown = two_rooms()
    here = read_rom_map(mem.read, (0, 0))
    assert here is not None
    cache: dict[tuple[int, int], RomMap | None] = {}
    assert arrival_text(mem.read, (0, 0), here, (0, 1, 9), shown, cache) is None
    assert arrival_text(mem.read, (0, 0), here, (0, 9, 0), shown, cache) is None
    # An unnamed destination map is still described by its map ID.
    assert arrival_text(mem.read, (0, 0), here, (0, 1, 1), lambda _m: None, cache) == (
        ", arriving at (4,1); from there, on foot: (4,1) -> this map at (3,0);"
        " (4,2) -> map 0/3"
    )


def test_read_exit_labels_without_a_readable_current_map_names_only() -> None:
    mem, shown = two_rooms()
    targets = (target(0, 0, (0, 1, 0)), target(1, 0, (0, 1, 0)))
    labels = read_exit_labels(mem.read, (0, 7), targets, None, shown)
    assert labels.name_map() == {(0, 1): "CAVE"}
    assert labels.arrivals == ()
