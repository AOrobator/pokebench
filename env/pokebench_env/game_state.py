"""Typed game state read straight from the emulator's RAM (and ROM tables).

Layouts follow pokeemerald (the US ROM matches it byte for byte) and were
checked live; see docs/findings/game-state.md. Save-block fields are reported
only once the game has left the pre-game screens: before that they hold
defaults (a random name, map 0/0) that are not the player's state.
"""

import json
import struct
from dataclasses import dataclass, replace
from pathlib import Path
from typing import TYPE_CHECKING

from pokebench_env.battle_details import BattleDetails, read_battle_details
from pokebench_env.battle_state import BattleState, read_battle_state
from pokebench_env.character_presence import (
    StoryCharacters,
    _flag,
    _graphics,
    read_story_characters,
)
from pokebench_env.displayed_names import place_name, player_gender, sign_labeler
from pokebench_env.elevation_view import read_object_elevations
from pokebench_env.exit_labels import ExitLabels, destination_name, read_exit_labels, section_name
from pokebench_env.exit_reach import ExitReach, build_exit_reach
from pokebench_env.field_moves import (
    FieldObstacles,
    MapGates,
    capabilities,
    map_gates,
    read_object_obstacles,
    survey,
)
from pokebench_env.game_screen import ReadMemory, read_screen
from pokebench_env.gba_text import GBA_TEXT, decode_text
from pokebench_env.heal_trainers import HealFacts, read_heal_facts
from pokebench_env.live_map import MAP_OFFSET, FullMap, LocalMap, read_full_map, read_local_map
from pokebench_env.map_layout import read_layout_context
from pokebench_env.map_observation import (
    MapObservation,
    build_observation,
    element_label,
    observed_elements,
)
from pokebench_env.map_rotating_elements import read_rotating_elements
from pokebench_env.map_sections import ExitSections, read_exit_sections
from pokebench_env.mart_stock import MartStock, read_mart_stock
from pokebench_env.move_learn import MoveLearning, read_move_learning
from pokebench_env.naming import NamingState, editor_open, read_naming
from pokebench_env.offscreen_objects import MapObject, read_offscreen_objects
from pokebench_env.party_ownership import PartyOwnership, read_party_ownership
from pokebench_env.player_map_visibility import MapVisibility
from pokebench_env.poison_berry_readout import visible_berry_lines
from pokebench_env.pokedex_own import Pokedex, read_pokedex, wild_foes
from pokebench_env.pokemon import SPECIES_NAMES as SPECIES_NAMES
from pokebench_env.pokemon import PartyMon, decode_party_mon, pokemon_cpu_context
from pokebench_env.resources import Resources, read_resources
from pokebench_env.respawn import LinkCache, Respawn, read_respawn
from pokebench_env.route103_rival import Route103Rival, read_route103_rival
from pokebench_env.running import RunningPermission, read_running_permission
from pokebench_env.screen_center import Cover, overhead_cover
from pokebench_env.static_npc_templates import StaticNpcTemplates, read_static_npc_templates
from pokebench_env.story import StoryState, read_story
from pokebench_env.story_progress import StoryProgress, read_story_progress
from pokebench_env.surf_gate import (
    ConnectionKey,
    FloodInputs,
    SurfGate,
    read_flood_inputs,
    surf_gate_from,
)
from pokebench_env.topology import Topology, read_topology
from pokebench_env.trainer_opponent import TrainerOpponent, read_trainer_opponent
from pokebench_env.training_readout import next_level_exp
from pokebench_env.transition_coherence import CB2_HANDLE_START_BATTLE, main_loop_idle
from pokebench_env.type_gap import TypeGap, read_type_gap
from pokebench_env.ui_state import (
    ActiveUi,
    Menu,
    menu_window_drawn,
    read_active_ui,
    read_dialog,
    read_menu,
)
from pokebench_env.warp_areas import AreaFacts, AreaVisits
from pokebench_env.world_context import GRAPHICS, SAVE_VARIABLES, WorldContext, read_world_context

if TYPE_CHECKING:
    from pokebench_env.bike import BikeState

