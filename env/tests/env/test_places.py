"""The game's map table served at /pokebench/places for story-destinations-v1.

Synthetic ROM layouts check the reader's bounds; the operator's ROM checks the real table
against pret/pokeemerald 731ad5b data/maps/LittlerootTown/map.json (warps (14,8) MAYS_HOUSE_1F,
(5,8) BRENDANS_HOUSE_1F, (7,16) PROFESSOR_BIRCHS_LAB; NORTH connection ROUTE101).
"""

import functools
import json
import os
import struct

import pytest
from fastapi import FastAPI
from test_view import get

from pokebench_env import rerender
from pokebench_env.game_state import MapNames
from pokebench_env.observation import install_observation
from pokebench_env.places import (
    SAVE_BLOCK_PTRS,
    Links,
    Place,
    PlaceDirectory,
    read_links,
    save_names,
)
from pokebench_env.rom import EMERALD_SHA1, RomError, resolve_rom
from pokebench_env.topology import MAP_GROUPS

ROM_START = 0x08000000


class Memory:
    """A sparse address space; unwritten bytes read as zero."""

    def __init__(self) -> None:
        self.cells: dict[int, int] = {}

    def put(self, address: int, data: bytes) -> None:
        for offset, value in enumerate(data):
            self.cells[address + offset] = value

    def __call__(self, address: int, length: int) -> bytes:
        return bytes(self.cells.get(address + i, 0) for i in range(length))


GROUP0 = 0x08100000
HEADER = 0x08100100
EVENTS = 0x08100200
WARPS = 0x08100300
CONNECTIONS = 0x08100400
ENTRIES = 0x08100500


def one_map(*, warps: list[tuple[int, int, int, int]], connections: list[tuple[int, int, int]]):  # type: ignore[no-untyped-def]
    memory = Memory()
    memory.put(MAP_GROUPS, struct.pack("<I", GROUP0))
    memory.put(GROUP0, struct.pack("<I", HEADER))
    memory.put(HEADER, struct.pack("<IIII", 0, EVENTS, 0, CONNECTIONS if connections else 0))
    memory.put(EVENTS, bytes([0, len(warps), 0, 0]) + struct.pack("<IIII", 0, WARPS, 0, 0))
    for index, (x, y, group, number) in enumerate(warps):
        memory.put(WARPS + index * 8, struct.pack("<hhBBBB", x, y, 0, 0, number, group))
    memory.put(CONNECTIONS, struct.pack("<iI", len(connections), ENTRIES))
    for index, (direction, group, number) in enumerate(connections):
        memory.put(ENTRIES + index * 12, struct.pack("<B3xiBB2x", direction, 0, group, number))
    return memory


def test_one_maps_warps_and_connections_from_its_rom_header() -> None:
    memory = one_map(warps=[(7, 16, 1, 4), (3, 3, 127, 127)], connections=[(2, 0, 16)])
    assert read_links(memory, (0, 0)) == Links(((7, 16, (1, 4)),), (("NORTH", (0, 16)),))


def test_a_map_without_connections_has_none() -> None:
    assert read_links(one_map(warps=[], connections=[]), (0, 0)) == Links((), ())


@pytest.mark.parametrize(
    ("address", "data"),
    [
        (GROUP0, struct.pack("<I", 0x01000000)),  # header pointer outside memory
        (HEADER + 4, struct.pack("<I", 3)),  # events pointer misaligned
        (EVENTS + 1, bytes([200])),  # more warps than any map has
        (EVENTS + 8, struct.pack("<I", 0x01000000)),  # warps pointer outside memory
        (HEADER + 12, struct.pack("<I", 0x01000000)),  # connections pointer outside memory
        (CONNECTIONS, struct.pack("<i", 99)),  # connection count out of range
        (CONNECTIONS + 4, struct.pack("<I", 0x01000000)),  # entries outside memory
        (ENTRIES, bytes([9])),  # unknown direction
    ],
)
def test_an_unreadable_header_is_left_out_never_guessed(address: int, data: bytes) -> None:
    memory = one_map(warps=[(7, 16, 1, 4)], connections=[(2, 0, 16)])
    memory.put(address, data)
    assert read_links(memory, (0, 0)) is None


@pytest.mark.parametrize("map_id", [(99, 0), (0, 999), (-1, 0)])
def test_a_map_outside_the_table_is_left_out(map_id: tuple[int, int]) -> None:
    assert read_links(one_map(warps=[], connections=[]), map_id) is None


def test_a_map_group_table_outside_memory_is_left_out() -> None:
    memory = one_map(warps=[], connections=[])
    memory.put(MAP_GROUPS, struct.pack("<I", 0x01000000))
    assert read_links(memory, (0, 0)) is None


SAVE2 = 0x02024EA4


def with_save(memory: Memory, *, gender: int, name: bytes) -> Memory:
    memory.put(SAVE_BLOCK_PTRS + 4, struct.pack("<I", SAVE2))
    memory.put(SAVE2, name + b"\xff" * (8 - len(name)))
    memory.put(SAVE2 + 8, bytes([gender]))
    return memory


RAED = bytes([0xCC, 0xBB, 0xBF, 0xBE])  # "RAED" in the game's charmap


def test_save_names_reads_gender_and_name_and_nothing_before_a_save_exists() -> None:
    assert save_names(with_save(Memory(), gender=0, name=RAED)) == (0, "RAED")
    assert save_names(Memory()) == (None, None)
    misaligned = Memory()
    misaligned.put(SAVE_BLOCK_PTRS + 4, struct.pack("<I", SAVE2 + 1))
    assert save_names(misaligned) == (None, None)


