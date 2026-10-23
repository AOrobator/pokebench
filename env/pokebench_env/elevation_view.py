"""elevation-aware-map-v1: tiles the player cannot step onto from the current elevation.

pokeemerald 731ad5bf event_object_movement.c IsElevationMismatchAt: a walker at elevation 0,
or a tile at elevation 0 (transition) or 15 (multi-level, such as bridges), never mismatches;
any other step onto a tile at another elevation is refused (COLLISION_ELEVATION_MISMATCH).
While surfing, field_player_avatar.c turns that refusal into a dismount (CanStopSurfing),
so the view applies only off the water, and only when the avatar flags were read.
"""

import struct
from dataclasses import replace

from pokebench_env.game_screen import ReadMemory
from pokebench_env.live_map import MAP_OFFSET, OBJECT_EVENTS, FullMap, LocalMap

SWITCH = "elevation-aware-map-v1"
GLYPH = "L"
MULTI_LEVEL = 15
# pokeemerald PLAYER_AVATAR_FLAG_SURFING.
SURFING = 1 << 3


def mismatch(player: int, tile: int) -> bool:
    return player != 0 and tile not in (0, MULTI_LEVEL) and tile != player


def elevation_view(
    shown: LocalMap | FullMap, player_elevation: int, avatar_flags: int | None
) -> tuple[LocalMap | FullMap, str]:
    if avatar_flags is None or avatar_flags & SURFING:
        return shown, ""
    rows = [list(row) for row in shown.rows]
    ox, oy = shown.origin
    levels: set[int] = set()
    for tile in shown.tiles:
        if tile.collision or not mismatch(player_elevation, tile.elevation):
            continue
        row, column = tile.y - oy, tile.x - ox
        # Collision, water, ledges, terrain, objects, warps and the player keep their glyphs.
        if rows[row][column] in (".", "g"):
            rows[row][column] = GLYPH
            levels.add(tile.elevation)
    if not levels:
        return shown, ""
    named = ", ".join(str(level) for level in sorted(levels))
    note = (
        f"Other levels ({GLYPH}): tiles at elevation {named}, while you are at elevation"
        f" {player_elevation}. The game refuses a step onto a tile at an elevation other than"
        " yours; tiles at elevation 0 or 15 accept any elevation."
    )
    return replace(shown, rows=tuple("".join(row) for row in rows)), note


def read_object_elevations(
    read: ReadMemory, map_id: tuple[int, int]
) -> tuple[tuple[int, int, int], ...]:
    """(x, y, currentElevation) of each object live_map lists on this map.

    pokeemerald DoesObjectCollideWithObjectAt: an object blocks a walker only when
    AreElevationsCompatible (either elevation 0, or both equal), so navigation needs both.
    """
    raw = read(OBJECT_EVENTS, 16 * 0x24)
    found = []
    for slot in range(16):
        body = raw[slot * 0x24 : (slot + 1) * 0x24]
        # The same objects live_map._objects lists: active, not hidden, not the player's slot flag.
        if not body[0] & 1 or body[1] & 0x20 or body[2] & 1 or (body[10], body[9]) != map_id:
            continue
        x, y = struct.unpack_from("<hh", body, 0x10)
        found.append((x - MAP_OFFSET, y - MAP_OFFSET, body[0x0B] & 15))
    return tuple(found)
