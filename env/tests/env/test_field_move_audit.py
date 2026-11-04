"""field-move-gates-v1 audit: 81 maps, Littleroot through the Dewford Gym, Slateport and Route 110.

field-moves-audit.json was computed from pret/pokeemerald 731ad5bf (map.json object events, map.bin
blocks and metatile attributes), independently of the server. Each map is read here the way
the server reads a destination map (exit_labels.read_rom_map and
field_moves.rom_object_obstacles over the ROM, every hide flag clear as on a new game), then:

- its obstacle objects, size and gated terrain tiles match the audit;
- the exits the audit found cut off are labelled none from the audit's start tile, and no other map
  has an exit an obstacle object cuts off (from any of its warps);
- INV-2: from every warp of every map the gated flood stays inside exit-reachability-v1's, and with
  every gate unknown it is that flood exactly.

The module analyses every map once (one ROM parse per map, one classify per start and gate set)
and the parametrized cases read that analysis; test_the_analysis_does_bounded_work counts it.
"""

import json
from collections import Counter
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pytest
from test_field_moves import operator_rom

from pokebench_env import exit_labels, field_moves
from pokebench_env.exit_labels import RomMap, _edge
from pokebench_env.field_moves import (
    Capabilities,
    Edges,
    FloodRules,
    MapGates,
    Reached,
    capabilities,
    classify,
    map_gates,
    rom_object_obstacles,
)
from pokebench_env.game_state import MapNames

AUDIT: dict[str, Any] = json.loads(
    (Path(__file__).parent / "fixtures/field-moves-audit.json").read_text()
)
ROM_START = 0x08000000
CLOSED = capabilities((), (), (), 0)
UNKNOWN = Capabilities(tuple((gid, None) for gid, _ in CLOSED.open))
Tile = tuple[int, int]
Tiles = dict[Tile, tuple[int, int]]
ConnectionKey = tuple[str, Tile, int]
# Closed gate sets: obstacle objects only, terrain only, both.
VARIANTS = {"objects": (True, False), "terrain": (False, True), "all": (True, True)}


def map_id_of(entry: dict[str, Any]) -> tuple[int, int]:
    return (entry["map_id"][0], entry["map_id"][1])


# In-memory names for the 81 audited maps; test_the_audit_names_are_the_porymap_names checks
# them against the real porymap adapter.
AUDIT_NAMES = MapNames(
    {map_id_of(m): m["map"].removeprefix("MAP_").replace("_", " ") for m in AUDIT["maps"]}
)


def is_empty(rules: FloodRules) -> bool:
    return not rules.walls and not rules.only


@dataclass(frozen=True)
class MapAudit:
    rom: RomMap
    tiles: Tiles
    warps: tuple[Tile, ...]
    edges: dict[ConnectionKey, Edges]
    closed: dict[str, MapGates]
    unknown: MapGates
    # (start, variant) -> classify from start; "open" is ungated. A variant whose closed rules are
    # empty floods exactly as ungated, so it shares the "open" result instead of flooding again.
    reached: dict[tuple[Tile, str], Reached[ConnectionKey]]

    def starts(self) -> tuple[Tile, ...]:
        return tuple(w for w in self.warps if w in self.tiles)


@dataclass(frozen=True)
class Audit:
    maps: dict[tuple[int, int], MapAudit]
    work: Counter[str]


class RomMaps:
    """Each map's ROM header parsed once, audited maps and connected destinations alike."""

    def __init__(self, read: Callable[[int, int], bytes]) -> None:
        self._read = read
        self._maps: dict[tuple[int, int], RomMap | None] = {}

    def get(self, map_id: tuple[int, int]) -> RomMap | None:
        if map_id not in self._maps:
            self._maps[map_id] = exit_labels.read_rom_map(self._read, map_id)
        return self._maps[map_id]


def tiles_of(rom: RomMap) -> Tiles:
    return {
        (x, y): (block[1], block[3])
        for y in range(rom.height)
        for x in range(rom.width)
        if (block := rom.block(x, y)) is not None
    }


def gates_of(
    rom: RomMap,
    tiles: Tiles,
    location: str | None,
    caps: Capabilities,
    *,
    objects: bool,
    terrain: bool,
) -> MapGates:
    found = rom_object_obstacles(rom.objects, lambda _flag: False, location) if objects else ()
    gates = map_gates(caps, found, tiles, location)
    if terrain:
        return gates
    return MapGates(caps, tuple(o for o in gates.obstacles if o.local_id is not None))


def connections_of(rom: RomMap, roms: RomMaps) -> dict[ConnectionKey, Edges]:
    edges: dict[ConnectionKey, Edges] = {}
    for direction, offset, to in rom.connections:
        beyond = roms.get(to)
        if beyond is not None:
            dry = _edge(rom, direction, offset, beyond)
            edges[(direction, to, offset)] = (dry, dry)
    return edges


