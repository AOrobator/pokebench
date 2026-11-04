"""The game's map table served at /pokebench/places for story-destinations-v1.

Synthetic ROM layouts check the reader's bounds; the operator's ROM checks the real table
against pret/pokeemerald 731ad5b data/maps/LittlerootTown/map.json (warps (14,8) MAYS_HOUSE_1F,
(5,8) BRENDANS_HOUSE_1F, (7,16) PROFESSOR_BIRCHS_LAB; NORTH connection ROUTE101).
"""

import functools
import os
import struct

import pytest

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


# --- the operator's ROM ------------------------------------------------------------------------


@functools.cache
def operator_rom() -> bytes:
    try:
        return resolve_rom(os.environ, EMERALD_SHA1).read_bytes()
    except RomError:
        pytest.skip("POKEBENCH_ROM is not set to the Emerald ROM")
