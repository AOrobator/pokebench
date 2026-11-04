"""adjacent-tiles-v1: the four tiles next to the player, in words, from the map the model sees.

Each tile is named by the glyph the map draws for it under the run's switches (ledge-hops-v1,
one-way-tiles-v1, counter-talk-v1), so the line never says more than the map shows. A tile is
called unenterable only where pokeemerald 731ad5b GetCollisionAtCoords refuses it whatever the
walker's height: collision bits (CheckForObjectEventCollision hops a ledge pressed its own way
first), IsMetatileDirectionallyImpassable edge walls, and a map edge with no connection on that
side (GetMapBorderIdAt == CONNECTION_INVALID), and never for the press that a directional warp
under the player answers. A connection is never named for one edge tile: Topology has no
connected-map size, so it cannot tell whether the tile lies in the connection's span. Objects and
warps are described, never called blockers; elevation is named only for a tile
elevation-aware-map-v1 draws L (IsElevationMismatchAt refuses it from the player's elevation).
"""

from collections.abc import Sequence
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from pokebench_env.map_observation import MapObservation

from pokebench_env.live_map import (
    EDGE_WALLS,
    LEDGES,
    WARP_PRESSES,
    FullMap,
    LocalMap,
    _warp_trigger,
)
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


def _outside(glyph: str, compass: str, topology: Topology | None, shut: bool) -> str:
    text = "outside this map" + (" (?)" if glyph == "?" else "")
    if topology is None:
        return text
    if any(c.direction == compass.upper() for c in topology.connections):
        return f"{text}, see Map connections for where the {compass} edge connects"
    return f"{text}, no connection {compass}" + (f", {SHUT}" if shut else "")


def _hopped(behavior: int, direction: str) -> bool:
    """CheckForObjectEventCollision: a ledge pressed its own way is jumped, whatever else holds."""
    return ARROWS.get(LEDGES.get(behavior, "")) == direction


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
    shut: bool,
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
        return f"ledge ({glyph}), hops {way} only" + (f", {SHUT}" if collision and shut else "")
    if glyph in {"S", "s"}:
        return "floor switch (" + ("raised" if glyph == "S" else "pressed") + f", {glyph})"
    if glyph in {"E", "e"}:
        return (
            "electric door (E), blocked now" + (f", {SHUT}" if shut else "")
            if glyph == "E"
            else "electric door (e), open now"
        )
    if glyph == "#":
        return "collision (#)" + (f", {SHUT}" if shut and not _hopped(behavior, direction) else "")
    if glyph == "+":
        sides = EDGE_WALLS[behavior]
        noun = "sides" if len(sides) > 1 else "side"
        return f"edge walls (+) on its {'+'.join(sides)} {noun}" + (
            f", {SHUT}" if opposite in sides and shut else ""
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
    unseen_unknown: bool = False,
    ledges: bool,
    edge_walls: bool,
    counters: bool,
    warp_guidance: bool,
    topology: Topology | None,
    on_foot: bool,
    terrain: bool = False,
    elevation: int | None = None,
    observation: "MapObservation | None" = None,
    solid_first: bool = False,
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
    # A directional warp under the player answers this press instead of a step.
    on_warp = any((a, b) == position for a, b, _, _ in shown.warps)
    warp_press = WARP_PRESSES.get(own.behavior, "").lower() if on_warp and own is not None else ""
    parts = []
    for direction, (dx, dy), compass, opposite in DIRECTIONS:
        x, y = px + dx, py + dy
        row, column = y - oy, x - ox
        inside = 0 <= row < len(cells) and 0 <= column < len(cells[row])
        glyph = cells[row][column] if inside else ""
        tile = tiles.get((x, y))
        shut = warp_press != direction
        if tile is None:
            name = (
                "unseen (?)"
                if unseen_unknown and inside
                else _outside(glyph, compass, topology, shut)
            )
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
                shut=shut,
            )
        if (
            observation is None
            and terrain
            and tile is not None
            and not tile.collision
            and glyph not in ("N", "W")
        ):
            # Local import: terrain presentation depends on the map/field-obstacle types.
            from pokebench_env.terrain_visibility import SANDSTORM, terrain_description

            special = terrain_description(tile.behavior)
            if glyph == "!":
                special = f"{SANDSTORM[1]} (!), {SANDSTORM[2]}"
            if special is not None:
                name = special
        if elevation is not None and tile is not None and glyph == "L":
            # elevation-aware-map-v1 draws L only where IsElevationMismatchAt refuses the step.
            name = f"another level (L), elevation {tile.elevation} (yours is {elevation})" + (
                f", {SHUT}" if shut else ""
            )
        if observation is not None and tile is not None:
            from pokebench_env.map_observation import labels_at

            observed = labels_at(
                observation, x, y, tile=tile, terrain=terrain and glyph not in ("N", "W")
            )
            if observed:
                labels = "; ".join(observed)
                note = ""
                if (
                    elevation is not None
                    and glyph in (".", "g")
                    and any(
                        e.kind == "other_level" and (e.x, e.y) == (x, y)
                        for e in observation.elements
                    )
                ):
                    note += f"; elevation {tile.elevation} (yours is {elevation})"
                    if shut:
                        note += f", {SHUT}"
                if tile.collision and glyph not in ("N", "W"):
                    note += ", collision set"
                # A solid tile is not a tile you can stand on, so the refusal leads and the element
                # it is made of follows. "ground (cave); collision (#), cannot be entered from here"
                # read as walkable cave ground in run 07a7, which pressed into that wall twenty
                # times. solid-tile-leads-v1: a solid tile is not a tile you can stand on, so the
                # refusal leads and the element it is made of follows. Off: the element leads, byte
                # for byte.
                described = glyph in ("@", "N", "W", "#", "+", "=", "~", "L", *ARROWS)
                name = (
                    (
                        f"{name}{note}; {labels}"
                        if tile.collision and described
                        else f"{labels}; {name}{note}"
                        if described
                        else f"{labels}{note}"
                    )
                    if solid_first
                    else (f"{labels}; {name}" if described else labels) + note
                )
            crossed = tuple(
                e
                for e in observation.elements
                if e.edge is not None and {e.edge[:2], e.edge[2:]} == {(px, py), (x, y)}
            )
            if crossed:
                name += "; rotating gate arm across this edge"
        if not shut:
            name += ", but you stand on a warp" + (
                f" whose listed activation is pressing {direction}" if warp_guidance else ""
            )
        elif compass in own_walls and not (tile is not None and _hopped(tile.behavior, direction)):
            name += (
                f", but your own tile is walled on its {compass} side,"
                f" so you cannot move {direction} from here"
            )
        where = f" ({x},{y})" if coordinates else ""
        parts.append(f"{direction}{where} {name}")
    return "Next tiles: " + "; ".join(parts)
