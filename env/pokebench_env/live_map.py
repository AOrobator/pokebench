"""A local grid from Emerald's live backup map and active object events.

Layouts/masks follow pret/pokeemerald include/global.fieldmap.h and fieldmap.h.
The 7-tile padding and mutable backup map are used, not a static reference map.
Addresses were verified on the pinned US ROM; see docs/findings/game-state.md.
"""

import struct
from dataclasses import dataclass

from pokebench_env.game_screen import ReadMemory

MAP_HEADER = 0x02037318
BACKUP_LAYOUT = 0x03005DC0
OBJECT_EVENTS = 0x02037350
MAP_OFFSET = 7
MAX_MAP_DATA_SIZE = 10240
# pokeemerald 731ad5b metatile_behaviors.h MB_JUMP_EAST/WEST/NORTH/SOUTH. These tiles carry
# collision, but moving into one in its direction jumps two tiles (GetLedgeJumpDirection).
LEDGES = {0x38: ">", 0x39: "<", 0x3A: "^", 0x3B: "v"}


def _pointer(value: int) -> bool:
    return (
        0x02000000 <= value < 0x02040000
        or 0x03000000 <= value < 0x03008000
        or 0x08000000 <= value < 0x0A000000
    )


def _u32(read: ReadMemory, address: int) -> int:
    return int.from_bytes(read(address, 4), "little")


def _warp_trigger(behavior: int | None) -> str:
    # pokeemerald field_control_avatar.c and metatile_behavior.c, revision731ad5b.
    directions = {
        0x62: "RIGHT",
        0x63: "LEFT",
        0x64: "UP",
        0x65: "DOWN",
        0x1B: "UP",
        0x1C: "DOWN",
        0x6D: "DOWN",
    }
    if behavior in directions:
        return f"directional exit: stand on tile, then press {directions[behavior]}"
    if behavior == 0x69:
        return "door: approach from below and press UP toward door"
    if behavior in {0x0E, 0x0F, 0x29, 0x60, 0x61, 0x67, 0x68, 0x6A, 0x6B, 0x6C, 0x6E}:
        return "step onto tile"
    return "activation unknown"


@dataclass(frozen=True)
class MapTile:
    x: int
    y: int
    metatile: int
    collision: int
    behavior: int
    elevation: int = 0


@dataclass(frozen=True)
class LocalMap:
    origin: tuple[int, int]
    rows: tuple[str, ...]
    tiles: tuple[MapTile, ...]
    objects: tuple[tuple[int, int, int], ...]
    warps: tuple[tuple[int, int, int, int], ...]

    def text(self, *, grid: bool = True, warp_guidance: bool = True, ledges: bool = True) -> str:
        x, y = self.origin
        cells = self.rows if ledges else _rows_without_ledges(self.rows, self.tiles, self.origin)
        rows = (
            "     "
            + " ".join(f"{x + i:3}" for i in range(len(cells[0])))
            + "\n"
            + "\n".join(
                f"{y + i:4} " + " ".join(f"{c:>3}" for c in row) for i, row in enumerate(cells)
            )
            if grid
            else "\n".join(cells)
        )
        return (
            f"Local map from live memory; top-left ({x},{y}), north is up:\n"
            + rows
            + _details(
                self.tiles, self.objects, self.warps, warp_guidance, outside=True, ledges=ledges
            )
        )


@dataclass(frozen=True)
class FullMap:
    """The whole current map (full-map-navigation-v1), one character per tile."""

    width: int
    height: int
    rows: tuple[str, ...]
    tiles: tuple[MapTile, ...]
    objects: tuple[tuple[int, int, int], ...]
    warps: tuple[tuple[int, int, int, int], ...]

    def text(self, *, grid: bool = True, warp_guidance: bool = True, ledges: bool = True) -> str:
        cells = self.rows if ledges else _rows_without_ledges(self.rows, self.tiles, (0, 0))
        if grid:
            tens = [" "] * self.width
            for column in range(0, self.width, 10):
                label = str(column)
                tens[column : column + len(label)] = label
            header = "".join(tens[: self.width]).rstrip()
            rows = (
                f"     {header}\n     "
                + "".join(str(c % 10) for c in range(self.width))
                + "\n"
                + "\n".join(f"{y:4} {row}" for y, row in enumerate(cells))
            )
        else:
            rows = "\n".join(cells)
        return (
            f"Whole current map from live memory ({self.width}x{self.height}),"
            " top-left (0,0), north is up:\n"
            + rows
            + _details(
                self.tiles, self.objects, self.warps, warp_guidance, outside=False, ledges=ledges
            )
        )

    def json(self, elevation: int) -> dict[str, object]:
        cells = {
            (t.x, t.y): (t.collision << 12) | (t.elevation << 8) | t.behavior for t in self.tiles
        }
        return {
            "width": self.width,
            "height": self.height,
            "elevation": elevation,
            "rows": [
                "".join(f"{cells[(x, y)]:04x}" for x in range(self.width))
                for y in range(self.height)
            ],
            "objects": [{"x": x, "y": y} for _, x, y in self.objects],
            "warps": [{"x": x, "y": y} for x, y, _, _ in self.warps],
        }


