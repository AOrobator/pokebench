"""Game-owned current map bounds and connections, not a story-route recommendation.

pret/pokeemerald global.fieldmap.h MapHeader.connections at0x0C, signed count,
12-byte MapConnection records: direction0, offset4, group8, number9.

connection-edge-tiles-v1 adds, per walking connection, the current-map edge tiles a player can
walk off (fieldmap.c): the backup map's padding holds the connected map's blocks
(FillNorthConnection and friends) and MAPGRID_UNDEFINED elsewhere; a connection covers
`0 <= coord - offset < destination size` (IsPosInConnectingMap). A step across is refused by
collision, MAPGRID_UNDEFINED, an edge wall on the crossed side or an elevation mismatch
(GetCollisionAtCoords); surfable water needs SURF, so it is not a walk.
"""

import struct
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Protocol

from pokebench_env.game_screen import ReadMemory
from pokebench_env.live_map import (
    BACKUP_LAYOUT,
    EDGE_WALLS,
    MAP_HEADER,
    MAP_OFFSET,
    MAX_MAP_DATA_SIZE,
    _behavior,
    _layout,
)
from pokebench_env.menu_prelude import MAP_GROUP_SIZES
from pokebench_env.semantic_targets import connection_argument

DIRECTIONS = {1: "SOUTH", 2: "NORTH", 3: "WEST", 4: "EAST", 5: "DIVE", 6: "EMERGE"}
MAX_CONNECTIONS = 16
# pokeemerald 731ad5b gMapGroups (data/maps/groups); the pinned US ROM's address.
MAP_GROUPS = 0x08486578
MAPGRID_UNDEFINED = 0x3FF
# pokeemerald 731ad5b sTileBitAttributes TILE_FLAG_SURFABLE behaviors.
SURFABLE = frozenset(
    {0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x19, 0x22, 0x2A, 0x50, 0x51, 0x52, 0x53, 0x6C, 0x6D, 0x6F}
)
# Leaving side and step for each walking connection, and the button that takes the step.
STEPS = {
    "NORTH": ("north", "south", 0, -1, "UP"),
    "SOUTH": ("south", "north", 0, 1, "DOWN"),
    "WEST": ("west", "east", -1, 0, "LEFT"),
    "EAST": ("east", "west", 1, 0, "RIGHT"),
}


def _span(pointer: int, length: int) -> bool:
    return pointer % 4 == 0 and any(
        start <= pointer and pointer + length <= end
        for start, end in (
            (0x02000000, 0x02040000),
            (0x03000000, 0x03008000),
            (0x08000000, 0x0A000000),
        )
    )


class NameLookup(Protocol):
    def name(self, map_id: tuple[int, int]) -> str | None: ...


Tile = tuple[int, int]


@dataclass(frozen=True)
class Connection:
    direction: str
    offset: int
    destination: tuple[int, int]
    destination_name: str
    # connection-edge-tiles-v1 only: None when off, not a walking connection, or unreadable.
    edges: tuple[Tile, ...] | None = None

    def json(self) -> dict[str, object]:
        body: dict[str, object] = {
            "direction": self.direction,
            "offset": self.offset,
            "destination": self.destination,
            "destination_name": self.destination_name,
        }
        if self.edges is not None:
            body["edges"] = [{"x": x, "y": y} for x, y in self.edges]
        return body

    def line(self, note: str | None = None, *, target: bool = False) -> str:
        head = (
            f"- {self.direction} -> {self.destination_name} "
            f"(map {self.destination[0]}/{self.destination[1]}), offset {self.offset}; "
        )
        # surf-gated-exits-v1: an edge only reachable across water says so instead of how to cross.
        if note is not None:
            return head + note
        if self.direction not in STEPS:
            return head + "requires the corresponding field ability"
        if self.edges is None:
            return head + "boundary continuation: walk across the matching edge in this direction"
        if not self.edges:
            return head + (
                "no tile on this edge can be walked across"
                " (solid, water, a wall or outside the connected map)"
            )
        # semantic-navigation-v2: the tool's argument for a connection it can walk off.
        argument = connection_argument(self.direction) if target else None
        return (
            head
            + f"walk off the map from {edge_phrase(self.edges)}: stand on one of these edge tiles"
            + f" and press {STEPS[self.direction][4]}"
            + ("" if argument is None else f"; navigate_to_target target {argument}")
        )


def _at(tile: Tile) -> str:
    return f"({tile[0]},{tile[1]})"


def edge_phrase(tiles: tuple[Tile, ...]) -> str:
    """Every tile, in order; a run of three or more adjacent tiles is named by its two ends."""
    runs: list[list[Tile]] = []
    for tile in tiles:
        last = runs[-1][-1] if runs else None
        if last is not None and abs(tile[0] - last[0]) + abs(tile[1] - last[1]) == 1:
            runs[-1].append(tile)
        else:
            runs.append([tile])
    parts: list[str] = []
    for run in runs:
        if len(run) >= 3:
            parts.append(f"any tile from {_at(run[0])} to {_at(run[-1])}")
        else:
            parts.extend(_at(tile) for tile in run)
    return parts[0] if len(parts) == 1 else ", ".join(parts[:-1]) + " or " + parts[-1]


