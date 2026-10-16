"""offscreen-objects-v1: the people and objects on this map that the local map does not show.

The save block keeps the loaded map's object templates (SaveBlock1.objectEventTemplates,
include/global.h; struct ObjectEventTemplate in include/global.fieldmap.h): localId,
graphicsId, x and y as s16 at +4/+6 in map coordinates, flagId at +0x14. A template whose
flag is set is hidden (TrySpawnObjectEvents / FlagGet). Scripts that move an object for good
update its template (SetObjectEventTemplateCoords), so a template's x,y is where the map
places it now. The game only loads objects near the camera into gObjectEvents; a loaded
object's current tile comes from there instead.
"""

import struct
from collections.abc import Sequence
from dataclasses import dataclass

from pokebench_env.character_presence import TEMPLATE_COUNT, TEMPLATES, _flag, _graphics
from pokebench_env.game_screen import ReadMemory
from pokebench_env.live_map import MAP_OFFSET, OBJECT_EVENTS
from pokebench_env.world_context import GRAPHICS

SWITCH = "offscreen-objects-v1"
# The readout's local map and Field objects list cover the player's tile +/- this many tiles.
WINDOW = 7
HEADER = (
    "Off-screen people and objects on this map (from the map's own object list; "
    "more than 7 tiles from you, so the Field objects list leaves them out):"
)

NONE = "Off-screen people and objects on this map: none."


@dataclass(frozen=True)
class MapObject:
    local_id: int
    graphics_id: int
    sprite_kind: str | None
    x: int
    y: int
    # True: the game has it loaded and this is its tile now. False: the template's tile.
    loaded: bool

    def text(self, map_id: tuple[int, int]) -> str:
        where = (
            "loaded off screen, its tile now"
            if self.loaded
            else "not loaded; where the map places it, it may have moved"
        )
        return (
            f"- map {map_id[0]}/{map_id[1]} object {self.local_id}: "
            f"sprite {self.sprite_kind or 'unknown'} (graphics {self.graphics_id}) "
            f"at ({self.x},{self.y}), {where}"
        )


def offscreen_text(objects: Sequence[MapObject], map_id: tuple[int, int]) -> str:
    if not objects:
        return NONE
    return "\n".join([HEADER, *(o.text(map_id) for o in objects)])


def _loaded(read: ReadMemory, map_id: tuple[int, int]) -> dict[int, tuple[int, int] | None]:
    """Loaded objects of this map by local id: their tile, or None when made invisible."""
    found: dict[int, tuple[int, int] | None] = {}
    bodies = read(OBJECT_EVENTS, 16 * 0x24)
    for offset in range(0, len(bodies), 0x24):
        body = bodies[offset : offset + 0x24]
        if not body[0] & 1 or body[2] & 1 or (body[10], body[9]) != map_id:
            continue
        ox, oy = struct.unpack_from("<hh", body, 0x10)
        found[body[8]] = None if body[1] & 0x20 else (ox - MAP_OFFSET, oy - MAP_OFFSET)
    return found


def read_offscreen_objects(
    read: ReadMemory, save1: int, map_id: tuple[int, int], position: tuple[int, int]
) -> tuple[MapObject, ...] | None:
    if not 0x02000000 <= save1 < 0x02040000 - TEMPLATES - TEMPLATE_COUNT * 24:
        return None
    try:
        raw = read(save1 + TEMPLATES, TEMPLATE_COUNT * 24)
        if len(raw) != TEMPLATE_COUNT * 24:
            return None
        loaded = _loaded(read, map_id)
        px, py = position
        found = []
        for slot in range(TEMPLATE_COUNT):
            entry = raw[slot * 24 : slot * 24 + 24]
            local_id, graphics = entry[0], entry[1]
            if local_id == 0 and graphics == 0:
                continue
            flag = struct.unpack_from("<H", entry, 0x14)[0]
            if flag != 0 and _flag(read, save1, flag):
                continue
            if local_id in loaded:
                tile = loaded[local_id]
                if tile is None:
                    continue
                x, y, is_loaded = tile[0], tile[1], True
            else:
                x, y = struct.unpack_from("<hh", entry, 4)
                is_loaded = False
            if abs(x - px) <= WINDOW and abs(y - py) <= WINDOW:
                continue
            resolved = _graphics(read, save1, graphics)
            found.append(MapObject(local_id, resolved, GRAPHICS.get(resolved), x, y, is_loaded))
    except (ValueError, OSError, struct.error, IndexError):
        return None
    return tuple(found)