__all__ = ["GBA_TEXT", "GameState", "MapNames", "PartyMon", "decode_text", "read_game_state"]
from pokebench_env.world import (
    InteractionObjectSlot,
    InteractionTarget,
    read_interaction_object_slots,
    read_targets,
)

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

    def ids(self) -> tuple[tuple[int, int], ...]:
        return tuple(self._names)


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
    # semantic-navigation-v1 only: complete native A-recipient slot order.
    interaction_object_slots: tuple[InteractionObjectSlot, ...] | None = None
    map_observation: MapObservation | None = None
    nearby: LocalMap | None = None
    full_map: FullMap | None = None
    map_visibility: MapVisibility | None = None
    topology: Topology | None = None
    player_elevation: int = 0
    # screen-center-player-v1: where the map's top layer is drawn over the player's sprite.
    overhead_cover: Cover | None = None
    # elevation-aware-map-v1: (x, y, elevation) of loaded objects, for navigation occupancy.
    object_elevations: tuple[tuple[int, int, int], ...] | None = None
    # tutorial-party-owner-v1: None when ownership cannot be established (state JSON omits it).
    party_owner: str | None = "player"
    party_ownership: PartyOwnership | None = None
    resources: Resources | None = None
    battle: BattleState | None = None
    running: RunningPermission | None = None
    # bike-register-v1 / bike-auto-mount-v1: owned bikes, registration, riding; None when off.
    bike: "BikeState | None" = None
    game_stats: dict[str, int | None] | None = None
    blackout_active: bool | None = None
    destination_names: tuple[tuple[int, int, str], ...] = ()
    story_characters: StoryCharacters | None = None
    story_progress: StoryProgress | None = None
    route103_rival: Route103Rival | None = None
    trainer_opponent: TrainerOpponent | None = None
    battle_details: BattleDetails | None = None
    # SaveBlock1.dynamicWarp (group, number, map name) when this map has a MAP_DYNAMIC warp.
    dynamic_warp: tuple[int, int, str] | None = None
    # displayed-place-names-v1: (group, number, name the game's own sign gives it for this save).
    displayed_places: tuple[tuple[int, int, str], ...] = ()
    # offscreen-objects-v1: this map's objects outside the readout's window; None when off.
    offscreen_objects: tuple[MapObject, ...] | None = None
    static_npc_templates: StaticNpcTemplates | None = None
    # readout-truth-v1: the active interface was read (active-ui-ownership-v1 on); text only.
    active_ui_read: bool = False
    # readout-truth-v1: sMenu's window is drawn (even with an invalid cursor); None when off.
    menu_window_drawn: bool | None = None
    # surf-gated-exits-v1: exits reachable only across water and whether Surf works; None when off.
    surf_gate: SurfGate | None = None
    # exit-reachability-v1: each exit labelled foot, water or none, and the foot area; off: None.
    exit_reach: ExitReach | None = None
    # heal-before-trainers-v1: present only with the switch, on the field.
    heal_trainers: HealFacts | None = None
    # respawn-readout-v1: the saved heal location and the centers that would move it; text only.
    respawn: Respawn | None = None
    # mid-frame-readout-v1: the save was not read only because the snapshot was mid-frame.
    mid_frame: bool = False
    # exit-labels-v2: popup names for warp destinations and arrival reach; None when off.
    exit_labels: ExitLabels | None = None
    exit_sections: ExitSections | None = None
    # field-move-gates-v1: the map's obstacles, capabilities and gated flood; None when off.
    field_obstacles: FieldObstacles[ConnectionKey] | None = None
    # move-learn-question-v1 / move-learn-comparison-v1: the open move-learning choice; text only.
    move_learning: MoveLearning | None = None
    move_learning_diagnostic: str | None = None
    # berry-readout-v1: visible loaded trees; text only, None when off.
    berry_readout: tuple[str, ...] | None = None
    # mart-stock-readout-v1: the open buy list of a normal shop; text only.
    mart_stock: MartStock | None = None
    mart_stock_diagnostic: str | None = None
    # exp-next-level-v1: the summary screen's NEXT LV. per party slot; None when off.
    party_next_level: tuple[int | None, ...] | None = None
    # pokedex-own-v1: the POKéDEX counts once the POKéDEX is received; text only, None when off.
    pokedex: Pokedex | None = None
    # type-gap-team-v1: party species and move types and the ROM type chart; None when off.
    type_gap: TypeGap | None = None
    move_matchup_enabled: bool = False