def _rows_without_ledges(
    rows: tuple[str, ...], tiles: tuple[MapTile, ...], origin: tuple[int, int]
) -> tuple[str, ...]:
    x, y = origin
    cells = [list(row) for row in rows]
    for tile in tiles:
        if cells[tile.y - y][tile.x - x] == LEDGES.get(tile.behavior):
            cells[tile.y - y][tile.x - x] = "#" if tile.collision else "."
    return tuple("".join(row) for row in cells)


def _details(
    tiles: tuple[MapTile, ...],
    objects: tuple[tuple[int, int, int], ...],
    warps: tuple[tuple[int, int, int, int], ...],
    warp_guidance: bool,
    *,
    outside: bool,
    ledges: bool,
) -> str:
    empty = "none nearby" if outside else "none on this map"
    listed_objects = ", ".join(f"id {i} at ({a},{b})" for i, a, b in objects) or empty
    behaviors_at = {(tile.x, tile.y): tile.behavior for tile in tiles}
    listed_warps = (
        ", ".join(
            (
                f"({a},{b}) -> dynamic destination"
                if (g, n) == (127, 127)
                else f"({a},{b}) -> map {g}/{n}"
            )
            + (f" [{_warp_trigger(behaviors_at.get((a, b)))}]" if warp_guidance else "")
            for a, b, g, n in warps
        )
        or empty
    )
    behaviors = sorted({tile.behavior for tile in tiles})
    return (
        (
            "\n@ player; N live object; W warp location (see activation below);"
            if warp_guidance
            else "\n@ player; N live object; W warp;"
        )
        + " # collision; g grass; ~ water;"
        + (
            " v ^ < > ledge: a one-way hop in the arrow's direction (move into it that way to"
            " jump over it, landing 2 tiles on); impassable from any other side;"
            if ledges
            else ""
        )
        + (
            " . clear terrain (may have script triggers); ? outside current map."
            if outside
            else " . clear terrain (may have script triggers)."
        )
        + "\nTerrain rules, elevation and objects can still block movement."
        + f"\nLive objects: {listed_objects}\nWarps: {listed_warps}"
        + (
            "\nWarp destinations are map group/number IDs, not warp indexes. Activation also"
            " requires matching elevation and available field controls; W alone does not"
            " guarantee a transition. After a transition, check the new map and position."
            if warp_guidance
            else ""
        )
        + "\nMetatile behaviors present: "
        + ", ".join(f"0x{value:02X}" for value in behaviors)
    )


@dataclass(frozen=True)
class _Layout:
    width: int
    height: int
    buffer: int
    map_width: int
    map_height: int
    attributes: tuple[int, int]
    events: int


def _layout(read: ReadMemory) -> _Layout | None:
    width, height, buffer = struct.unpack("<III", read(BACKUP_LAYOUT, 12))
    layout, events = struct.unpack("<II", read(MAP_HEADER, 8))
    if not _pointer(layout) or not _pointer(buffer) or width * height > MAX_MAP_DATA_SIZE:
        return None
    map_width, map_height, _, _, primary, secondary = struct.unpack("<IIIIII", read(layout, 24))
    if width != map_width + 15 or height != map_height + 14:
        return None
    if not _pointer(primary) or not _pointer(secondary):
        return None
    attributes = (_u32(read, primary + 0x10), _u32(read, secondary + 0x10))
    if not all(_pointer(p) for p in attributes):
        return None
    return _Layout(width, height, buffer, map_width, map_height, attributes, events)


def _objects(
    read: ReadMemory, map_id: tuple[int, int], near: tuple[int, int] | None, radius: int
) -> list[tuple[int, int, int]]:
    objects = []
    raw_objects = read(OBJECT_EVENTS, 16 * 0x24)
    for slot in range(16):
        body = raw_objects[slot * 0x24 : (slot + 1) * 0x24]
        if not body[0] & 1 or body[1] & 0x20 or body[2] & 1:
            continue
        if (body[10], body[9]) != map_id:
            continue
        ox, oy = struct.unpack_from("<hh", body, 0x10)
        ox -= MAP_OFFSET
        oy -= MAP_OFFSET
        if near is None or (abs(ox - near[0]) <= radius and abs(oy - near[1]) <= radius):
            objects.append((body[8], ox, oy))
    return objects


