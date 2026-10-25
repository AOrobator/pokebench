import struct

import pytest

from pokebench_env.live_map import FullMap, LocalMap, MapTile
from pokebench_env.map_rotating_elements import read_rotating_elements

# Source: pokeemerald 731ad5bf rotating_gate.c; independently matched in US ROM
# f3ae088181bf583e55daf962a92bb46f4f1d07b7, including its 8-byte structure stride.
FORTREE = (
    (6, 7, 5, 1),
    (9, 15, 5, 2),
    (3, 19, 5, 1),
    (2, 6, 4, 1),
    (9, 12, 4, 0),
    (6, 23, 4, 0),
    (12, 22, 4, 0),
    (6, 3, 3, 2),
)
TRICK = (
    (14, 5, 4, 1),
    (10, 6, 1, 2),
    (6, 6, 3, 1),
    (14, 8, 4, 1),
    (3, 10, 2, 3),
    (9, 14, 0, 1),
    (3, 15, 6, 0),
    (2, 17, 1, 2),
    (12, 18, 6, 3),
    (5, 18, 3, 1),
    (10, 19, 2, 2),
)
ARMS = (
    (1, 0, 1, 0, 0, 0, 0, 0),
    (1, 1, 1, 0, 0, 0, 0, 0),
    (1, 0, 1, 1, 0, 0, 0, 0),
    (1, 1, 1, 1, 0, 0, 0, 0),
    (1, 0, 1, 0, 1, 0, 0, 0),
    (1, 1, 1, 0, 1, 0, 0, 0),
    (1, 0, 1, 1, 1, 0, 0, 0),
    (1, 0, 1, 0, 1, 1, 0, 0),
    (1, 1, 1, 1, 1, 0, 0, 0),
    (1, 1, 1, 0, 1, 1, 0, 0),
    (1, 0, 1, 1, 1, 1, 0, 0),
    (1, 1, 1, 1, 1, 1, 0, 0),
)
SAVE = 0x02030000


class GateMemory:
    def __init__(self, map_id=(12, 1)):
        self.bytes = {}
        self.calls = []
        self.put(0x080FB854, bytes.fromhex("10b5041c2406240e8020c001a1f7f2fe0019007810bc02bc0847"))
        self.put(0x0809D67C, bytes.fromhex("03485100034a89180068401802bc08478c5d00039c93ffff"))
        self.put(0x080FB8EC, bytes.fromhex("44a00302b0e8580848a00302"))
        self.put(0x080FB918, bytes.fromhex("44a00302f0e8580848a0030238a00302"))
        self.put(
            0x080FBAE4, bytes.fromhex("f0b5061c308e0006050e708e0006040e271c301c00f034f8012d14d1")
        )
        for address, entries in [(0x0858E8B0, FORTREE), (0x0858E8F0, TRICK)]:
            self.put(address, b"".join(struct.pack("<hhBBxx", *v) for v in entries))
        self.put(0x08592078, bytes(v for row in ARMS for v in row))
        config, entries = (0x0858E8B0, FORTREE) if map_id == (12, 1) else (0x0858E8F0, TRICK)
        self.put(0x0203A044, struct.pack("<I", config))
        self.put(0x0203A048, bytes([len(entries)]))
        self.put(0x0203A038, bytes([64] * len(entries)))
        self.put(0x03005D8C, struct.pack("<I", SAVE))
        self.put(SAVE + 4, bytes(map_id))
        self.put(SAVE + 0x139C, bytes(v[3] for v in entries))

    def put(self, address, data):
        for offset, value in enumerate(data):
            self.bytes[address + offset] = value

    def read(self, address, size):
        self.calls.append((address, size))
        return bytes(self.bytes.get(address + i, 0) for i in range(size))


def room(width=20, height=25):
    return FullMap(
        width,
        height,
        tuple("." * width for _ in range(height)),
        tuple(MapTile(x, y, 0, 0, 0, 3) for y in range(height) for x in range(width)),
        (),
        (),
    )


