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

from collections.abc import Mapping
from dataclasses import dataclass

from pokebench_env.field_moves import (
    FOOT,
    LEDGES,
    MOVE_SURF,
    NONE,
    STEP,
    SURFING,
    WATER,
    Edges,
    FloodRules,
    Reached,
    SurfUse,
    Tile,
    Tiles,
    classify,
    reachable,
    surf_use,
    water_only,
)
from pokebench_env.game_screen import ReadMemory
from pokebench_env.live_map import read_full_map
from pokebench_env.pokemon import PartyMon
from pokebench_env.topology import STEPS, Topology, _edges
from pokebench_env.world import InteractionTarget

# field-move-gates-v1 moved the flood and the Surf rule into field_moves; these names stay.
__all__ = [
    "FOOT",
    "LEDGES",
    "MOVE_SURF",
    "NONE",
    "STEP",
    "SURFING",
    "WATER",
    "Edges",
    "Reached",
    "SurfUse",
    "Tile",
    "Tiles",
    "classify",
    "reachable",
    "surf_use",
    "water_only",
]

SWITCH = "surf-gated-exits-v1"
SWITCH_V2 = "surf-gated-exits-v2"
PLAYER_AVATAR = 0x02037590
NOT_NOW = "not an exit you can use now"
CANNOT_CROSS = "crosses water you cannot cross yet"

# exit-reachability-v1: one map connection, as (direction, destination map, offset); a map can have
# two on one side (Route 111 two WEST, Route 124 two EAST).
ConnectionKey = tuple[str, tuple[int, int], int]
Connections = Mapping[str, Edges]


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
    rules: FloodRules | None = None,
) -> SurfGate:
    # surf-gated-exits-v1 keys connections by direction, as it always has (a later one on the
    # same side replaces an earlier one). field-move-gates-v1 floods with its rules.
    by_direction: dict[str, Edges] = {}
    for (direction, _, _), edges in flood.connections.items():
        by_direction[direction] = edges
    warps, gated = water_only(
        flood.tiles, flood.start, warps=flood.warps, connections=by_direction, rules=rules
    )
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
