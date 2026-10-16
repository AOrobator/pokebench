"""character-presence-v1: which story characters the current map's own object list places here.

The save block keeps the loaded map's object templates (SaveBlock1.objectEventTemplates,
include/global.h). A template whose flag is set is hidden (FlagGet in the field object
code), and graphics ids from OBJ_EVENT_GFX_VAR_0 resolve through VAR_OBJ_GFX_ID_0.

A graphics id alone is not an identity: Battle Tent, Battle Frontier, Contest Hall and
link scripts reuse the rival's graphics for other people (e.g.
SlateportCity_BattleTentBattleRoom/scripts.inc sets VAR_OBJ_GFX_ID_1 to
OBJ_EVENT_GFX_RIVAL_MAY_NORMAL for the opponent; Route111 uses it for the falling player).
So a character is named only on the maps where pret/pokeemerald 731ad5bf places that
story character: map.json object events with the character's graphics, or, for the rival,
maps whose scripts call Common_EventScript_SetupRivalGfxId / SetupRivalOnBikeGfxId
(data/scripts/rival_graphics.inc).
"""

import struct
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Protocol

from pokebench_env.game_screen import ReadMemory
from pokebench_env.world_context import SAVE_VARIABLES, LiveObject

TEMPLATES = 0xC70
TEMPLATE_COUNT = 64
SAVE_FLAGS = 0x1270
GFX_VAR_0 = 240
VAR_OBJ_GFX_ID_0 = 0x4010

_RIVAL_SCRIPT_MAPS = frozenset(
    {
        "LITTLEROOT TOWN", "LITTLEROOT TOWN PROFESSOR BIRCHS LAB", "OLDALE TOWN", "ROUTE103",
        "ROUTE104", "RUSTBORO CITY", "ROUTE110", "LAVARIDGE TOWN", "ROUTE119", "LILYCOVE CITY",
        "EVER GRANDE CITY CHAMPIONS ROOM",
    }
)  # fmt: skip
_HOUSES = frozenset(
    {
        "LITTLEROOT TOWN BRENDANS HOUSE 1F", "LITTLEROOT TOWN BRENDANS HOUSE 2F",
        "LITTLEROOT TOWN MAYS HOUSE 1F", "LITTLEROOT TOWN MAYS HOUSE 2F",
    }
)  # fmt: skip
OUT_OF_VIEW = " (on this map, out of view)"


class MapObjectTile(Protocol):
    @property
    def x(self) -> int: ...

    @property
    def y(self) -> int: ...

    @property
    def loaded(self) -> bool: ...


def _placed(entry: str, tiles: Mapping[str, MapObjectTile | None]) -> str:
    name = entry.removesuffix(OUT_OF_VIEW)
    tile = tiles.get(name) if entry.endswith(OUT_OF_VIEW) else None
    if tile is None:
        return entry
    if tile.loaded:
        return f"{name} at {tile.x},{tile.y} (out of view)"
    return (
        f"{name} at {tile.x},{tile.y} "
        "(out of view; where the map places this character, it may have moved)"
    )


