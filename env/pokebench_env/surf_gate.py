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

from pokebench_env.game_screen import ReadMemory
from pokebench_env.live_map import read_full_map
from pokebench_env.pokemon import PartyMon
from pokebench_env.topology import STEPS, SURFABLE, Topology, _edges
from pokebench_env.world import InteractionTarget

SWITCH = "surf-gated-exits-v1"
MOVE_SURF = 57
PLAYER_AVATAR = 0x02037590
SURFING = 1 << 3
# MB_JUMP_EAST/WEST/NORTH/SOUTH and the step each one hops.
LEDGES = {0x38: (1, 0), 0x39: (-1, 0), 0x3A: (0, -1), 0x3B: (0, 1)}
STEP = ((1, 0), (-1, 0), (0, 1), (0, -1))
NOT_NOW = "not an exit you can use now"

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


def water_only(
    tiles: Tiles,
    start: Tile,
    *,
    warps: Iterable[Tile],
    connections: Mapping[str, tuple[tuple[Tile, ...], tuple[Tile, ...]]],
) -> tuple[tuple[Tile, ...], tuple[str, ...]]:
    """Warps and connection directions reachable with water open but not on foot.

    A warp counts as reached from itself or a neighbour (doors and cave mouths are entered from
    next to them). A connection maps to (its foot edge tiles, its edge tiles crossable with water).
    """
    foot = reachable(tiles, start, water=False)
    wet = reachable(tiles, start, water=True)

    def near(tile: Tile, area: frozenset[Tile]) -> bool:
        x, y = tile
        return tile in area or any((x + dx, y + dy) in area for dx, dy in STEP)

    gated_warps = tuple(w for w in dict.fromkeys(warps) if not near(w, foot) and near(w, wet))
    gated = tuple(
        direction
        for direction, (dry, wet_edges) in connections.items()
        if not any(t in foot for t in dry) and any(t in wet for t in wet_edges)
    )
    return gated_warps, gated


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
        badge, party = self.balance_badge is not True, self.party_surf is False
        missing = (
            "you have neither"
            if badge and party
            else "you do not have the Balance Badge"
            if badge
            else "no Pokémon in your party knows SURF"
        )
        return f"Surf needs the Balance Badge and a party Pokémon that knows SURF ({missing})"

    def connection_note(self) -> str:
        return (
            f"{NOT_NOW}: every way from where you stand to this edge crosses water,"
            f" and {self.reason()}"
        )

    def warp_note(self) -> str:
        return (
            f"; {NOT_NOW}: every way from where you stand to it crosses water, and {self.reason()}"
        )

    def destination_note(self) -> str:
        return f" ({NOT_NOW}: across water, needs Surf)"


def read_surf_gate(
    read: ReadMemory,
    map_id: tuple[int, int],
    position: Tile,
    targets: tuple[InteractionTarget, ...] | None,
    topology: Topology | None,
    badges: tuple[str, ...] | None,
    party: tuple[PartyMon, ...] | None,
) -> SurfGate | None:
    full = read_full_map(read, position, map_id)
    if full is None:
        return None
    tiles = {(t.x, t.y): (t.collision, t.behavior) for t in full.tiles}
    connections: dict[str, tuple[tuple[Tile, ...], tuple[Tile, ...]]] = {}
    for c in () if topology is None else topology.connections:
        if c.direction not in STEPS:
            continue
        dry = _edges(read, c.direction, c.offset, c.destination)
        wet = _edges(read, c.direction, c.offset, c.destination, water=True)
        if dry is not None and wet is not None:
            connections[c.direction] = (dry, wet)
    warps, gated = water_only(
        tiles,
        position,
        warps=[(t.x, t.y) for t in targets or () if t.kind == "warp" and t.destination is not None],
        connections=connections,
    )
    use = surf_use(badges, party, read(PLAYER_AVATAR, 1)[0])
    return SurfGate(use.can_surf, use.balance_badge, use.party_surf, use.surfing, warps, gated)
