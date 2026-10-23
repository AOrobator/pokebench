"""field-move-gates-v1: every field-move and item gate in one place (pret/pokeemerald 731ad5bf).

GATES is the table: how the game marks each obstacle, what opens it and the text it prints when
the way stays closed. Move gates follow the interaction scripts
(data/scripts/field_move_scripts.inc): the badge flag, then checkpartymove (src/scrcmd.c
ScrCmd_checkpartymove: the first non-egg party Pokémon that knows the move; HP and status are
never checked). Surf keeps surf-gated-exits-v1's rule (PartyHasMonWithSurf counts an egg). Item
gates are a bag check (checkitem), or riding the bike already (PLAYER_AVATAR_FLAG_MACH_BIKE /
_ACRO_BIKE, include/global.fieldmap.h).

Obstacle objects come from SaveBlock1.objectEventTemplates (as offscreen-objects-v1 reads them):
a template whose flag is set is gone (removeobject sets it; trees and rocks use temp flags that
ClearTempFieldEventData clears on every map load, so each visit reads them afresh); a loaded
object's tile comes from gObjectEvents.

surf-gated-exits-v1 and exit-reachability-v1's flood lives here too; surf_gate.py re-exports it.
"""

import struct
from collections import deque
from collections.abc import Callable, Iterable, Mapping, Sequence
from dataclasses import dataclass
from typing import Generic, TypeVar

from pokebench_env.character_presence import TEMPLATE_COUNT, TEMPLATES, _flag, _graphics
from pokebench_env.game_screen import ReadMemory
from pokebench_env.live_map import MAP_OFFSET, OBJECT_EVENTS
from pokebench_env.pokemon import PartyMon
from pokebench_env.resources import ResourceItem
from pokebench_env.topology import SURFABLE
from pokebench_env.world_context import GRAPHICS

SWITCH = "field-move-gates-v1"
MOVE_SURF = 57
SURFING = 1 << 3
MACH_BIKE = 1 << 1
ACRO_BIKE = 1 << 2
# surf-gated-exits-v2 wording (the operator 2026-10-20): never name a badge, move or item.
MOVE_NEEDS = "a field move you cannot use yet"
ITEM_NEEDS = "an item you do not have yet"
BIKE_NEEDS = "special movement that walking navigation does not perform"


@dataclass(frozen=True)
class Gate:
    id: str
    # How the game marks it.
    marker: str
    # The badge (as game_state.BADGES names it) and move a move gate checks.
    badge: str | None
    move: int | None
    # Items any one of which opens an item gate.
    items: tuple[int, ...]
    # Avatar flags that open it (riding that bike).
    avatar: int
    # The game's whole text when the way stays closed, None when it prints nothing.
    text: str | None
    label: str | None
    source: str
    needs: str


