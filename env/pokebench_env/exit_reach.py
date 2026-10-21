"""exit-reachability-v1: every exit on the current map labelled foot, water or none.

The flood is surf_gate.reachable from the player's tile: collision blocks, surfable water blocks
on foot, a ledge hops one tile in its arrow direction only (pokeemerald GetCollisionAtCoords,
MB_JUMP_*). Elevation, one-way tiles and objects are ignored; each can only take tiles away from
what the player can walk to, so the flood is a superset of the walkable area. An exit it reaches
neither on foot nor across water is `none`, and saying it cannot be reached on foot is true.
Unread exits (no full map, unreadable edges, dive connections) carry no label and stay listed.

field-move-gates-v1: with a survey, the labels and the foot area come from the gated flood, and
each exit whose label the closed gates worsened carries the obstacles every way to it passes.

The tiles reached on foot ship as one hex string per map row, four tiles per digit, the most
significant bit the leftmost tile, so the agent can test any tile without the whole map.
"""

from dataclasses import dataclass

from pokebench_env.field_moves import Survey, rows
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
    # field-move-gates-v1: obstacle ids (field_obstacles) every way to a cut-off exit passes.
    warp_blocks: tuple[tuple[Tile, tuple[int, ...]], ...] = ()
    connection_blocks: tuple[tuple[ConnectionKey, tuple[int, ...]], ...] = ()

    def rows(self) -> tuple[str, ...]:
        return rows(self.foot, self.width, self.height)

    def json(self) -> dict[str, object]:
        warp_blocks, connection_blocks = dict(self.warp_blocks), dict(self.connection_blocks)

        def blocked(ids: tuple[int, ...] | None) -> dict[str, object]:
            return {} if ids is None else {"blocked_by": list(ids)}

        return {
            "warps": [
                {"x": x, "y": y, "reach": how, **blocked(warp_blocks.get((x, y)))}
                for (x, y), how in self.warps
            ],
            "connections": [
                {
                    "direction": d,
                    "destination": list(to),
                    "offset": offset,
                    "reach": how,
                    **blocked(connection_blocks.get((d, to, offset))),
                }
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


def build_exit_reach(
    flood: FloodInputs, found: Survey[ConnectionKey] | None = None
) -> ExitReach | None:
    """None when the player's own tile is not on the map read (nothing can be said)."""
    if flood.start not in flood.tiles:
        return None
    if found is not None:
        gated = found.gated
        return ExitReach(
            flood.width,
            flood.height,
            gated.foot,
            gated.warps,
            gated.connections,
            tuple(found.warp_blocks.items()),
            tuple(found.connection_blocks.items()),
        )
    reached = classify(flood.tiles, flood.start, warps=flood.warps, connections=flood.connections)
    return ExitReach(flood.width, flood.height, reached.foot, reached.warps, reached.connections)
