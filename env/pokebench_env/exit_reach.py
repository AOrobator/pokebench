"""exit-reachability-v1: every exit on the current map labelled foot, water or none.

The flood is surf_gate.reachable from the player's tile: collision blocks, surfable water blocks
on foot, a ledge hops one tile in its arrow direction only (pokeemerald GetCollisionAtCoords,
MB_JUMP_*). Elevation, one-way tiles and objects are ignored; each can only take tiles away from
what the player can walk to, so the flood is a superset of the walkable area. An exit it reaches
neither on foot nor across water is `none`, and saying it cannot be reached on foot is true.
Unread exits (no full map, unreadable edges, dive connections) carry no label and stay listed.

The tiles reached on foot ship as one hex string per map row, four tiles per digit, the most
significant bit the leftmost tile, so the agent can test any tile without the whole map.
"""

from dataclasses import dataclass

from pokebench_env.surf_gate import NONE, ConnectionKey, FloodInputs, Tile, classify

SWITCH = "exit-reachability-v1"
NOTE = "not reachable on foot from where you stand"


@dataclass(frozen=True)
class ExitReach:
    width: int
    height: int
    foot: frozenset[Tile]
    warps: tuple[tuple[Tile, str], ...]
    connections: tuple[tuple[ConnectionKey, str], ...]

    def rows(self) -> tuple[str, ...]:
        digits = (self.width + 3) // 4
        out = []
        for y in range(self.height):
            bits = 0
            for x in range(digits * 4):
                bits = bits << 1 | ((x, y) in self.foot)
            out.append(f"{bits:0{digits}x}")
        return tuple(out)

    def json(self) -> dict[str, object]:
        return {
            "warps": [{"x": x, "y": y, "reach": how} for (x, y), how in self.warps],
            "connections": [
                {"direction": d, "destination": list(to), "offset": offset, "reach": how}
                for (d, to, offset), how in self.connections
            ],
            "foot": {"width": self.width, "height": self.height, "rows": list(self.rows())},
        }

    def blocks_warp(self, x: int, y: int) -> bool:
        return ((x, y), NONE) in self.warps

    def blocks_connection(self, direction: str, destination: tuple[int, int], offset: int) -> bool:
        return ((direction, destination, offset), NONE) in self.connections

    def connection_note(self) -> str:
        return f"{NOTE}: no walkable way on this map leads from your tile to this edge"

    def warp_note(self) -> str:
        return f"; {NOTE}: no walkable way on this map leads from your tile to it"

    def destination_note(self) -> str:
        return f" ({NOTE})"


def build_exit_reach(flood: FloodInputs) -> ExitReach | None:
    """None when the player's own tile is not on the map read (nothing can be said)."""
    if flood.start not in flood.tiles:
        return None
    reached = classify(flood.tiles, flood.start, warps=flood.warps, connections=flood.connections)
    return ExitReach(flood.width, flood.height, reached.foot, reached.warps, reached.connections)