def _warps(
    read: ReadMemory, events: int, near: tuple[int, int] | None, radius: int
) -> list[tuple[int, int, int, int]]:
    warps = []
    if _pointer(events):
        header = read(events, 12)
        count = header[1]
        pointer = int.from_bytes(header[8:12], "little")
        if count and _pointer(pointer):
            raw_warps = read(pointer, count * 8)
            for i in range(count):
                wx, wy, _, _, number, group = struct.unpack_from("<hhBBBB", raw_warps, i * 8)
                if near is None or (abs(wx - near[0]) <= radius and abs(wy - near[1]) <= radius):
                    warps.append((wx, wy, group, number))
    return warps


def _behavior(read: ReadMemory, layout: _Layout, cache: dict[int, int], metatile: int) -> int:
    if metatile not in cache:
        which = int(metatile >= 512)
        cache[metatile] = (
            int.from_bytes(
                read(layout.attributes[which] + 2 * (metatile - 512 * which), 2), "little"
            )
            & 0xFF
        )
    return cache[metatile]


def _symbol(
    cell: tuple[int, int],
    position: tuple[int, int],
    objects: set[tuple[int, int]],
    warps: set[tuple[int, int]],
    collision: int,
    behavior: int,
) -> str:
    return (
        "@"
        if cell == position
        else "N"
        if cell in objects
        else "W"
        if cell in warps
        else LEDGES[behavior]
        if behavior in LEDGES
        else "#"
        if collision
        else "g"
        if behavior in (2, 3)
        else "~"
        if 0x10 <= behavior <= 0x15
        else "."
    )


def read_local_map(
    read: ReadMemory, position: tuple[int, int], map_id: tuple[int, int], radius: int = 7
) -> LocalMap | None:
    if not 0 <= radius <= 7:
        raise ValueError("map radius must be 0..7")
    layout = _layout(read)
    if layout is None:
        return None
    x, y = position
    origin = (x - radius, y - radius)
    objects = _objects(read, map_id, position, radius)
    warps = _warps(read, layout.events, position, radius)
    object_coords = {(a, b) for _, a, b in objects}
    warp_coords = {(a, b) for a, b, _, _ in warps}
    tiles = []
    rows = []
    cache: dict[int, int] = {}
    for cy in range(y - radius, y + radius + 1):
        row = []
        by = cy + MAP_OFFSET
        for cx in range(x - radius, x + radius + 1):
            bx = cx + MAP_OFFSET
            if not (
                0 <= cx < layout.map_width
                and 0 <= cy < layout.map_height
                and 0 <= bx < layout.width
                and 0 <= by < layout.height
            ):
                row.append("?")
                continue
            block = int.from_bytes(read(layout.buffer + 2 * (by * layout.width + bx), 2), "little")
            metatile = block & 0x3FF
            collision = (block >> 10) & 3
            behavior = _behavior(read, layout, cache, metatile)
            tiles.append(MapTile(cx, cy, metatile, collision, behavior, (block >> 12) & 15))
            row.append(_symbol((cx, cy), position, object_coords, warp_coords, collision, behavior))
        rows.append("".join(row))
    return LocalMap(origin, tuple(rows), tuple(tiles), tuple(objects), tuple(warps))


def read_full_map(
    read: ReadMemory, position: tuple[int, int], map_id: tuple[int, int]
) -> FullMap | None:
    layout = _layout(read)
    if layout is None:
        return None
    if not (1 <= layout.map_width <= 256 and 1 <= layout.map_height <= 256):
        return None
    objects = _objects(read, map_id, None, 0)
    warps = _warps(read, layout.events, None, 0)
    object_coords = {(a, b) for _, a, b in objects}
    warp_coords = {(a, b) for a, b, _, _ in warps}
    tiles = []
    rows = []
    cache: dict[int, int] = {}
    for cy in range(layout.map_height):
        start = layout.buffer + 2 * ((cy + MAP_OFFSET) * layout.width + MAP_OFFSET)
        blocks = struct.unpack(f"<{layout.map_width}H", read(start, 2 * layout.map_width))
        row = []
        for cx, block in enumerate(blocks):
            metatile = block & 0x3FF
            collision = (block >> 10) & 3
            behavior = _behavior(read, layout, cache, metatile)
            tiles.append(MapTile(cx, cy, metatile, collision, behavior, (block >> 12) & 15))
            row.append(_symbol((cx, cy), position, object_coords, warp_coords, collision, behavior))
        rows.append("".join(row))
    return FullMap(
        layout.map_width, layout.map_height, tuple(rows), tuple(tiles), tuple(objects), tuple(warps)
    )
