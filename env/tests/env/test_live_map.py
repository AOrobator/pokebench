import struct

import pytest

from pokebench_env.live_map import read_local_map


class Memory:
    def __init__(self) -> None:
        self.cells: dict[int, int] = {}

    def put(self, address: int, body: bytes) -> None:
        self.cells.update({address + i: b for i, b in enumerate(body)})

    def read(self, address: int, length: int) -> bytes:
        return bytes(self.cells.get(address + i, 0) for i in range(length))


def loaded() -> Memory:
    m = Memory()
    m.put(0x03005DC0, struct.pack("<III", 20, 19, 0x02005000))
    m.put(0x02037318, struct.pack("<II", 0x02001000, 0x02002000))
    m.put(0x02001000, struct.pack("<IIIIII", 5, 5, 0, 0, 0x02003000, 0x02004000))
    m.put(0x02003010, struct.pack("<I", 0x02007000))
    m.put(0x02004010, struct.pack("<I", 0x02008000))
    m.put(0x02007002, struct.pack("<H", 2))
    m.put(0x02008010, struct.pack("<H", 0x10))
    m.put(0x02002000, bytes([0, 1, 0, 0]) + struct.pack("<II", 0, 0x02009000))
    m.put(0x02009000, struct.pack("<hhBBBB", 0, 1, 0, 0, 9, 0))
    tile(m, 0, 0, 1)
    tile(m, 1, 0, 0x400)
    tile(m, 2, 1, 520)
    obj(m, 1, 2, 0)
    obj(m, 0, 1, 1, player=True)
    return m


def tile(m: Memory, x: int, y: int, block: int) -> None:
    m.put(0x02005000 + 2 * ((y + 7) * 20 + x + 7), struct.pack("<H", block))


def obj(m: Memory, slot: int, x: int, y: int, player: bool = False) -> None:
    body = bytearray(0x24)
    body[0] = 1
    body[2] = int(player)
    body[8:11] = bytes([2, 0, 1])
    struct.pack_into("<hh", body, 0x10, x + 7, y + 7)
    m.put(0x02037350 + slot * 0x24, body)


def test_live_grid_decodes_padding_collision_both_tilesets_objects_and_warps() -> None:
    m = loaded()
    result = read_local_map(m.read, (1, 1), (1, 0), radius=1)
    assert result is not None
    assert result.rows == ("g#N", "W@~", "...")
    assert result.origin == (0, 0)
    assert result.objects == ((2, 2, 0),)
    assert result.warps == ((0, 1, 0, 9),)
    assert [(t.x, t.y, t.behavior) for t in result.tiles if t.behavior] == [(0, 0, 2), (2, 1, 0x10)]
    assert "id 2 at (2,0)" in result.text()
    assert "(0,1) -> map 0/9" in result.text()


def test_map_and_object_changes_are_live_not_static_templates() -> None:
    m = loaded()
    tile(m, 1, 0, 0)
    obj(m, 1, 2, 2)
    result = read_local_map(m.read, (1, 1), (1, 0), radius=1)
    assert result is not None
    assert result.rows == ("g..", "W@~", "..N")
    assert result.objects == ((2, 2, 2),)


@pytest.mark.parametrize("offset,value", [(0, 0), (1, 0x20), (9, 2), (10, 2)])
def test_inactive_invisible_and_foreign_map_objects_are_not_shown(offset: int, value: int) -> None:
    m = loaded()
    m.put(0x02037350 + 0x24 + offset, bytes([value]))
    result = read_local_map(m.read, (1, 1), (1, 0), radius=1)
    assert result is not None
    assert result.objects == ()


def test_outside_current_map_is_unknown_not_open_floor() -> None:
    result = read_local_map(loaded().read, (0, 0), (1, 0), radius=1)
    assert result is not None
    assert result.rows[0] == "???"
    assert all(row[0] == "?" for row in result.rows)


