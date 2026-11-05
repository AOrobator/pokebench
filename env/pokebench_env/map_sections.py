"""exit-labels-v3: directed terrain sections and distinct physical exits.

ROM layout facts, not a guaranteed path: temporary objects and scripts may block it.
SCCs preserve one-way ledges. No location, objective or route is hardcoded.
Movement grounding: pret731ad5b GetCollisionAtCoords / MB_JUMP_*; topology.crossable.
"""

from collections import deque
from collections.abc import Callable
from dataclasses import dataclass, replace

from pokebench_env.active_warps import warp_activation
from pokebench_env.exit_labels import (
    DYNAMIC,
    DestinationGates,
    MapId,
    RomMap,
    Tile,
    _edge,
    destination_rules,
    read_rom_map,
)
from pokebench_env.field_moves import FloodRules
from pokebench_env.game_screen import ReadMemory
from pokebench_env.live_map import FullMap
from pokebench_env.surf_gate import LEDGES
from pokebench_env.topology import STEPS, SURFABLE, crossable
from pokebench_env.warp_areas import AreaFacts, LandingFacts, objects_in

SWITCH = "exit-labels-v3"


@dataclass(frozen=True)
class Sections:
    rom: RomMap
    regions: dict[Tile, Tile]
    links: dict[Tile, set[Tile]]
    labels: dict[Tile, str]
    rules: FloodRules | None = None
    arms: frozenset[frozenset[Tile]] = frozenset()

    def section(self, tile: Tile) -> Tile | None:
        return self.regions.get(tile)

    def landing(self, tile: Tile) -> Tile | None:
        if (region := self.section(tile)) is not None:
            return region
        block = self.rom.block(*tile)
        if (
            block is None
            or block[3] in SURFABLE
            or (self.rules is not None and tile in self.rules.walls)
            or not any((x, y) == tile for x, y, *_ in self.rom.warps)
        ):
            return None
        # Door warps can be colliding. Once placed there, emergence still must
        # respect edge walls, elevation and the existing field-gate step rules.
        origin = (block[0], 0, block[2], block[3])
        found: set[Tile] = set()
        for leaving, entering, dx, dy, _ in STEPS.values():
            if (
                self.rules is not None
                and (only := self.rules.only.get(tile)) is not None
                and only != (dx, dy)
            ):
                continue
            neighbour = (tile[0] + dx, tile[1] + dy)
            other = self.rom.block(*neighbour)
            region = self.section(neighbour)
            if (
                region is not None
                and frozenset({tile, neighbour}) not in self.arms
                and other is not None
                and crossable(origin, other, leaving, entering, water=False)
            ):
                found.add(region)
        return next(iter(found)) if len(found) == 1 else None

    def connected(self, start: Tile | None, end: Tile | None) -> bool:
        if start is None or end is None:
            return False
        seen = {start}
        queue = deque([start])
        while queue:
            here = queue.popleft()
            if here == end:
                return True
            for nxt in self.links[here] - seen:
                seen.add(nxt)
                queue.append(nxt)
        return False

    def reaches(self, start: Tile, end: Tile) -> bool:
        return self.connected(self.section(start), self.section(end))

    def label(self, region: Tile | None) -> str:
        return "terrain section unknown" if region is None else self.labels[region]


