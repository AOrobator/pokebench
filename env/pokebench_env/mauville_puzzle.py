"""Observable Mauville Gym tiles, from the paired live map, without solving its puzzle.

pokeemerald 731ad5bf: metatile_labels.h, MauvilleCity_Gym/scripts.inc and
field_specials.c MauvilleGymSetDefaultBarriers/MauvilleGymPressSwitch.
Only door footprints are drawn, not their collision-free upper graphics or fixed poles.
"""

from dataclasses import replace

from pokebench_env.live_map import FullMap, LocalMap, MapTile

SWITCH = "mauville-puzzle-readout-v1"
MAP = (10, 0)
SWITCHES = {0x205: "raised", 0x206: "pressed"}
# Horizontal door footprints; the upper halves are purely visual.
HORIZONTAL = frozenset({0x228, 0x229, 0x22A, 0x22B, 0x238, 0x239, 0x23A, 0x23B})
# Open vertical doors become ordinary FloorTile/PoleTop_Off, so qualify by footprint too.
VERTICAL = {
    (6, 9): frozenset({0x248, 0x21A}),
    (6, 10): frozenset({0x250, 0x251}),
    (3, 12): frozenset({0x249, 0x21A}),
    (3, 13): frozenset({0x250, 0x251}),
}
LEGEND = (
    "Mauville puzzle (live tiles): S raised floor switch; s pressed floor switch; "
    "E electric door blocked now; e electric door open now. "
    "@, N and W keep priority; the lists below include tiles under them."
)


def _door(tile: MapTile) -> bool:
    return tile.metatile in HORIZONTAL or tile.metatile in VERTICAL.get((tile.x, tile.y), ())


def switch_name(
    shown: LocalMap | FullMap | None, map_id: tuple[int, int] | None, x: int, y: int
) -> str | None:
    if map_id != MAP or shown is None:
        return None
    tile = next((t for t in shown.tiles if (t.x, t.y) == (x, y)), None)
    status = None if tile is None else SWITCHES.get(tile.metatile)
    return None if status is None else f"floor switch ({status})"


def puzzle_view(
    shown: LocalMap | FullMap, map_id: tuple[int, int] | None
) -> tuple[LocalMap | FullMap, str]:
    if map_id != MAP:
        return shown, ""
    rows = [list(row) for row in shown.rows]
    ox, oy = shown.origin
    switches: list[str] = []
    blocked: list[str] = []
    opened: list[str] = []
    for tile in shown.tiles:
        status = SWITCHES.get(tile.metatile)
        at = f"({tile.x},{tile.y})"
        if status is not None:
            switches.append(f"{at} {status}")
            glyph = "S" if status == "raised" else "s"
        elif _door(tile):
            (blocked if tile.collision else opened).append(at)
            glyph = "E" if tile.collision else "e"
        else:
            continue
        row, column = tile.y - oy, tile.x - ox
        if rows[row][column] in {".", "#"}:
            rows[row][column] = glyph
    if not switches and not blocked and not opened:
        return shown, ""
    note = (
        LEGEND
        + "\nFloor switches now: "
        + ("; ".join(switches) or "none in this view")
        + "\nElectric door tiles now: blocked "
        + (", ".join(blocked) or "none in this view")
        + "; open "
        + (", ".join(opened) or "none in this view")
        + ". These are the current live tiles, not permanent walls."
    )
    return replace(shown, rows=tuple("".join(row) for row in rows)), note
