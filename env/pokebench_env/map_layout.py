"""Current layout facts, qualified against the matching US-ROM layout table.

pokeemerald731ad5b overworld.c SetCurrentMapLayout updates the saved ID and live
pointer, leaving the original header ID unchanged. Generated Pyramid dimensions
come from battle_pyramid.c GenerateBattlePyramidFloorLayout and its 4x4 squares.
"""

import hashlib
import struct
from dataclasses import dataclass

from pokebench_env.game_screen import ReadMemory

_MAP_LAYOUTS = 0x08481DD4
_LAYOUT_COUNT = 441
_TABLE_SIGNATURE = "a0c2020b1caf263b8603d942a86aeba93d8e386e61abf32bd67881061a3ec7a8"
_SAVE_POINTER = 0x03005D8C
_MAP_HEADER = 0x02037318
_VARIANTS = {
    ((24, 46), 164): "low tide",
    ((24, 46), 168): "high tide",
    ((24, 47), 165): "low tide",
    ((24, 47), 169): "high tide",
    **{
        ((24, map_number), 433 + offset): "uncracked floor"
        for offset, map_number in enumerate((79, 80, 81, 82, 84, 85))
    },
}


@dataclass(frozen=True)
class LayoutContext:
    layout_id: int
    flash_level: int | None
    variant: str | None


def effective_dimensions(
    declared: tuple[int, int],
    backup: tuple[int, int],
    map_id: tuple[int, int] | None,
    layout_id: int | None,
) -> tuple[int, int] | None:
    width, height = declared
    if not (0 < width <= 256 and 0 < height <= 256 and backup[0] * backup[1] <= 10240):
        return None
    if backup == (width + 15, height + 14):
        return declared
    if map_id == (26, 26) and layout_id == 361 and declared == (8, 8) and backup == (47, 46):
        return (32, 32)
    return None


def read_layout_context(read: ReadMemory, map_id: tuple[int, int] | None) -> LayoutContext | None:
    if map_id is None:
        return None
    save = int.from_bytes(read(_SAVE_POINTER, 4), "little")
    if not (0x02000000 <= save <= 0x02040000 - 0x34) or save % 4:
        return None
    body = read(save, 0x34)
    if (body[4], body[5]) != map_id:
        return None
    layout_id = struct.unpack_from("<H", body, 0x32)[0]
    if not 1 <= layout_id <= _LAYOUT_COUNT:
        return None
    if hashlib.sha256(read(_MAP_LAYOUTS, 16)).hexdigest() != _TABLE_SIGNATURE:
        return None
    current = int.from_bytes(read(_MAP_HEADER, 4), "little")
    expected = int.from_bytes(read(_MAP_LAYOUTS + 4 * (layout_id - 1), 4), "little")
    if not (0x08000000 <= current < 0x0A000000) or current != expected:
        return None
    flash = body[0x30]
    return LayoutContext(
        layout_id, flash if flash <= 8 else None, _VARIANTS.get((map_id, layout_id))
    )