# Each story character's graphics and the maps (MapNames form) where pret places that character.
CHARACTERS: tuple[tuple[str, frozenset[int], frozenset[str]], ...] = (
    (
        "PROF. BIRCH",
        frozenset({64}),
        frozenset(
            {
                "LITTLEROOT TOWN", "LITTLEROOT TOWN PROFESSOR BIRCHS LAB", "ROUTE101", "ROUTE103",
                "ROUTE110", "EVER GRANDE CITY CHAMPIONS ROOM",
            }
        ),
    ),
    (
        "MAY",
        frozenset(range(105, 110)),
        _RIVAL_SCRIPT_MAPS
        | {"LITTLEROOT TOWN MAYS HOUSE 1F", "LITTLEROOT TOWN MAYS HOUSE 2F"},
    ),
    (
        "BRENDAN",
        frozenset(range(100, 105)),
        _RIVAL_SCRIPT_MAPS
        | {"LITTLEROOT TOWN BRENDANS HOUSE 1F", "LITTLEROOT TOWN BRENDANS HOUSE 2F"},
    ),
    ("MOM", frozenset({215}), _HOUSES | {"LITTLEROOT TOWN"}),
    (
        "NORMAN",
        frozenset({129}),
        frozenset(
            {
                "LITTLEROOT TOWN BRENDANS HOUSE 1F", "LITTLEROOT TOWN MAYS HOUSE 1F",
                "PETALBURG CITY GYM",
            }
        ),
    ),
    (
        "WALLY",
        frozenset({135}),
        frozenset(
            {
                "PETALBURG CITY", "PETALBURG CITY GYM", "MAUVILLE CITY",
                "VERDANTURF TOWN WANDAS HOUSE", "VICTORY ROAD 1F",
            }
        ),
    ),
    ("ROXANNE", frozenset({125}), frozenset({"RUSTBORO CITY GYM"})),
    (
        "STEVEN",
        frozenset({134}),
        frozenset(
            {
                "GRANITE CAVE STEVENS ROOM", "METEOR FALLS STEVENS CAVE",
                "MOSSDEEP CITY SPACE CENTER 1F", "MOSSDEEP CITY SPACE CENTER 2F",
                "MOSSDEEP CITY STEVENS HOUSE", "ROUTE118", "ROUTE120", "ROUTE128",
                "SOOTOPOLIS CITY",
            }
        ),
    ),
)  # fmt: skip


@dataclass(frozen=True)
class StoryCharacters:
    here: tuple[str, ...]
    absent: tuple[str, ...]
    # Characters on this map but out of view, with their template's local id.
    out_of_view: tuple[tuple[str, int], ...] = ()

    def text(self, placed: "Mapping[int, MapObjectTile] | None" = None) -> str:
        # offscreen-objects-v1: an out-of-view character gets its tile; None keeps today's line.
        shown = self.here
        if placed is not None:
            tiles = {name: placed.get(local_id) for name, local_id in self.out_of_view}
            shown = tuple(_placed(entry, tiles) for entry in self.here)
        here = ", ".join(shown) if shown else "none"
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
    read: ReadMemory,
    save1: int,
    map_id: tuple[int, int],
    live: Sequence[LiveObject],
    *,
    location: str | None,
) -> StoryCharacters | None:
    if not 0x02000000 <= save1 < 0x02040000 - TEMPLATES - TEMPLATE_COUNT * 24:
        return None
    try:
        present = _present(read, save1, map_id, live, location)
    except (ValueError, OSError, struct.error, IndexError):
        return None
    return StoryCharacters(
        here=tuple(present[name][0] for name, _, _ in CHARACTERS if name in present),
        absent=tuple(name for name, _, _ in CHARACTERS if name not in present),
        out_of_view=tuple(
            (name, present[name][1])
            for name, _, _ in CHARACTERS
            if name in present and present[name][0].endswith(OUT_OF_VIEW)
        ),
    )


def _present(
    read: ReadMemory,
    save1: int,
    map_id: tuple[int, int],
    live: Sequence[LiveObject],
    location: str | None,
) -> dict[str, tuple[str, int]]:
    raw = read(save1 + TEMPLATES, TEMPLATE_COUNT * 24)
    if len(raw) != TEMPLATE_COUNT * 24:
        raise ValueError("short object template read")
    present: dict[str, tuple[str, int]] = {}
    for slot in range(TEMPLATE_COUNT):
        local_id, graphics = raw[slot * 24], raw[slot * 24 + 1]
        if local_id == 0 and graphics == 0:
            continue
        flag = struct.unpack_from("<H", raw, slot * 24 + 0x14)[0]
        if flag != 0 and _flag(read, save1, flag):
            continue
        resolved = _graphics(read, save1, graphics)
        for name, ids, maps in CHARACTERS:
            if resolved in ids and location in maps and name not in present:
                seen = next(
                    (o for o in live if o.local_id == local_id and o.map_id == map_id), None
                )
                present[name] = (
                    f"{name} at {seen.x},{seen.y}" if seen is not None else name + OUT_OF_VIEW,
                    local_id,
                )
    return present
