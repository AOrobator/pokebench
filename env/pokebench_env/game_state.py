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

from pokebench_env.battle_details import BattleDetails, read_battle_details
from pokebench_env.battle_state import BattleState, read_battle_state
from pokebench_env.character_presence import StoryCharacters, read_story_characters
from pokebench_env.game_screen import ReadMemory, read_screen
from pokebench_env.gba_text import GBA_TEXT, decode_text
from pokebench_env.live_map import MAP_OFFSET, FullMap, LocalMap, read_full_map, read_local_map
from pokebench_env.naming import NamingState, read_naming
from pokebench_env.party_ownership import PartyOwnership, read_party_ownership
from pokebench_env.pokemon import SPECIES_NAMES as SPECIES_NAMES
from pokebench_env.pokemon import PartyMon, decode_party_mon, pokemon_cpu_context
from pokebench_env.resources import Resources, read_resources
from pokebench_env.running import RunningPermission, read_running_permission
from pokebench_env.story import StoryState, read_story
from pokebench_env.topology import Topology, read_topology
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

PRE_GAME = frozenset({"intro", "title", "main_menu", "birch_speech", "naming"})
FACING = {1: "down", 2: "up", 3: "left", 4: "right"}
BADGES = ("STONE", "KNUCKLE", "DYNAMO", "HEAT", "BALANCE", "FEATHER", "MIND", "RAIN")
FLAG_BADGE01 = 0x867


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
    nearby: LocalMap | None = None
    full_map: FullMap | None = None
    topology: Topology | None = None
    player_elevation: int = 0
    party_owner: str = "player"
    party_ownership: PartyOwnership | None = None
    resources: Resources | None = None
    battle: BattleState | None = None
    running: RunningPermission | None = None
    game_stats: dict[str, int | None] | None = None
    blackout_active: bool | None = None
    destination_names: tuple[tuple[int, int, str], ...] = ()
    story_characters: StoryCharacters | None = None
    battle_details: BattleDetails | None = None
    # SaveBlock1.dynamicWarp (group, number, map name) when this map has a MAP_DYNAMIC warp.
    dynamic_warp: tuple[int, int, str] | None = None


DYNAMIC_WARP = 0x14


def _dynamic_warp(read: ReadMemory, save1: int, maps: MapNames) -> tuple[int, int, str] | None:
    # struct WarpData {s8 mapGroup; s8 mapNum; s8 warpId; ...} (include/global.h), set by
    # setdynamicwarp / SetDynamicWarp and used by SetWarpDestinationToDynamicWarp (overworld.c).
    group, number = struct.unpack("<bb", read(save1 + DYNAMIC_WARP, 2))
    name = maps.name((group, number)) if (group, number) != (127, 127) else None
    return None if name is None else (group, number, name)


def _u32(read: ReadMemory, address: int) -> int:
    return int.from_bytes(read(address, 4), "little")


def _party(read: ReadMemory) -> tuple[PartyMon, ...]:
    count = read(PARTY_COUNT, 1)[0]
    if count > 6:
        raise ValueError(f"party count {count} is not a party")
    # One contiguous read prevents mixing slots from different emulator snapshots.
    body = read(PARTY, 100 * count)
    cpu = pokemon_cpu_context(read)
    return tuple(
        decode_party_mon(
            body[100 * slot : 100 * (slot + 1)], read, address=PARTY + 100 * slot, cpu=cpu
        )
        for slot in range(count)
    )


GAME_STAT_FIELDS = {
    "saved_game": 0,
    "pokemon_captures": 11,
    "evolved_pokemon": 14,
    "used_pokecenter": 15,
}


def _game_stats(read: ReadMemory, save1: int, save2: int) -> dict[str, int | None]:
    body = read(save1 + 0x159C, 64 * 4)
    key_body = read(save2 + 0xAC, 4)
    if len(body) != 256 or len(key_body) != 4:
        raise ValueError("short game-stat read")
    key = int.from_bytes(key_body, "little")
    values = {
        name: struct.unpack_from("<I", body, index * 4)[0] ^ key
        for name, index in GAME_STAT_FIELDS.items()
    }
    return {name: value if value <= 0xFFFFFF else None for name, value in values.items()}


def _badges(read: ReadMemory, save1: int) -> tuple[str, ...]:
    flags = int.from_bytes(read(save1 + 0x1270 + (FLAG_BADGE01 >> 3), 2), "little")
    bits = flags >> (FLAG_BADGE01 & 7)
    return tuple(badge for i, badge in enumerate(BADGES) if bits >> i & 1)


