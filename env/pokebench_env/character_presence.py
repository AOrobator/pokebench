"""character-presence-v1: which story characters the current map's own object list places here.

The save block keeps the loaded map's object templates (SaveBlock1.objectEventTemplates,
include/global.h). A template whose flag is set is hidden (FlagGet in the field object
code), and graphics ids from OBJ_EVENT_GFX_VAR_0 resolve through VAR_OBJ_GFX_ID_0.
"""

import struct
from collections.abc import Sequence
from dataclasses import dataclass

from pokebench_env.game_screen import ReadMemory
from pokebench_env.world_context import SAVE_VARIABLES, LiveObject

TEMPLATES = 0xC70
TEMPLATE_COUNT = 64
SAVE_FLAGS = 0x1270
GFX_VAR_0 = 240
VAR_OBJ_GFX_ID_0 = 0x4010

# Unique graphics of characters the story names; generic sprites never count as them.
CHARACTERS: tuple[tuple[str, frozenset[int]], ...] = (
    ("PROF. BIRCH", frozenset({64})),
    ("MAY", frozenset(range(105, 110))),
    ("BRENDAN", frozenset(range(100, 105))),
    ("MOM", frozenset({215})),
    ("NORMAN", frozenset({129})),
    ("WALLY", frozenset({135})),
    ("ROXANNE", frozenset({125})),
    ("STEVEN", frozenset({134})),
)


@dataclass(frozen=True)
class StoryCharacters:
    here: tuple[str, ...]
    absent: tuple[str, ...]

    def text(self) -> str:
        here = ", ".join(self.here) if self.here else "none"
        absent = ", ".join(self.absent) if self.absent else "none"
        return (
            f"Story characters here (from this map's own object list): {here}. "
            f"Not on this map: {absent}. "
            "Sprite kinds such as SCIENTIST_1 or FAT_MAN are not these characters."
        )


def _flag(read: ReadMemory, save1: int, flag: int) -> bool:
    return bool(read(save1 + SAVE_FLAGS + flag // 8, 1)[0] & (1 << (flag % 8)))


def _graphics(read: ReadMemory, save1: int, graphics: int) -> int:
    if graphics < GFX_VAR_0:
        return graphics
    var = VAR_OBJ_GFX_ID_0 + graphics - GFX_VAR_0
    return int(struct.unpack("<H", read(save1 + SAVE_VARIABLES + 2 * (var - 0x4000), 2))[0])


def read_story_characters(
    read: ReadMemory, save1: int, map_id: tuple[int, int], live: Sequence[LiveObject]
) -> StoryCharacters | None:
    if not 0x02000000 <= save1 < 0x02040000 - TEMPLATES - TEMPLATE_COUNT * 24:
        return None
    raw = read(save1 + TEMPLATES, TEMPLATE_COUNT * 24)
    present: dict[str, str] = {}
    for slot in range(TEMPLATE_COUNT):
        local_id, graphics = raw[slot * 24], raw[slot * 24 + 1]
        if local_id == 0 and graphics == 0:
            continue
        flag = struct.unpack_from("<H", raw, slot * 24 + 0x14)[0]
        if flag != 0 and _flag(read, save1, flag):
            continue
        resolved = _graphics(read, save1, graphics)
        for name, ids in CHARACTERS:
            if resolved in ids and name not in present:
                seen = next(
                    (o for o in live if o.local_id == local_id and o.map_id == map_id), None
                )
                present[name] = (
                    f"{name} at {seen.x},{seen.y}"
                    if seen is not None
                    else f"{name} (on this map, out of view)"
                )
    return StoryCharacters(
        here=tuple(present[name] for name, _ in CHARACTERS if name in present),
        absent=tuple(name for name, _ in CHARACTERS if name not in present),
    )
