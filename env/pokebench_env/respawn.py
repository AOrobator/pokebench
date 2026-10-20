"""respawn-readout-v1: where a blackout sends the player, as one readout line after Money.

pret/pokeemerald 731ad5b:

- SaveBlock1.lastHealLocation (+0x1C, struct WarpData: s8 mapGroup, s8 mapNum, s8 warpId, pad,
  s16 x, s16 y; include/global.h). SetLastHealLocationWarp (src/overworld.c) stores a heal
  location from src/data/heal_locations.json when a script runs setrespawn.
- setrespawn runs in every *_PokemonCenter_1F OnTransition (data/maps/RustboroCity_PokemonCenter_1F/
  scripts.inc: setrespawn HEAL_LOCATION_RUSTBORO_CITY), in EverGrandeCity_PokemonLeague_1F and
  BattleFrontier_PokemonCenter_1F, and for the bedroom in InsideOfTruck and the Hall of Fame. A
  center's heal location is the town tile below its door (MAP_RUSTBORO_CITY 16,39).
- DoWhiteOut (src/overworld.c): SetMoney(money / 2), HealPlayerParty, then warp to lastHealLocation.
  So a blackout loses money - money / 2; Emerald has no badge or level rule.

Map changes are the fewest changes over the ROM map table's warps and walking connections, both
ways: the same count as hopsFrom in packages/agent/src/low-hp-trainer-warning.ts.

Whether the player entered a center comes from what this server saw (RespawnMemory): a center it
read the player standing in, or the center behind a lastHealLocation it read. "Not entered" is
claimed only when the server saw the game from before the save existed.
"""

import struct
import threading
from collections import deque
from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Literal

from pokebench_env.game_screen import ReadMemory
from pokebench_env.places import Links, MapTable, read_links

if TYPE_CHECKING:
    from pokebench_env.game_state import GameState

SWITCH = "respawn-readout-v1"
LAST_HEAL = 0x1C

MapId = tuple[int, int]
HealKey = tuple[str, int, int]


@dataclass(frozen=True)
class HealPoint:
    kind: Literal["home", "center", "league"]
    town: str
    # The map-table name of the map whose OnTransition runs setrespawn for it (None for home).
    center: str | None


def _center(town: str, *, label: str | None = None, building: str | None = None) -> HealPoint:
    return HealPoint("center", label or town, building or f"{town} POKEMON CENTER 1F")


# src/data/heal_locations.json entries some setrespawn names, by map-table name and tile.
HEAL_POINTS: dict[HealKey, HealPoint] = {
    ("LITTLEROOT TOWN BRENDANS HOUSE 2F", 4, 2): HealPoint("home", "LITTLEROOT TOWN", None),
    ("LITTLEROOT TOWN MAYS HOUSE 2F", 4, 2): HealPoint("home", "LITTLEROOT TOWN", None),
    ("PETALBURG CITY", 20, 17): _center("PETALBURG CITY"),
    ("SLATEPORT CITY", 19, 20): _center("SLATEPORT CITY"),
    ("MAUVILLE CITY", 22, 6): _center("MAUVILLE CITY"),
    ("RUSTBORO CITY", 16, 39): _center("RUSTBORO CITY"),
    ("FORTREE CITY", 5, 7): _center("FORTREE CITY"),
    ("LILYCOVE CITY", 24, 15): _center("LILYCOVE CITY"),
    ("MOSSDEEP CITY", 28, 17): _center("MOSSDEEP CITY"),
    ("SOOTOPOLIS CITY", 43, 32): _center("SOOTOPOLIS CITY"),
    ("EVER GRANDE CITY", 27, 49): _center("EVER GRANDE CITY"),
    ("OLDALE TOWN", 6, 17): _center("OLDALE TOWN"),
    ("DEWFORD TOWN", 2, 11): _center("DEWFORD TOWN"),
    ("LAVARIDGE TOWN", 9, 7): _center("LAVARIDGE TOWN"),
    ("FALLARBOR TOWN", 14, 8): _center("FALLARBOR TOWN"),
    ("VERDANTURF TOWN", 16, 4): _center("VERDANTURF TOWN"),
    ("PACIFIDLOG TOWN", 8, 16): _center("PACIFIDLOG TOWN"),
    ("EVER GRANDE CITY", 18, 6): HealPoint(
        "league", "EVER GRANDE CITY", "EVER GRANDE CITY POKEMON LEAGUE 1F"
    ),
    ("BATTLE FRONTIER OUTSIDE EAST", 3, 52): _center(
        "BATTLE FRONTIER OUTSIDE EAST",
        label="BATTLE FRONTIER",
        building="BATTLE FRONTIER POKEMON CENTER 1F",
    ),
}
# Each map that runs setrespawn on entry, and the heal location it stores.
CENTERS: dict[str, HealKey] = {
    point.center: key for key, point in HEAL_POINTS.items() if point.center is not None
}
BUILDING = {"center": "POKéMON CENTER", "league": "POKéMON LEAGUE"}
ENTER = "Entering a POKéMON CENTER makes it the place you wake up if your party faints."


@dataclass(frozen=True)
class CenterExit:
    map_id: MapId
    name: str
    # The warp tile on this map; None when the player is in that center.
    x: int | None
    y: int | None