GATES: tuple[Gate, ...] = (
    Gate(
        "cut",
        "object OBJ_EVENT_GFX_CUTTABLE_TREE (EventScript_CutTree)",
        "STONE",
        15,
        (),
        0,
        "This tree looks like it can be CUT down!",
        "Text_CantCut",
        "data/scripts/field_move_scripts.inc:55",
        MOVE_NEEDS,
    ),
    Gate(
        "rock_smash",
        "object OBJ_EVENT_GFX_BREAKABLE_ROCK (EventScript_RockSmash)",
        "DYNAMO",
        249,
        (),
        0,
        "It's a rugged rock, but a POKéMON may be able to smash it.",
        "Text_CantSmash",
        "data/scripts/field_move_scripts.inc:118",
        MOVE_NEEDS,
    ),
    Gate(
        "strength",
        "object OBJ_EVENT_GFX_PUSHABLE_BOULDER (EventScript_StrengthBoulder)",
        "HEAT",
        70,
        (),
        0,
        "It's a big boulder, but a POKéMON may be able to push it aside.",
        "Text_CantStrength",
        "data/scripts/field_move_scripts.inc:175",
        MOVE_NEEDS,
    ),
    Gate(
        "surf",
        "TILE_FLAG_SURFABLE water at elevation 1 (GetInteractedWaterScript)",
        "BALANCE",
        MOVE_SURF,
        (),
        SURFING,
        None,
        None,
        "src/field_control_avatar.c:450",
        MOVE_NEEDS,
    ),
    Gate(
        "waterfall",
        "MB_WATERFALL 0x13, climbed surfing north (IsPlayerSurfingNorth)",
        "RAIN",
        127,
        (),
        0,
        "A wall of water is crashing down with a mighty roar.",
        "Text_CantWaterfall",
        "data/scripts/field_move_scripts.inc:205",
        MOVE_NEEDS,
    ),
    Gate(
        "dive",
        "deep water 0x11/0x12/0x14 on a map with a dive connection (TrySetDiveWarp)",
        "MIND",
        291,
        (),
        0,
        # EventScript_UseDive prints it with the Mind Badge and no non-egg Pokémon that knows DIVE;
        # without the badge nothing happens.
        "The sea is deep here. A POKéMON may be able to go underwater.",
        "Text_CantDive",
        "data/scripts/field_move_scripts.inc:263",
        MOVE_NEEDS,
    ),
    Gate(
        "mach_bike",
        "MB_MUDDY_SLOPE 0xD0 (one way south on foot), MB_CRACKED_FLOOR 0xD2 (falls through)",
        None,
        None,
        (259,),
        MACH_BIKE,
        None,
        None,
        "src/field_player_avatar.c:567",
        BIKE_NEEDS,
    ),
    Gate(
        "acro_bike",
        "MB_BUMPY_SLOPE 0xD1 and rails 0xD3-0xD6 (CheckAcroBikeCollision blocks walkers)",
        None,
        None,
        (272,),
        ACRO_BIKE,
        None,
        None,
        "src/field_player_avatar.c:774",
        BIKE_NEEDS,
    ),
    Gate(
        "go_goggles",
        "Route 111 coord triggers ViciousSandstormTriggerDown/Left (VAR_TEMP_3 0)",
        None,
        None,
        (279,),
        0,
        "The sandstorm is vicious. It's impossible to keep going.",
        "gText_SandstormIsVicious",
        "data/event_scripts.s:853",
        ITEM_NEEDS,
    ),
    Gate(
        "devon_scope",
        "invisible object OBJ_EVENT_GFX_KECLEON (EventScript_Kecleon; Fortree: its own script)",
        None,
        None,
        (288,),
        0,
        "Something unseeable is in the way.",
        "Kecleon_Text_SomethingUnseeable",
        "data/maps/Route120/scripts.inc:404",
        ITEM_NEEDS,
    ),
)
GATE = {g.id: g for g in GATES}


@dataclass(frozen=True)
class SurfUse:
    can_surf: bool | None
    balance_badge: bool | None
    party_surf: bool | None
    surfing: bool | None


def _any(values: Iterable[bool | None]) -> bool | None:
    known = list(values)
    return True if True in known else None if None in known else False


def surf_use(
    badges: tuple[str, ...] | None,
    party: tuple[PartyMon, ...] | None,
    avatar_flags: int | None,
) -> SurfUse:
    """Whether field Surf works now; None where an unread value could change the answer."""
    badge = None if badges is None else "BALANCE" in badges
    party_surf = (
        None
        if party is None
        else _any(
            None if m.moves is None else any(v.move_id == MOVE_SURF for v in m.moves) for m in party
        )
    )
    surfing = None if avatar_flags is None else bool(avatar_flags & SURFING)
    if surfing is True or (badge is True and party_surf is True):
        can: bool | None = True
    elif surfing is False and (badge is False or party_surf is False):
        can = False
    else:
        can = None
    return SurfUse(can, badge, party_surf, surfing)


def _knows(mon: PartyMon, move: int) -> bool | None:
    # checkpartymove: a non-egg Pokémon whose four moves include it.
    if mon.is_egg is True:
        return False
    if mon.is_egg is None or mon.moves is None:
        return None
    return any(v.move_id == move for v in mon.moves)


def _both(a: bool | None, b: bool | None) -> bool | None:
    return False if a is False or b is False else True if a is True and b is True else None


@dataclass(frozen=True)
class Capabilities:
    # (gate id, open now) in GATES order; None where an unread value could change the answer.
    open: tuple[tuple[str, bool | None], ...]

    def of(self, gate: str) -> bool | None:
        return dict(self.open)[gate]

    def json(self) -> dict[str, bool | None]:
        return dict(self.open)


