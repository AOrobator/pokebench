"""surf-gated-exits-v1: exits reachable only across water, and whether Surf can be used now.

pret/pokeemerald 731ad5bf. GetInteractedWaterScript (field_control_avatar.c:448-452) starts Surf
only when FlagGet(FLAG_BADGE05_GET) (SYSTEM_FLAGS + 0xB, the Balance Badge) and
PartyHasMonWithSurf() (field_player_avatar.c:1297: a party Pokémon that knows MOVE_SURF, checked
only while the avatar is not already surfing). PLAYER_AVATAR_FLAG_SURFING (1 << 3 of
gPlayerAvatar.flags) means the player is surfing now. On foot, TILE_FLAG_SURFABLE water is refused
(its elevation 1 mismatches land in GetCollisionAtCoords), and a nonzero collision is impassable
except that a ledge (MB_JUMP_*) hops one tile on in its arrow direction.

An exit is water-only when every way to it from the player's tile on this map crosses water: it
is not reachable on foot, but it is with water open. Elevation, edge walls and objects are left
out on purpose; each can only add connectivity on foot here, so an error keeps an exit listed.
"""

from collections import deque
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from typing import Generic, TypeVar

from pokebench_env.game_screen import ReadMemory
from pokebench_env.live_map import read_full_map
from pokebench_env.pokemon import PartyMon
from pokebench_env.topology import STEPS, SURFABLE, Topology, _edges
from pokebench_env.world import InteractionTarget

SWITCH = "surf-gated-exits-v1"
SWITCH_V2 = "surf-gated-exits-v2"
MOVE_SURF = 57
PLAYER_AVATAR = 0x02037590
SURFING = 1 << 3
# MB_JUMP_EAST/WEST/NORTH/SOUTH and the step each one hops.
LEDGES = {0x38: (1, 0), 0x39: (-1, 0), 0x3A: (0, -1), 0x3B: (0, 1)}
STEP = ((1, 0), (-1, 0), (0, 1), (0, -1))
NOT_NOW = "not an exit you can use now"
CANNOT_CROSS = "crosses water you cannot cross yet"

Tile = tuple[int, int]
# (collision, behavior) per tile of the current map.
Tiles = Mapping[Tile, tuple[int, int]]


@dataclass(frozen=True)
class SurfUse:
    can_surf: bool | None
    balance_badge: bool | None
    party_surf: bool | None
    surfing: bool | None


def surf_use(
    badges: tuple[str, ...] | None,
    party: tuple[PartyMon, ...] | None,
    avatar_flags: int | None,
) -> SurfUse:
    """Whether field Surf works now; None where an unread value could change the answer."""
    badge = None if badges is None else "BALANCE" in badges
    knows = (
        None
        if party is None
        else [
            None if m.moves is None else any(v.move_id == MOVE_SURF for v in m.moves) for m in party
        ]
    )
    party_surf = (
        None if knows is None else True if True in knows else None if None in knows else False
    )
    surfing = None if avatar_flags is None else bool(avatar_flags & SURFING)
    if surfing is True or (badge is True and party_surf is True):
        can: bool | None = True
    elif surfing is False and (badge is False or party_surf is False):
        can = False
    else:
        can = None
    return SurfUse(can, badge, party_surf, surfing)


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
# exit-reachability-v1: one map connection, as (direction, destination map, offset); a map can have
# two on one side (Route 111 two WEST, Route 124 two EAST).
ConnectionKey = tuple[str, tuple[int, int], int]
K = TypeVar("K")
Connections = Mapping[str, Edges]
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
    connections: Connections,
) -> tuple[tuple[Tile, ...], tuple[str, ...]]:
    """Warps and connection directions reachable with water open but not on foot."""
    reached = classify(tiles, start, warps=warps, connections=connections)
    return (
        tuple(w for w, how in reached.warps if how == WATER),
        tuple(d for d, how in reached.connections if how == WATER),
    )


@dataclass(frozen=True)
class FloodInputs:
    """The current map's tiles, the player's tile and the exits the flood classifies."""

    tiles: Tiles
    start: Tile
    warps: tuple[Tile, ...]
    connections: Mapping[ConnectionKey, Edges]
    width: int
    height: int


