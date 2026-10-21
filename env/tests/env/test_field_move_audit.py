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
"""

import functools
import json
from pathlib import Path
from typing import Any

import pytest
from test_field_moves import operator_rom

from pokebench_env import rerender
from pokebench_env.exit_labels import RomMap, _edge, read_rom_map
from pokebench_env.field_moves import (
    Capabilities,
    MapGates,
    capabilities,
    classify,
    map_gates,
    reachable,
    rom_object_obstacles,
)
from pokebench_env.game_state import MapNames

AUDIT: dict[str, Any] = json.loads(
    (Path(__file__).parent / "fixtures/field-moves-audit.json").read_text()
)
ROM_START = 0x08000000
CLOSED = capabilities((), (), (), 0)
UNKNOWN = Capabilities(tuple((gid, None) for gid, _ in CLOSED.open))
Tiles = dict[tuple[int, int], tuple[int, int]]


@functools.cache
def names() -> MapNames:
    return MapNames.load(rerender.PORYMAP_MAPS)


def read(address: int, length: int) -> bytes:
    rom = operator_rom()
    if address >= ROM_START:
        return rom[address - ROM_START : address - ROM_START + length]
    return bytes(length)


@functools.cache
def rom_map(map_id: tuple[int, int]) -> RomMap:
    found = read_rom_map(read, map_id)
    assert found is not None, map_id
    return found


def tiles_of(rom: RomMap) -> Tiles:
    return {
        (x, y): (block[1], block[3])
        for y in range(rom.height)
        for x in range(rom.width)
        if (block := rom.block(x, y)) is not None
    }


def gates_of(
    map_id: tuple[int, int], caps: Capabilities, *, objects: bool, terrain: bool
) -> MapGates:
    rom = rom_map(map_id)
    location = names().name(map_id)
    found = rom_object_obstacles(rom.objects, lambda _flag: False, location) if objects else ()
    gates = map_gates(caps, found, tiles_of(rom), location)
    if terrain:
        return gates
    return MapGates(caps, tuple(o for o in gates.obstacles if o.local_id is not None))


def connections_of(map_id: tuple[int, int]) -> dict[tuple[str, tuple[int, int], int], Any]:
    rom = rom_map(map_id)
    edges = {}
    for direction, offset, to in rom.connections:
        beyond = read_rom_map(read, to)
        if beyond is not None:
            dry = _edge(rom, direction, offset, beyond)
            edges[(direction, to, offset)] = (dry, dry)
    return edges


MAPS = [pytest.param(m, id=m["map"]) for m in AUDIT["maps"]]


def test_the_audit_covers_81_maps_and_20_obstacle_objects() -> None:
    assert len(AUDIT["maps"]) == 81
    assert sum(len(m["obstacles"]) for m in AUDIT["maps"]) == 20


@pytest.mark.parametrize("entry", MAPS)
def test_objects_size_and_terrain_match_the_audit(entry: dict[str, Any]) -> None:
    map_id = (entry["map_id"][0], entry["map_id"][1])
    rom = rom_map(map_id)
    assert [rom.width, rom.height] == entry["size"]
    gates = gates_of(map_id, CLOSED, objects=True, terrain=True)
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
    surf = sum(
        1
        for _, behavior in tiles_of(rom).values()
        if behavior in {0x10, 0x11, 0x12, 0x14, 0x15, 0x50, 0x51, 0x52, 0x53}
    )
    assert surf == entry["surf_tiles"]


@pytest.mark.parametrize("cut", AUDIT["cuts"], ids=lambda c: c["map"])
def test_the_exits_the_audit_found_cut_off_are_labelled_none(cut: dict[str, Any]) -> None:
    entry = next(m for m in AUDIT["maps"] if m["map"] == cut["map"])
    map_id = (entry["map_id"][0], entry["map_id"][1])
    rom, tiles = rom_map(map_id), tiles_of(rom_map(map_id))
    warps = [w[:2] for w in rom.warps]
    start = (cut["start"][0], cut["start"][1])
    gates = gates_of(map_id, CLOSED, objects=cut["by"] == "objects", terrain=cut["by"] == "terrain")
    gated = dict(classify(tiles, start, warps=warps, connections={}, rules=gates.rules()).warps)
    ungated = dict(classify(tiles, start, warps=warps, connections={}).warps)
    changed = sorted(w for w in warps if gated[w] != ungated[w])
    assert changed == sorted((x, y) for x, y in cut["warps"])
    assert all(gated[(x, y)] == "none" for x, y in cut["warps"])


@pytest.mark.parametrize("entry", MAPS)
def test_only_the_rusturf_rocks_cut_off_an_exit(entry: dict[str, Any]) -> None:
    map_id = (entry["map_id"][0], entry["map_id"][1])
    rom, tiles = rom_map(map_id), tiles_of(rom_map(map_id))
    warps = [w[:2] for w in rom.warps]
    edges = connections_of(map_id)
    rules = gates_of(map_id, CLOSED, objects=True, terrain=False).rules()
    cut = set()
    for start in warps:
        if start not in tiles:
            continue
        gated = classify(tiles, start, warps=warps, connections=edges, rules=rules)
        ungated = classify(tiles, start, warps=warps, connections=edges)
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
    entry: dict[str, Any],
) -> None:
    map_id = (entry["map_id"][0], entry["map_id"][1])
    rom, tiles = rom_map(map_id), tiles_of(rom_map(map_id))
    closed = gates_of(map_id, CLOSED, objects=True, terrain=True).rules()
    unknown = gates_of(map_id, UNKNOWN, objects=True, terrain=True).rules()
    for start in (w[:2] for w in rom.warps):
        if start not in tiles:
            continue
        for water in (False, True):
            plain = reachable(tiles, start, water=water)
            assert reachable(tiles, start, water=water, rules=closed) <= plain
            assert reachable(tiles, start, water=water, rules=unknown) == plain