def capabilities(
    party: tuple[PartyMon, ...] | None,
    badges: tuple[str, ...] | None,
    bag: tuple[ResourceItem, ...] | None,
    avatar_flags: int | None,
) -> Capabilities:
    found: list[tuple[str, bool | None]] = []
    for gate in GATES:
        if gate.id == "surf":
            found.append((gate.id, surf_use(badges, party, avatar_flags).can_surf))
        elif gate.move is not None:
            badge = None if badges is None else gate.badge in badges
            knows = None if party is None else _any(_knows(m, gate.move) for m in party)
            found.append((gate.id, _both(badge, knows)))
        else:
            riding = avatar_flags is not None and bool(avatar_flags & gate.avatar)
            held = None if bag is None else any(i.item_id in gate.items for i in bag)
            found.append((gate.id, True if riding else held))
    return Capabilities(tuple(found))


Tile = tuple[int, int]
Step = tuple[int, int]

# Obstacle objects by graphics id (include/constants/event_objects.h).
OBJECT_GATES = {82: "cut", 86: "rock_smash", 87: "strength", 204: "devon_scope"}
# The Devon Scope Kecleon stand only on these maps; the Route 120 bridge Kecleon at (12,16) goes
# with the Steven event (Route120_EventScript_BridgeKecleon), not the scope.
KECLEON_MAPS = frozenset({"ROUTE119", "ROUTE120", "FORTREE CITY"})
BRIDGE_KECLEON = ("ROUTE120", (12, 16))


@dataclass(frozen=True)
class Obstacle:
    gate: str
    # The sprite kind of an object, or the terrain's name.
    name: str
    tiles: tuple[Tile, ...]
    # The template's local id (objects only).
    local_id: int | None
    # True: loaded, its tile now; False: the template's tile; None: terrain.
    loaded: bool | None
    # Terrain a walker can leave only by this step (a slope or a sandstorm pushes it on); None:
    # a closed obstacle is a wall.
    only: tuple[int, int] | None = None


def _live_tiles(read: ReadMemory, map_id: tuple[int, int]) -> dict[int, Tile]:
    found: dict[int, Tile] = {}
    bodies = read(OBJECT_EVENTS, 16 * 0x24)
    for offset in range(0, len(bodies), 0x24):
        body = bodies[offset : offset + 0x24]
        if not body[0] & 1 or body[2] & 1 or (body[10], body[9]) != map_id:
            continue
        ox, oy = struct.unpack_from("<hh", body, 0x10)
        found[body[8]] = (ox - MAP_OFFSET, oy - MAP_OFFSET)
    return found


def read_object_obstacles(
    read: ReadMemory, save1: int, map_id: tuple[int, int], location: str | None
) -> tuple[Obstacle, ...] | None:
    """This map's obstacle objects still in place, loaded or not; None when unreadable."""
    if not 0x02000000 <= save1 < 0x02040000 - TEMPLATES - TEMPLATE_COUNT * 24:
        return None
    try:
        raw = read(save1 + TEMPLATES, TEMPLATE_COUNT * 24)
        if len(raw) != TEMPLATE_COUNT * 24:
            return None
        live = _live_tiles(read, map_id)
        found = []
        for slot in range(TEMPLATE_COUNT):
            entry = raw[slot * 24 : slot * 24 + 24]
            local_id, graphics = entry[0], entry[1]
            if local_id == 0 and graphics == 0:
                continue
            gate = OBJECT_GATES.get(_graphics(read, save1, graphics))
            flag = struct.unpack_from("<H", entry, 0x14)[0]
            if gate is None or (flag != 0 and _flag(read, save1, flag)):
                continue
            template = struct.unpack_from("<hh", entry, 4)
            if gate == "devon_scope" and (
                location not in KECLEON_MAPS or (location, template) == BRIDGE_KECLEON
            ):
                continue
            tile = live.get(local_id, template)
            name = GRAPHICS.get(_graphics(read, save1, graphics)) or gate
            found.append(Obstacle(gate, name, (tile,), local_id, local_id in live))
    except (ValueError, OSError, struct.error, IndexError):
        return None
    return tuple(found)


# A ROM ObjectEventTemplate as (localId, graphicsId, x, y, flagId).
RomObject = tuple[int, int, int, int, int]