def read_game_state(
    read: ReadMemory,
    maps: MapNames,
    *,
    active_ui_enabled: bool = True,
    message_phase_enabled: bool = False,
    full_map_enabled: bool = False,
    story_characters_enabled: bool = True,
    battle_details_enabled: bool = True,
    dynamic_warp_enabled: bool = True,
    connection_edges_enabled: bool = False,
) -> GameState:
    screen = read_screen(read)
    in_battle = bool(read(IN_BATTLE, 1)[0] & 0x02)
    battle = read_battle_state(read) if in_battle else None
    dialog, menu = read_dialog(read, screen.kind), read_menu(read)
    native_ui = read_active_ui(read, screen)
    active_ui = native_ui if active_ui_enabled else None
    if native_ui and native_ui.details and isinstance(native_ui.details.get("message"), str):
        dialog = str(native_ui.details["message"])
    player_object = 0
    field_initialized = False
    if screen.kind not in PRE_GAME or screen.kind == "naming":
        player_object = read(PLAYER_AVATAR + 5, 1)[0]
        player_flags = (
            read(OBJECT_EVENTS + 0x24 * player_object, 3) if player_object < 16 else bytes(3)
        )
        field_initialized = bool(player_flags[0] & 1 and player_flags[2] & 1)
    pregame = screen.kind in PRE_GAME and not (
        screen.kind == "naming"
        and field_initialized
        and native_ui is not None
        and native_ui.details is not None
        and native_ui.details.get("naming_owner") in ("box", "caught_mon", "nickname", "walda")
    )
    save1, save2 = (0, 0)
    if not pregame and screen.kind != "field_transition" and field_initialized:
        save1, save2 = struct.unpack("<II", read(SAVE_BLOCK_PTRS, 8))
    valid_saves = (
        0x02000000 <= save1 <= 0x02040000 - 0x1A9C
        and save1 % 4 == 0
        and 0x02000000 <= save2 <= 0x02040000 - 0xB0
        and save2 % 4 == 0
    )
    if pregame or not field_initialized or not valid_saves:
        return GameState(
            screen.label,
            field_initialized and not pregame,
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
            battle=battle,
            blackout_active=screen.callback2 == 0x08085F59,
            story=read_story(read, screen) if screen.kind in PRE_GAME else StoryState(),
            naming=read_naming(read, decode_text) if screen.callback2 == 0x080E4F59 else None,
            dialog=dialog,
            menu=menu,
            active_ui=active_ui,
        )
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
    targets = read_targets(read, map_id) if nearby is not None else None
    party = _party(read)
    resources = read_resources(read, save1, save2)
    ownership = read_party_ownership(read, party)
    context = (
        read_world_context(
            read,
            (x, y),
            map_id,
            save1,
            decode_text,
            message_phase=message_phase_enabled,
            native_ui=native_ui,
        )
        if screen.kind == "overworld" and not in_battle
        else None
    )
    return GameState(
        blackout_active=screen.callback2 == 0x08085F59,
        game_stats=_game_stats(read, save1, save2),
        resources=resources,
        battle=battle,
        battle_details=read_battle_details(read, battle, party, resources)
        if battle_details_enabled
        else None,
        running=read_running_permission(read),
        screen=screen.label,
        started=True,
        story=read_story(read, screen, save1),
        name=decode_text(read(save2, 8)),
        location=maps.name(map_id) or f"unknown map {map_id}",
        map_id=map_id,
        position=(x, y),
        facing=FACING.get(facing),
        in_battle=in_battle,
        party=party,
        party_ownership=ownership,
        party_owner=(
            "tutorial"
            if in_battle and _u32(read, 0x02022FEC) & (1 << 9)
            else ownership.owner or "unknown"
        ),
        money=_u32(read, save1 + 0x490) ^ _u32(read, save2 + 0xAC),
        badges=_badges(read, save1),
        play_time=(hours, minutes, seconds),
        dialog=dialog,
        menu=menu,
        active_ui=active_ui,
        local_map=None if nearby is None else nearby.text(),
        nearby=nearby,
        full_map=read_full_map(read, (x, y), map_id)
        if full_map_enabled and nearby is not None
        else None,
        player_elevation=body[0x0B] & 15,
        topology=read_topology(read, maps, edges=connection_edges_enabled)
        if nearby is not None
        else None,
        destination_names=tuple(
            (
                t.destination[0],
                t.destination[1],
                maps.name(t.destination[:2])
                or f"unknown map {t.destination[0]}/{t.destination[1]}",
            )
            for t in targets or ()
            if t.destination is not None and t.destination[:2] != (127, 127)
        ),
        world_context=context,
        story_characters=read_story_characters(
            read,
            save1,
            map_id,
            () if context is None else context.objects,
            location=maps.name(map_id),
        )
        if story_characters_enabled and screen.kind == "overworld" and not in_battle
        else None,
        # named-warp-destinations-v1 OFF never reads SaveBlock1.dynamicWarp.
        dynamic_warp=_dynamic_warp(read, save1, maps)
        if dynamic_warp_enabled
        and any(
            t.destination is not None and t.destination[:2] == (127, 127) for t in targets or ()
        )
        else None,
        interaction_targets=targets,
        field_controls_locked=bool(read(FIELD_CONTROLS_LOCK, 1)[0])
        if screen.kind == "overworld" and not in_battle
        else None,
    )