class Names:
    def __init__(self, names: dict[tuple[int, int], str]) -> None:
        self.names = names
        self.asked = 0

    def ids(self) -> tuple[tuple[int, int], ...]:
        self.asked += 1
        return (*self.names, (0, 5))

    def name(self, map_id: tuple[int, int]) -> str | None:
        return self.names.get(map_id)


def test_directory_names_maps_as_the_readout_does_and_reads_the_rom_once() -> None:
    memory = with_save(one_map(warps=[(7, 16, 1, 4)], connections=[]), gender=0, name=RAED)
    names = Names({(0, 0): "LITTLEROOT TOWN BRENDANS HOUSE 1F"})
    directory = PlaceDirectory(memory, names)
    shown = directory.places(displayed=True)
    assert shown == (
        Place(
            (0, 0),
            "LITTLEROOT TOWN BRENDANS HOUSE 1F",
            "RAED's HOUSE 1F",
            Links(((7, 16, (1, 4)),), ()),
        ),
    )
    assert directory.places(displayed=False)[0].display == "LITTLEROOT TOWN BRENDANS HOUSE 1F"
    assert names.asked == 1
    assert shown[0].json() == {
        "map_id": [0, 0],
        "name": "LITTLEROOT TOWN BRENDANS HOUSE 1F",
        "display": "RAED's HOUSE 1F",
        "warps": [{"x": 7, "y": 16, "to": [1, 4]}],
        "connections": [],
    }


class Unnamed(Names):
    def ids(self) -> tuple[tuple[int, int], ...]:
        return ((0, 0),)


def test_a_map_the_table_cannot_name_is_left_out() -> None:
    memory = one_map(warps=[], connections=[])
    assert PlaceDirectory(memory, Unnamed({})).places(displayed=False) == ()


def test_the_places_route_serves_the_directory() -> None:
    memory = one_map(warps=[(7, 16, 1, 4)], connections=[(2, 0, 16)])
    app = FastAPI()
    install_observation(app, lambda: None, memory, MapNames({(0, 0): "LITTLEROOT TOWN"}))  # type: ignore[arg-type,return-value]
    status, _, body = get(app, "/pokebench/places")
    assert status == 200
    assert json.loads(body) == {
        "places": [
            {
                "map_id": [0, 0],
                "name": "LITTLEROOT TOWN",
                "display": "LITTLEROOT TOWN",
                "warps": [{"x": 7, "y": 16, "to": [1, 4]}],
                "connections": [{"direction": "NORTH", "to": [0, 16]}],
            }
        ]
    }


# --- the operator's ROM ------------------------------------------------------------------------


@functools.cache
def operator_rom() -> bytes:
    try:
        return resolve_rom(os.environ, EMERALD_SHA1).read_bytes()
    except RomError:
        pytest.skip("POKEBENCH_ROM is not set to the Emerald ROM")


def rom_reader(address: int, length: int) -> bytes:
    rom = operator_rom()
    if address >= ROM_START:
        return rom[address - ROM_START : address - ROM_START + length]
    return bytes(length)


def test_the_real_map_table_has_littleroots_doors_and_birchs_lab() -> None:
    maps = MapNames.load(rerender.PORYMAP_MAPS)
    places = {p.map_id: p for p in PlaceDirectory(rom_reader, maps).places(displayed=False)}
    assert len(places) == len(maps.ids())
    littleroot = places[(0, 9)]
    assert littleroot.name == "LITTLEROOT TOWN"
    assert littleroot.links == Links(
        ((14, 8, (1, 2)), (5, 8, (1, 0)), (7, 16, (1, 4))), (("NORTH", (0, 16)),)
    )
    assert places[(1, 4)].name == "LITTLEROOT TOWN PROFESSOR BIRCHS LAB"
    assert places[(1, 4)].links.warps == ((6, 12, (0, 9)), (7, 12, (0, 9)))


VENDOR_DIFFERS = frozenset({"LavaridgeTown_Gym_1F", "LavaridgeTown_Gym_B1F"})


def test_every_rom_warp_matches_the_map_data_except_where_the_vendor_copy_differs() -> None:
    maps = MapNames.load(rerender.PORYMAP_MAPS)
    groups = json.loads((rerender.PORYMAP_MAPS / "map_groups.json").read_text())
    ids = {}
    for group, key in enumerate(groups["group_order"]):
        for number, folder in enumerate(groups[key]):
            ids[folder] = (group, number)
    constants = {
        json.loads((rerender.PORYMAP_MAPS / folder / "map.json").read_text())["id"]: map_id
        for folder, map_id in ids.items()
    }
    places = {p.map_id: p for p in PlaceDirectory(rom_reader, maps).places(displayed=False)}
    # The vendor's copy of the map data moves the Lavaridge gym's warps one row; the ROM agrees
    # with pret/pokeemerald 731ad5b (LavaridgeTown_Gym_1F warps at (13,18) and (14,18)).
    assert places[ids["LavaridgeTown_Gym_1F"]].links.warps[:2] == (
        (13, 18, ids["LavaridgeTown"]),
        (14, 18, ids["LavaridgeTown"]),
    )
    for folder, map_id in ids.items():
        if folder in VENDOR_DIFFERS:
            continue
        data = json.loads((rerender.PORYMAP_MAPS / folder / "map.json").read_text())
        expected = tuple(
            (w["x"], w["y"], constants[w["dest_map"]])
            for w in data.get("warp_events") or []
            if w["dest_map"] in constants
        )
        assert places[map_id].links.warps == expected, folder