def rom_object_obstacles(
    objects: Iterable[RomObject], flag_set: Callable[[int], bool], location: str | None
) -> tuple[Obstacle, ...]:
    """Obstacle objects a map places on load: its ROM templates whose hide flag is clear."""
    found = []
    for local_id, graphics, x, y, flag in objects:
        gate = OBJECT_GATES.get(graphics)
        if gate is None or (flag != 0 and flag_set(flag)):
            continue
        if gate == "devon_scope" and (
            location not in KECLEON_MAPS or (location, (x, y)) == BRIDGE_KECLEON
        ):
            continue
        found.append(Obstacle(gate, GRAPHICS.get(graphics) or gate, ((x, y),), local_id, False))
    return tuple(found)


# MB_JUMP_EAST/WEST/NORTH/SOUTH and the step each one hops.
LEDGES = {0x38: (1, 0), 0x39: (-1, 0), 0x3A: (0, -1), 0x3B: (0, 1)}
STEP = ((1, 0), (-1, 0), (0, 1), (0, -1))
# (collision, behavior) per tile of the current map.
Tiles = Mapping[Tile, tuple[int, int]]

# Terrain gates by metatile behavior (include/constants/metatile_behaviors.h): the gate, the name
# the readout gives the tiles, the one step a walker can leave them by (None: a wall when closed)
# and what the game does there.
TERRAIN: dict[int, tuple[str, str, Step | None, str | None]] = {
    # ForcedMovement_MuddySlope: unless moving north at the Mach Bike's top speed, slide south.
    0xD0: (
        "mach_bike",
        "slope tiles (metatile behavior 0xD0)",
        (0, 1),
        "which you slide down to the south on foot",
    ),
    # CheckAcroBikeCollision blocks every walker on these.
    0xD1: ("acro_bike", "bumpy slope tiles (metatile behavior 0xD1)", None, None),
    0xD3: ("acro_bike", "rail tiles (metatile behavior 0xD3)", None, None),
    0xD4: ("acro_bike", "rail tiles (metatile behavior 0xD4)", None, None),
    0xD5: ("acro_bike", "rail tiles (metatile behavior 0xD5)", None, None),
    0xD6: ("acro_bike", "rail tiles (metatile behavior 0xD6)", None, None),
    # MB_WATERFALL is a forced south current until Waterfall climbs it.
    0x13: (
        "waterfall",
        "waterfall tiles (metatile behavior 0x13)",
        (0, 1),
        "whose water pushes you back down to the south",
    ),
}
# A Mach Bike rolls along a non-isolated rail (bike.c: collisions 12 and 13 are outside the
# 0 < c < 12 block range).
MACH_RAILS = frozenset({TERRAIN[0xD5][1], TERRAIN[0xD6][1]})
# CrackedFloorPerStepCallback breaks the floor under a walker below the Mach Bike's top speed and
# CaveHole_CheckFallDownHole drops them through, on the maps that set STEP_CB_CRACKED_FLOOR.
CRACKED = {
    0xD2: "cracked floor tiles (metatile behavior 0xD2)",
    0x66: "hole tiles (metatile behavior 0x66)",
}
CRACKED_MAPS = frozenset(
    {
        "GRANITE CAVE B1F",
        "MIRAGE TOWER 2F",
        "MIRAGE TOWER 3F",
        "MT PYRE 2F",
        "SKY PILLAR 2F",
        "SKY PILLAR 4F",
    }
)
# Route111 coord events while VAR_TEMP_3 is 0 (data/maps/Route111/map.json): without the GO
# GOGGLES, Route111_EventScript_ViciousSandstormTrigger pushes a walker back down or left.
SANDSTORM_MAP = "ROUTE111"
SANDSTORM: tuple[tuple[Tile, Step], ...] = (
    *(((x, 61), (0, 1)) for x in range(11, 15)),
    *(((x, y), (-1, 0)) for x, y in ((12, 44), (13, 43), (14, 42), (16, 40), (17, 39), (18, 38))),
)
SANDSTORM_NAME = "sandstorm tiles"
HOW: dict[str, str] = {
    **{name: how for _, name, _, how in TERRAIN.values() if how is not None},
    **{name: "which you fall through on foot" for name in CRACKED.values()},
    SANDSTORM_NAME: "where the game pushes you back",
}

Cell = tuple[str, str, Step | None]


def _reading(tile: Tile) -> tuple[int, int]:
    return tile[1], tile[0]


