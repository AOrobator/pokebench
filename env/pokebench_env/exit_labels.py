"""exit-labels-v2: warps named as the game's location popup names their map, plus the map ID.

pret/pokeemerald 731ad5b. ShowMapNamePopUpWindow (src/map_name_popup.c) prints
GetMapName(gMapHeader.regionMapSectionId) (src/region_map.c): gRegionMapEntries[mapsec].name
for mapsec < MAPSEC_NONE, the player's secret base name for MAPSEC_SECRET_BASE (not named here),
blanks otherwise. MapHeader.regionMapSectionId is the u8 at +0x14 (include/global.fieldmap.h).
gRegionMapEntries (8-byte RegionMapLocation {u8 x, y, width, height; const u8 *name}) is at
0x085A147C on the pinned US ROM, found by its LITTLEROOT TOWN and OLDALE TOWN entries.

When two or more exits of the current map lead to the same name, each such warp also says what is
reachable on foot from where it lands. The landing tile is the destination map's warp event
number `warpId` (WarpEvent {s16 x, y; u8 elevation, warpId, mapNum, mapGroup}). The destination
map's ROM layout (MapLayout {s32 width, height; u16 *border, *map; Tileset *primary, *secondary};
block = metatile 0-9, collision 10-11, elevation 12-15; behavior = metatileAttributes & 0xFF,
512 metatiles in the primary tileset) is flooded from there with exit_reach's rules
(surf_gate.classify). A map connection counts when a reached edge tile can be crossed into the
connected map's ROM layout under topology.crossable, as connection-edge-tiles-v1 checks the live
map. Scripts that change metatiles at run time (setmetatile) are not seen; the ROM layout is what
the map holds when it loads.

field-move-gates-v1: with gates, the destination's flood closes the obstacles the map places on
load (its ROM object templates whose hide flag is clear; temp flags are cleared on every load, so
those count as clear) and its gated terrain, under the player's capabilities now.
"""

import struct
from collections.abc import Callable, Iterable
from dataclasses import dataclass

from pokebench_env.character_presence import _flag
from pokebench_env.displayed_names import _text
from pokebench_env.field_moves import (
    Capabilities,
    FloodRules,
    RomObject,
    Tiles,
    map_gates,
    rom_object_obstacles,
)
from pokebench_env.game_screen import ReadMemory
from pokebench_env.places import _header
from pokebench_env.surf_gate import FOOT, classify
from pokebench_env.topology import DIRECTIONS, STEPS, Block, Topology, _span, crossable
from pokebench_env.world import InteractionTarget

SWITCH = "exit-labels-v2"
REGION_MAP_ENTRIES = 0x085A147C
MAPSEC_SECRET_BASE = 86
MAPSEC_NONE = 213
SECTION_OFFSET = 0x14
DYNAMIC = (127, 127)
MAX_WARPS = 64
MAX_CONNECTIONS = 16
MAX_OBJECTS = 64
# FLAG_TEMP_1..FLAG_TEMP_1F (include/constants/flags.h), cleared by ClearTempFieldEventData.
TEMP_FLAGS = range(0x01, 0x20)
PRIMARY_METATILES = 512
ROM_START, ROM_END = 0x08000000, 0x0A000000
# A map whose popup prints blanks (MAPSEC_DYNAMIC: the cable club's UNION ROOM, TRADE CENTER and
# RECORD CORNER; MAPSEC_NONE): the game shows no name, so the readout says only that.
UNNAMED = "a map with no location name"
# A warp to the map the player is on (the PETALBURG CITY GYM's room doors).
THIS_MAP = "this map"

MapId = tuple[int, int]
Tile = tuple[int, int]
Shown = Callable[[MapId], str | None]
# field-move-gates-v1: the player's capabilities, SaveBlock1 and the map-table names.
DestinationGates = tuple[Capabilities, int, Callable[[MapId], str | None]]


def _u32(read: ReadMemory, address: int) -> int:
    return int.from_bytes(read(address, 4), "little")