@dataclass(frozen=True)
class Topology:
    width: int
    height: int
    connections: tuple[Connection, ...]

    def json(self) -> dict[str, object]:
        return {
            "width": self.width,
            "height": self.height,
            "connections": tuple(c.json() for c in self.connections),
        }

    def text(self, notes: Mapping[int, str] | None = None, *, targets: bool = False) -> str:
        """notes: a note per connection, by its index in self.connections."""
        lines = [f"Current map bounds: X=0..{self.width - 1}, Y=0..{self.height - 1}"]
        lines.append(
            "Map connections (game-defined; terrain and story conditions may block passage):"
        )
        lines.extend(
            c.line(
                None if notes is None else notes.get(i),
                # navigate_to_target resolves a connection by direction alone: one per side only.
                target=targets and sum(o.direction == c.direction for o in self.connections) == 1,
            )
            for i, c in enumerate(self.connections)
        )
        if not self.connections:
            lines.append("- none defined; inspect doors/warps instead")
        return "\n".join(lines)


def _destination_size(read: ReadMemory, group: int, number: int) -> tuple[int, int] | None:
    """MapLayout width/height via gMapGroups[group][number]->mapLayout, or None if unreadable."""
    if not (0 <= group < len(MAP_GROUP_SIZES) and 0 <= number < MAP_GROUP_SIZES[group]):
        return None
    pointer = int.from_bytes(read(MAP_GROUPS + group * 4, 4), "little")
    if not _span(pointer, (number + 1) * 4):
        return None
    header = int.from_bytes(read(pointer + number * 4, 4), "little")
    if not _span(header, 4):
        return None
    layout = int.from_bytes(read(header, 4), "little")
    if not _span(layout, 8):
        return None
    width, height = struct.unpack("<II", read(layout, 8))
    if not (0 < width <= 256 and 0 < height <= 256):
        return None
    return width, height


def _edges(
    read: ReadMemory,
    direction: str,
    offset: int,
    destination: tuple[int, int],
    *,
    water: bool = False,
) -> tuple[Tile, ...] | None:
    """Edge tiles a player can cross; with water, also surfing ones (surf-gated-exits-v1)."""
    layout = _layout(read)
    size = _destination_size(read, *destination)
    if layout is None or size is None:
        return None
    leaving, entering, dx, dy, _ = STEPS[direction]
    width, height = layout.map_width, layout.map_height
    span = size[0] if dx == 0 else size[1]
    cache: dict[int, int] = {}

    def block(x: int, y: int) -> tuple[int, int, int, int]:
        raw = int.from_bytes(
            read(layout.buffer + 2 * ((y + MAP_OFFSET) * layout.width + x + MAP_OFFSET), 2),
            "little",
        )
        metatile = raw & 0x3FF
        behavior = -1 if metatile == MAPGRID_UNDEFINED else _behavior(read, layout, cache, metatile)
        return metatile, (raw >> 10) & 3, raw >> 12, behavior

    if dx == 0:
        edge_y = 0 if dy < 0 else height - 1
        tiles = [(x, edge_y) for x in range(width)]
    else:
        edge_x = 0 if dx < 0 else width - 1
        tiles = [(edge_x, y) for y in range(height)]
    found: list[Tile] = []
    for x, y in tiles:
        along = x if dx == 0 else y
        if not 0 <= along - offset < span:
            continue
        if crossable(block(x, y), block(x + dx, y + dy), leaving, entering, water=water):
            found.append((x, y))
    return tuple(found)


Block = tuple[int, int, int, int]


def crossable(here: Block, beyond: Block, leaving: str, entering: str, *, water: bool) -> bool:
    """One step across a map edge, each block as (metatile, collision, elevation, behavior)."""
    # Surfing onto or off water changes height: a crossing that touches water skips that check.
    wet = water and (here[3] in SURFABLE or beyond[3] in SURFABLE)
    return not (
        MAPGRID_UNDEFINED in (here[0], beyond[0])
        or here[1]
        or beyond[1]
        or (not wet and (here[3] in SURFABLE or beyond[3] in SURFABLE))
        or leaving in EDGE_WALLS.get(here[3], ())
        or entering in EDGE_WALLS.get(beyond[3], ())
        or (
            not wet and here[2] not in (0, 15) and beyond[2] not in (0, 15) and here[2] != beyond[2]
        )
    )


def read_topology(read: ReadMemory, maps: NameLookup, *, edges: bool = False) -> Topology | None:
    layout = int.from_bytes(read(MAP_HEADER, 4), "little")
    if not _span(layout, 8):
        return None
    width, height = struct.unpack("<II", read(layout, 8))
    backup_width, backup_height = struct.unpack("<II", read(BACKUP_LAYOUT, 8))
    if not (
        width > 0
        and height > 0
        and width * height <= MAX_MAP_DATA_SIZE
        and backup_width == width + 15
        and backup_height == height + 14
    ):
        return None
    table = int.from_bytes(read(MAP_HEADER + 12, 4), "little")
    if table == 0:
        return Topology(width, height, ())
    if not _span(table, 8):
        return None
    count, entries = struct.unpack("<iI", read(table, 8))
    if not 0 <= count <= MAX_CONNECTIONS or (count and not _span(entries, count * 12)):
        return None
    connections = []
    for index in range(count):
        direction, offset, group, number = struct.unpack(
            "<B3xiBB2x", read(entries + index * 12, 12)
        )
        if direction not in DIRECTIONS:
            return None
        destination = (group, number)
        connections.append(
            Connection(
                DIRECTIONS[direction],
                offset,
                destination,
                maps.name(destination) or f"unknown map {group}/{number}",
                _edges(read, DIRECTIONS[direction], offset, destination)
                if edges and DIRECTIONS[direction] in STEPS
                else None,
            )
        )
    return Topology(width, height, tuple(connections))