def edges(elements, group="gate:0"):
    return {(e.direction, e.edge) for e in elements if e.group == group and e.state == "arm"}


def test_reads_packed_live_orientation_bytes_and_reports_edges_not_occupied_cells():
    memory = GateMemory()
    elements, unavailable = read_rotating_elements(memory.read, (12, 1), room())
    assert unavailable == ()
    assert len([e for e in elements if e.state == "pivot"]) == 8
    # First Fortree gate is T2, initially clockwise 90 degrees: E2, S1, W1.
    assert edges(elements) == {
        ("east", (6, 6, 6, 7)),
        ("east", (7, 6, 7, 7)),
        ("south", (5, 7, 6, 7)),
        ("west", (5, 6, 5, 7)),
    }
    assert (SAVE + 0x139C, 8) in memory.calls
    assert all(e.kind == "rotating_gate" for e in elements)
    assert all(e.orientation == 1 for e in elements if e.group == "gate:0")


@pytest.mark.parametrize(
    "orientation,expected",
    [
        (
            0,
            {
                ("north", (5, 6, 6, 6)),
                ("north", (5, 5, 6, 5)),
                ("east", (6, 6, 6, 7)),
                ("south", (5, 7, 6, 7)),
            },
        ),
        (
            2,
            {
                ("south", (5, 7, 6, 7)),
                ("south", (5, 8, 6, 8)),
                ("west", (5, 6, 5, 7)),
                ("north", (5, 6, 6, 6)),
            },
        ),
        (
            3,
            {
                ("west", (5, 6, 5, 7)),
                ("west", (4, 6, 4, 7)),
                ("north", (5, 6, 6, 6)),
                ("east", (6, 6, 6, 7)),
            },
        ),
    ],
)
def test_orientation_is_current_not_the_source_default(orientation, expected):
    memory = GateMemory()
    memory.put(SAVE + 0x139C, bytes([orientation]))
    elements, unavailable = read_rotating_elements(memory.read, (12, 1), room())
    assert unavailable == ()
    assert edges(elements) == expected


def test_trick_house_uses_its_own_eleven_gate_shapes():
    memory = GateMemory((29, 8))
    elements, unavailable = read_rotating_elements(memory.read, (29, 8), room(15, 22))
    assert unavailable == ()
    assert len([e for e in elements if e.state == "pivot"]) == 11
    assert edges(elements, "gate:5") == {("east", (9, 13, 9, 14)), ("south", (8, 14, 9, 14))}


@pytest.mark.parametrize("map_id", [None, (10, 0), (12, 0), (29, 7)])
def test_other_maps_do_not_read_reused_temp_variables(map_id):
    memory = GateMemory()
    assert read_rotating_elements(memory.read, map_id, room()) == ((), ())
    assert memory.calls == []


@pytest.mark.parametrize(
    "address,data",
    [
        (0x0203A044, struct.pack("<I", 0x0858E8F0)),
        (0x0203A048, b"\x0b"),
        (0x03005D8C, b"\0" * 4),
        (SAVE + 4, b"\x1d\x08"),
        (0x0858E8B0, b"\xff"),
        (0x080FB854, b"\xff"),
    ],
)
def test_unqualified_or_uninitialized_owner_never_becomes_a_default_gate(address, data):
    memory = GateMemory()
    memory.put(address, data)
    elements, unavailable = read_rotating_elements(memory.read, (12, 1), room())
    assert elements == ()
    assert unavailable


def test_invalid_orientation_is_unknown_and_does_not_erase_other_gates():
    memory = GateMemory()
    memory.put(SAVE + 0x139C, b"\xff")
    elements, unavailable = read_rotating_elements(memory.read, (12, 1), room())
    assert not any(e.group == "gate:0" for e in elements)
    assert any(e.group == "gate:1" for e in elements)
    assert unavailable and "gate:0" in unavailable[0]


