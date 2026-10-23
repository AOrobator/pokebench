"""field-move-gates-v1: every "close(s) every way on foot to" line is true as printed.

survey's warp_blocks and connection_blocks hold, for each cut-off exit, the closed obstacles every
way to it passes one of. A readout line may say its obstacles close every way to an exit only when
they are that exit's whole blocker set: closing exactly them, with every other gate open, must cut
the exit off. VICTORY ROAD B1F from (30,25) and SEAFLOOR CAVERN ROOM1 from (5,18) are the real
maps where a line per obstacle kind overclaimed; the sweep checks every porymap map from every warp.
"""

import re
from collections.abc import Callable, Iterator
from dataclasses import dataclass, replace
from typing import Any

import pytest
from test_field_moves import operator_rom

from pokebench_env import field_moves
from pokebench_env.exit_labels import RomMap, _edge, read_rom_map
from pokebench_env.field_moves import (
    FOOT,
    Capabilities,
    Edges,
    FieldObstacles,
    MapGates,
    Obstacle,
    Survey,
    capabilities,
    classify,
    map_gates,
    rom_object_obstacles,
    survey,
)
from pokebench_env.game_state import BADGES, MapNames

ROM_START = 0x08000000
CLOSED = capabilities((), (), (), 0)
# All eight badges, an empty bag and a party that knows no field move.
BADGED = capabilities((), BADGES, (), 0)
BOULDER = "It's a big boulder, but a POKéMON may be able to push it aside."
ROCK = "It's a rugged rock, but a POKéMON may be able to smash it."
HEADER = "Field obstacles on this map (from the map's own object list and its tiles):"
Tile = tuple[int, int]
Key = tuple[str, tuple[int, int], int]
CLAIM = re.compile(r"^- (?P<what>.*?) (?:together )?closes? every way on foot to (?P<exits>.*?): ")


@dataclass(frozen=True)
class Place:
    location: str
    rom: RomMap
    tiles: dict[Tile, tuple[int, int]]
    warps: tuple[Tile, ...]
    edges: dict[Key, Edges]

    def gates(self, caps: Capabilities) -> MapGates:
        objects = rom_object_obstacles(self.rom.objects, lambda _flag: False, self.location)
        return map_gates(caps, objects, self.tiles, self.location)

    def lines(
        self,
        gates: MapGates,
        start: Tile,
        warp_name: Callable[[Tile], str] = lambda w: f"({w[0]},{w[1]})",
        connection_name: Callable[[Key], str] = lambda k: f"{k[0]} edge",
    ) -> list[str]:
        return self.surveyed(gates, start, warp_name, connection_name)[1]

    def surveyed(
        self,
        gates: MapGates,
        start: Tile,
        warp_name: Callable[[Tile], str],
        connection_name: Callable[[Key], str],
    ) -> tuple[Survey[Key], list[str]]:
        found = survey(self.tiles, start, gates, warps=self.warps, connections=self.edges)
        field = FieldObstacles(gates, found, self.rom.width, self.rom.height)
        return found, field.lines(warp_name, connection_name)


class Places:
    def __init__(self, names: MapNames) -> None:
        rom = operator_rom()

        def read(address: int, length: int) -> bytes:
            if address >= ROM_START:
                return rom[address - ROM_START : address - ROM_START + length]
            return bytes(length)

        self._read = read
        self._names = names
        self._roms: dict[tuple[int, int], RomMap | None] = {}

    def rom(self, map_id: tuple[int, int]) -> RomMap | None:
        if map_id not in self._roms:
            self._roms[map_id] = read_rom_map(self._read, map_id)
        return self._roms[map_id]

    def place(self, map_id: tuple[int, int]) -> Place | None:
        rom, location = self.rom(map_id), self._names.name(map_id)
        if rom is None or location is None:
            return None
        tiles = {
            (x, y): (block[1], block[3])
            for y in range(rom.height)
            for x in range(rom.width)
            if (block := rom.block(x, y)) is not None
        }
        edges: dict[Key, Edges] = {}
        for direction, offset, to in rom.connections:
            beyond = self.rom(to)
            if beyond is not None:
                dry = _edge(rom, direction, offset, beyond)
                edges[(direction, to, offset)] = (dry, dry)
        warps = tuple(dict.fromkeys(w[:2] for w in rom.warps))
        return Place(location, rom, tiles, warps, edges)

    def named(self, location: str) -> Place:
        map_id = next(m for m in self._names.ids() if self._names.name(m) == location)
        found = self.place(map_id)
        assert found is not None, location
        return found

    def every(self) -> Iterator[Place]:
        for map_id in self._names.ids():
            found = self.place(map_id)
            if found is not None:
                yield found


@pytest.fixture(scope="module")
def places(porymap_names: MapNames) -> Places:
    return Places(porymap_names)


def test_victory_road_b1f_names_the_boulder_and_the_rock_together_for_8_3(places: Places) -> None:
    place = places.named("VICTORY ROAD B1F")
    assert place.lines(place.gates(BADGED), (30, 25)) == [
        HEADER,
        "- PUSHABLE_BOULDER at (21,4) and BREAKABLE_ROCK at (18,12) together close every way on"
        " foot to (8,3): they need a field move you cannot use yet; the game says:"
        f' "{BOULDER}" at the PUSHABLE_BOULDER and "{ROCK}" at the BREAKABLE_ROCK',
        "- PUSHABLE_BOULDER at (34,4), (20,5), (35,6), (4,7), (9,10), (21,25) and (20,26): it needs"
        f' a field move you cannot use yet; the game says: "{BOULDER}"',
        "- BREAKABLE_ROCK at (34,3), (20,4), (19,5), (20,25) and (21,26): it needs a field move you"
        f' cannot use yet; the game says: "{ROCK}"',
    ]