def _halfwords(pointer: int, count: int) -> bool:
    """A u16 array in ROM: 2-byte aligned (map data and metatile attributes need not be 4)."""
    return pointer % 2 == 0 and ROM_START <= pointer and pointer + 2 * count <= ROM_END


def section_name(read: ReadMemory, map_id: MapId) -> str | None:
    """The name the location popup prints for this map, or None when the game prints none."""
    header = _header(read, *map_id)
    if header is None:
        return None
    mapsec = read(header + SECTION_OFFSET, 1)[0]
    if mapsec >= MAPSEC_NONE or mapsec == MAPSEC_SECRET_BASE:
        return None
    return _text(read, _u32(read, REGION_MAP_ENTRIES + 8 * mapsec + 4), None) or None


@dataclass(frozen=True)
class RomMap:
    width: int
    height: int
    blocks: tuple[Block, ...]
    # (x, y, warpId, mapGroup, mapNum) in event order; the order is what warpId indexes.
    warps: tuple[tuple[int, int, int, int, int], ...]
    connections: tuple[tuple[str, int, MapId], ...]
    # ObjectEventTemplates in event order: (localId, graphicsId, x, y, flagId).
    objects: tuple[RomObject, ...] = ()

    def block(self, x: int, y: int) -> Block | None:
        if 0 <= x < self.width and 0 <= y < self.height:
            return self.blocks[y * self.width + x]
        return None


def read_rom_map(read: ReadMemory, map_id: MapId) -> RomMap | None:
    """One map's layout, warps and connections from its ROM header, or None when unreadable."""
    header = _header(read, *map_id)
    if header is None:
        return None
    layout, events, _, table = struct.unpack("<IIII", read(header, 16))
    if not _span(layout, 24):
        return None
    width, height, _, data, primary, secondary = struct.unpack("<iiIIII", read(layout, 24))
    if not (0 < width <= 256 and 0 < height <= 256 and _halfwords(data, width * height)):
        return None
    if not (_span(primary, 0x14) and _span(secondary, 0x14)):
        return None
    attributes = (_u32(read, primary + 0x10), _u32(read, secondary + 0x10))
    if not all(_halfwords(a, 1) for a in attributes):
        return None
    behaviors: dict[int, int] = {}

    def behavior(metatile: int) -> int:
        if metatile not in behaviors:
            which = int(metatile >= PRIMARY_METATILES)
            address = attributes[which] + 2 * (metatile - PRIMARY_METATILES * which)
            behaviors[metatile] = int.from_bytes(read(address, 2), "little") & 0xFF
        return behaviors[metatile]

    raw = struct.unpack(f"<{width * height}H", read(data, 2 * width * height))
    blocks = tuple((b & 0x3FF, (b >> 10) & 3, b >> 12, behavior(b & 0x3FF)) for b in raw)
    warps: list[tuple[int, int, int, int, int]] = []
    objects: list[RomObject] = []
    if _span(events, 12):
        total = read(events, 1)[0]
        pointer = _u32(read, events + 4)
        if total <= MAX_OBJECTS and (total == 0 or _span(pointer, total * 24)):
            body = read(pointer, total * 24) if total else b""
            for i in range(total):
                local_id, graphics = body[i * 24], body[i * 24 + 1]
                x, y = struct.unpack_from("<hh", body, i * 24 + 4)
                flag = struct.unpack_from("<H", body, i * 24 + 0x14)[0]
                objects.append((local_id, graphics, x, y, flag))
        count = read(events + 1, 1)[0]
        pointer = _u32(read, events + 8)
        if count <= MAX_WARPS and (count == 0 or _span(pointer, count * 8)):
            body = read(pointer, count * 8) if count else b""
            for i in range(count):
                x, y, _, warp, number, group = struct.unpack_from("<hhBBBB", body, i * 8)
                warps.append((x, y, warp, group, number))
    connections: list[tuple[str, int, MapId]] = []
    if _span(table, 8):
        total, entries = struct.unpack("<iI", read(table, 8))
        if 0 <= total <= MAX_CONNECTIONS and (total == 0 or _span(entries, total * 12)):
            for i in range(total):
                direction, offset, group, number = struct.unpack(
                    "<B3xiBB2x", read(entries + i * 12, 12)
                )
                if DIRECTIONS.get(direction) in STEPS:
                    connections.append((DIRECTIONS[direction], offset, (group, number)))
    return RomMap(width, height, blocks, tuple(warps), tuple(connections), tuple(objects))