def build_sections(
    rom: RomMap,
    rules: FloodRules | None = None,
    *,
    active_warps: bool = False,
    arms: frozenset[frozenset[Tile]] = frozenset(),  # rotating-gate-regions-v1: no step across
) -> Sections:
    warps = {
        (x, y)
        for x, y, *_ in rom.warps
        if not active_warps
        or warp_activation(None if (block := rom.block(x, y)) is None else block[3]) is not False
    }
    floor = {
        (x, y): b
        for y in range(rom.height)
        for x in range(rom.width)
        if (b := rom.block(x, y)) is not None
        and not b[1]
        and b[3] not in SURFABLE
        and (x, y) not in warps
        and (rules is None or (x, y) not in rules.walls)
    }
    graph: dict[Tile, list[Tile]] = {p: [] for p in floor}
    reverse: dict[Tile, list[Tile]] = {p: [] for p in floor}
    for (x, y), block in floor.items():
        for leaving, entering, dx, dy, _ in STEPS.values():
            if (
                rules is not None
                and (only := rules.only.get((x, y))) is not None
                and only != (dx, dy)
            ):
                continue
            nxt = (x + dx, y + dy)
            other = rom.block(*nxt)
            if frozenset({(x, y), nxt}) in arms:
                continue
            if other is not None and other[1] and LEDGES.get(other[3]) == (dx, dy):
                hop = nxt
                nxt = (x + 2 * dx, y + 2 * dy)
                other = rom.block(*nxt)
                valid = nxt in floor and frozenset({hop, nxt}) not in arms
            else:
                valid = (
                    other is not None
                    and nxt in floor
                    and crossable(block, other, leaving, entering, water=False)
                )
            if valid:
                graph[(x, y)].append(nxt)
                reverse[nxt].append((x, y))
    # Iterative Kosaraju: maps can exceed Python's recursion limit.
    visited: set[Tile] = set()
    order: list[Tile] = []
    for start in graph:
        if start in visited:
            continue
        stack = [(start, False)]
        while stack:
            tile, finish = stack.pop()
            if finish:
                order.append(tile)
            elif tile not in visited:
                visited.add(tile)
                stack.append((tile, True))
                stack.extend((n, False) for n in graph[tile] if n not in visited)
    regions: dict[Tile, Tile] = {}
    labels: dict[Tile, str] = {}
    for start in reversed(order):
        if start in regions:
            continue
        members = {start}
        todo = [start]
        while todo:
            tile = todo.pop()
            for nxt in reverse[tile]:
                if nxt not in regions and nxt not in members:
                    members.add(nxt)
                    todo.append(nxt)
        anchor = min(members, key=lambda p: (p[1], p[0]))
        for tile in members:
            regions[tile] = anchor
        cx = sum(p[0] for p in members) / len(members)
        cy = sum(p[1] for p in members) / len(members)
        direction = ("north" if cy < rom.height / 2 else "south") + (
            "west" if cx < rom.width / 2 else "east"
        )
        labels[anchor] = f"{direction} terrain section [{anchor[0]},{anchor[1]}]"
    links: dict[Tile, set[Tile]] = {r: set() for r in labels}
    for tile, neighbours in graph.items():
        links[regions[tile]].update(regions[n] for n in neighbours if regions[n] != regions[tile])
    return Sections(rom, regions, links, labels, rules, arms)


@dataclass(frozen=True)
class SectionExit:
    x: int
    y: int
    label: str
    detail: str
    # warp-areas-v1 only, and deliberately not in json(): the readout text records it.
    landing: LandingFacts | None = None

    def json(self) -> dict[str, object]:
        return {"x": self.x, "y": self.y, "label": self.label, "detail": self.detail}


@dataclass(frozen=True)
class SectionConnection:
    direction: str
    offset: int
    destination: MapId
    label: str

    def json(self) -> dict[str, object]:
        return {
            "direction": self.direction,
            "offset": self.offset,
            "destination": list(self.destination),
            "label": self.label,
        }


@dataclass(frozen=True)
class ExitSections:
    current: str
    warps: tuple[SectionExit, ...]
    connections: tuple[SectionConnection, ...]

    def json(self) -> dict[str, object]:
        return {
            "current": self.current,
            "warps": [w.json() for w in self.warps],
            "connections": [c.json() for c in self.connections],
        }


