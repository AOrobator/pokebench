"""adjacent-tiles-v1: the four tiles next to the player, in words, from the map the model sees.

Each tile is named by the glyph the map draws for it under the run's switches (ledge-hops-v1,
one-way-tiles-v1, counter-talk-v1), so the line never says more than the map shows. A tile is
called unenterable only where pokeemerald 731ad5b GetCollisionAtCoords refuses it whatever the
walker's height: collision bits (CheckForObjectEventCollision hops a ledge pressed its own way
first), IsMetatileDirectionallyImpassable edge walls, and a map edge with no connection on that
side (GetMapBorderIdAt == CONNECTION_INVALID). Objects and warps are described, never called
blockers; elevation is never named.
"""

from collections.abc import Sequence

from pokebench_env.live_map import EDGE_WALLS, LEDGES, FullMap, LocalMap, _warp_trigger
from pokebench_env.topology import Topology

# (direction word, step, compass side of a tile facing that way, its opposite)
DIRECTIONS = (
    ("up", (0, -1), "north", "south"),
    ("down", (0, 1), "south", "north"),
    ("left", (-1, 0), "west", "east"),
    ("right", (1, 0), "east", "west"),
)
# The way each drawn ledge arrow hops (MB_JUMP_EAST/WEST/NORTH/SOUTH in LEDGES).
ARROWS = {">": "right", "<": "left", "^": "up", "v": "down"}
# pokeemerald PLAYER_AVATAR_FLAG_ON_FOOT and PLAYER_AVATAR_FLAG_SURFING.
ON_FOOT = 1 << 0
SURFING = 1 << 3
SHUT = "cannot be entered from here"


def walking(avatar_flags: int | None) -> bool:
    return avatar_flags is not None and bool(avatar_flags & ON_FOOT) and not avatar_flags & SURFING


def _outside(glyph: str, compass: str, topology: Topology | None) -> str:
    text = "outside this map" + (" (?)" if glyph == "?" else "")
    if topology is None:
        return text
    named = [c for c in topology.connections if c.direction == compass.upper()]
    if not named:
        return f"{text}, no connection {compass}, {SHUT}"
    listed = " and ".join(
        f"{c.destination_name} (map {c.destination[0]}/{c.destination[1]})" for c in named
    )
    plural = "s are" if len(named) > 1 else " is"
    return f"{text}, this map's {compass} connection{plural} {listed}"


def _tile(
    glyph: str,
    direction: str,
    opposite: str,
    collision: int,
    behavior: int,
    ids: Sequence[int],
    *,
    warp_guidance: bool,
    on_foot: bool,
) -> str:
    if glyph == "N":
        return "person or object (N, object id " + ", ".join(str(i) for i in ids) + ")"
    if glyph == "W":
        return "warp (W)" + (f" [{_warp_trigger(behavior)}]" if warp_guidance else "")
    if glyph == "=":
        return (
            "counter (=), cannot be walked onto, face it and press A to talk to someone behind it"
        )
    if glyph in ARROWS:
        way = ARROWS[glyph]
        if way == direction:
            return f"ledge ({glyph}), hop over it moving {way}, landing 2 tiles on"
        return f"ledge ({glyph}), hops {way} only" + (f", {SHUT}" if collision else "")
    if glyph == "#":
        hopped = ARROWS.get(LEDGES.get(behavior, "")) == direction
        return "collision (#)" + ("" if hopped else f", {SHUT}")
    if glyph == "+":
        sides = EDGE_WALLS[behavior]
        noun = "sides" if len(sides) > 1 else "side"
        return f"edge walls (+) on its {'+'.join(sides)} {noun}" + (
            f", {SHUT}" if opposite in sides else ""
        )
    if glyph == "g":
        return "grass (g)"
    if glyph == "~":
        return "water (~)" + (", not walkable on foot" if on_foot else "")
    return "clear (.)"


def next_tiles(
    shown: LocalMap | FullMap,
    position: tuple[int, int],
    *,
    coordinates: bool,
    ledges: bool,
    edge_walls: bool,
    counters: bool,
    warp_guidance: bool,
    topology: Topology | None,
    on_foot: bool,
) -> str:
    """One line naming the tiles up, down, left and right of the player, in that order."""
    cells = shown.cells(ledges=ledges, edge_walls=edge_walls, counters=counters)
    ox, oy = shown.origin
    tiles = {(t.x, t.y): t for t in shown.tiles}
    px, py = position
    own = tiles.get(position)
    own_walls = (
        EDGE_WALLS.get(own.behavior, ())
        if edge_walls and own is not None and own.collision == 0
        else ()
    )
    parts = []
    for direction, (dx, dy), compass, opposite in DIRECTIONS:
        x, y = px + dx, py + dy
        row, column = y - oy, x - ox
        inside = 0 <= row < len(cells) and 0 <= column < len(cells[row])
        glyph = cells[row][column] if inside else ""
        tile = tiles.get((x, y))
        if tile is None:
            name = _outside(glyph, compass, topology)
        else:
            name = _tile(
                glyph,
                direction,
                opposite,
                tile.collision,
                tile.behavior,
                [i for i, a, b in shown.objects if (a, b) == (x, y)],
                warp_guidance=warp_guidance,
                on_foot=on_foot,
            )
        if compass in own_walls:
            name += (
                f", but your own tile is walled on its {compass} side,"
                f" so you cannot move {direction} from here"
            )
        where = f" ({x},{y})" if coordinates else ""
        parts.append(f"{direction}{where} {name}")
    return "Next tiles: " + "; ".join(parts)
