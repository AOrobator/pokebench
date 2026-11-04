"""field-move-gates-v1: every "close(s) every way on foot to" line is true as printed.

survey's warp_blocks and connection_blocks hold, for each cut-off exit, the closed obstacles every
way to it passes one of. A readout line may say its obstacles close every way to an exit only when
they are that exit's whole blocker set: closing exactly them, with every other gate open, must cut
the exit off. VICTORY ROAD B1F from (30,25) and SEAFLOOR CAVERN ROOM1 from (5,18) are the real
maps where a line per obstacle kind overclaimed; the sweep checks every porymap map from every warp.
"""

from collections.abc import Callable, Iterator
from dataclasses import dataclass, replace

import pytest
from test_field_moves import operator_rom

from pokebench_env.exit_labels import RomMap, _edge, read_rom_map
from pokebench_env.field_moves import (
    Capabilities,
    Edges,
    FieldObstacles,
    MapGates,
    Obstacle,
    Survey,
    capabilities,
    map_gates,
    rom_object_obstacles,
    survey,
)
from pokebench_env.game_state import MapNames

ROM_START = 0x08000000
CLOSED = capabilities((), (), (), 0)
# All eight badges, an empty bag and a party that knows no field move.
ROCK = "It's a rugged rock, but a POKéMON may be able to smash it."
HEADER = "Field obstacles on this map (from the map's own object list and its tiles):"
Tile = tuple[int, int]
Key = tuple[str, tuple[int, int], int]


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
        " field move, an item, or special movement unavailable to walking navigation;"
        f' the game says: "{ROCK}" at the'
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