def _edge(rom: RomMap, direction: str, offset: int, beyond: RomMap) -> tuple[Tile, ...]:
    """Edge tiles of `rom` a player can walk across into the connected map `beyond`."""
    leaving, entering, dx, dy, _ = STEPS[direction]
    if dx == 0:
        y = 0 if dy < 0 else rom.height - 1
        far = beyond.height - 1 if dy < 0 else 0
        pairs = [((x, y), beyond.block(x - offset, far)) for x in range(rom.width)]
    else:
        x = 0 if dx < 0 else rom.width - 1
        far = beyond.width - 1 if dx < 0 else 0
        pairs = [((x, y), beyond.block(far, y - offset)) for y in range(rom.height)]
    found: list[Tile] = []
    for tile, other in pairs:
        here = rom.block(*tile)
        if here is not None and other is not None:
            if crossable(here, other, leaving, entering, water=False):
                found.append(tile)
    return tuple(found)


def _at(tiles: Iterable[Tile]) -> str:
    return " or ".join(f"({x},{y})" for x, y in tiles)


def _label(map_id: MapId, shown: Shown, here: MapId) -> str:
    name = THIS_MAP if map_id == here else shown(map_id) or UNNAMED
    return f"{name} (map {map_id[0]}/{map_id[1]})"


def _doorways(warps: list[tuple[int, int, MapId]]) -> list[tuple[MapId, list[Tile]]]:
    """Adjacent warps in event order that lead to the same map read as one exit (a doorway)."""
    groups: list[tuple[MapId, list[Tile]]] = []
    for x, y, to in warps:
        last = groups[-1] if groups else None
        if (
            last is not None
            and last[0] == to
            and abs(last[1][-1][0] - x) + abs(last[1][-1][1] - y) == 1
        ):
            last[1].append((x, y))
        else:
            groups.append((to, [(x, y)]))
    return groups


def destination_rules(
    read: ReadMemory,
    rom: RomMap,
    target: MapId,
    tiles: Tiles,
    gates: DestinationGates | None,
) -> FloodRules | None:
    """The existing field-move owner supplies the same arrival rules to both label versions."""
    rules = None
    if gates is not None:
        caps, save1, names = gates
        location = names(target)

        def hidden(flag: int) -> bool:
            return flag not in TEMP_FLAGS and _flag(read, save1, flag)

        objects = rom_object_obstacles(rom.objects, hidden, location)
        rules = map_gates(caps, objects, tiles, location).rules()
    return rules


