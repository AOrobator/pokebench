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
SURF_BEHAVIORS = {0x10, 0x11, 0x12, 0x14, 0x15, 0x50, 0x51, 0x52, 0x53}


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


def test_the_audit_names_are_the_porymap_names(porymap_names: MapNames) -> None:
    for entry in AUDIT["maps"]:
        map_id = map_id_of(entry)
        assert porymap_names.name(map_id) == AUDIT_NAMES.name(map_id), entry["map"]


def test_the_analysis_does_bounded_work(audit: Audit) -> None:
    work = audit.work
    # No file is read: the ROM is already in memory and the names are the in-memory owner.
    assert work["file_reads"] == 0
    # Each map header is parsed once, audited map or connected destination.
    assert work["rom_maps"] == work["distinct_rom_maps"]
    assert work["distinct_rom_maps"] <= 2 * len(AUDIT["maps"])
    # Per start: one ungated classify plus at most one per closed gate set (two floods each).
    starts = sum(len({s for s, _ in m.reached}) for m in audit.maps.values())
    classified = sum(len({id(r) for r in m.reached.values()}) for m in audit.maps.values())
    assert work["floods"] == 2 * classified
    assert work["floods"] <= 2 * (1 + len(VARIANTS)) * starts
    assert starts == sum(len(m.starts()) for m in audit.maps.values()) + sum(
        (c["start"][0], c["start"][1]) not in audit.maps[map_id_of(e)].starts()
        for c in AUDIT["cuts"]
        for e in AUDIT["maps"]
        if e["map"] == c["map"]
    )


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


@pytest.mark.parametrize("entry", MAPS)
def test_objects_size_and_terrain_match_the_audit(entry: dict[str, Any], audit: Audit) -> None:
    found = audit.maps[map_id_of(entry)]
    assert [found.rom.width, found.rom.height] == entry["size"]
    gates = found.closed["all"]
    objects = sorted(
        (
            {"gate": o.gate, "x": o.tiles[0][0], "y": o.tiles[0][1]}
            for o in gates.obstacles
            if o.local_id is not None
        ),
        key=lambda o: (o["y"], o["x"]),
    )
    assert objects == sorted(entry["obstacles"], key=lambda o: (o["y"], o["x"]))
    slopes = sum(len(o.tiles) for o in gates.obstacles if o.name.startswith("slope"))
    cracked = sum(len(o.tiles) for o in gates.obstacles if o.name.startswith(("cracked", "hole")))
    assert (slopes, cracked) == (entry["slope_tiles"], entry["cracked_tiles"])
    surf = sum(1 for _, behavior in found.tiles.values() if behavior in SURF_BEHAVIORS)
    assert surf == entry["surf_tiles"]


@pytest.mark.parametrize("cut", AUDIT["cuts"], ids=lambda c: c["map"])
def test_the_exits_the_audit_found_cut_off_are_labelled_none(
    cut: dict[str, Any], audit: Audit
) -> None:
    entry = next(m for m in AUDIT["maps"] if m["map"] == cut["map"])
    found = audit.maps[map_id_of(entry)]
    start = (cut["start"][0], cut["start"][1])
    assert not is_empty(found.closed[cut["by"]].rules())
    gated = dict(found.reached[(start, cut["by"])].warps)
    ungated = dict(found.reached[(start, "open")].warps)
    changed = sorted(w for w in found.warps if gated[w] != ungated[w])
    assert changed == sorted((x, y) for x, y in cut["warps"])
    assert all(gated[(x, y)] == "none" for x, y in cut["warps"])


@pytest.mark.parametrize("entry", MAPS)
def test_only_the_rusturf_rocks_cut_off_an_exit(entry: dict[str, Any], audit: Audit) -> None:
    found = audit.maps[map_id_of(entry)]
    cut = set()
    for start in found.starts():
        gated, ungated = found.reached[(start, "objects")], found.reached[(start, "open")]
        cut |= {w for (w, a), (_, b) in zip(gated.warps, ungated.warps, strict=True) if a != b}
        cut |= {
            k
            for (k, a), (_, b) in zip(gated.connections, ungated.connections, strict=True)
            if a != b
        }
    # From the east side the same rocks cut the west warp (4,10) off too.
    expected = {(4, 10), (29, 16), (18, 20)} if entry["map"] == "MAP_RUSTURF_TUNNEL" else set()
    assert cut == expected


@pytest.mark.parametrize("entry", MAPS)
def test_inv2_the_gated_flood_stays_inside_exit_reachability_from_every_warp(
    entry: dict[str, Any], audit: Audit
) -> None:
    found = audit.maps[map_id_of(entry)]
    # Every gate unknown closes nothing, so the flood is exit-reachability-v1's exactly
    # (test_without_rules_the_flood_is_exit_reachability_v1 checks empty rules flood as none).
    assert is_empty(found.unknown.rules())
    for start in found.starts():
        plain, closed = found.reached[(start, "open")], found.reached[(start, "all")]
        assert closed.foot <= plain.foot
        assert closed.wet <= plain.wet