def analyse(entry: dict[str, Any], roms: RomMaps, names: MapNames) -> MapAudit:
    map_id = map_id_of(entry)
    rom = roms.get(map_id)
    assert rom is not None, map_id
    tiles = tiles_of(rom)
    location = names.name(map_id)
    closed = {
        v: gates_of(rom, tiles, location, CLOSED, objects=o, terrain=t)
        for v, (o, t) in VARIANTS.items()
    }
    unknown = gates_of(rom, tiles, location, UNKNOWN, objects=True, terrain=True)
    warps = tuple(dict.fromkeys(w[:2] for w in rom.warps))
    edges = connections_of(rom, roms)
    plan: dict[Tile, set[str]] = {w: {"objects", "all"} for w in warps if w in tiles}
    for cut in AUDIT["cuts"]:
        if cut["map"] == entry["map"]:
            plan.setdefault((cut["start"][0], cut["start"][1]), set()).add(cut["by"])
    reached: dict[tuple[Tile, str], Reached[ConnectionKey]] = {}
    for start, variants in plan.items():
        ungated = classify(tiles, start, warps=warps, connections=edges)
        reached[(start, "open")] = ungated
        for variant in sorted(variants):
            rules = closed[variant].rules()
            reached[(start, variant)] = (
                ungated
                if is_empty(rules)
                else classify(tiles, start, warps=warps, connections=edges, rules=rules)
            )
    return MapAudit(rom, tiles, warps, edges, closed, unknown, reached)


def run_audit(read: Callable[[int, int], bytes], names: MapNames) -> Audit:
    """Every audited map analysed once, counting file reads, ROM map parses and floods."""
    work: Counter[str] = Counter()
    spread = field_moves._spread
    read_rom_map = exit_labels.read_rom_map
    read_text = Path.read_text

    def counted_spread(*args: Any, **kwargs: Any) -> frozenset[Tile]:
        work["floods"] += 1
        return spread(*args, **kwargs)

    def counted_rom_map(*args: Any, **kwargs: Any) -> RomMap | None:
        work["rom_maps"] += 1
        return read_rom_map(*args, **kwargs)

    def counted_read_text(self: Path, *args: Any, **kwargs: Any) -> str:
        work["file_reads"] += 1
        return read_text(self, *args, **kwargs)

    with pytest.MonkeyPatch.context() as patch:
        patch.setattr(field_moves, "_spread", counted_spread)
        patch.setattr(exit_labels, "read_rom_map", counted_rom_map)
        patch.setattr(Path, "read_text", counted_read_text)
        roms = RomMaps(read)
        maps = {map_id_of(m): analyse(m, roms, names) for m in AUDIT["maps"]}
    work["distinct_rom_maps"] = len(roms._maps)
    return Audit(maps, work)


def rom_read() -> Callable[[int, int], bytes]:
    rom = operator_rom()

    def read(address: int, length: int) -> bytes:
        if address >= ROM_START:
            return rom[address - ROM_START : address - ROM_START + length]
        return bytes(length)

    return read


@pytest.fixture(scope="module")
def audit() -> Audit:
    return run_audit(rom_read(), AUDIT_NAMES)


MAPS = [pytest.param(m, id=m["map"]) for m in AUDIT["maps"]]


def test_the_audit_covers_81_maps_and_20_obstacle_objects() -> None:
    assert len(AUDIT["maps"]) == 81
    assert sum(len(m["obstacles"]) for m in AUDIT["maps"]) == 20


def test_the_analysis_floods_once_per_start_on_a_map_twice_the_size() -> None:
    # Work stays linear in starts x tiles: a synthetic all-floor map with N warps, then 2N.
    def floods(n: int) -> tuple[int, int]:
        rom = RomMap(
            n,
            1,
            tuple((0, 0, 0, 0) for _ in range(n)),
            tuple((x, 0, 0, 0, 0) for x in range(n)),
            (),
        )
        entry = {"map": "MAP_SYNTHETIC", "map_id": [99, n]}
        work: Counter[str] = Counter()
        spread = field_moves._spread

        def counted(*args: Any, **kwargs: Any) -> frozenset[Tile]:
            work["floods"] += 1
            work["visits"] += len(result := spread(*args, **kwargs))
            return result

        roms = RomMaps(lambda _a, _n: b"")
        roms._maps[(99, n)] = rom
        with pytest.MonkeyPatch.context() as patch:
            patch.setattr(field_moves, "_spread", counted)
            analyse(entry, roms, MapNames({}))
        return work["floods"], work["visits"]

    assert floods(16) == (2 * 16, 2 * 16 * 16)
    assert floods(32) == (2 * 32, 2 * 32 * 32)
