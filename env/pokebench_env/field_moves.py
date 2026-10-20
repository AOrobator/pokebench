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
from collections.abc import Iterable, Mapping
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
        None,
        None,
        "src/field_control_avatar.c:465",
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
        ITEM_NEEDS,
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
        ITEM_NEEDS,
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


# MB_JUMP_EAST/WEST/NORTH/SOUTH and the step each one hops.
LEDGES = {0x38: (1, 0), 0x39: (-1, 0), 0x3A: (0, -1), 0x3B: (0, 1)}
STEP = ((1, 0), (-1, 0), (0, 1), (0, -1))
# (collision, behavior) per tile of the current map.
Tiles = Mapping[Tile, tuple[int, int]]


def reachable(tiles: Tiles, start: Tile, *, water: bool) -> frozenset[Tile]:
    """Tiles the player can walk to from start (with water open when water is True)."""
    seen = {start}
    queue = deque([start])
    while queue:
        x, y = queue.popleft()
        for dx, dy in STEP:
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
            seen.add(nxt)
            queue.append(nxt)
    return frozenset(seen)


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
    tiles: Tiles, start: Tile, *, warps: Iterable[Tile], connections: Mapping[K, Edges]
) -> Reached[K]:
    """Each warp and connection labelled foot, water (only across water) or none (neither).

    A warp counts as reached from itself or a neighbour (doors and cave mouths are entered from
    next to them). A connection maps to (its foot edge tiles, its edge tiles crossable with water).
    """
    foot = reachable(tiles, start, water=False)
    wet = reachable(tiles, start, water=True)

    def near(tile: Tile, area: frozenset[Tile]) -> bool:
        x, y = tile
        return tile in area or any((x + dx, y + dy) in area for dx, dy in STEP)

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


def water_only(
    tiles: Tiles,
    start: Tile,
    *,
    warps: Iterable[Tile],
    connections: Mapping[str, Edges],
) -> tuple[tuple[Tile, ...], tuple[str, ...]]:
    """Warps and connection directions reachable with water open but not on foot."""
    reached = classify(tiles, start, warps=warps, connections=connections)
    return (
        tuple(w for w, how in reached.warps if how == WATER),
        tuple(d for d, how in reached.connections if how == WATER),
    )