DYNAMIC_WARP = 0x14


def _dynamic_warp(
    read: ReadMemory, save1: int, maps: MapNames, *, zero_unset: bool = False
) -> tuple[int, int, str] | None:
    # struct WarpData {s8 mapGroup; s8 mapNum; s8 warpId; s16 x, y} (include/global.h), set by
    # setdynamicwarp / SetDynamicWarp and used by SetWarpDestinationToDynamicWarp (overworld.c).
    # unset-dynamic-warp-v1: the new game's zeroed save holds all-zero WarpData until a script
    # sets it (the truck's InsideOfTruck_EventScript_SetIntroFlags); that is not map 0/0.
    if zero_unset and read(save1 + DYNAMIC_WARP, 8) == bytes(8):
        return None
    group, number = struct.unpack("<bb", read(save1 + DYNAMIC_WARP, 2))
    name = maps.name((group, number)) if (group, number) != (127, 127) else None
    return None if name is None else (group, number, name)


def _u32(read: ReadMemory, address: int) -> int:
    return int.from_bytes(read(address, 4), "little")


def _party(read: ReadMemory, *, empty_move_pp: bool = False) -> tuple[PartyMon, ...]:
    count = read(PARTY_COUNT, 1)[0]
    if count > 6:
        raise ValueError(f"party count {count} is not a party")
    # One contiguous read prevents mixing slots from different emulator snapshots.
    body = read(PARTY, 100 * count)
    cpu = pokemon_cpu_context(read)
    return tuple(
        decode_party_mon(
            body[100 * slot : 100 * (slot + 1)],
            read,
            address=PARTY + 100 * slot,
            cpu=cpu,
            empty_move_pp=empty_move_pp,
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


VAR_TEMP_3 = 0x4003


def _map_gates(
    read: ReadMemory,
    save1: int,
    map_id: tuple[int, int],
    location: str | None,
    flood: FloodInputs,
    party: tuple[PartyMon, ...],
    badges: tuple[str, ...],
    resources: Resources,
) -> MapGates | None:
    # field-move-gates-v1: unreadable templates leave every obstacle open (no gates at all).
    objects = read_object_obstacles(read, save1, map_id, location)
    if objects is None:
        return None
    caps = capabilities(party, badges, resources.bag, read(PLAYER_AVATAR, 1)[0])
    temp3 = struct.unpack("<H", read(save1 + SAVE_VARIABLES + 2 * (VAR_TEMP_3 - 0x4000), 2))[0]
    return map_gates(caps, objects, flood.tiles, location, sandstorm=temp3 == 0)


def _move_learning(
    read: ReadMemory,
    ui: ActiveUi | None,
    battle: BattleState | None,
    party: tuple[PartyMon, ...],
    early: bool,
    screen: str,
) -> tuple[MoveLearning | None, str | None]:
    # The evolution scene prints its pages in the battle message window too; only a battle
    # screen's pages belong to the battle script.
    message = None if battle is None or screen != "battle" else battle.message
    page = None if message is None else message.page
    prompt = None if battle is None else battle.prompt
    try:
        return read_move_learning(read, ui, prompt, party, early=early, page=page), None
    except (ValueError, IndexError) as error:
        return None, f"harness bug: move learning: {error}"


def _mart_stock(read: ReadMemory, save1: int) -> tuple[MartStock | None, str | None]:
    try:
        return read_mart_stock(read, save1), None
    except (ValueError, IndexError) as error:
        return None, f"harness bug: mart stock: {error}"


def _with_training(
    read: ReadMemory, state: "GameState", *, exp_next_enabled: bool, pokedex_enabled: bool
) -> "GameState":
    """exp-next-level-v1 and pokedex-own-v1, read once the rest of the state is known."""
    next_level = (
        tuple(
            None
            if m.is_egg or m.species_id is None or m.level is None or m.experience is None
            else next_level_exp(read, m.species_id, m.level, m.experience)
            for m in state.party or ()
        )
        if exp_next_enabled
        else None
    )
    dex = None
    if pokedex_enabled and state.story is not None and state.story.pokedex_received:
        dex = read_pokedex(read)
        if dex is not None:
            dex = replace(dex, wild_foes=wild_foes(read, dex.owned, state))
    if next_level is None and dex is None:
        return state
    return replace(state, party_next_level=next_level, pokedex=dex)


def read_bike_state(read: ReadMemory) -> "BikeState | None":
    # bike.py imports action_history, which imports this module.
    from pokebench_env.bike import read_bike

    return read_bike(read)


def read_game_state(
    read: ReadMemory,
    maps: MapNames,
    *,
    active_ui_enabled: bool = True,
    message_phase_enabled: bool = False,
    full_map_enabled: bool = False,
    story_characters_enabled: bool = True,
    battle_details_enabled: bool = True,
    battle_damage_enabled: bool = False,
    dynamic_warp_enabled: bool = True,
    displayed_names_enabled: bool = False,
    connection_edges_enabled: bool = False,
    in_game_naming_enabled: bool = False,
    offscreen_objects_enabled: bool = False,
    static_npc_templates_enabled: bool = False,
    transition_coherence_enabled: bool = False,
    blackout_transition_enabled: bool = False,
    readout_truth_enabled: bool = False,
    # map-wide-triggers-v1: every coordinate trigger on the map in the state;
    # the text keeps the nearby ones.
    map_wide_triggers_enabled: bool = False,
    birch_pages_enabled: bool = False,
    birch_intro_pages_enabled: bool = False,
    surf_gate_enabled: bool = False,
    # bike-register-v1 / bike-auto-mount-v1: owned bikes, registration and riding in the state.
    bike_enabled: bool = False,
    exit_reach_enabled: bool = False,
    heal_trainers_enabled: bool = False,
    heal_trainers_v2_enabled: bool = False,
    tutorial_owner_enabled: bool = False,
    mid_frame_enabled: bool = False,
    unset_warp_enabled: bool = False,
    semantic_navigation_enabled: bool = False,
    evolution_decision_enabled: bool = False,
    exit_labels_enabled: bool = False,
    exit_sections_enabled: bool = False,
    area_visits: AreaVisits | None = None,
    gym_door_label_enabled: bool = False,
    active_warp_exits_enabled: bool = False,
    map_observability_enabled: bool = False,
    map_observability_full: bool = False,
    caught_nickname_enabled: bool = False,
    caught_nickname_v2_enabled: bool = False,
    caught_dex_enabled: bool = False,
    party_item_confirmation_enabled: bool = False,
    party_menu_message_enabled: bool = False,
    interface_guidance_enabled: bool = False,
    bag_pocket_truth_enabled: bool = False,
    pokenav_short_list_enabled: bool = False,
    pokenav_call_advance_enabled: bool = False,
    field_moves_enabled: bool = False,
    move_learning_enabled: bool = False,
    move_learning_early_enabled: bool = False,
    berry_readout_enabled: bool = False,
    overhead_cover_enabled: bool = False,
    object_elevations_enabled: bool = False,
    battle_move_learn_input_enabled: bool = False,
    mart_stock_enabled: bool = False,
    shop_interface_enabled: bool = False,
    exp_next_enabled: bool = False,
    pokedex_enabled: bool = False,
    type_gap_enabled: bool = False,
    move_matchup_enabled: bool = False,
    respawn_links: LinkCache | None = None,
) -> GameState:
    screen = read_screen(read, blackout_transition=blackout_transition_enabled)
    coherent = transition_coherence_enabled
    # transition-coherence-v1: CB2_HandleStartBattle is the battle start, not an unknown screen.
    label = (
        "battle_transition"
        if coherent and screen.kind == "unknown" and screen.callback2 == CB2_HANDLE_START_BATTLE
        else screen.label
    )
    in_battle = bool(read(IN_BATTLE, 1)[0] & 0x02)
    battle = (
        read_battle_state(
            read,
            current_battle_only=coherent,
            tutorial_owner_enabled=tutorial_owner_enabled,
            turn_action_prompt=caught_nickname_enabled,
        )
        if in_battle
        else None
    )
    dialog, menu = read_dialog(read, screen.kind), read_menu(read)
    native_ui = read_active_ui(
        read,
        screen,
        caught_dex=caught_dex_enabled,
        battle_move_learn_input=battle_move_learn_input_enabled,
        truth=readout_truth_enabled,
        party_item_confirmation=party_item_confirmation_enabled,
        party_menu_message=party_menu_message_enabled,
        bag_pocket_truth=bag_pocket_truth_enabled,
        pokenav_short_list=pokenav_short_list_enabled,
        pokenav_call_advance=pokenav_call_advance_enabled,
        evolution_decision=evolution_decision_enabled,
        birch_pages=birch_pages_enabled,
        birch_intro_pages=birch_intro_pages_enabled,
        transition_coherence=coherent,
        blackout_transition=blackout_transition_enabled,
        tutorial_owner_enabled=tutorial_owner_enabled,
    )
    # Cmd_trygivecaughtmonnick state 1 owns input while battle controllers are busy.
    # Reuse the coherent battle read instead of decoding a second prompt owner.
    prompt = None if battle is None else battle.prompt
    if (
        caught_nickname_v2_enabled
        and caught_nickname_enabled
        and screen.callback2 == 0x08038421
        and battle is not None
        and battle.diagnostic is None
        and battle.text_phase == "prompt"
        and prompt is not None
        and prompt.kind == "nickname_caught"
        and prompt.ready
        and prompt.selected in {"YES", "NO"}
        and native_ui is not None
        and native_ui.phase == "battle_resolving"
        and native_ui.diagnostic is None
    ):
        native_ui = ActiveUi(
            "battle_yes_no",
            prompt.selected,
            True,
            "UP or DOWN moves the cursor, A answers the highlighted choice, B answers NO",
            details={"prompt_kind": prompt.kind},
        )
    if interface_guidance_enabled:
        from pokebench_env.interface_guidance import interface_guidance

        native_ui = interface_guidance(native_ui)
    if (
        caught_dex_enabled
        and native_ui is not None
        and native_ui.phase.startswith("pokedex_caught_")
        and battle is not None
    ):
        battle = replace(battle, text_phase="screen" if native_ui.ready is True else "busy")
    if evolution_decision_enabled:
        from pokebench_env.evolution_decision import decision_ui

        native_ui = decision_ui(native_ui, read)
    if shop_interface_enabled:
        from pokebench_env.shop_interface import shop_ui

        native_ui = shop_ui(native_ui, read)
    active_ui = native_ui if active_ui_enabled else None
    truth_read = readout_truth_enabled and active_ui_enabled
    window_drawn = menu_window_drawn(read) if readout_truth_enabled else None
    if native_ui and native_ui.details and isinstance(native_ui.details.get("message"), str):
        dialog = str(native_ui.details["message"])
    # birch-intro-pages-v1: Dialog is the page on screen, not the whole gStringVar4 buffer.
    if (
        birch_intro_pages_enabled
        and native_ui is not None
        and native_ui.phase == "birch_intro_page"
        and native_ui.ready is True
        and native_ui.value
    ):
        dialog = native_ui.value
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
    # transition-coherence-v1: a frame that ends mid-callback can hold a half-moved save block
    # (MoveSaveBlocks_ResetHeap) or a half re-keyed bag and money; read none of it.
    torn = coherent and main_loop_idle(read) is False
    readable = not pregame and screen.kind != "field_transition" and field_initialized
    if readable and not torn:
        save1, save2 = struct.unpack("<II", read(SAVE_BLOCK_PTRS, 8))
    valid_saves = (
        0x02000000 <= save1 <= 0x02040000 - 0x1A9C
        and save1 % 4 == 0
        and 0x02000000 <= save2 <= 0x02040000 - 0xB0
        and save2 % 4 == 0
    )
    if pregame or not field_initialized or not valid_saves:
        return GameState(
            label,
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
            active_ui_read=truth_read,
            menu_window_drawn=window_drawn,
            mid_frame=mid_frame_enabled and readable and torn,
            type_gap=read_type_gap(read, None)
            if move_matchup_enabled
            and field_initialized
            and not pregame
            and battle is not None
            and battle.ready is True
            else None,
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
        read_local_map(
            read,
            (x, y),
            map_id,
            active_warps=active_warp_exits_enabled,
            map_observability=map_observability_enabled,
        )
        if screen.kind == "overworld" and not in_battle
        else None
    )
    player = decode_text(read(save2, 8))
    gender = player_gender(read, save2) if displayed_names_enabled else None
    targets = (
        read_targets(
            read,
            map_id,
            sign_label=sign_labeler(read, gender, player) if displayed_names_enabled else None,
            native_slots=semantic_navigation_enabled,
        )
        if nearby is not None
        else None
    )
    active_full = (
        read_full_map(
            read, (x, y), map_id, active_warps=True, map_observability=map_observability_enabled
        )
        if active_warp_exits_enabled and nearby is not None
        else None
    )
    if active_full is not None and targets is not None:
        from pokebench_env.active_warps import warp_activation

        behaviors = {(t.x, t.y): t.behavior for t in active_full.tiles}
        targets = tuple(
            t
            for t in targets
            if t.kind != "warp" or warp_activation(behaviors.get((t.x, t.y))) is not False
        )
    party = _party(read, empty_move_pp=tutorial_owner_enabled)
    if (
        party_menu_message_enabled
        and active_ui is not None
        and active_ui.phase.startswith("party_")
        and active_ui.details is not None
        and active_ui.diagnostic is None
    ):
        details = dict(active_ui.details)
        cursor = details.get("selected_index" if active_ui.phase == "party_menu" else "party_slot")
        if type(cursor) is int and party is not None and 0 <= cursor < len(party):
            mon = party[cursor]
            details.update({"cursor_party_index": cursor, "cursor_party_number": cursor + 1})
            if mon.species is not None and mon.diagnostic is None:
                species = "EGG" if mon.is_egg else mon.species
                details["cursor_species"] = species
                details["cursor_fainted"] = mon.hp == 0 if mon.hp is not None else None
                if active_ui.phase == "party_menu":
                    suffix = " (fainted)" if mon.hp == 0 else ""
                    active_ui = replace(
                        active_ui, selected=f"{active_ui.selected}: {species}{suffix}"
                    )
            active_ui = replace(active_ui, details=details)
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
            truth=readout_truth_enabled,
            map_wide_triggers=map_wide_triggers_enabled,
        )
        if screen.kind == "overworld" and not in_battle
        else None
    )
    badges = _badges(read, save1)
    topology = (
        read_topology(
            read,
            maps,
            edges=connection_edges_enabled,
            map_observability=map_observability_enabled,
            map_id=map_id,
        )
        if nearby is not None
        else None
    )
    # One flood read for surf-gated-exits-v1 and exit-reachability-v1.
    flood = (
        read_flood_inputs(read, map_id, (x, y), targets, topology)
        if (surf_gate_enabled or exit_reach_enabled) and nearby is not None
        else None
    )
    # field-move-gates-v1: the closed gates make that flood's walls (needs exit-reachability-v1).
    gates = (
        _map_gates(read, save1, map_id, maps.name(map_id), flood, party, badges, resources)
        if field_moves_enabled and exit_reach_enabled and flood is not None
        else None
    )
    found = (
        survey(flood.tiles, flood.start, gates, warps=flood.warps, connections=flood.connections)
        if gates is not None and flood is not None and flood.start in flood.tiles
        else None
    )
    surf_gate = (
        surf_gate_from(read, flood, badges, party, None if gates is None else gates.rules())
        if surf_gate_enabled and flood is not None
        else None
    )
    exit_reach = (
        build_exit_reach(flood, found) if exit_reach_enabled and flood is not None else None
    )
    learning, learning_diagnostic = (
        _move_learning(read, native_ui, battle, party, move_learning_early_enabled, label)
        if move_learning_enabled
        else (None, None)
    )
    stock, stock_diagnostic = _mart_stock(read, save1) if mart_stock_enabled else (None, None)
    state = GameState(
        move_learning=learning,
        move_learning_diagnostic=learning_diagnostic,
        mart_stock=stock,
        mart_stock_diagnostic=stock_diagnostic,
        blackout_active=screen.callback2 == 0x08085F59,
        game_stats=_game_stats(read, save1, save2),
        resources=resources,
        battle=battle,
        battle_details=read_battle_details(
            read,
            battle,
            party,
            resources,
            badges=badges,
            damage=battle_damage_enabled,
        )
        if battle_details_enabled
        else None,
        running=read_running_permission(read),
        bike=read_bike_state(read) if bike_enabled else None,
        screen=label,
        started=True,
        story=read_story(read, screen, save1),
        story_progress=read_story_progress(read, save1, resources),
        route103_rival=read_route103_rival(read, save1, in_battle),
        trainer_opponent=read_trainer_opponent(read, save1, in_battle),
        name=player,
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
            else ownership.owner
            if tutorial_owner_enabled
            else ownership.owner or "unknown"
        ),
        money=_u32(read, save1 + 0x490) ^ _u32(read, save2 + 0xAC),
        badges=badges,
        play_time=(hours, minutes, seconds),
        dialog=dialog,
        menu=menu,
        active_ui=active_ui,
        # in-game-naming-readout-v1: nickname, box, caught-mon and Walda naming in the field.
        naming=read_naming(read, decode_text)
        if in_game_naming_enabled and screen.callback2 == 0x080E4F59 and editor_open(read)
        else None,
        local_map=None if nearby is None else nearby.text(),
        nearby=nearby,
        full_map=(
            active_full
            if active_warp_exits_enabled
            else read_full_map(read, (x, y), map_id, map_observability=map_observability_enabled)
        )
        if full_map_enabled and nearby is not None
        else None,
        player_elevation=body[0x0B] & 15,
        overhead_cover=overhead_cover(read, (x, y), body[0x0B] >> 4)
        if overhead_cover_enabled and screen.kind == "overworld" and not in_battle
        else None,
        object_elevations=read_object_elevations(read, map_id)
        if object_elevations_enabled and nearby is not None
        else None,
        topology=topology,
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
        berry_readout=visible_berry_lines(read, resources, map_id, (x, y))
        if berry_readout_enabled and screen.kind == "overworld" and not in_battle
        else None,
        story_characters=read_story_characters(
            read,
            save1,
            map_id,
            () if context is None else context.objects,
            location=maps.name(map_id),
            live_wins=readout_truth_enabled,
        )
        if story_characters_enabled and screen.kind == "overworld" and not in_battle
        else None,
        static_npc_templates=read_static_npc_templates(read, save1, map_id)
        if static_npc_templates_enabled and screen.kind == "overworld" and not in_battle
        else None,
        offscreen_objects=read_offscreen_objects(read, save1, map_id, (x, y))
        if offscreen_objects_enabled and screen.kind == "overworld" and not in_battle
        else None,
        # named-warp-destinations-v1 OFF never reads SaveBlock1.dynamicWarp.
        dynamic_warp=_dynamic_warp(read, save1, maps, zero_unset=unset_warp_enabled)
        if dynamic_warp_enabled
        and any(
            t.destination is not None and t.destination[:2] == (127, 127) for t in targets or ()
        )
        else None,
        interaction_targets=targets,
        interaction_object_slots=read_interaction_object_slots(read)
        if semantic_navigation_enabled and nearby is not None
        else None,
        displayed_places=tuple(
            (g, n, shown)
            for g, n in dict.fromkeys(
                [map_id, *(t.destination[:2] for t in targets or () if t.destination is not None)]
            )
            if (shown := place_name(maps.name((g, n)), gender, player)) is not None
        )
        if displayed_names_enabled
        else (),
        field_controls_locked=bool(read(FIELD_CONTROLS_LOCK, 1)[0])
        if screen.kind == "overworld" and not in_battle
        else None,
        active_ui_read=truth_read,
        menu_window_drawn=window_drawn,
        surf_gate=surf_gate,
        exit_reach=exit_reach,
        heal_trainers=read_heal_facts(
            read, save1, save2, map_id, party, whole_map=heal_trainers_v2_enabled
        )
        if heal_trainers_enabled and screen.kind == "overworld" and not in_battle
        else None,
        exit_sections=read_exit_sections(
            read,
            map_id,
            (x, y),
            lambda m: destination_name(
                maps.name(m),
                (place_name(maps.name(m), gender, player) if displayed_names_enabled else None)
                or section_name(read, m),
                enabled=gym_door_label_enabled,
            ),
            None if gates is None else (gates.caps, save1, maps.name),
            None if gates is None else gates.rules(),
            active_warps=active_warp_exits_enabled,
            live_map=active_full,
            areas=None
            if area_visits is None
            else AreaFacts(
                area_visits,
                lambda flag: _flag(read, save1, flag),
                lambda graphics: GRAPHICS.get(_graphics(read, save1, graphics)),
            ),
        )
        if exit_sections_enabled
        and nearby is not None
        and screen.kind == "overworld"
        and not in_battle
        else None,
        exit_labels=read_exit_labels(
            read,
            map_id,
            targets,
            topology,
            lambda m: destination_name(
                maps.name(m),
                (place_name(maps.name(m), gender, player) if displayed_names_enabled else None)
                or section_name(read, m),
                enabled=gym_door_label_enabled,
            ),
            None if gates is None else (gates.caps, save1, maps.name),
            active_warps=active_warp_exits_enabled,
        )
        if exit_labels_enabled and nearby is not None
        else None,
        field_obstacles=None
        if gates is None or found is None or flood is None
        else FieldObstacles(gates, found, flood.width, flood.height),
        respawn=read_respawn(read, save1, map_id, maps, respawn_links.get(read, maps))
        if respawn_links is not None and screen.kind == "overworld" and not in_battle
        else None,
    )
    if map_observability_enabled and state.nearby is not None:
        observation_view = (
            state.full_map
            if map_observability_full and state.full_map is not None
            else state.nearby
        )
        rotating_elements, unavailable = read_rotating_elements(read, map_id, observation_view)
        layout_context = read_layout_context(read, map_id)
        if state.interaction_targets is None:
            unavailable += ("interaction target coverage unavailable",)
        if layout_context is None:
            unavailable += ("current layout identity not verified",)
        observation = build_observation(
            observation_view,
            map_id,
            observed_elements(
                observation_view,
                map_id,
                state.player_elevation,
                None if state.running is None else state.running.avatar_flags,
                field_gates=None if state.field_obstacles is None else state.field_obstacles.gates,
            )
            + rotating_elements,
            unavailable,
            layout_context,
        )
        labeled = []
        for target in state.interaction_targets or ():
            facts = tuple(
                e
                for e in observation.elements
                if (e.x, e.y) == (target.x, target.y) and e.edge is None
            )
            switches = tuple(e for e in facts if e.kind == "switch")
            objects = tuple(e for e in facts if e.kind in ("door", "generator"))
            if target.kind == "coordinate_trigger" and switches:
                target = replace(target, name="; ".join(element_label(e) for e in switches))
            elif (target.kind == "background" or target.kind.startswith("metatile_")) and objects:
                target = replace(
                    target,
                    name="; ".join(
                        [target.name or target.kind, *(element_label(e) for e in objects)]
                    ),
                )
            labeled.append(target)
        state = replace(
            state,
            map_observation=observation,
            interaction_targets=tuple(labeled) if state.interaction_targets is not None else None,
        )
    state = _with_training(
        read, state, exp_next_enabled=exp_next_enabled, pokedex_enabled=pokedex_enabled
    )
    matchup_scene = move_matchup_enabled and (
        state.move_learning is not None or (state.battle is not None and state.battle.ready is True)
    )
    if matchup_scene:
        state = replace(state, move_matchup_enabled=True)
    if (type_gap_enabled or matchup_scene) and state.started:
        state = replace(state, type_gap=read_type_gap(read, state.party))
    return state
