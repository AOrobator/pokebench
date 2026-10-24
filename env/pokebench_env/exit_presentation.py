"""Move proven blocked exit facts out of actionable lists; retain native JSON evidence."""

from collections.abc import Callable
from dataclasses import replace
from typing import TypeVar

from pokebench_env.game_state import GameState
from pokebench_env.live_map import FullMap, LocalMap, _symbol
from pokebench_env.topology import Connection
from pokebench_env.world import InteractionTarget

SWITCH = "available-exits-presentation-v1"
Map = TypeVar("Map", LocalMap, FullMap)


def _without_warps(grid: Map | None, blocked: Callable[[int, int], bool]) -> Map | None:
    if grid is None:
        return None
    removed = {(x, y) for x, y, *_ in grid.warps if blocked(x, y)}
    rows = [list(row) for row in grid.rows]
    ox, oy = grid.origin if isinstance(grid, LocalMap) else (0, 0)
    for tile in grid.tiles:
        if (tile.x, tile.y) in removed and rows[tile.y - oy][tile.x - ox] == "W":
            rows[tile.y - oy][tile.x - ox] = _symbol(
                (tile.x, tile.y), (-1, -1), set(), set(), tile.collision, tile.behavior
            )
    return replace(
        grid,
        rows=tuple("".join(row) for row in rows),
        warps=tuple(w for w in grid.warps if (w[0], w[1]) not in removed),
    )


def split_exits(
    state: GameState, *, surf: bool
) -> tuple[GameState, tuple[InteractionTarget, ...], tuple[Connection, ...]]:
    reach, gate = state.exit_reach, state.surf_gate if surf else None

    def blocked(x: int, y: int) -> bool:
        return (reach is not None and reach.blocks_warp(x, y)) or (
            gate is not None and gate.blocks_warp(x, y)
        )

    def blocked_connection(c: Connection) -> bool:
        return (
            reach is not None and reach.blocks_connection(c.direction, c.destination, c.offset)
        ) or (gate is not None and gate.blocks_connection(c.direction))

    warps = tuple(
        t for t in state.interaction_targets or () if t.kind == "warp" and blocked(t.x, t.y)
    )
    connections = tuple(
        c
        for c in (() if state.topology is None else state.topology.connections)
        if blocked_connection(c)
    )
    if not warps and not connections:
        return state, (), ()
    nearby = _without_warps(state.nearby, blocked)
    return (
        replace(
            state,
            interaction_targets=None
            if state.interaction_targets is None
            else tuple(t for t in state.interaction_targets if t not in warps),
            nearby=nearby,
            local_map=state.local_map if nearby is None else nearby.text(),
            full_map=_without_warps(state.full_map, blocked),
            topology=None
            if state.topology is None
            else replace(
                state.topology,
                connections=tuple(c for c in state.topology.connections if c not in connections),
            ),
        ),
        warps,
        connections,
    )