@pytest.mark.parametrize("pending,ended", [(1, True), (2, True), (0, False)])
def test_rotating_sprite_does_not_report_a_settled_future_footprint(pending, ended):
    memory = GateMemory()
    memory.put(0x0203A038, b"\x02")
    sprite = bytearray(0x44)
    struct.pack_into("<I", sprite, 0x1C, 0x080FBAE5)
    struct.pack_into("<hhh", sprite, 0x2E, 0, pending, 1)
    sprite[0x3E] = 1
    sprite[0x3F] = 0x20 if ended else 0
    memory.put(0x02020630 + 2 * 0x44, sprite)
    elements, unavailable = read_rotating_elements(memory.read, (12, 1), room())
    assert unavailable == ()
    assert edges(elements) == set()
    gate = [e for e in elements if e.group == "gate:0"]
    assert len(gate) == 1 and gate[0].state == "transitioning" and gate[0].orientation is None


def test_local_view_only_includes_gate_edges_touching_observed_tiles_and_is_not_mutated():
    memory = GateMemory()
    shown = LocalMap((7, 7), ("@",), (MapTile(7, 7, 0, 0, 0, 3),), (), ())
    elements, unavailable = read_rotating_elements(memory.read, (12, 1), shown)
    assert unavailable == ()
    assert len(elements) == 1
    assert elements[0].edge == (7, 6, 7, 7)
    assert (elements[0].x, elements[0].y) == (7, 7)
    assert shown.rows == ("@",) and shown.tiles == (MapTile(7, 7, 0, 0, 0, 3),)


def test_no_gate_in_view_does_not_read_unrelated_live_data():
    memory = GateMemory()
    shown = LocalMap((19, 0), (".",), (MapTile(19, 0, 0, 0, 0),), (), ())
    assert read_rotating_elements(memory.read, (12, 1), shown) == ((), ())
    assert memory.calls == []


@pytest.mark.parametrize("fault", ["slot", "unused", "callback", "gate_id", "pending"])
def test_loaded_sprite_identity_and_animation_values_are_validated(fault):
    memory = GateMemory()
    memory.put(0x0203A038, b"\x02")
    sprite = bytearray(0x44)
    struct.pack_into("<I", sprite, 0x1C, 0x080FBAE5)
    sprite[0x3E] = 1
    sprite[0x3F] = 0x20
    if fault == "slot":
        memory.put(0x0203A038, b"\xff")
    elif fault == "unused":
        sprite[0x3E] = 0
    elif fault == "callback":
        struct.pack_into("<I", sprite, 0x1C, 0x080FBB65)
    elif fault == "gate_id":
        sprite[0x2E] = 1
    else:
        sprite[0x30] = 3
    memory.put(0x02020630 + 2 * 0x44, sprite)
    elements, unavailable = read_rotating_elements(memory.read, (12, 1), room())
    assert not any(e.group == "gate:0" for e in elements)
    assert unavailable and "gate:0" in unavailable[0]


def test_loaded_settled_sprite_reports_the_current_edges():
    memory = GateMemory()
    memory.put(0x0203A038, b"\x02")
    sprite = bytearray(0x44)
    struct.pack_into("<I", sprite, 0x1C, 0x080FBAE5)
    sprite[0x3E] = 1
    sprite[0x3F] = 0x20
    memory.put(0x02020630 + 2 * 0x44, sprite)
    elements, unavailable = read_rotating_elements(memory.read, (12, 1), room())
    assert unavailable == ()
    assert len(edges(elements)) == 4


@pytest.mark.parametrize("fault", ["short", "unreadable"])
def test_incomplete_memory_never_becomes_zero_orientation(fault):
    memory = GateMemory()

    def read(address, size):
        if address == SAVE + 0x139C:
            if fault == "short":
                return b""
            raise OSError("archive region unavailable")
        return memory.read(address, size)

    elements, unavailable = read_rotating_elements(read, (12, 1), room())
    assert elements == ()
    assert unavailable == ("rotating gate memory unavailable",)