def _components(cells: Mapping[Tile, Cell]) -> list[list[Tile]]:
    seen: set[Tile] = set()
    groups = []
    for tile in sorted(cells, key=_reading):
        if tile in seen:
            continue
        seen.add(tile)
        group, queue = [tile], deque([tile])
        while queue:
            x, y = queue.popleft()
            for dx, dy in STEP:
                nxt = (x + dx, y + dy)
                if nxt not in seen and cells.get(nxt) == cells[tile]:
                    seen.add(nxt)
                    group.append(nxt)
                    queue.append(nxt)
        groups.append(sorted(group, key=_reading))
    return groups


def terrain_obstacles(
    tiles: Tiles, location: str | None, *, sandstorm: bool = True
) -> tuple[Obstacle, ...]:
    """Gated terrain on this map, one obstacle per connected run of tiles of the same kind."""
    cells: dict[Tile, Cell] = {}
    for tile, (_, behavior) in tiles.items():
        if behavior in TERRAIN:
            gate, name, only, _ = TERRAIN[behavior]
            cells[tile] = (gate, name, only)
        elif behavior in CRACKED and location in CRACKED_MAPS:
            cells[tile] = ("mach_bike", CRACKED[behavior], None)
    if sandstorm and location == SANDSTORM_MAP:
        for tile, push in SANDSTORM:
            if tile in tiles:
                cells[tile] = ("go_goggles", SANDSTORM_NAME, push)
    found = []
    for group in _components(cells):
        gate, name, only = cells[group[0]]
        found.append(Obstacle(gate, name, tuple(group), None, None, only))
    return tuple(found)


@dataclass(frozen=True)
class FloodRules:
    walls: frozenset[Tile]
    only: Mapping[Tile, Step]


@dataclass(frozen=True)
class MapGates:
    caps: Capabilities
    obstacles: tuple[Obstacle, ...]

    def state(self, o: Obstacle) -> bool | None:
        """Whether this walking gate is open; item/move ownership lives in caps separately."""
        found = self.caps.of(o.gate)
        if o.local_id is None and o.gate in ("mach_bike", "acro_bike"):
            # This is the walking flood, not a bike route solver. Ownership (caps) cannot
            # establish mounting, northward top speed, wheelies/hops or rail alignment.
            # Unknown capability retains the legacy conservative unknown/open convention.
            return False if found is not None else None
        return found

    def closed(self, o: Obstacle) -> bool:
        return self.state(o) is False

    def rules(self) -> FloodRules:
        walls: set[Tile] = set()
        only: dict[Tile, Step] = {}
        for o in self.obstacles:
            if self.closed(o):
                for tile in o.tiles:
                    if o.only is None:
                        walls.add(tile)
                    else:
                        only[tile] = o.only
        return FloodRules(frozenset(walls), only)


def map_gates(
    caps: Capabilities,
    objects: Iterable[Obstacle],
    tiles: Tiles,
    location: str | None,
    *,
    sandstorm: bool = True,
) -> MapGates:
    return MapGates(caps, (*objects, *terrain_obstacles(tiles, location, sandstorm=sandstorm)))


def _spread(
    tiles: Tiles,
    starts: Iterable[Tile],
    *,
    water: bool,
    rules: FloodRules | None,
    outside: frozenset[Tile] = frozenset(),
) -> frozenset[Tile]:
    seen = set(starts)
    queue = deque(seen)
    while queue:
        x, y = queue.popleft()
        for dx, dy in STEP:
            if rules is not None and rules.only.get((x, y), (dx, dy)) != (dx, dy):
                continue
            nxt = (x + dx, y + dy)
            cell = tiles.get(nxt)
            if cell is None:
                continue
            collision, behavior = cell
            if collision and LEDGES.get(behavior) == (dx, dy):
                nxt = (x + 2 * dx, y + 2 * dy)
                cell = tiles.get(nxt)
                if cell is None:
                    continue
                collision, behavior = cell
            if nxt in seen or collision or (not water and behavior in SURFABLE):
                continue
            if nxt in outside or (rules is not None and nxt in rules.walls):
                continue
            seen.add(nxt)
            queue.append(nxt)
    return frozenset(seen)


def reachable(
    tiles: Tiles, start: Tile, *, water: bool, rules: FloodRules | None = None
) -> frozenset[Tile]:
    """Tiles the player can walk to from start (with water open when water is True).

    field-move-gates-v1's rules make a closed obstacle's tiles walls and let a tile with a forced
    step be left only by it. Without rules this is exit-reachability-v1's flood.
    """
    return _spread(tiles, (start,), water=water, rules=rules)


