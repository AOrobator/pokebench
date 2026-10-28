"""Re-render recorded readouts from a run's raw-RAM archive under a server feature set.

The live server decodes RAM with `read_state` and formats it with `render`; this module owns
both, so a probe that re-renders a recorded turn under other switches runs the server's code.
Input (stdin JSON): {"run_dir": str, "raw_ram": [{"path": str, "sha256": str}, ...]}.
Switches come from the environment the server reads (POKEBENCH_FEATURES_OFF, POKEBENCH_ACTIVE_UI).
blackout-readout-v1's once-only field line comes from the live server's frame latch, which a
single archive cannot carry; a re-render shows only the line read from its own state.
Output (stdout JSON): {"readouts": [str, ...]} in input order.

A request may also name one archive as "places": {"path", "sha256"}. The output then adds
"places", the game's map table read from that archive as GET /pokebench/places serves it
(decision probes' --trust-header re-derives harness-trust-v1's header with it). Without it the
output is unchanged.
"""

import json
import os
import sys
from collections.abc import Callable, Mapping, Sequence
from pathlib import Path
from typing import TextIO

from pokebench_env.blackout_readout import Whiteout
from pokebench_env.caught_nickname import SWITCH as CAUGHT_NICKNAME
from pokebench_env.elevation_view import SWITCH as ELEVATION_MAP
from pokebench_env.exit_labels import SWITCH as EXIT_LABELS
from pokebench_env.exit_reach import SWITCH as EXIT_REACH
from pokebench_env.field_moves import SWITCH as FIELD_MOVES
from pokebench_env.game_screen import ReadMemory
from pokebench_env.game_state import GameState, MapNames, read_game_state
from pokebench_env.heal_trainers import SWITCH as HEAL_TRAINERS
from pokebench_env.heal_trainers import SWITCH_V2 as HEAL_TRAINERS_V2
from pokebench_env.mart_stock import SWITCH as MART_STOCK
from pokebench_env.move_learn import COMPARISON_SWITCH as MOVE_COMPARISON
from pokebench_env.move_learn import EARLY_SWITCH as MOVE_EARLY
from pokebench_env.move_learn import QUESTION_SWITCH as MOVE_QUESTION
from pokebench_env.places import PlaceDirectory
from pokebench_env.player_map_visibility import SWITCH as VISIBILITY
from pokebench_env.player_map_visibility import MapMemory, place_names_only
from pokebench_env.pokedex_own import SWITCH as POKEDEX_OWN
from pokebench_env.raw_ram import load_raw_ram
from pokebench_env.readout import features_off_from_env, format_readout
from pokebench_env.readout_fixes import MID_FRAME, OWNER, UNSET_WARP
from pokebench_env.respawn import SWITCH as RESPAWN
from pokebench_env.respawn import LinkCache, RespawnMemory
from pokebench_env.rom import resolve_rom
from pokebench_env.screen_center import SWITCH as SCREEN_CENTER
from pokebench_env.screen_settle import WARP_FEATURE, warp_animating
from pokebench_env.surf_gate import SWITCH as SURF_GATE
from pokebench_env.training_readout import SWITCH as EXP_NEXT
from pokebench_env.type_gap import SWITCH as TYPE_GAP
from pokebench_env.ui_state import active_ui_enabled_from_env

PORYMAP_MAPS = (
    Path(__file__).resolve().parents[1] / "vendor/continual-harness/pokemon_env/porymap/data/maps"
)