def arrival_text(
    read: ReadMemory,
    here_id: MapId,
    here: RomMap,
    destination: tuple[int, int, int],
    shown: Shown,
    cache: dict[MapId, RomMap | None],
    gates: DestinationGates | None = None,
) -> str | None:
    """`, arriving at (x,y); from there, on foot: ...` for one warp, or None when unreadable."""
    group, number, warp = destination
    target = (group, number)

    def rom_map(map_id: MapId) -> RomMap | None:
        if map_id not in cache:
            cache[map_id] = read_rom_map(read, map_id)
        return cache[map_id]

    rom = rom_map(target)
    if rom is None or warp >= len(rom.warps):
        return None
    start = rom.warps[warp][:2]
    tiles = {
        (x, y): (block[1], block[3])
        for y in range(rom.height)
        for x in range(rom.width)
        if (block := rom.block(x, y)) is not None
    }
    edges = {}
    for direction, offset, to in rom.connections:
        beyond = rom_map(to)
        if beyond is not None:
            dry = _edge(rom, direction, offset, beyond)
            edges[(direction, to, offset)] = (dry, dry)
    rules = destination_rules(read, rom, target, tiles, gates)
    reached = classify(
        tiles, start, warps=[(x, y) for x, y, *_ in rom.warps], connections=edges, rules=rules
    )
    foot = {tile for tile, how in reached.warps if how == FOOT}
    groups = _doorways(
        [(x, y, (g, n)) for x, y, _w, g, n in rom.warps if (x, y) in foot and (g, n) != DYNAMIC]
    )
    backs_of: dict[Tile, Tile] = {
        (x, y): here.warps[w][:2]
        for x, y, w, g, n in rom.warps
        if (g, n) == here_id and w < len(here.warps)
    }
    parts = [
        f"{_at(tiles_)} -> this map at {_at(dict.fromkeys(backs))}"
        if to == here_id and (backs := [backs_of[t] for t in tiles_ if t in backs_of])
        else f"{_at(tiles_)} -> {_label(to, shown, here_id)}"
        for to, tiles_ in groups
    ]
    parts += [
        f"{direction} edge -> {_label(to, shown, here_id)}"
        for (direction, to, _offset), how in reached.connections
        if how == FOOT
    ]
    return f", arriving at {_at([start])}; from there, on foot: " + (
        "; ".join(parts) if parts else "no exit of that map"
    )


@dataclass(frozen=True)
class ExitLabels:
    # (group, number, name) for each destination map the readout names.
    names: tuple[tuple[int, int, str], ...]
    # (x, y, arrival text) for each warp of this map that shares its destination's name.
    arrivals: tuple[tuple[int, int, str], ...]

    def name_map(self) -> dict[MapId, str]:
        return {(g, n): name for g, n, name in self.names}

    def arrival(self, x: int, y: int) -> str | None:
        return next((text for a, b, text in self.arrivals if (a, b) == (x, y)), None)


def read_exit_labels(
    read: ReadMemory,
    map_id: MapId,
    targets: tuple[InteractionTarget, ...] | None,
    topology: Topology | None,
    shown: Shown,
    gates: DestinationGates | None = None,
) -> ExitLabels:
    """Names for this map's warp destinations, and arrival reach for warps sharing a name.

    `shown` gives the name the readout uses for a map: a displayed-place-names-v1 name when the
    game has shown one, else the popup's section name, else None.
    """
    warps = [
        (t.x, t.y, t.destination)
        for t in targets or ()
        if t.kind == "warp" and t.destination is not None and t.destination[:2] != DYNAMIC
    ]
    names: dict[MapId, str] = {}
    unnamed: set[MapId] = set()
    for _x, _y, (g, n, _w) in warps:
        if (g, n) in names:
            continue
        if (g, n) == map_id:
            names[(g, n)] = THIS_MAP
        elif (name := shown((g, n))) is not None:
            names[(g, n)] = name
        elif _header(read, g, n) is not None:
            names[(g, n)] = UNNAMED
            unnamed.add((g, n))
    # One count per exit: a doorway's adjacent warp tiles are one exit.
    counts: dict[str, int] = {}
    for to, _tiles in _doorways([(x, y, d[:2]) for x, y, d in warps]):
        if to in names and to not in unnamed:
            counts[names[to]] = counts.get(names[to], 0) + 1
    for c in () if topology is None else topology.connections:
        if (name := shown(c.destination)) is not None:
            counts[name] = counts.get(name, 0) + 1
    here = read_rom_map(read, map_id)
    cache: dict[MapId, RomMap | None] = {}
    arrivals: list[tuple[int, int, str]] = []
    for x, y, destination in warps:
        name = names.get(destination[:2])
        if here is None or name is None or counts.get(name, 0) < 2:
            continue
        text = arrival_text(read, map_id, here, destination, shown, cache, gates)
        if text is not None:
            arrivals.append((x, y, text))
    return ExitLabels(tuple((g, n, name) for (g, n), name in names.items()), tuple(arrivals))