@dataclass(frozen=True)
class Respawn:
    map_id: MapId
    name: str
    x: int
    y: int
    hops: int | None
    centers: tuple[CenterExit, ...]


def map_changes(links: Mapping[MapId, Links], start: MapId, goal: MapId) -> int | None:
    """Fewest map changes from start to goal, over every warp and connection, both ways."""
    nxt: dict[MapId, set[MapId]] = {}
    for here, out in links.items():
        for to in [w[2] for w in out.warps] + [c[1] for c in out.connections]:
            nxt.setdefault(here, set()).add(to)
            nxt.setdefault(to, set()).add(here)
    seen = {start: 0}
    queue = deque([start])
    while queue:
        at = queue.popleft()
        for to in nxt.get(at, ()):
            if to not in seen:
                seen[to] = seen[at] + 1
                queue.append(to)
    return seen.get(goal)


class LinkCache:
    """The map table's warps and connections, read from the ROM once (ROM data never changes)."""

    def __init__(self, links: Mapping[MapId, Links] | None = None) -> None:
        self._links = links

    def get(self, read: ReadMemory, maps: MapTable) -> Mapping[MapId, Links]:
        if self._links is None:
            found: dict[MapId, Links] = {}
            for map_id in maps.ids():
                out = read_links(read, map_id)
                if out is not None:
                    found[map_id] = out
            self._links = found
        return self._links


def read_respawn(
    read: ReadMemory, save1: int, map_id: MapId, maps: MapTable, links: Mapping[MapId, Links]
) -> Respawn | None:
    """The saved heal location seen from map_id, or None when it is unset, unknown or unreadable."""
    try:
        group, number, _warp, x, y = struct.unpack("<bbbxhh", read(save1 + LAST_HEAL, 8))
    except struct.error:
        return None
    if group < 0 or number < 0:
        return None
    name = maps.name((group, number))
    if name is None:
        return None
    key = (name, x, y)
    centers: list[CenterExit] = []
    here = maps.name(map_id)
    if here is not None and CENTERS.get(here, key) != key:
        centers.append(CenterExit(map_id, here, None, None))
    seen = {map_id}
    for wx, wy, to in links.get(map_id, Links((), ())).warps:
        building = maps.name(to)
        if to in seen or building is None or CENTERS.get(building, key) == key:
            continue
        seen.add(to)
        centers.append(CenterExit(to, building, wx, wy))
    return Respawn(
        (group, number), name, x, y, map_changes(links, map_id, (group, number)), tuple(centers)
    )


@dataclass
class RespawnMemory:
    """The POKéMON CENTERs this server has seen the player enter."""

    # None until the first state; True when that state had no save yet (a new game).
    complete: bool | None = None
    entered: set[str] = field(default_factory=set)
    _lock: threading.Lock = field(default_factory=threading.Lock, repr=False)

    def note(self, state: "GameState") -> None:
        with self._lock:
            if self.complete is None:
                self.complete = not state.started
            if not state.started:
                return
            if state.location in CENTERS:
                self.entered.add(state.location)
            r = state.respawn
            point = None if r is None else HEAL_POINTS.get((r.name, r.x, r.y))
            if point is not None and point.center is not None:
                self.entered.add(point.center)

    def knows(self) -> bool:
        return self.complete is True

    def entered_center(self, name: str) -> bool:
        with self._lock:
            return name in self.entered


def _where(r: Respawn, names: Mapping[MapId, str]) -> str:
    point = HEAL_POINTS.get((r.name, r.x, r.y))
    if point is None:
        return f"at {names.get(r.map_id) or r.name} ({r.x},{r.y})"
    if point.kind == "home":
        return f"at your house in {point.town}"
    return f"outside the {BUILDING[point.kind]} in {point.town}"


def _distance(hops: int | None) -> str:
    if hops is None:
        return ""
    if hops == 0:
        return " (on this map)"
    return f" ({hops} map change{'' if hops == 1 else 's'} from here)"


def _center_sentence(
    c: CenterExit, memory: "RespawnMemory | None", names: Mapping[MapId, str], here: str | None
) -> str:
    shown = names.get(c.map_id) or c.name
    if c.x is None or c.y is None:
        return f"You are in {shown}, and it is not yet where you wake up."
    point = HEAL_POINTS[CENTERS[c.name]]
    building = BUILDING[point.kind]
    opener = (
        f"This town has a {building}"
        if here is not None and here == CENTERS[c.name][0]
        else f"An exit here leads to a {building}"
    )
    if memory is None or not memory.knows():
        status = "that is not where you wake up"
    elif memory.entered_center(c.name):
        status = "you entered before, but it is no longer where you wake up"
    else:
        status = "you have not entered"
    return f"{opener} {status}: {shown} at ({c.x},{c.y})."


def respawn_line(
    r: Respawn,
    money: int | None,
    memory: RespawnMemory | None,
    names: Mapping[MapId, str],
    *,
    here: str | None = None,
) -> str:
    lose = (
        "lose half your money"
        if money is None
        else f"lose half your money (₽{money - money // 2} of ₽{money})"
    )
    line = f"If your party faints, you wake up {_where(r, names)}{_distance(r.hops)} and {lose}."
    if r.centers:
        line += "".join(f" {_center_sentence(c, memory, names, here)}" for c in r.centers)
        line += f" {ENTER}"
    return line
