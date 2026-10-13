"""Game-owned current map bounds and connections, not a story-route recommendation.

pret/pokeemerald global.fieldmap.h MapHeader.connections at0x0C, signed count,
12-byte MapConnection records: direction0, offset4, group8, number9.
"""

import struct
from dataclasses import asdict, dataclass
from typing import Protocol

from pokebench_env.game_screen import ReadMemory
from pokebench_env.live_map import BACKUP_LAYOUT, MAP_HEADER, MAX_MAP_DATA_SIZE

DIRECTIONS = {1: "SOUTH", 2: "NORTH", 3: "WEST", 4: "EAST", 5: "DIVE", 6: "EMERGE"}
MAX_CONNECTIONS = 16


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


@dataclass(frozen=True)
class Connection:
    direction: str
    offset: int
    destination: tuple[int, int]
    destination_name: str


@dataclass(frozen=True)
class Topology:
    width: int
    height: int
    connections: tuple[Connection, ...]

    def json(self) -> dict[str, object]:
        return asdict(self)

    def text(self) -> str:
        lines = [f"Current map bounds: X=0..{self.width - 1}, Y=0..{self.height - 1}"]
        lines.append(
            "Map connections (game-defined; terrain and story conditions may block passage):"
        )
        lines.extend(
            f"- {c.direction} -> {c.destination_name} (map {c.destination[0]}/{c.destination[1]}), "
            f"offset {c.offset}; "
            + (
                "boundary continuation: walk across the matching edge in this direction"
                if c.direction in {"NORTH", "SOUTH", "EAST", "WEST"}
                else "requires the corresponding field ability"
            )
            for c in self.connections
        )
        if not self.connections:
            lines.append("- none defined; inspect doors/warps instead")
        return "\n".join(lines)


def read_topology(read: ReadMemory, maps: NameLookup) -> Topology | None:
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
            )
        )
    return Topology(width, height, tuple(connections))