def test_seafloor_cavern_room1_names_both_boulders_and_the_rock_together(places: Places) -> None:
    place = places.named("SEAFLOOR CAVERN ROOM1")
    assert place.lines(place.gates(CLOSED), (5, 18)) == [
        HEADER,
        "- PUSHABLE_BOULDER at (5,11) and (12,11) and BREAKABLE_ROCK at (5,10) together close every"
        " way on foot to (17,13) and (6,2): they need a field move you cannot use yet; the game"
        f' says: "{BOULDER}" at the PUSHABLE_BOULDER and "{ROCK}" at the BREAKABLE_ROCK',
    ]


def test_every_printed_close_claim_holds_with_exactly_its_obstacles_closed(
    places: Places, monkeypatch: pytest.MonkeyPatch
) -> None:
    floods = 0
    spread = field_moves._spread

    def counted(*args: Any, **kwargs: Any) -> frozenset[Tile]:
        nonlocal floods
        floods += 1
        return spread(*args, **kwargs)

    monkeypatch.setattr(field_moves, "_spread", counted)
    checked: set[str] = set()
    for place in places.every():
        gates = place.gates(CLOSED)
        closed = [o for o in gates.obstacles if gates.closed(o)]
        if not closed:
            continue
        keys = list(place.edges)
        for start in place.warps:
            if start not in place.tiles:
                continue
            floods = 0
            found, lines = place.surveyed(
                gates, start, lambda w: f"W{w[0]}_{w[1]}", lambda k, keys=keys: f"C{keys.index(k)}"
            )
            # survey: gated and open classify (4 floods), then at most one flood per closed
            # obstacle on foot and one with water open.
            assert floods <= 4 + 2 * len(closed), (place.location, start, floods)
            ungated = found.open
            was = {f"W{w[0]}_{w[1]}": how for w, how in ungated.warps} | {
                f"C{keys.index(k)}": how for k, how in ungated.connections
            }
            claims = 0
            floods = 0
            for line in lines:
                claim = CLAIM.match(line)
                if claim is None:
                    continue
                what = claim["what"]
                named_tiles = {(int(x), int(y)) for x, y in re.findall(r"\((\d+),(\d+)\)", what)}
                named = tuple(o for o in closed if o.name in what and set(o.tiles) <= named_tiles)
                assert {t for o in named for t in o.tiles} == named_tiles, line
                alone = classify(
                    place.tiles,
                    start,
                    warps=place.warps,
                    connections=place.edges,
                    rules=MapGates(gates.caps, named).rules(),
                )
                now = {f"W{w[0]}_{w[1]}": how for w, how in alone.warps} | {
                    f"C{keys.index(k)}": how for k, how in alone.connections
                }
                for exit_ in re.findall(r"W\d+_\d+|C\d+", claim["exits"]):
                    assert now[exit_] != FOOT and now[exit_] != was[exit_], (
                        place.location,
                        start,
                        line,
                    )
                claims += 1
                checked.add(f"{place.location} {start}")
            # One classify (two floods) per printed claim.
            assert floods == 2 * claims, (place.location, start, floods, claims)
    assert {"VICTORY ROAD B1F (30, 25)", "SEAFLOOR CAVERN ROOM1 (5, 18)"} <= checked
    assert "RUSTURF TUNNEL (4, 10)" in checked


def joint_lines(tiles: dict[Tile, tuple[int, int]], objects: tuple[Obstacle, ...]) -> list[str]:
    gates = map_gates(CLOSED, objects, tiles, None)
    found = survey(tiles, (0, 0), gates, warps=((5, 0),), connections={})
    every = tuple(range(len(gates.obstacles)))
    field = FieldObstacles(gates, replace(found, warp_blocks={(5, 0): every}), 6, 1)
    return field.lines(lambda w: f"({w[0]},{w[1]})", str)


def test_a_joint_line_names_mixed_needs_and_the_kinds_the_game_is_silent_at() -> None:
    tiles = {(x, 0): (0, 0xD0 if x == 3 else 0) for x in range(6)}
    rock = Obstacle("rock_smash", "BREAKABLE_ROCK", ((1, 0),), 1, False)
    assert joint_lines(tiles, (rock,)) == [
        HEADER,
        "- BREAKABLE_ROCK at (1,0) and slope tiles (metatile behavior 0xD0) at (3,0) (which you"
        " slide down to the south on foot) together close every way on foot to (5,0): they need a"
        f' field move or an item you cannot use yet; the game says: "{ROCK}" at the'
        " BREAKABLE_ROCK; the game shows no message at the slope tiles (metatile behavior 0xD0)",
    ]


def test_a_joint_line_of_silent_kinds_says_the_game_shows_no_message() -> None:
    tiles = {(x, 0): (0, {1: 0xD0, 3: 0xD5}.get(x, 0)) for x in range(6)}
    assert joint_lines(tiles, ())[1:] == [
        "- slope tiles (metatile behavior 0xD0) at (1,0) (which you slide down to the south on"
        " foot) and rail tiles (metatile behavior 0xD5) at (3,0) together close every way on foot"
        " to (5,0): they need special movement that walking navigation does not perform; the game"
        " shows no message at the slope"
        " tiles (metatile behavior 0xD0) or rail tiles (metatile behavior 0xD5)"
    ]
