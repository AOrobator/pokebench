"""elevation-aware-map-v1: tiles the player cannot step onto from the current elevation.

pokeemerald 731ad5bf event_object_movement.c IsElevationMismatchAt: a walker at elevation 0,
or a tile at elevation 0 (transition) or 15 (multi-level, such as bridges), never mismatches;
any other step onto a tile at another elevation is refused (COLLISION_ELEVATION_MISMATCH).
While surfing, field_player_avatar.c turns that refusal into a dismount (CanStopSurfing),
so the view applies only off the water, and only when the avatar flags were read.
"""

from dataclasses import replace

from pokebench_env.live_map import FullMap, LocalMap

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
