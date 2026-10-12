"""Typed game state read straight from the emulator's RAM (and ROM tables).

Layouts follow pokeemerald (the US ROM matches it byte for byte) and were
checked live; see docs/findings/game-state.md. Save-block fields are reported
only once the game has left the pre-game screens: before that they hold
defaults (a random name, map 0/0) that are not the player's state.
"""

import json
import string
import struct
from dataclasses import dataclass
from pathlib import Path

from pokebench_env.game_screen import ReadMemory, read_screen
from pokebench_env.live_map import read_local_map
from pokebench_env.naming import NamingState, read_naming

SAVE_BLOCK_PTRS = 0x03005D8C
PARTY_COUNT = 0x020244E9
PARTY = 0x020244EC
PLAYER_AVATAR = 0x02037590
OBJECT_EVENTS = 0x02037350
IN_BATTLE = 0x030026F9
FIELD_CONTROLS_LOCK = 0x03000F2C
SPECIES_NAMES = 0x083185C8

PRE_GAME = frozenset({"intro", "title", "main_menu", "birch_speech", "naming"})
FACING = {1: "down", 2: "up", 3: "left", 4: "right"}
BADGES = ("STONE", "KNUCKLE", "DYNAMO", "HEAT", "BALANCE", "FEATHER", "MIND", "RAIN")
FLAG_BADGE01 = 0x867
SUBSTRUCT_ORDERS = (
    "GAEM GAME GEAM GEMA GMAE GMEA AGEM AGME AEGM AEMG AMGE AMEG "
    "EGAM EGMA EAGM EAMG EMGA EMAG MGAE MGEA MAGE MAEG MEGA MEAG"
).split()

GBA_TEXT: dict[int, str] = {
    0x00: " ",
    **{0xA1 + i: d for i, d in enumerate(string.digits)},
    0xAB: "!",
    0xAC: "?",
    0xAD: ".",
    0xAE: "-",
    0xB0: "…",
    0xB1: "“",
    0xB2: "”",
    0xB3: "‘",
    0xB4: "'",
    0xB5: "♂",
    0xB6: "♀",
    0xB8: ",",
    0xBA: "/",
    **{0xBB + i: c for i, c in enumerate(string.ascii_uppercase)},
    **{0xD5 + i: c for i, c in enumerate(string.ascii_lowercase)},
}


def decode_text(raw: bytes) -> str:
    out = []
    for byte in raw:
        if byte == 0xFF:
            break
        out.append(GBA_TEXT.get(byte, "?"))
    return "".join(out)


class MapNames:
    def __init__(self, names: dict[tuple[int, int], str]) -> None:
        self._names = names

    @classmethod
    def load(cls, maps_dir: Path) -> "MapNames":
        groups = json.loads((maps_dir / "map_groups.json").read_text())
        names: dict[tuple[int, int], str] = {}
        for group, key in enumerate(groups["group_order"]):
            for number, folder in enumerate(groups[key]):
                map_id = json.loads((maps_dir / folder / "map.json").read_text())["id"]
                names[(group, number)] = map_id.removeprefix("MAP_").replace("_", " ")
        return cls(names)

    def name(self, map_id: tuple[int, int]) -> str | None:
        return self._names.get(map_id)


@dataclass(frozen=True)
class PartyMon:
    species: str
    level: int
    hp: int
    max_hp: int


@dataclass(frozen=True)
class GameState:
    screen: str
    started: bool
    name: str | None
    location: str | None
    map_id: tuple[int, int] | None
    position: tuple[int, int] | None
    facing: str | None
    in_battle: bool
    party: tuple[PartyMon, ...] | None
    money: int | None
    badges: tuple[str, ...] | None
    play_time: tuple[int, int, int] | None
    field_controls_locked: bool | None = None
    local_map: str | None = None
    naming: NamingState | None = None


def _u32(read: ReadMemory, address: int) -> int:
    return int.from_bytes(read(address, 4), "little")


def _species(body: bytes) -> int:
    personality: int
    ot_id: int
    personality, ot_id = struct.unpack_from("<II", body, 0)
    key = personality ^ ot_id
    order = SUBSTRUCT_ORDERS[personality % 24]
    offset = 0x20 + 12 * order.index("G")
    word: int = struct.unpack_from("<I", body, offset)[0]
    return (word ^ key) & 0xFFFF


def _party(read: ReadMemory) -> tuple[PartyMon, ...]:
    count = read(PARTY_COUNT, 1)[0]
    if count > 6:
        raise ValueError(f"party count {count} is not a party")
    members = []
    for slot in range(count):
        body = read(PARTY + 100 * slot, 100)
        species_id = _species(body)
        name = decode_text(read(SPECIES_NAMES + 11 * species_id, 11)) if species_id < 412 else ""
        level, _, hp, max_hp = struct.unpack_from("<BBHH", body, 0x54)
        members.append(PartyMon(name or f"species #{species_id}", level, hp, max_hp))
    return tuple(members)


def _badges(read: ReadMemory, save1: int) -> tuple[str, ...]:
    flags = int.from_bytes(read(save1 + 0x1270 + (FLAG_BADGE01 >> 3), 2), "little")
    bits = flags >> (FLAG_BADGE01 & 7)
    return tuple(badge for i, badge in enumerate(BADGES) if bits >> i & 1)


def read_game_state(read: ReadMemory, maps: MapNames) -> GameState:
    screen = read_screen(read)
    in_battle = bool(read(IN_BATTLE, 1)[0] & 0x02)
    player_object = 0
    field_initialized = False
    if screen.kind not in PRE_GAME:
        player_object = read(PLAYER_AVATAR + 5, 1)[0]
        player_flags = (
            read(OBJECT_EVENTS + 0x24 * player_object, 3) if player_object < 16 else bytes(3)
        )
        field_initialized = bool(player_flags[0] & 1 and player_flags[2] & 1)
    if screen.kind in PRE_GAME or not field_initialized:
        return GameState(
            screen.label,
            False,
            None,
            None,
            None,
            None,
            None,
            in_battle,
            None,
            None,
            None,
            None,
            naming=read_naming(read, decode_text) if screen.kind == "naming" else None,
        )
    save1, save2 = struct.unpack("<II", read(SAVE_BLOCK_PTRS, 8))
    x, y, group, number = struct.unpack("<hhbb", read(save1, 6))
    map_id = (group, number)
    hours, minutes, seconds = struct.unpack("<HBB", read(save2 + 0x0E, 4))
    facing = read(OBJECT_EVENTS + 0x24 * player_object + 0x18, 1)[0] & 0x0F
    nearby = (
        read_local_map(read, (x, y), map_id)
        if screen.kind == "overworld" and not in_battle
        else None
    )
    return GameState(
        screen=screen.label,
        started=True,
        name=decode_text(read(save2, 8)),
        location=maps.name(map_id) or f"unknown map {map_id}",
        map_id=map_id,
        position=(x, y),
        facing=FACING.get(facing),
        in_battle=in_battle,
        party=_party(read),
        money=_u32(read, save1 + 0x490) ^ _u32(read, save2 + 0xAC),
        badges=_badges(read, save1),
        play_time=(hours, minutes, seconds),
        local_map=None if nearby is None else nearby.text(),
        field_controls_locked=bool(read(FIELD_CONTROLS_LOCK, 1)[0])
        if screen.kind == "overworld" and not in_battle
        else None,
    )