def read_flood_inputs(
    read: ReadMemory,
    map_id: tuple[int, int],
    position: Tile,
    targets: tuple[InteractionTarget, ...] | None,
    topology: Topology | None,
) -> FloodInputs | None:
    full = read_full_map(read, position, map_id)
    if full is None:
        return None
    tiles = {(t.x, t.y): (t.collision, t.behavior) for t in full.tiles}
    connections: dict[ConnectionKey, Edges] = {}
    for c in () if topology is None else topology.connections:
        if c.direction not in STEPS:
            continue
        dry = _edges(read, c.direction, c.offset, c.destination)
        wet = _edges(read, c.direction, c.offset, c.destination, water=True)
        if dry is not None and wet is not None:
            connections[(c.direction, c.destination, c.offset)] = (dry, wet)
    warps = tuple(
        (t.x, t.y) for t in targets or () if t.kind == "warp" and t.destination is not None
    )
    return FloodInputs(tiles, position, warps, connections, full.width, full.height)


@dataclass(frozen=True)
class SurfGate:
    can_surf: bool | None
    balance_badge: bool | None
    party_surf: bool | None
    surfing: bool | None
    # Exits on this map reachable from the player only across water (whatever can_surf says).
    warps: tuple[Tile, ...]
    connections: tuple[str, ...]

    def json(self) -> dict[str, object]:
        return {
            "can_surf": self.can_surf,
            "balance_badge": self.balance_badge,
            "party_surf": self.party_surf,
            "surfing": self.surfing,
            "warps": [{"x": x, "y": y} for x, y in self.warps],
            "connections": list(self.connections),
        }

    def blocks_warp(self, x: int, y: int) -> bool:
        return self.can_surf is False and (x, y) in self.warps

    def blocks_connection(self, direction: str) -> bool:
        return self.can_surf is False and direction in self.connections

    def reason(self) -> str:
        badge, party = self.balance_badge is False, self.party_surf is False
        missing = (
            "you have neither"
            if badge and party
            else "you do not have the Balance Badge"
            if badge
            else "no Pokémon in your party knows SURF"
        )
        return f"Surf needs the Balance Badge and a party Pokémon that knows SURF ({missing})"

    # surf-gated-exits-v2 (plain): no Balance Badge or SURF named, which the player has not been
    # told about on Route 103 (operator decision 2026-10-17).
    def connection_note(self, *, plain: bool = False) -> str:
        if plain:
            return f"{NOT_NOW}: every way from where you stand to this edge {CANNOT_CROSS}"
        return (
            f"{NOT_NOW}: every way from where you stand to this edge crosses water,"
            f" and {self.reason()}"
        )

    def warp_note(self, *, plain: bool = False) -> str:
        if plain:
            return f"; {NOT_NOW}: every way from where you stand to it {CANNOT_CROSS}"
        return (
            f"; {NOT_NOW}: every way from where you stand to it crosses water, and {self.reason()}"
        )

    def destination_note(self, *, plain: bool = False) -> str:
        if plain:
            return f" ({NOT_NOW}: across water you cannot cross yet)"
        return f" ({NOT_NOW}: across water, needs Surf)"


def surf_gate_from(
    read: ReadMemory,
    flood: FloodInputs,
    badges: tuple[str, ...] | None,
    party: tuple[PartyMon, ...] | None,
) -> SurfGate:
    # surf-gated-exits-v1 keys connections by direction, as it always has (a later one on the
    # same side replaces an earlier one).
    by_direction: dict[str, Edges] = {}
    for (direction, _, _), edges in flood.connections.items():
        by_direction[direction] = edges
    warps, gated = water_only(flood.tiles, flood.start, warps=flood.warps, connections=by_direction)
    use = surf_use(badges, party, read(PLAYER_AVATAR, 1)[0])
    return SurfGate(use.can_surf, use.balance_badge, use.party_surf, use.surfing, warps, gated)


def read_surf_gate(
    read: ReadMemory,
    map_id: tuple[int, int],
    position: Tile,
    targets: tuple[InteractionTarget, ...] | None,
    topology: Topology | None,
    badges: tuple[str, ...] | None,
    party: tuple[PartyMon, ...] | None,
) -> SurfGate | None:
    flood = read_flood_inputs(read, map_id, position, targets, topology)
    return None if flood is None else surf_gate_from(read, flood, badges, party)
