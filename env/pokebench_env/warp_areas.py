"""warp-areas-v1: each map's pads grouped by the area they land in.

Facts per pad from the exit sections the readout already has, never a route. An area counts as
visited when the server saw the player on a tile of its section this run. Object names come from
the destination map's own object list with hide flags applied, and only for areas the run has
been in: the harness does not name what the game has not shown.
"""

import threading
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import Protocol

SWITCH = "warp-areas-v1"
MapId = tuple[int, int]
Tile = tuple[int, int]
HEADER = "Warps by landing area (pad → landing tile; facts about each pad, not a route):"


class AreaVisits:
    """Tiles the server saw the player on, per map, for one run. One archive carries none."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._tiles: dict[MapId, set[Tile]] = {}

    def note(self, map_id: MapId, tile: Tile) -> None:
        with self._lock:
            self._tiles.setdefault(map_id, set()).add(tile)

    def tiles(self, map_id: MapId) -> frozenset[Tile]:
        with self._lock:
            return frozenset(self._tiles.get(map_id, ()))


@dataclass(frozen=True)
class AreaFacts:
    visits: AreaVisits
    hidden: Callable[[int], bool]
    sprite: Callable[[int], str | None]


@dataclass(frozen=True)
class LandingFacts:
    tile: Tile | None
    exits: str
    caveat: str
    visited: bool | None
    objects: tuple[str, ...]


class AreaPad(Protocol):
    @property
    def x(self) -> int: ...

    @property
    def y(self) -> int: ...

    @property
    def label(self) -> str: ...

    @property
    def landing(self) -> LandingFacts | None: ...


def objects_in(
    objects: Sequence[tuple[int, int, int, int, int]],
    in_area: Callable[[Tile], bool],
    facts: AreaFacts,
) -> tuple[str, ...]:
    return tuple(
        f"{facts.sprite(graphics) or 'unknown sprite'} at ({x},{y})"
        for _, graphics, x, y, flag in objects
        if in_area((x, y)) and not (flag != 0 and facts.hidden(flag))
    )


def _pad(pad: AreaPad, landing: LandingFacts) -> str:
    at = f"({pad.x},{pad.y})"
    tile = landing.tile
    return at if tile is None else f"{at} → ({tile[0]},{tile[1]})"


def warp_area_lines(pads: Sequence[tuple[AreaPad, bool]]) -> list[str]:
    """One line per landing area. `pads` holds each warp and whether the player can reach it."""
    areas: dict[tuple[str, str], list[tuple[AreaPad, LandingFacts, bool]]] = {}
    for pad, can in pads:
        if (landing := pad.landing) is not None:
            areas.setdefault((pad.label, landing.exits), []).append((pad, landing, can))
    caveats = {landing.caveat for pad, _ in pads if (landing := pad.landing) is not None}
    lines = [" ".join((HEADER, max(caveats, key=len))).rstrip()] if areas else []
    for (label, exits), members in areas.items():
        first = members[0][1]
        parts = [f"- {label}."]
        if first.visited is not None:
            parts.append(f"Been there this run: {'yes' if first.visited else 'no'}.")
        if first.objects:
            parts.append(f"Objects there: {', '.join(first.objects)}.")
        reachable = [_pad(p, landing) for p, landing, can in members if can]
        cut_off = [_pad(p, landing) for p, landing, can in members if not can]
        parts.append(f"Pads you can reach: {', '.join(reachable) or 'none'}.")
        if cut_off:
            parts.append(f"Pads you can't reach: {', '.join(cut_off)}.")
        parts.append(exits)
        lines.append(" ".join(parts))
    return lines