def read_exit_sections(
    read: ReadMemory,
    map_id: MapId,
    position: Tile,
    shown: Callable[[MapId], str | None],
    gates: DestinationGates | None = None,
    current_rules: FloodRules | None = None,
    *,
    active_warps: bool = False,
    live_map: FullMap | None = None,
    areas: AreaFacts | None = None,
) -> ExitSections | None:
    if areas is not None:
        areas.visits.note(map_id, position)
    cache: dict[MapId, Sections | None] = {}

    def section_map(mid: MapId) -> Sections | None:
        if mid not in cache:
            rom = read_rom_map(read, mid)
            if rom is None:
                cache[mid] = None
            else:
                if active_warps and mid == map_id and live_map is not None:
                    live = {(t.x, t.y): t for t in live_map.tiles}
                    rom = replace(
                        rom,
                        blocks=tuple(
                            (t.metatile, t.collision, t.elevation, t.behavior)
                            if (t := live.get((x, y))) is not None
                            else rom.blocks[y * rom.width + x]
                            for y in range(rom.height)
                            for x in range(rom.width)
                        ),
                    )
                tiles = {
                    (x, y): (b[1], b[3])
                    for y in range(rom.height)
                    for x in range(rom.width)
                    if (b := rom.block(x, y)) is not None
                }
                rules = (
                    current_rules
                    if mid == map_id
                    else destination_rules(read, rom, mid, tiles, gates)
                )
                cache[mid] = build_sections(rom, rules, active_warps=active_warps)
        return cache[mid]

    here = section_map(map_id)
    if here is None:
        return None
    current = here.landing(position)

    def named(mid: MapId, sections: Sections | None, region: Tile | None) -> str:
        name = shown(mid) or "a map with no location name"
        part = "terrain section unknown" if sections is None else sections.label(region)
        return f"{name} (map {mid[0]}/{mid[1]}) — {part}"

    def entrance(rom: RomMap, x: int, y: int, current: bool) -> bool:
        if current and live_map is None:
            return True
        block = rom.block(x, y)
        return not active_warps or warp_activation(None if block is None else block[3]) is not False

    def details(mid: MapId, target: Sections, start: Tile | None) -> str:
        parts: list[str] = []
        for x, y, wid, g, n in target.rom.warps:
            if not entrance(target.rom, x, y, mid == map_id):
                continue
            if not target.connected(start, target.landing((x, y))):
                continue
            if (g, n) == map_id and wid < len(here.rom.warps):
                landing = here.rom.warps[wid][:2]
                region = here.landing(landing)
                relation = (
                    "unknown terrain section"
                    if region is None or current is None
                    else (
                        "same terrain section as you"
                        if region == current
                        else "different terrain section from you"
                    )
                )
                parts.append(
                    f"exit ({x},{y}) returns to {named(map_id, here, region)} "
                    f"at ({landing[0]},{landing[1]}) ({relation})"
                )
            elif (g, n) != DYNAMIC:
                parts.append(
                    f"exit ({x},{y}) → {shown((g, n)) or 'a map with no location name'} "
                    f"(map {g}/{n})"
                )
        for direction, offset, to in target.rom.connections:
            if direction not in STEPS:
                continue
            beyond = section_map(to)
            if beyond is not None and any(
                target.connected(start, target.section(t))
                for t in _edge(target.rom, direction, offset, beyond.rom)
            ):
                parts.append(
                    f"{direction} edge → {shown(to) or 'a map with no location name'} "
                    f"(map {to[0]}/{to[1]})"
                )
        return "Terrain exits after arrival: " + ("; ".join(parts) if parts else "none established")

    def caveat(mid: MapId) -> str:
        return " Temporary objects and scripts may block these terrain paths." + (
            " Entrance activation uses the map’s default terrain; scripts may change entrances."
            if active_warps and mid != map_id
            else ""
        )

    unestablished = "Landing is not established."

    def landing_facts(
        mid: MapId, target: Sections, tile: Tile, region: Tile | None
    ) -> LandingFacts | None:
        if areas is None:
            return None
        visited = None
        if region is not None:
            visited = any(target.landing(t) == region for t in areas.visits.tiles(mid))
        return LandingFacts(
            tile,
            details(mid, target, region) + ".",
            caveat(mid).strip(),
            visited,
            objects_in(target.rom.objects, lambda t: target.landing(t) == region, areas)
            if visited
            else (),
        )

    nowhere = None if areas is None else LandingFacts(None, unestablished, "", None, ())
    warps: list[SectionExit] = []
    for x, y, wid, g, n in here.rom.warps:
        if not entrance(here.rom, x, y, True):
            continue
        if (g, n) == DYNAMIC:
            warps.append(
                SectionExit(
                    x,
                    y,
                    "dynamic destination — terrain section unknown",
                    unestablished,
                    nowhere,
                )
            )
            continue
        mid = (g, n)
        target = section_map(mid)
        landing = (
            None if target is None or wid >= len(target.rom.warps) else target.rom.warps[wid][:2]
        )
        region = None if landing is None or target is None else target.landing(landing)
        detail = (
            unestablished
            if landing is None or target is None
            else f"Arrives at ({landing[0]},{landing[1]}). "
            + details(mid, target, region)
            + "."
            + caveat(mid)
        )
        facts = (
            nowhere
            if landing is None or target is None
            else landing_facts(mid, target, landing, region)
        )
        warps.append(SectionExit(x, y, named(mid, target, region), detail, facts))
    connections: list[SectionConnection] = []
    for direction, offset, to in here.rom.connections:
        beyond = section_map(to)
        regions = (
            {
                r
                for tile in _edge(here.rom, direction, offset, beyond.rom)
                if (r := here.section(tile)) is not None
            }
            if direction in STEPS and beyond is not None
            else set()
        )
        area = ", ".join(here.label(r) for r in sorted(regions)) or "terrain section unknown"
        connections.append(
            SectionConnection(
                direction,
                offset,
                to,
                f"{shown(to) or 'a map with no location name'} (map {to[0]}/{to[1]}); "
                f"exit lies in {area}",
            )
        )
    return ExitSections(named(map_id, here, current), tuple(warps), tuple(connections))