def read_state(
    read: ReadMemory,
    maps: MapNames,
    *,
    active_ui: bool,
    off: frozenset[str],
    links: LinkCache | None = None,
    visibility: MapMemory | None = None,
) -> GameState:
    state = read_game_state(
        read,
        maps,
        active_ui_enabled=active_ui,
        message_phase_enabled="field-dialogue-phase-v1" not in off,
        # window-escape-route-v1 sends map_grid for navigate_to; the readout keeps its local map.
        full_map_enabled=not {"full-map-navigation-v1", "window-escape-route-v1"} <= off,
        story_characters_enabled="character-presence-v1" not in off,
        # battle-triage-guidance-v1 acts on battle-details-v2's RUN verdict, so either reads it.
        battle_details_enabled=not {
            "battle-details-v2",
            "battle-triage-guidance-v1",
            "battle-effective-damage-v1",
        }
        <= off,
        battle_damage_enabled="battle-effective-damage-v1" not in off,
        dynamic_warp_enabled="named-warp-destinations-v1" not in off,
        displayed_names_enabled="displayed-place-names-v1" not in off,
        connection_edges_enabled="connection-edge-tiles-v1" not in off,
        in_game_naming_enabled="in-game-naming-readout-v1" not in off,
        offscreen_objects_enabled="offscreen-objects-v1" not in off,
        static_npc_templates_enabled="static-npc-template-approach-v1" not in off,
        blackout_transition_enabled="blackout-transition-v1" not in off,
        transition_coherence_enabled="transition-coherence-v1" not in off,
        readout_truth_enabled="readout-truth-v1" not in off,
        birch_pages_enabled="birch-speech-pages-v1" not in off,
        birch_intro_pages_enabled="birch-intro-pages-v1" not in off,
        surf_gate_enabled=SURF_GATE not in off,
        exit_reach_enabled=EXIT_REACH not in off,
        heal_trainers_enabled=HEAL_TRAINERS not in off,
        heal_trainers_v2_enabled=HEAL_TRAINERS_V2 not in off,
        tutorial_owner_enabled=OWNER not in off,
        mid_frame_enabled=MID_FRAME not in off,
        unset_warp_enabled=UNSET_WARP not in off,
        semantic_navigation_enabled=not {"semantic-navigation-v1", "semantic-navigation-v2"} <= off,
        evolution_decision_enabled="evolution-decision-v1" not in off,
        # exit-labels-v2 renames named-warp-destinations-v1's labels, so it needs that switch.
        exit_labels_enabled=EXIT_LABELS not in off and "named-warp-destinations-v1" not in off,
        map_observability_enabled="map-observability-v1" not in off and "live-map-v1" not in off,
        map_observability_full="full-map-navigation-v1" not in off,
        active_warp_exits_enabled="active-warp-exits-v1" not in off,
        gym_door_label_enabled="gym-door-label-v1" not in off,
        exit_sections_enabled="exit-labels-v3" not in off
        and EXIT_LABELS not in off
        and "named-warp-destinations-v1" not in off,
        caught_dex_enabled="caught-dex-input-v1" not in off,
        caught_nickname_enabled=CAUGHT_NICKNAME not in off,
        caught_nickname_v2_enabled="caught-nickname-prompt-v2" not in off,
        party_item_confirmation_enabled="party-item-confirmation-v1" not in off,
        party_menu_message_enabled="party-menu-message-v1" not in off,
        interface_guidance_enabled="interface-guidance-v1" not in off,
        bag_pocket_truth_enabled="bag-pocket-truth-v1" not in off,
        pokenav_short_list_enabled="pokenav-short-list-v1" not in off,
        # field-move-gates-v1 gates exit-reachability-v1's flood, so it needs that switch.
        field_moves_enabled=FIELD_MOVES not in off and EXIT_REACH not in off,
        move_learning_enabled=not {MOVE_QUESTION, MOVE_COMPARISON} <= off,
        # move-learn-early-comparison-v1 shows move-learn-comparison-v1's block earlier.
        move_learning_early_enabled=MOVE_EARLY not in off and MOVE_COMPARISON not in off,
        berry_readout_enabled="berry-readout-v1" not in off,
        overhead_cover_enabled=SCREEN_CENTER not in off,
        object_elevations_enabled=ELEVATION_MAP not in off,
        battle_move_learn_input_enabled="battle-move-learn-input-v1" not in off,
        mart_stock_enabled=MART_STOCK not in off,
        shop_interface_enabled="shop-interface-v1" not in off,
        exp_next_enabled=EXP_NEXT not in off,
        pokedex_enabled=POKEDEX_OWN not in off,
        type_gap_enabled=TYPE_GAP not in off,
        map_wide_triggers_enabled="map-wide-triggers-v1" not in off
        and "coordinate-script-conditions-v1" not in off,
        respawn_links=links if RESPAWN not in off else None,
    )
    # Optional session memory belongs to the observation/replay delivery factory.
    # Raw callers retain the unprojected native facts for offline diagnostics.
    return state if VISIBILITY in off or visibility is None else visibility.project(read, state)


