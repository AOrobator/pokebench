"""trainer-sight-check-v1 (RED stub)."""

from collections.abc import Sequence

from pokebench_env.game_screen import ReadMemory

SWITCH = "trainer-sight-check-v1"
MAX_ROUTE_TILES = 1024


def movement_facings(movement_type: int) -> tuple[int, ...]:
    raise NotImplementedError


def sight_report(
    read: ReadMemory, map_id: tuple[int, int], route: Sequence[tuple[int, int]]
) -> dict[str, object]:
    raise NotImplementedError
