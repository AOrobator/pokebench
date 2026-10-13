"""Typed game state read straight from the emulator's RAM (and ROM tables).

Layouts follow pokeemerald (the US ROM matches it byte for byte) and were
checked live; see docs/findings/game-state.md. Save-block fields are reported
only once the game has left the pre-game screens: before that they hold
defaults (a random name, map 0/0) that are not the player's state.
"""

import json
import struct
from dataclasses import dataclass
from pathlib import Path

from pokebench_env.game_screen import ReadMemory, read_screen
from pokebench_env.gba_text import GBA_TEXT, decode_text
from pokebench_env.live_map import MAP_OFFSET, read_local_map
from pokebench_env.naming import NamingState, read_naming
from pokebench_env.story import StoryState, read_story
from pokebench_env.ui_state import ActiveUi, Menu, read_active_ui, read_dialog, read_menu
from pokebench_env.world_context import WorldContext, read_world_context

__all__ = ["GBA_TEXT", "GameState", "MapNames", "PartyMon", "decode_text", "read_game_state"]
from pokebench_env.world import InteractionTarget, read_targets

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
    story: StoryState | None = None
    local_map: str | None = None
    naming: NamingState | None = None
    world_context: WorldContext | None = None
    dialog: str | None = None
    menu: Menu | None = None
    active_ui: ActiveUi | None = None
    interaction_targets: tuple[InteractionTarget, ...] | None = None


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
    dialog, menu = read_dialog(read, screen.kind), read_menu(read)
    active_ui = read_active_ui(read, screen)
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
            story=read_story(read, screen),
            naming=read_naming(read, decode_text) if screen.kind == "naming" else None,
            dialog=dialog,
            menu=menu,
            active_ui=active_ui,
        )
    save1, save2 = struct.unpack("<II", read(SAVE_BLOCK_PTRS, 8))
    _, _, group, number = struct.unpack("<hhBB", read(save1, 6))
    body = read(OBJECT_EVENTS + 0x24 * player_object, 0x24)
    x, y = struct.unpack_from("<hh", body, 0x10)
    x -= MAP_OFFSET
    y -= MAP_OFFSET
    map_id = (group, number)
    hours, minutes, seconds = struct.unpack("<HBB", read(save2 + 0x0E, 4))
    facing = body[0x18] & 0x0F
    nearby = (
        read_local_map(read, (x, y), map_id)
        if screen.kind == "overworld" and not in_battle
        else None
    )
    return GameState(
        screen=screen.label,
        started=True,
        story=read_story(read, screen, save1),
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
        dialog=dialog,
        menu=menu,
        active_ui=active_ui,
        local_map=None if nearby is None else nearby.text(),
        world_context=read_world_context(read, (x, y), map_id, save1, decode_text)
        if screen.kind == "overworld" and not in_battle
        else None,
        interaction_targets=read_targets(read, map_id) if nearby is not None else None,
        field_controls_locked=bool(read(FIELD_CONTROLS_LOCK, 1)[0])
        if screen.kind == "overworld" and not in_battle
        else None,
    )