Edges = tuple[tuple[Tile, ...], tuple[Tile, ...]]
K = TypeVar("K")
# exit-reachability-v1: how an exit can be reached from the player's tile on this map.
FOOT, WATER, NONE = "foot", "water", "none"


@dataclass(frozen=True)
class Reached(Generic[K]):
    foot: frozenset[Tile]
    wet: frozenset[Tile]
    warps: tuple[tuple[Tile, str], ...]
    connections: tuple[tuple[K, str], ...]


def classify(
    tiles: Tiles,
    start: Tile,
    *,
    warps: Iterable[Tile],
    connections: Mapping[K, Edges],
    rules: FloodRules | None = None,
) -> Reached[K]:
    """Each warp and connection labelled foot, water (only across water) or none (neither).

    A warp counts as reached from itself or a neighbour (doors and cave mouths are entered from
    next to them). A connection maps to (its foot edge tiles, its edge tiles crossable with water).
    """
    foot = reachable(tiles, start, water=False, rules=rules)
    wet = reachable(tiles, start, water=True, rules=rules)

    def label(on_foot: bool, across: bool) -> str:
        return FOOT if on_foot else WATER if across else NONE

    return Reached(
        foot,
        wet,
        tuple((w, label(near(w, foot), near(w, wet))) for w in dict.fromkeys(warps)),
        tuple(
            (key, label(any(t in foot for t in dry), any(t in wet for t in wet_edges)))
            for key, (dry, wet_edges) in connections.items()
        ),
    )


def near(tile: Tile, area: frozenset[Tile]) -> bool:
    """The tile or one of its four neighbours is in the area (how warps are reached)."""
    x, y = tile
    return tile in area or any((x + dx, y + dy) in area for dx, dy in STEP)


def water_only(
    tiles: Tiles,
    start: Tile,
    *,
    warps: Iterable[Tile],
    connections: Mapping[str, Edges],
    rules: FloodRules | None = None,
) -> tuple[tuple[Tile, ...], tuple[str, ...]]:
    """Warps and connection directions reachable with water open but not on foot."""
    reached = classify(tiles, start, warps=warps, connections=connections, rules=rules)
    return (
        tuple(w for w, how in reached.warps if how == WATER),
        tuple(d for d, how in reached.connections if how == WATER),
    )


def _successors(tiles: Tiles, area: frozenset[Tile], *, water: bool) -> frozenset[Tile]:
    """Tiles one ungated step (a ledge hop included) from the area, outside it."""
    found: set[Tile] = set()
    for x, y in area:
        for dx, dy in STEP:
            nxt = (x + dx, y + dy)
            cell = tiles.get(nxt)
            if cell is not None and cell[0] and LEDGES.get(cell[1]) == (dx, dy):
                nxt = (x + 2 * dx, y + 2 * dy)
            if nxt not in area and nxt in tiles:
                found.add(nxt)
    return frozenset(found)


def _beyond(
    tiles: Tiles, gates: MapGates, area: frozenset[Tile], *, water: bool
) -> dict[int, frozenset[Tile]]:
    """For each closed obstacle the area touches, what lies past it outside the area.

    Spread with every gate open from the obstacle's own tiles, never back into the area: an exit
    in it is one every way to which, from the area, passes this obstacle or another one listed.
    """
    edge = area | _successors(tiles, area, water=water)
    found: dict[int, frozenset[Tile]] = {}
    for i, o in enumerate(gates.obstacles):
        starts = [
            t
            for t in o.tiles
            if t in edge
            and (t in area or (tiles[t][0] == 0 and (water or tiles[t][1] not in SURFABLE)))
        ]
        if gates.closed(o) and starts:
            found[i] = _spread(tiles, starts, water=water, rules=None, outside=area)
    return found


@dataclass(frozen=True)
class Survey(Generic[K]):
    # The flood with the closed gates, and with every gate open (exit-reachability-v1's).
    gated: Reached[K]
    open: Reached[K]
    # Obstacle index -> what lies past it on foot, for each closed obstacle the foot area touches.
    beyond: Mapping[int, frozenset[Tile]]
    # Exits whose label the closed gates worsened -> the obstacles every way to them passes.
    warp_blocks: Mapping[Tile, tuple[int, ...]]
    connection_blocks: Mapping[K, tuple[int, ...]]


