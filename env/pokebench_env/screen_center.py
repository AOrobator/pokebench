"""screen-center-player-v1: whether the map's top layer is drawn over the player's sprite.

pokeemerald 731ad5bf field_camera.c DrawMetatile: METATILE_LAYER_TYPE_NORMAL and _SPLIT draw a
metatile's top layer to BG1 (priority 1), which covers object sprites of a lower priority;
_COVERED draws it to BG2 instead. event_object_movement.c sets a sprite's priority from its
previousElevation by sElevationToPriority, so at priority 2 the player is drawn under BG1.
The player's 16x32 sprite stands on its tile and reaches into the tile above. A top tile entry
of 0 is the tileset's blank tile, so a top layer of four 0 entries draws nothing.
"""

import struct
from dataclasses import dataclass

from pokebench_env.game_screen import ReadMemory
from pokebench_env.live_map import BACKUP_LAYOUT, MAP_HEADER, MAP_OFFSET, _pointer

SWITCH = "screen-center-player-v1"
ELEVATION_TO_PRIORITY = (2, 2, 2, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 0, 0, 2)
TOP_LAYER_BG_PRIORITY = 1
LAYER_TYPE_COVERED = 1
PRIMARY_METATILES = 512


@dataclass(frozen=True)
class Cover:
    """The player's tile and the tile above, where the map's top layer is drawn over the sprite."""

    tiles: tuple[tuple[int, int], ...]
    elevation: int
    position: tuple[int, int]


def _covers(read: ReadMemory, tilesets: tuple[int, int], metatile: int) -> bool:
    which = int(metatile >= PRIMARY_METATILES)
    index = metatile - PRIMARY_METATILES * which
    metatiles, attributes = struct.unpack("<II", read(tilesets[which] + 0x0C, 8))
    if not _pointer(metatiles) or not _pointer(attributes):
        return False
    layer = int.from_bytes(read(attributes + 2 * index, 2), "little") >> 12
    top = struct.unpack("<4H", read(metatiles + 16 * index + 8, 8))
    return layer != LAYER_TYPE_COVERED and any(entry & 0x3FF for entry in top)


def overhead_cover(
    read: ReadMemory, position: tuple[int, int], previous_elevation: int
) -> Cover | None:
    width, height, buffer = struct.unpack("<III", read(BACKUP_LAYOUT, 12))
    layout = int.from_bytes(read(MAP_HEADER, 4), "little")
    if not _pointer(layout) or not _pointer(buffer):
        return None
    map_width, map_height, _, _, primary, secondary = struct.unpack("<IIIIII", read(layout, 24))
    if width != map_width + 15 or height != map_height + 14:
        return None
    if not _pointer(primary) or not _pointer(secondary):
        return None
    if ELEVATION_TO_PRIORITY[previous_elevation & 15] <= TOP_LAYER_BG_PRIORITY:
        return Cover((), previous_elevation, position)
    x, y = position
    covered = []
    for tile in ((x, y), (x, y - 1)):
        bx, by = tile[0] + MAP_OFFSET, tile[1] + MAP_OFFSET
        if not (0 <= bx < width and 0 <= by < height):
            continue
        block = int.from_bytes(read(buffer + 2 * (by * width + bx), 2), "little")
        if _covers(read, (primary, secondary), block & 0x3FF):
            covered.append(tile)
    return Cover(tuple(covered), previous_elevation, position)


def cover_line(cover: Cover) -> str:
    named = [
        f"({x},{y}), {'your tile' if (x, y) == cover.position else 'the tile above'},"
        for x, y in cover.tiles
    ]
    verb = "are" if len(named) > 1 else "is"
    return (
        "Your character is drawn under the map's top layer here: "
        + " and ".join(named)
        + f" {verb} drawn over your sprite at elevation {cover.elevation}, so the screenshot's"
        " center may not show you; the sprites you see nearby are other characters."
    )