def render(
    state: GameState,
    off: frozenset[str],
    *,
    warp_animation: bool = False,
    whiteout: Whiteout | None = None,
    respawn_memory: RespawnMemory | None = None,
) -> str:
    return format_readout(
        state,
        off,
        named_interactions="named-interactions-v1" not in off,
        world_destinations="world-destinations-v1" not in off,
        bounded_navigation="bounded-navigation-v1" not in off,
        message_phase="field-dialogue-phase-v1" not in off,
        named_warps="named-warp-destinations-v1" not in off,
        warp_animation=warp_animation,
        adjacent_tiles="adjacent-tiles-v1" not in off,
        rules_in_prompt="readout-rules-in-prompt-v1" not in off,
        whiteout=whiteout,
        respawn_memory=respawn_memory,
    )


class RawRef:
    def __init__(self, path: str, sha256: str) -> None:
        self.path = path
        self.sha256 = sha256


def parse_ref(item: object) -> RawRef:
    if (
        not isinstance(item, dict)
        or not isinstance(item.get("path"), str)
        or not isinstance(item.get("sha256"), str)
    ):
        raise ValueError(f"bad raw_ram reference: {item!r}")
    path = Path(item["path"])
    if path.is_absolute() or ".." in path.parts:
        raise ValueError(f"raw_ram path must stay inside the run directory: {item['path']}")
    return RawRef(item["path"], item["sha256"])


def parse_places(text: str) -> RawRef | None:
    body = json.loads(text)
    item = body.get("places") if isinstance(body, dict) else None
    return None if item is None else parse_ref(item)


def parse_request(text: str) -> tuple[Path, list[RawRef]]:
    body = json.loads(text)
    if (
        not isinstance(body, dict)
        or not isinstance(body.get("run_dir"), str)
        or not isinstance(body.get("raw_ram"), list)
    ):
        raise ValueError("request must be {run_dir: str, raw_ram: [{path, sha256}, ...]}")
    return Path(body["run_dir"]), [parse_ref(item) for item in body["raw_ram"]]


Loader = Callable[[Path, str], ReadMemory]


def rerender(
    run_dir: Path, refs: Sequence[RawRef], load: Loader, maps: MapNames, env: Mapping[str, str]
) -> list[str]:
    off = features_off_from_env(env)
    active_ui = active_ui_enabled_from_env(env)
    # respawn-readout-v1: one archive carries no history of entered centers (RespawnMemory).
    links = LinkCache()
    visibility = MapMemory()

    def one(read: ReadMemory) -> str:
        animation = WARP_FEATURE not in off and warp_animating(read)
        return render(
            read_state(
                read, maps, active_ui=active_ui, off=off, links=links, visibility=visibility
            ),
            off,
            warp_animation=animation,
        )

    return [one(load(run_dir / ref.path, ref.sha256)) for ref in refs]


def places(
    run_dir: Path, ref: RawRef, load: Loader, maps: MapNames, env: Mapping[str, str]
) -> list[dict[str, object]]:
    displayed = "displayed-place-names-v1" not in features_off_from_env(env)
    directory = PlaceDirectory(load(run_dir / ref.path, ref.sha256), maps)
    entries = directory.places(displayed=displayed)
    if VISIBILITY not in features_off_from_env(env):
        entries = place_names_only(entries)
    return [place.json() for place in entries]


def main(env: Mapping[str, str], stdin: TextIO, stdout: TextIO) -> int:
    text = stdin.read()
    run_dir, refs = parse_request(text)
    table = parse_places(text)
    rom = resolve_rom(env).read_bytes()

    def load(path: Path, sha256: str) -> ReadMemory:
        return load_raw_ram(path, sha256, rom=rom)

    maps = MapNames.load(PORYMAP_MAPS)
    out: dict[str, object] = {"readouts": rerender(run_dir, refs, load, maps, env)}
    if table is not None:
        out["places"] = places(run_dir, table, load, maps, env)
    json.dump(out, stdout)
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main(os.environ, sys.stdin, sys.stdout))