def survey(
    tiles: Tiles,
    start: Tile,
    gates: MapGates,
    *,
    warps: Iterable[Tile],
    connections: Mapping[K, Edges],
) -> Survey[K]:
    warps = tuple(warps)
    gated = classify(tiles, start, warps=warps, connections=connections, rules=gates.rules())
    opened = classify(tiles, start, warps=warps, connections=connections)
    foot = _beyond(tiles, gates, gated.foot, water=False)
    wet: dict[int, frozenset[Tile]] | None = None

    def blockers(was: str, now: str, hit: Callable[[frozenset[Tile]], bool]) -> tuple[int, ...]:
        nonlocal wet
        if was == FOOT and now != FOOT:
            return tuple(i for i, past in foot.items() if hit(past))
        if was == WATER and now == NONE:
            if wet is None:
                wet = _beyond(tiles, gates, gated.wet, water=True)
            return tuple(i for i, past in wet.items() if hit(past))
        return ()

    warp_blocks: dict[Tile, tuple[int, ...]] = {}
    for (w, now), (_, was) in zip(gated.warps, opened.warps, strict=True):

        def at_warp(past: frozenset[Tile], w: Tile = w) -> bool:
            return near(w, past)

        found = blockers(was, now, at_warp)
        if found:
            warp_blocks[w] = found
    connection_blocks: dict[K, tuple[int, ...]] = {}
    for (key, now), (_, was) in zip(gated.connections, opened.connections, strict=True):
        dry, wet_edges = connections[key]
        edges = dry if was == FOOT else wet_edges

        def at_edge(past: frozenset[Tile], edges: tuple[Tile, ...] = edges) -> bool:
            return any(t in past for t in edges)

        found = blockers(was, now, at_edge)
        if found:
            connection_blocks[key] = found
    return Survey(gated, opened, foot, warp_blocks, connection_blocks)


def rows(area: frozenset[Tile], width: int, height: int) -> tuple[str, ...]:
    """One hex string per map row, four tiles per digit, the high bit the leftmost tile."""
    digits = (width + 3) // 4
    out = []
    for y in range(height):
        bits = 0
        for x in range(digits * 4):
            bits = bits << 1 | ((x, y) in area)
        out.append(f"{bits:0{digits}x}")
    return tuple(out)


def _join(items: Sequence[str], joiner: str) -> str:
    return items[0] if len(items) == 1 else ", ".join(items[:-1]) + f" {joiner} " + items[-1]


def _tiles_text(tiles: Sequence[Tile], joiner: str) -> str:
    return _join([f"({x},{y})" for x, y in tiles], joiner)


@dataclass(frozen=True)
class Kind:
    """Closed obstacles of one kind (same name and gate) named together on a readout line."""

    name: str
    gate: str
    tiles: tuple[Tile, ...]

    def what(self, *, joint: bool) -> str:
        how = HOW.get(self.name)
        tiles = f"{self.name} at {_tiles_text(self.tiles, 'and')}"
        if how is None:
            return tiles
        return f"{tiles} ({how})" if joint else f"{tiles}, {how},"


def _need_text(needs: set[str]) -> str:
    if len(needs) == 1:
        return next(iter(needs))
    if BIKE_NEEDS in needs:
        return "a field move, an item, or special movement unavailable to walking navigation"
    return "a field move or an item you cannot use yet"


@dataclass(frozen=True)
class Group:
    """One readout line: closed obstacles and the exits every way on foot to which they close.

    With exits, the kinds are those exits' whole blocker set: every way to them passes one of
    these obstacles, so closing exactly these cuts them off. Without, it only names the kind.
    """

    kinds: tuple[Kind, ...]
    exits: tuple[str, ...]

    def line(self) -> str:
        if len(self.kinds) > 1:
            return self._joint()
        kind = self.kinds[0]
        gate = GATE[kind.gate]
        said = (
            "the game shows no message there"
            if gate.text is None
            else f'the game says: "{gate.text}"'
        )
        verb = "closes" if len(kind.tiles) == 1 else "close"
        cut = f" {verb} every way on foot to {_join(self.exits, 'and')}" if self.exits else ""
        return f"- {kind.what(joint=not self.exits)}{cut}: it needs {gate.needs}; {said}"

    def _joint(self) -> str:
        needs = {GATE[k.gate].needs for k in self.kinds}
        need = _need_text(needs)
        quoted = [f'"{GATE[k.gate].text}" at the {k.name}' for k in self.kinds if GATE[k.gate].text]
        silent = [k.name for k in self.kinds if GATE[k.gate].text is None]
        said = [f"the game says: {_join(quoted, 'and')}"] if quoted else []
        if silent:
            said.append(f"the game shows no message at the {_join(silent, 'or')}")
        what = " and ".join(k.what(joint=True) for k in self.kinds)
        return (
            f"- {what} together close every way on foot to {_join(self.exits, 'and')}:"
            f" they need {need}; {'; '.join(said)}"
        )


