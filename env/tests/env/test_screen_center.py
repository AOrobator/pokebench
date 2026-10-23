import struct
from dataclasses import replace

from test_readout import IN_GAME

from pokebench_env.live_map import BACKUP_LAYOUT, MAP_HEADER, MAP_OFFSET
from pokebench_env.readout import SERVER_FEATURES, features_off_from_env, format_readout
from pokebench_env.screen_center import SWITCH, Cover, cover_line, overhead_cover

LAYOUT, BUFFER, PRIMARY, SECONDARY = 0x02010000, 0x02020000, 0x08100000, 0x08200000
METATILES, ATTRIBUTES = 0x08110000, 0x08120000
WIDTH, HEIGHT = 5, 5
# Archive 21953 of run 0d5d (ROUTE110, seq 129029): the bridge metatile has layer type NORMAL and
# four non-blank top tiles; the plain ground beside it has a blank top layer.
BRIDGE, GROUND, COVERED_ROOF = 1, 2, 3


class Memory:
    def __init__(self) -> None:
        self.cells: dict[int, int] = {}

    def put(self, address: int, data: bytes) -> None:
        for i, b in enumerate(data):
            self.cells[address + i] = b

    def read(self, address: int, size: int) -> bytes:
        return bytes(self.cells.get(address + i, 0) for i in range(size))


def memory(grid: dict[tuple[int, int], int]) -> Memory:
    m = Memory()
    m.put(MAP_HEADER, struct.pack("<II", LAYOUT, 0))
    m.put(LAYOUT, struct.pack("<IIIIII", WIDTH, HEIGHT, 0, 0, PRIMARY, SECONDARY))
    m.put(BACKUP_LAYOUT, struct.pack("<III", WIDTH + 15, HEIGHT + 14, BUFFER))
    m.put(PRIMARY + 0x0C, struct.pack("<II", METATILES, ATTRIBUTES))
    m.put(SECONDARY + 0x0C, struct.pack("<II", METATILES + 0x8000, ATTRIBUTES + 0x8000))
    top = {BRIDGE: (0x11, 0x12, 0x13, 0x14), GROUND: (0, 0, 0, 0), COVERED_ROOF: (0x21, 0x22, 0, 0)}
    layer = {BRIDGE: 0, GROUND: 0, COVERED_ROOF: 1}
    for metatile in (BRIDGE, GROUND, COVERED_ROOF):
        m.put(METATILES + 16 * metatile, struct.pack("<8H", 1, 2, 3, 4, *top[metatile]))
        m.put(ATTRIBUTES + 2 * metatile, struct.pack("<H", (layer[metatile] << 12) | 0x70))
    for (x, y), metatile in grid.items():
        address = BUFFER + 2 * ((y + MAP_OFFSET) * (WIDTH + 15) + x + MAP_OFFSET)
        m.put(address, struct.pack("<H", (15 << 12) | metatile))
    return m


BRIDGE_COLUMN = {(2, y): BRIDGE for y in range(5)} | {(1, y): GROUND for y in range(5)}


def test_a_bridge_over_the_player_covers_the_tile_and_the_tile_above_at_elevation_3():
    cover = overhead_cover(memory(BRIDGE_COLUMN).read, (2, 3), 3)
    assert cover == Cover(((2, 3), (2, 2)), 3, (2, 3))
    assert cover_line(cover) == (
        "Your character is drawn under the map's top layer here: (2,3), your tile, and (2,2),"
        " the tile above, are drawn over your sprite at elevation 3, so the screenshot's center"
        " may not show you; the sprites you see nearby are other characters."
    )


def test_priority_from_elevation_4_draws_the_sprite_above_the_top_layer():
    assert overhead_cover(memory(BRIDGE_COLUMN).read, (2, 3), 4) == Cover((), 4, (2, 3))


def test_blank_and_covered_layer_types_do_not_cover_the_sprite():
    grid = {(2, 3): GROUND, (2, 2): COVERED_ROOF}
    assert overhead_cover(memory(grid).read, (2, 3), 3) == Cover((), 3, (2, 3))
    only_above = {(2, 3): GROUND, (2, 2): BRIDGE}
    cover = overhead_cover(memory(only_above).read, (2, 3), 3)
    assert cover == Cover(((2, 2),), 3, (2, 3))
    assert "(2,2), the tile above, is drawn over your sprite" in cover_line(cover)


def test_an_unreadable_layout_reads_nothing():
    assert overhead_cover(Memory().read, (2, 3), 3) is None


def test_the_readout_factory_honors_the_switch_and_keeps_off_bytes():
    s = replace(IN_GAME, overhead_cover=Cover(((7, 9),), 3, (7, 9)))
    off = format_readout(s, off=frozenset({SWITCH}))
    on = format_readout(s)
    assert "drawn under the map's top layer" not in off
    assert off == format_readout(replace(IN_GAME, overhead_cover=None))
    assert "Your character is drawn under the map's top layer here: (7,9), your tile, is" in on
    assert format_readout(replace(s, overhead_cover=Cover((), 3, (7, 9)))) == off


def test_switch_is_registered_server_side_and_default_off():
    assert SWITCH == "screen-center-player-v1"
    assert SWITCH in SERVER_FEATURES
    assert SWITCH in features_off_from_env({})
