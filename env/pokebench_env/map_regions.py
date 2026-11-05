"""rotating-gate-regions-v1: which tiles connect with the gates as they stand, never a push.

Walking is map_sections.build_sections on the live full map: collision, water, elevation, edge
walls, warps and ledge hops, with live objects as walls and each arm a refused step. A gate turns
only when the player walks into an arm, so tiles an arm separates connect only some other way.
A section is mutually reachable tiles, so a ledge hop between two areas gets its own line.
"""

from collections import Counter

from pokebench_env.exit_labels import RomMap, Tile
from pokebench_env.field_moves import FloodRules
from pokebench_env.live_map import FullMap, LocalMap
from pokebench_env.map_observation import MapObservation
from pokebench_env.map_rotating_elements import PUZZLES
from pokebench_env.map_sections import Sections, build_sections

SWITCH = "rotating-gate-regions-v1"
HEADER = (
    "Walkable areas with the gates as they stand now. Tiles with the same letter connect "
    "without turning any gate. You are in area A."
)


def _name(index: int) -> str:
    letter = chr(ord("A") + index % 26)
    return letter if index < 26 else _name(index // 26 - 1) + letter


def _sections(shown: FullMap, arms: frozenset[frozenset[Tile]], position: Tile) -> Sections:
    rom = RomMap(
        shown.width,
        shown.height,
        tuple((t.metatile, t.collision, t.elevation, t.behavior) for t in shown.tiles),
        tuple((x, y, 0, 0, 0) for x, y, _, _ in shown.warps),
        (),
    )
    # The player's own object is on the object list; a tile is never a wall to who stands on it.
    walls = frozenset((x, y) for _, x, y in shown.objects) - {position}
    return build_sections(rom, FloodRules(walls, {}), arms=arms)


def gate_region_lines(
    shown: LocalMap | FullMap, observation: MapObservation, position: Tile
) -> tuple[str, ...]:
    """Nothing unless every gate's arms were read: a missing arm would join two areas falsely."""
    puzzle = PUZZLES.get(observation.map_id)
    if puzzle is None or not isinstance(shown, FullMap):
        return ()
    arms = [
        (element.group, element.edge[:2], element.edge[2:])
        for element in observation.elements
        if element.kind == "rotating_gate"
        and element.group is not None
        and element.edge is not None
    ]
    if {group for group, _, _ in arms} != {f"gate:{gate}" for gate in range(len(puzzle[1]))}:
        return ()
    sections = _sections(shown, frozenset(frozenset({a, b}) for _, a, b in arms), position)
    home = sections.landing(position)
    if home is None:
        return ()
    sizes = Counter(sections.regions.values())
    others = sorted(set(sizes) - {home}, key=lambda r: (-sizes[r], r[1], r[0]))
    areas = {region: index for index, region in enumerate((home, *others))}
    width = len(_name(len(areas) - 1))
    cells = {
        (tile.x, tile.y): areas[region]
        for tile in shown.tiles
        if (region := sections.landing((tile.x, tile.y))) is not None
    }
    grid = tuple(
        f"{y:2d}  "
        + " ".join(
            (_name(cells[(x, y)]) if (x, y) in cells else "#").rjust(width)
            for x in range(shown.width)
        )
        for y in range(shown.height)
    )
    gates = sorted(
        {
            (int(group.removeprefix("gate:")), *sorted((cells[a], cells[b])))
            for group, a, b in arms
            if a in cells and b in cells and cells[a] != cells[b]
        }
    )
    hops = sorted(
        (areas[start], areas[end]) for start, ends in sections.links.items() for end in ends
    )
    return (
        HEADER,
        *grid,
        *(
            f"Gate {gate} has an arm between area {_name(a)} and area {_name(b)}."
            for gate, a, b in gates
        ),
        *(f"A ledge hops one way from area {_name(a)} to area {_name(b)}." for a, b in hops),
    )
