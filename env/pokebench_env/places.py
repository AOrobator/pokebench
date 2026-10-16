"""The game's own map table: every map's name, its warps and its walking connections.

story-destinations-v1 (agent side) resolves a place a story line names against this directory.
Read from the ROM, pret/pokeemerald 731ad5b:

- gMapGroups (data/maps/groups, `topology.MAP_GROUPS`): one MapHeader pointer per map.
- MapHeader (include/global.fieldmap.h): events at +0x04, connections at +0x0C.
- MapEvents: warpCount at +1, warps pointer at +8; WarpEvent is 8 bytes
  (s16 x, s16 y, u8 elevation, u8 warpId, u8 mapNum, u8 mapGroup).
- MapConnections: s32 count, pointer; MapConnection is 12 bytes (u8 direction, s32 offset,
  u8 mapGroup, u8 mapNum).

Each map is named as the readout names it: the building's sign text when displayed-place-names-v1
is on (`displayed_names.place_name`), else the map table name. Dynamic warps (127/127) lead
nowhere fixed and are left out. A map whose header cannot be read is left out, never guessed.
"""

import struct
from collections.abc import Iterable
from dataclasses import dataclass
from typing import Protocol

from pokebench_env.displayed_names import place_name, player_gender
from pokebench_env.game_screen import ReadMemory
from pokebench_env.gba_text import decode_text
from pokebench_env.menu_prelude import MAP_GROUP_SIZES
from pokebench_env.topology import DIRECTIONS, MAP_GROUPS, MAX_CONNECTIONS, _span

DYNAMIC = (127, 127)
MAX_WARPS = 64
SAVE_BLOCK_PTRS = 0x03005D8C

MapId = tuple[int, int]


class MapTable(Protocol):
    def ids(self) -> Iterable[MapId]: ...
    def name(self, map_id: MapId) -> str | None: ...


@dataclass(frozen=True)
class Links:
    warps: tuple[tuple[int, int, MapId], ...]
    connections: tuple[tuple[str, MapId], ...]


@dataclass(frozen=True)
class Place:
    map_id: MapId
    name: str
    display: str
    links: Links

    def json(self) -> dict[str, object]:
        return {
            "map_id": list(self.map_id),
            "name": self.name,
            "display": self.display,
            "warps": [{"x": x, "y": y, "to": list(to)} for x, y, to in self.links.warps],
            "connections": [
                {"direction": direction, "to": list(to)} for direction, to in self.links.connections
            ],
        }


def _u32(read: ReadMemory, address: int) -> int:
    return int.from_bytes(read(address, 4), "little")


def _header(read: ReadMemory, group: int, number: int) -> int | None:
    if not (0 <= group < len(MAP_GROUP_SIZES) and 0 <= number < MAP_GROUP_SIZES[group]):
        return None
    table = _u32(read, MAP_GROUPS + group * 4)
    if not _span(table, (number + 1) * 4):
        return None
    header = _u32(read, table + number * 4)
    return header if _span(header, 16) else None


def read_links(read: ReadMemory, map_id: MapId) -> Links | None:
    """One map's fixed warps and walking/diving connections from its ROM header, or None."""
    header = _header(read, *map_id)
    if header is None:
        return None
    events = _u32(read, header + 4)
    if not _span(events, 20):
        return None
    count = read(events + 1, 1)[0]
    pointer = _u32(read, events + 8)
    if count > MAX_WARPS or (count and not _span(pointer, count * 8)):
        return None
    warps: list[tuple[int, int, MapId]] = []
    raw = read(pointer, count * 8) if count else b""
    for index in range(count):
        x, y, _, _, number, group = struct.unpack_from("<hhBBBB", raw, index * 8)
        if (group, number) != DYNAMIC:
            warps.append((x, y, (group, number)))
    connections: list[tuple[str, MapId]] = []
    table = _u32(read, header + 12)
    if table:
        if not _span(table, 8):
            return None
        total, entries = struct.unpack("<iI", read(table, 8))
        if not 0 <= total <= MAX_CONNECTIONS or (total and not _span(entries, total * 12)):
            return None
        for index in range(total):
            direction, _, group, number = struct.unpack("<B3xiBB2x", read(entries + index * 12, 12))
            if direction not in DIRECTIONS:
                return None
            connections.append((DIRECTIONS[direction], (group, number)))
    return Links(tuple(warps), tuple(connections))


def save_names(read: ReadMemory) -> tuple[int | None, str | None]:
    """The saved player gender and name, or (None, None) before a save block exists."""
    save2 = _u32(read, SAVE_BLOCK_PTRS + 4)
    if not (0x02000000 <= save2 <= 0x02040000 - 0xB0 and save2 % 4 == 0):
        return None, None
    return player_gender(read, save2), decode_text(read(save2, 8)) or None


class PlaceDirectory:
    """The map table's links read once (ROM data never changes); names per request."""

    def __init__(self, read: ReadMemory, maps: MapTable) -> None:
        self._read = read
        self._maps = maps
        self._links: dict[MapId, Links] | None = None

    def links(self) -> dict[MapId, Links]:
        if self._links is None:
            found = {}
            for map_id in self._maps.ids():
                links = read_links(self._read, map_id)
                if links is not None:
                    found[map_id] = links
            self._links = found
        return self._links

    def places(self, *, displayed: bool) -> tuple[Place, ...]:
        gender, player = save_names(self._read) if displayed else (None, None)
        out = []
        for map_id, links in self.links().items():
            name = self._maps.name(map_id)
            if name is None:
                continue
            shown = place_name(name, gender, player) if displayed else None
            out.append(Place(map_id, name, shown or name, links))
        return tuple(out)