HEADER = "Field obstacles on this map (from the map's own object list and its tiles):"


@dataclass(frozen=True)
class FieldObstacles(Generic[K]):
    gates: MapGates
    survey: Survey[K]
    width: int
    height: int

    def json(self) -> dict[str, object]:
        def entry(i: int, o: Obstacle) -> dict[str, object]:
            gate = GATE[o.gate]
            past = self.survey.beyond.get(i)
            return {
                "id": i,
                "gate": o.gate,
                "name": o.name,
                "kind": "object" if o.local_id is not None else "terrain",
                "local_id": o.local_id,
                "loaded": o.loaded,
                "tiles": [{"x": x, "y": y} for x, y in o.tiles],
                "only": None if o.only is None else list(o.only),
                "open": self.gates.state(o),
                "needs": gate.needs,
                "text": gate.text,
                "beyond": None
                if past is None
                else {
                    "width": self.width,
                    "height": self.height,
                    "rows": list(rows(past, self.width, self.height)),
                },
            }

        return {
            "capabilities": self.gates.caps.json(),
            "obstacles": [entry(i, o) for i, o in enumerate(self.gates.obstacles)],
        }

    def _kinds(self, ids: Iterable[int]) -> tuple[Kind, ...]:
        tiles: dict[tuple[str, str], list[Tile]] = {}
        for i in ids:
            o = self.gates.obstacles[i]
            tiles.setdefault((o.name, o.gate), []).extend(o.tiles)
        return tuple(
            Kind(name, gate, tuple(sorted(found, key=_reading)))
            for (name, gate), found in tiles.items()
        )

    def lines(
        self, warp_name: Callable[[Tile], str], connection_name: Callable[[K], str]
    ) -> list[str]:
        """The cut-off exits by blocker set, then the other closed obstacle objects by kind.

        A line says its obstacles close every way on foot to an exit only when they are that
        exit's whole blocker set. Terrain is named only when it cuts off an exit.
        """
        cuts: dict[tuple[int, ...], list[str]] = {}
        named = [(ids, warp_name(w)) for w, ids in self.survey.warp_blocks.items()] + [
            (ids, connection_name(key)) for key, ids in self.survey.connection_blocks.items()
        ]
        for ids, exit_name in named:
            if all(self.gates.closed(self.gates.obstacles[i]) for i in ids):
                cuts.setdefault(tuple(sorted(ids)), []).append(exit_name)
        cutting = {i for ids in cuts for i in ids}
        rest = [
            i
            for i, o in enumerate(self.gates.obstacles)
            if self.gates.closed(o) and i not in cutting
        ]
        groups = [Group(self._kinds(ids), tuple(exits)) for ids, exits in cuts.items()]
        groups += [Group((kind,), ()) for kind in self._kinds(rest)]
        if not groups:
            return []
        return [HEADER, *(g.line() for g in groups)]

    def _passes(self, ids: Iterable[int]) -> str:
        named: dict[str, list[Tile]] = {}
        needs: set[str] = set()
        for i in ids:
            o = self.gates.obstacles[i]
            named.setdefault(o.name, []).extend(o.tiles)
            needs.add(GATE[o.gate].needs)
        what = " or ".join(
            f"{name} at {_tiles_text(sorted(tiles, key=_reading), 'or')}"
            for name, tiles in named.items()
        )
        need = _need_text(needs)
        return f"{what}, which needs {need}"

    def warp_note(self, x: int, y: int) -> str | None:
        ids = self.survey.warp_blocks.get((x, y))
        if ids is None:
            return None
        return (
            "; not reachable on foot from where you stand: every way to it on this map passes "
            + self._passes(ids)
        )

    def connection_note(self, key: K) -> str | None:
        ids = self.survey.connection_blocks.get(key)
        if ids is None:
            return None
        return (
            "not reachable on foot from where you stand: every way on this map to this edge"
            f" passes {self._passes(ids)}"
        )