@pytest.mark.parametrize(
    "address,body",
    [
        (0x02037318, bytes(8)),
        (0x03005DC0, struct.pack("<III", 20, 19, 0)),
        (0x03005DC0, struct.pack("<III", 1000, 1000, 0x02005000)),
        (0x03005DC0, struct.pack("<III", 21, 19, 0x02005000)),
        (0x02001010, bytes(8)),
        (0x02003010, bytes(4)),
    ],
)
def test_unready_and_invalid_layout_is_unavailable(address: int, body: bytes) -> None:
    m = loaded()
    m.put(address, body)
    assert read_local_map(m.read, (1, 1), (1, 0), 1) is None


@pytest.mark.parametrize("radius", [-1, 8])
def test_radius_has_a_small_production_bound(radius: int) -> None:
    with pytest.raises(ValueError, match="radius"):
        read_local_map(loaded().read, (1, 1), (1, 0), radius)


def test_empty_events_and_outside_window_do_not_invent_objects_or_warps() -> None:
    m = loaded()
    m.put(0x02002001, b"\0")
    obj(m, 1, 4, 4)
    result = read_local_map(m.read, (1, 1), (1, 0), 0)
    assert result is not None
    assert result.rows == ("@",)
    assert result.objects == result.warps == ()
    assert "none nearby" in result.text()


def test_dynamic_warp_sentinel_is_not_reported_as_a_real_map() -> None:
    m = loaded()
    m.put(0x02009000, struct.pack("<hhBBBB", 0, 1, 0, 0, 127, 127))
    result = read_local_map(m.read, (1, 1), (1, 0), 1)
    assert result is not None
    assert "(0,1) -> dynamic destination" in result.text()
    assert "map 127/127" not in result.text()


def test_rendered_grid_labels_every_world_column_and_row_at_nonzero_origin():
    result = read_local_map(loaded().read, (1, 1), (1, 0), 2)
    assert result is not None
    assert result.text().splitlines()[:7] == [
        "Local map from live memory; top-left (-1,-1), north is up:",
        "      -1   0   1   2   3",
        "  -1   ?   ?   ?   ?   ?",
        "   0   ?   g   #   N   .",
        "   1   ?   W   @   ~   .",
        "   2   ?   .   .   .   .",
        "   3   ?   .   .   .   .",
    ]


@pytest.mark.parametrize(
    "behavior,expected",
    [
        (0x62, "directional exit: stand on tile, then press RIGHT"),
        (0x63, "directional exit: stand on tile, then press LEFT"),
        (0x64, "directional exit: stand on tile, then press UP"),
        (0x65, "directional exit: stand on tile, then press DOWN"),
        (0x1B, "directional exit: stand on tile, then press UP"),
        (0x1C, "directional exit: stand on tile, then press DOWN"),
        (0x6D, "directional exit: stand on tile, then press DOWN"),
        (0x69, "door: approach from below and press UP toward door"),
        (0x60, "step onto tile"),
        (0x61, "step onto tile"),
        (0x6A, "step onto tile"),
        (0x6B, "step onto tile"),
        (0x6C, "step onto tile"),
        (0x6E, "step onto tile"),
        (0x0E, "step onto tile"),
        (0x0F, "step onto tile"),
        (0x29, "step onto tile"),
        (0x67, "step onto tile"),
        (0x68, "step onto tile"),
        (0x00, "activation unknown"),
    ],
)
def test_warp_trigger_uses_live_tile_behavior(behavior: int, expected: str) -> None:
    m = loaded()
    m.put(0x02007000, struct.pack("<H", behavior))
    result = read_local_map(m.read, (1, 1), (1, 0), radius=1)
    assert result is not None
    assert f"(0,1) -> map 0/9 [{expected}]" in result.text(), result.text()
    m.put(0x02007000, struct.pack("<H", 0x65))
    changed = read_local_map(m.read, (1, 1), (1, 0), radius=1)
    assert changed is not None
    assert "[directional exit: stand on tile, then press DOWN]" in changed.text(), changed.text()


def test_warp_without_loaded_tile_does_not_guess_activation() -> None:
    m = loaded()
    m.put(0x02009000, struct.pack("<hhBBBB", 0, 5, 0, 0, 9, 0))
    result = read_local_map(m.read, (1, 4), (1, 0), radius=1)
    assert result is not None
    assert "(0,5) -> map 0/9 [activation unknown]" in result.text(), result.text()
