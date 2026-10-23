"""Special terrain under field-move-gates-v1, from live metatile behaviors.

Effects: pokeemerald 731ad5bf field_player_avatar.c forced movement table,
field_tasks.c (ice/cracked floors), bike.c and field_control_avatar.c.
No route, bike technique, or puzzle solution is selected here.
"""

from dataclasses import replace
from typing import TypeVar

from pokebench_env.field_moves import FieldObstacles
from pokebench_env.live_map import FullMap, LocalMap

K = TypeVar("K")

# glyph, observable terrain, consequence; intentionally no undiscovered item/move names.
TERRAIN: dict[int, tuple[str, str, str]] = {
    0xD0: ("s", "muddy slope", "slides south on foot; climbing north requires sufficient speed"),
    0xD1: ("b", "bumpy slope", "requires special movement; walking navigation cannot climb it"),
    0xD2: ("f", "cracked floor", "can break and drop you through; walking navigation avoids it"),
    0x66: ("o", "hole", "not ordinary walking ground; may drop you to another floor"),
    0x0F: ("o", "hole", "drops you to another floor"),
    0x13: ("w", "waterfall", "water flows south; climbing requires a usable field move"),
    0x20: ("i", "ice", "movement can slide; walking navigation avoids it"),
    0x26: ("t", "thin ice", "changes when stepped on; walking navigation avoids it"),
    0x27: ("c", "cracked ice", "can break when stepped on; walking navigation avoids it"),
    0x48: ("p", "spin tile", "forces movement; walking navigation avoids it"),
    0xBB: ("j", "jump mat", "forces a jump; walking navigation avoids it"),
    0xBC: ("p", "spin mat", "forces spinning; walking navigation avoids it"),
    **{
        b: ("r", "rail", "requires special movement; walking navigation avoids it")
        for b in range(0xD3, 0xD7)
    },
    **{
        b: ("F", f"forced movement {d}", "walking navigation avoids it")
        for b, d in zip(range(0x40, 0x48), ("east", "west", "north", "south") * 2, strict=True)
    },
    **{
        b: (
            "C",
            f"water current {d}",
            "forces movement while surfing; walking navigation avoids it",
        )
        for b, d in zip(range(0x50, 0x54), ("east", "west", "north", "south"), strict=True)
    },
}
SANDSTORM = ("!", "sandstorm boundary", "the game pushes you back while its item gate is closed")


def terrain_description(behavior: int) -> str | None:
    terrain = TERRAIN.get(behavior)
    return None if terrain is None else f"{terrain[1]} ({terrain[0]}), {terrain[2]}"


def terrain_view(
    shown: LocalMap | FullMap, field: FieldObstacles[K] | None
) -> tuple[LocalMap | FullMap, str]:
    rows = [list(row) for row in shown.rows]
    ox, oy = shown.origin
    sand = {
        tile
        for o in (() if field is None else field.gates.obstacles)
        if o.gate == "go_goggles" and field is not None and field.gates.closed(o)
        for tile in o.tiles
    }
    named: dict[tuple[str, str, str], None] = {}
    for tile in shown.tiles:
        terrain = SANDSTORM if (tile.x, tile.y) in sand else TERRAIN.get(tile.behavior)
        if terrain is None or tile.collision:
            continue
        named[terrain] = None
        row, column = tile.y - oy, tile.x - ox
        # Player, loaded objects and warps retain their activation/identity glyphs.
        if rows[row][column] in (".", "~"):
            rows[row][column] = terrain[0]
    if not named:
        return shown, ""
    legend = "; ".join(f"{glyph} {name}: {effect}" for glyph, name, effect in named)
    return replace(
        shown, rows=tuple("".join(row) for row in rows)
    ), f"Special terrain (live tiles): {legend}."
