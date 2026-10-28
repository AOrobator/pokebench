"""The model's text readout and the typed JSON state, both from `GameState`.

Observation switches (harness feature ids, set per run) remove their own text
from the readout only; the typed JSON state used for measurement is unchanged.
The additions are full-map-navigation-v1's `map_grid` and displayed-place-names-v1's
`location_display`, each present only when its switch is on.
"""

from collections.abc import Mapping
from dataclasses import asdict, replace

from pokebench_env.adjacent_tiles import next_tiles, walking
from pokebench_env.battle_message_waiting import SWITCH as MESSAGE_WAITING
from pokebench_env.battle_message_waiting import message_clause
from pokebench_env.battle_triage import SWITCH as TRIAGE
from pokebench_env.battle_triage import battle_triage_lines, field_triage_line
from pokebench_env.birch_pages import INTRO_PHASE, INTRO_SWITCH
from pokebench_env.birch_pages import PHASE as BIRCH_PAGE
from pokebench_env.birch_pages import SWITCH as BIRCH_PAGES
from pokebench_env.blackout_readout import SWITCH as BLACKOUT
from pokebench_env.blackout_readout import WHITING_OUT, Whiteout, whiteout_line
from pokebench_env.elevation_view import SWITCH as ELEVATION_MAP
from pokebench_env.elevation_view import elevation_view
from pokebench_env.exit_labels import SWITCH as EXIT_LABELS
from pokebench_env.exit_presentation import SWITCH as AVAILABLE_EXITS
from pokebench_env.exit_presentation import split_exits
from pokebench_env.exit_reach import SWITCH as EXIT_REACH
from pokebench_env.exit_reach import ExitReach
from pokebench_env.field_moves import SWITCH as FIELD_MOVES
from pokebench_env.field_moves import FieldObstacles
from pokebench_env.game_state import GameState
from pokebench_env.levelup_box import SWITCH as LEVELUP_BOX
from pokebench_env.levelup_box import levelup_clause
from pokebench_env.map_observation import SWITCH as MAP_OBSERVABILITY
from pokebench_env.map_observation import render_observation
from pokebench_env.map_rules import FEATURE as RULES_FEATURE
from pokebench_env.mart_stock import SWITCH as MART_STOCK
from pokebench_env.mart_stock import stock_lines
from pokebench_env.mauville_puzzle import SWITCH as MAUVILLE_PUZZLE
from pokebench_env.mauville_puzzle import puzzle_view, switch_name
from pokebench_env.move_learn import COMPARISON_SWITCH as MOVE_COMPARISON
from pokebench_env.move_learn import QUESTION_SWITCH as MOVE_QUESTION
from pokebench_env.move_learn import comparison_lines, question_line
from pokebench_env.offscreen_objects import SWITCH as OFFSCREEN
from pokebench_env.offscreen_objects import offscreen_text
from pokebench_env.poison_berry_readout import (
    BERRY,
    POISON,
    POISON_WARNING,
    bag_berry_lines,
    poisoned,
)
from pokebench_env.pokedex_own import dex_lines
from pokebench_env.readout_fixes import MID_FRAME, MID_FRAME_TEXT
from pokebench_env.readout_truth import SWITCH as TRUTH
from pokebench_env.readout_truth import lock_line, menu_line
from pokebench_env.respawn import SWITCH as RESPAWN
from pokebench_env.respawn import RespawnMemory, respawn_line
from pokebench_env.screen_center import SWITCH as SCREEN_CENTER
from pokebench_env.screen_center import cover_line
from pokebench_env.semantic_targets import SWITCH as SEMANTIC_V2
from pokebench_env.semantic_targets import interaction_suffix, listed_objects, same_tile
from pokebench_env.status_names import SWITCH as STATUS_NAMES
from pokebench_env.status_names import status_text
from pokebench_env.surf_gate import SWITCH as SURF_GATE
from pokebench_env.surf_gate import SWITCH_V2 as SURF_GATE_V2
from pokebench_env.surf_gate import ConnectionKey, SurfGate
from pokebench_env.topology import Connection, Topology
from pokebench_env.training_readout import exp_clause
from pokebench_env.world import InteractionTarget
from pokebench_env.yes_no_answer import SWITCH as YES_NO_ANSWER
from pokebench_env.yes_no_answer import answer_line

# post-battle-readout-v1: the battle block after the battle ends (evolution or summary screen while
# the battle finishes), and the battle's move-learning YES/NO box as the Interface line.
POST_BATTLE = "post-battle-readout-v1"
POST_BATTLE_SCREENS = frozenset({"evolution", "pokemon_summary", "summary"})
# BattleScript_AskToLearnMove yesnoboxlearnmove / yesnoboxstoplearningmove
# (battle_text.py 0x5A / 0x5B).
LEARN_BOXES = frozenset({"learn_move", "stop_learning_move"})
# battle_message_waiting.py's controls for a battle YES/NO box.
BOX_CONTROLS = "UP or DOWN moves the cursor, A answers the highlighted choice, B answers NO"


def _learn_box_interface(state: GameState) -> str | None:
    battle = state.battle
    prompt = None if battle is None else battle.prompt
    if (
        battle is None
        or battle.diagnostic is not None
        or prompt is None
        or prompt.kind not in LEARN_BOXES
        or not prompt.ready
        or prompt.selected not in {"YES", "NO"}
    ):
        return None
    return f"Interface: {prompt.kind}; input ready; selected {prompt.selected}; {BOX_CONTROLS}"


SERVER_FEATURES = (
    "expanded-menu-battle-information-v1",
    "ram-state-v1",
    "live-map-v1",
    "live-player-position-v1",
    "world-coordinate-grid-v1",
    "live-object-sprites-v1",
    "world-targets-v1",
    "named-interactions-v1",
    "world-destinations-v1",
    "bounded-navigation-v1",
    "semantic-navigation-v1",
    "field-dialogue-phase-v1",
    "active-field-message-buffer-v1",
    "naming-cursor-v1",
    "story-state-v1",
    "coordinate-script-conditions-v1",
    "field-control-lock",
    "warp-activation-guidance-v1",
    "ledge-hops-v1",
    "one-way-tiles-v1",
    "full-map-navigation-v1",
    "counter-talk-v1",
    "named-warp-destinations-v1",
    "character-presence-v1",
    "battle-details-v2",
    "warp-arrival-settle-v1",
    "displayed-place-names-v1",
    "battle-triage-guidance-v1",
    "adjacent-tiles-v1",
    "readout-rules-in-prompt-v1",
    "connection-edge-tiles-v1",
    "in-game-naming-readout-v1",
    "battle-message-waiting-v1",
    "offscreen-objects-v1",
    "levelup-box-v1",
    "transition-coherence-v1",
    "readout-truth-v1",
    "birch-speech-pages-v1",
    "blackout-readout-v1",
    "surf-gated-exits-v1",
    "exit-reachability-v1",
    "heal-before-trainers-v1",
    "tutorial-party-owner-v1",
    "mid-frame-readout-v1",
    "unset-dynamic-warp-v1",
    "status-names-v1",
    "surf-gated-exits-v2",
    "battle-effective-damage-v1",
    "safe-navigation-strides-v1",
    "evolution-decision-v1",
    "original-speed-pacing-v1",
    "semantic-navigation-v2",
    "exit-labels-v2",
    "heal-before-trainers-v2",
    "respawn-readout-v1",
    "caught-nickname-prompt-v1",
    "party-item-confirmation-v1",
    "yes-no-answer-readout-v1",
    "field-move-gates-v1",
    "exit-labels-v3",
    "move-learn-settle-v1",
    "move-learn-question-v1",
    "move-learn-comparison-v1",
    "gym-door-label-v1",
    "mart-stock-readout-v1",
    "caught-dex-input-v1",
    "exp-next-level-v1",
    "pokedex-own-v1",
    "shop-interface-v1",
    "map-wide-triggers-v1",
    "birch-intro-pages-v1",
    "post-battle-readout-v1",
    "move-learn-early-comparison-v1",
    POISON,
    BERRY,
    "battle-move-learn-input-v1",
    "static-npc-template-approach-v1",
    "coherent-battle-observation-v1",
    "window-escape-route-v1",
    ELEVATION_MAP,
    SCREEN_CENTER,
    "blackout-transition-v1",
    "player-elevation-readout-v1",
    "party-menu-message-v1",
    "interface-guidance-v1",
    "active-warp-exits-v1",
    "available-exits-presentation-v1",
    "bag-pocket-truth-v1",
    "caught-nickname-prompt-v2",
    MAUVILLE_PUZZLE,
    "cutscene-journal-v1",
    "map-observability-v1",
    "type-gap-team-v1",
    "pokenav-short-list-v1",
    "scene-journal-safe-capture-v1",
    "pokenav-call-auto-advance-v1",
)


def features_off_from_env(env: Mapping[str, str]) -> frozenset[str]:
    raw = env.get(
        "POKEBENCH_FEATURES_OFF",
        "named-interactions-v1,world-destinations-v1,bounded-navigation-v1,semantic-navigation-v1,expanded-menu-battle-information-v1,field-dialogue-phase-v1,full-map-navigation-v1,named-warp-destinations-v1,character-presence-v1,battle-details-v2,warp-arrival-settle-v1,displayed-place-names-v1,"
        "battle-triage-guidance-v1,"
        "adjacent-tiles-v1,"
        "readout-rules-in-prompt-v1,connection-edge-tiles-v1,in-game-naming-readout-v1,"
        "battle-message-waiting-v1,"
        "static-npc-template-approach-v1,"
        "offscreen-objects-v1,"
        "levelup-box-v1,"
        "transition-coherence-v1,"
        "readout-truth-v1,birch-speech-pages-v1,blackout-readout-v1,"
        "surf-gated-exits-v1,"
        "exit-reachability-v1,"
        "heal-before-trainers-v1,"
        "tutorial-party-owner-v1,mid-frame-readout-v1,unset-dynamic-warp-v1,status-names-v1,"
        "surf-gated-exits-v2,battle-effective-damage-v1,safe-navigation-strides-v1,evolution-decision-v1,original-speed-pacing-v1,"
        "semantic-navigation-v2,exit-labels-v2,heal-before-trainers-v2,respawn-readout-v1,"
        "caught-nickname-prompt-v1,caught-nickname-prompt-v2,party-item-confirmation-v1,yes-no-answer-readout-v1,"
        "field-move-gates-v1,exit-labels-v3,move-learn-settle-v1,move-learn-question-v1,"
        "move-learn-comparison-v1,gym-door-label-v1,"
        "mart-stock-readout-v1,caught-dex-input-v1,exp-next-level-v1,pokedex-own-v1,"
        "shop-interface-v1,map-wide-triggers-v1,"
        "birch-intro-pages-v1,post-battle-readout-v1,move-learn-early-comparison-v1,poison-readout-v1,berry-readout-v1,battle-move-learn-input-v1,coherent-battle-observation-v1,"
        "window-escape-route-v1,"
        "elevation-aware-map-v1,screen-center-player-v1,blackout-transition-v1,player-elevation-readout-v1,party-menu-message-v1,interface-guidance-v1,active-warp-exits-v1,available-exits-presentation-v1,bag-pocket-truth-v1,cutscene-journal-v1,scene-journal-safe-capture-v1,"
        "type-gap-team-v1,pokenav-short-list-v1,pokenav-call-auto-advance-v1",
    )
    if raw == "":
        return frozenset()
    ids = raw.split(",")
    if any(item not in SERVER_FEATURES for item in ids):
        raise ValueError(f"POKEBENCH_FEATURES_OFF names an unknown observation feature: {raw!r}")
    return frozenset(ids)


WARP_ANIMATION_LOCK = (
    "Field controls: locked (door/stairs/warp animation still running; observe again)"
)

PRE_GAME_TEXT = "Game not started: no save data (player, location, party) exists yet."


def _clock(seconds: int) -> str:
    return f"{seconds // 3600}:{seconds // 60 % 60:02d}:{seconds % 60:02d}"


def _play_seconds(state: GameState) -> int | None:
    if state.play_time is None:
        return None
    hours, minutes, seconds = state.play_time
    return hours * 3600 + minutes * 60 + seconds


def _menu(
    state: GameState, truth: bool = False, evolution: bool = False, move_question: bool = False
) -> str:
    ui = state.active_ui
    # BattleScript_AskToLearnMove owns a YES/NO box while the controller is busy.
    # Its verified prompt takes precedence over the generic battle interface.
    battle = state.battle
    prompt = None if battle is None else battle.prompt
    if (
        move_question
        and battle is not None
        and battle.diagnostic is None
        and battle.text_phase == "prompt"
        and prompt is not None
        and prompt.kind in {"learn_move", "stop_learning_move"}
        and prompt.ready
        and prompt.selected in {"YES", "NO"}
    ):
        return f"Menu: {prompt.kind}; selected {prompt.selected}"
    if (
        evolution
        and state.screen == "evolution"
        and ui is not None
        and not ui.diagnostic
        and ui.selected is None
    ):
        return "Menu: no selectable menu is open" + (
            "; use choose_evolution" if ui.phase == "evolution_decision" else ""
        )
    if state.active_ui is not None and state.active_ui.selected is not None:
        return f"Menu: {state.active_ui.phase}; selected {state.active_ui.selected}"
    # readout-truth-v1: no menu is open, or a non-menu interface owns input.
    line = menu_line(state) if truth else None
    if line is not None:
        return line
    if state.menu is None:
        return "Menu: unavailable (active owner not verified)"
    return (
        f"Unverified menu buffer: cursor {state.menu.selected} of {state.menu.options}"
        "; active menu owner unavailable"
    )


def _move_learning_lines(state: GameState, off: frozenset[str]) -> list[str]:
    """move-learn-question-v1 and move-learn-comparison-v1, after the Interface line."""
    lines = []
    if state.move_learning_diagnostic is not None and not {MOVE_QUESTION, MOVE_COMPARISON} <= off:
        lines.append(f"HARNESS BUG (move learning): {state.move_learning_diagnostic}")
    learning = state.move_learning
    if learning is None:
        return lines
    question = question_line(learning) if MOVE_QUESTION not in off else None
    if question is not None:
        lines.append(question)
    if MOVE_COMPARISON not in off:
        lines.extend(comparison_lines(learning))
    return lines


def _mart_stock_lines(state: GameState, off: frozenset[str]) -> list[str]:
    """mart-stock-readout-v1, after the Interface line."""
    if MART_STOCK in off:
        return []
    if state.mart_stock_diagnostic is not None:
        return [f"HARNESS BUG (mart stock): {state.mart_stock_diagnostic}"]
    return [] if state.mart_stock is None else stock_lines(state.mart_stock, state.money)


def format_readout(
    state: GameState,
    off: frozenset[str] = frozenset(),
    *,
    named_interactions: bool = False,
    world_destinations: bool = False,
    bounded_navigation: bool = False,
    message_phase: bool = False,
    named_warps: bool = False,
    warp_animation: bool = False,
    adjacent_tiles: bool = False,
    rules_in_prompt: bool = False,
    whiteout: Whiteout | None = None,
    respawn_memory: RespawnMemory | None = None,
) -> str:
    if "ram-state-v1" in off:
        return ""
    unavailable_warps: tuple[InteractionTarget, ...] = ()
    unavailable_connections: tuple[Connection, ...] = ()
    if AVAILABLE_EXITS not in off and EXIT_REACH not in off:
        state, unavailable_warps, unavailable_connections = split_exits(
            state, surf=SURF_GATE not in off
        )
    truth = TRUTH not in off
    # readout-rules-in-prompt-v1: the fixed map rules are in the system prompt instead.
    rules = rules_in_prompt and RULES_FEATURE not in off
    # displayed-place-names-v1: buildings the game names on their signs, for this save's player.
    places = (
        {(g, n): name for g, n, name in state.displayed_places}
        if "displayed-place-names-v1" not in off
        else {}
    )
    # named-warp-destinations-v1 exposes only names the game itself displays. Internal map-table
    # names remain in GameState for identity/navigation, but are not player-facing provenance.
    destinations = (
        {(g, n): places[(g, n)] for g, n, _name in state.destination_names if (g, n) in places}
        if named_warps and "named-warp-destinations-v1" not in off
        else None
    )
    # exit-labels-v2: every destination named as the location popup names it (a displayed
    # place name first), plus arrival reach for warps whose destination shares its name.
    labels = state.exit_labels if destinations is not None and EXIT_LABELS not in off else None
    sections = state.exit_sections if "exit-labels-v3" not in off else None
    warp_labels = {} if sections is None else {(w.x, w.y): w.label for w in sections.warps}
    if labels is not None and destinations is not None:
        destinations = {**labels.name_map(), **destinations}
    # The game's own dynamic warp (SaveBlock1.dynamicWarp) for MAP_DYNAMIC warps; ON side only.
    dynamic = None
    if destinations is not None and state.dynamic_warp is not None:
        group, number, _internal_name = state.dynamic_warp
        if (place := places.get((group, number))) is not None:
            dynamic = f"{place} (dynamic warp; map {group}/{number})"
    expanded = "expanded-menu-battle-information-v1" not in off
    # battle-details-v2 replaces the raw battler/input lines; OFF keeps them byte for byte.
    details = state.battle_details if expanded and "battle-details-v2" not in off else None
    ui = state.active_ui
    from pokebench_env.ui_state import BIRCH_PHASES, CLOCK_PHASES

    incumbent_phases = {
        *(
            (ui.phase,)
            if "caught-dex-input-v1" not in off
            and ui is not None
            and ui.phase.startswith("pokedex_caught_")
            else ()
        ),
        *(
            (ui.phase,)
            if "evolution-decision-v1" not in off
            and ui is not None
            and ui.phase.startswith("evolution")
            else ()
        ),
        *BIRCH_PHASES.values(),
        *CLOCK_PHASES.values(),
        "unsupported",
        "naming_transition",
        "field_transition",
        # birch-speech-pages-v1: a Birch page is shown wherever the Birch phases are.
        *((BIRCH_PAGE,) if BIRCH_PAGES not in off else ()),
        *((INTRO_PHASE,) if INTRO_SWITCH not in off else ()),
    }
    omitted_ui = not expanded and ui is not None and ui.phase not in incumbent_phases
    if omitted_ui:
        lines = [
            f"Screen: {state.screen}",
            "Dialog: detailed menu text unprovided",
            "Menu: detailed controls unprovided",
        ]
        if ui is not None and ui.diagnostic:
            lines.append(f"STATE COVERAGE ERROR: {ui.diagnostic}")
    else:
        dialog = "none" if state.dialog is None else f'"{state.dialog}"'
        lines = [
            f"Screen: {state.screen}",
            f"Dialog: {dialog}",
            _menu(state, truth, "evolution-decision-v1" not in off, MOVE_QUESTION not in off),
        ]
        box = _learn_box_interface(state) if POST_BATTLE not in off and state.in_battle else None
        if box is not None:
            lines.append(box)
        elif ui is not None:
            lines.append((ui if expanded else replace(ui, details=None)).text())
        # yes-no-answer-readout-v1: how to answer the other option of the open YES/NO box.
        answer = answer_line(state) if YES_NO_ANSWER not in off else None
        if answer is not None:
            lines.append(answer)
        lines.extend(_move_learning_lines(state, off))
        lines.extend(_mart_stock_lines(state, off))
    if state.resources is not None:
        if expanded and state.resources.bag is not None:
            lines.append(
                "Bag: "
                # readout-truth-v1: the field says "empty" as the battle does.
                + ("empty" if (details is not None or truth) and not state.resources.bag else "")
                + "; ".join(
                    f"{item.name or 'item #' + str(item.item_id)} ×{item.quantity}"
                    for item in state.resources.bag
                )
            )
        if expanded and state.resources.daycare:
            lines.append(
                "Daycare: "
                + "; ".join(
                    f"slot {entry.slot + 1} {entry.pokemon.species} "
                    f"Lv{entry.displayed_level}; steps {entry.steps}"
                    for entry in state.resources.daycare
                )
            )
        for diagnostic in state.resources.diagnostics:
            lines.append(f"HARNESS BUG ({diagnostic.owner}): {diagnostic.message}")
    if state.party_ownership and state.party_ownership.diagnostic:
        lines.append(f"HARNESS BUG (party ownership): {state.party_ownership.diagnostic}")
    if state.battle is not None:
        battle = state.battle
        if battle.diagnostic:
            lines.append(f"HARNESS BUG (battle): {battle.diagnostic}")
        playback = (
            []
            if battle.playback is None
            else [
                f"Battle playback: {battle.playback.controls}; "
                f"stoppable {battle.playback.stoppable}; finished {battle.playback.finished}"
            ]
        )
        execution = (
            []
            if battle.current_execution is None
            else [
                f"Battle execution: {battle.current_execution.phase}; "
                f"attacker {battle.current_execution.attacker}; "
                f"target {battle.current_execution.target}; "
                f"move ID {battle.current_execution.move_id}; "
                f"result flags {battle.current_execution.move_result_flags}. "
                "Completion and damage are separate recorded signals."
            ]
        )
        waiting = MESSAGE_WAITING not in off
        levelup = LEVELUP_BOX not in off
        # battle-message-waiting-v1 (and levelup-box-v1) without battle-details-v2: its own
        # line, only when no player input is ready and the battle shows a message, a YES/NO
        # box or the level-up stats box.
        own = (
            details is None
            and battle.phase != "replay"
            and not any(i.ready for i in battle.player_inputs or ())
        )
        clause = levelup_clause(battle) if own and levelup else None
        if clause is None and own and waiting:
            clause = message_clause(battle)
        own_line = [] if clause is None else [f"Battle input: {clause}"]
        if details is not None:
            lines += [
                *details.lines(
                    battle,
                    input_override=(
                        ui.controls
                        if "caught-dex-input-v1" not in off
                        and ui is not None
                        and ui.phase == "pokedex_caught_entry"
                        and ui.ready is True
                        else None
                    ),
                    message_waiting=waiting,
                    levelup_box=levelup,
                    effective_damage="battle-effective-damage-v1" not in off,
                    ended=POST_BATTLE not in off
                    and battle.phase == "finishing"
                    and state.screen in POST_BATTLE_SCREENS,
                ),
                *playback,
                *execution,
            ]
        elif expanded:
            lines.append(
                f"Battle state: {battle.phase}; input {battle.ready}; "
                f"turn {battle.turn}; outcome {battle.outcome}"
            )
            lines += own_line
            lines += playback
            for actor in battle.battlers or ():
                lines.append(
                    f"Battler {actor.battler} {actor.species} Lv{actor.level} "
                    f"HP {actor.hp}/{actor.max_hp}; "
                    f"status {actor.status1}/{actor.status2}/{actor.status3}; "
                    f"stages {actor.stat_stages}; moves "
                    + ", ".join(
                        f"{move.name} PP {move.pp}/{move.max_pp}"
                        for move in actor.moves
                        if move.move_id
                    )
                )
            for selection in battle.player_inputs or ():
                lines.append(
                    f"Battle input {selection.battler}: {selection.phase}; "
                    f"ready {selection.ready}; selected {selection.selected}; "
                    f"target {selection.target_cursor}"
                )
            lines += execution
        else:
            lines.append("Battle details: unprovided")
            lines += own_line
        if TRIAGE not in off:
            lines += battle_triage_lines(battle, state.battle_details)
    # blackout-readout-v1: CB2_WhiteOut is running in this observation's own state.
    if state.blackout_active and BLACKOUT not in off:
        lines.append(WHITING_OUT)
    if state.story is not None and "story-state-v1" not in off:
        lines.append(state.story.text(truth=truth))
    if state.naming is not None and "naming-cursor-v1" not in off:
        lines.append(state.naming.readout())
    if state.screen == "field_transition":
        return "\n".join(
            [
                *lines,
                "Map loading: save-backed world state unavailable "
                "until field initialization finishes.",
            ]
        )
    if not state.started:
        return "\n".join([*lines, PRE_GAME_TEXT])
    if state.position is None:
        # mid-frame-readout-v1: the save was skipped because the snapshot was mid-frame.
        if state.mid_frame and MID_FRAME not in off:
            return "\n".join([*lines, MID_FRAME_TEXT])
        return "\n".join(
            [*lines, "Save-backed world state unavailable: save data is not initialized or valid."]
        )
    x, y = state.position
    named_status = STATUS_NAMES not in off
    poison_readout = POISON not in off
    facing = "" if state.facing is None else f", facing {state.facing}"
    next_levels = state.party_next_level or ()
    party = "; ".join(
        f"{m.species or 'UNKNOWN'} Lv{m.level} HP {m.hp}/{m.max_hp}"
        # exp-next-level-v1: the summary screen's EXP. POINTS and NEXT LV.
        + (
            f" · {exp_clause(m.experience, next_levels[i])}"
            if i < len(next_levels) and exp_clause(m.experience, next_levels[i])
            else ""
        )
        # status-names-v1: the status by name (poison, sleep turns, ...) instead of its bits.
        + (
            " · STATUS "
            + (
                "PSN (poisoned)"
                if poison_readout and poisoned(m.status)
                else str((status_text(m.status) if named_status else None) or m.status)
            )
            if expanded and m.status
            else ""
        )
        + (
            " · moves "
            + ", ".join(
                f"{move.name or move.move_id} PP {move.pp}" for move in m.moves if move.move_id
            )
            if expanded and m.moves is not None
            else ""
        )
        + (f" · nickname {m.nickname}" if expanded and m.nickname else "")
        + (f" · HARNESS BUG: {m.diagnostic}" if m.diagnostic else "")
        + (f" · HARNESS BUG: {m.nickname_diagnostic}" if m.nickname_diagnostic else "")
        for i, m in enumerate(state.party or ())
    )
    location = places.get(state.map_id) if state.map_id is not None else None
    lines += [
        f"Player: {state.name}",
        f"Location: {sections.current if sections is not None else location or state.location}",
    ]
    if "live-player-position-v1" not in off:
        position = f"Position: X={x}, Y={y}{facing}"
        if "player-elevation-readout-v1" not in off:
            position += f", elevation {state.player_elevation}"
            tile = (
                next(
                    (t for t in state.nearby.tiles if (t.x, t.y) == state.position),
                    None,
                )
                if state.nearby is not None
                else None
            )
            if tile is not None and tile.elevation in (0, 15):
                position += f", on a tile that accepts any elevation ({tile.elevation})"
        lines.append(position)
    # tutorial-party-owner-v1: an owner that could not be established is None (OFF: "unknown").
    owner = state.party_owner or "unknown"
    lines.append(f"Party ({owner}): {party or 'none'}")
    if state.pokedex is not None:
        lines.extend(dex_lines(state, state.pokedex))
    triage = (
        field_triage_line(state.party, owner)
        if TRIAGE not in off and not state.in_battle and state.battle is None
        else None
    )
    if triage is not None:
        lines.append(triage)
    lines.append(f"Money: ₽{state.money}")
    # respawn-readout-v1: where a blackout sends the player, beside the money it would halve.
    if state.respawn is not None and RESPAWN not in off:
        lines.append(
            respawn_line(state.respawn, state.money, respawn_memory, places, here=state.location)
        )
    lines += [
        f"Badges: {', '.join(state.badges or ()) or 'none'}",
        f"In battle: {'yes' if state.in_battle else 'no'}",
        f"Play time: {_clock(_play_seconds(state) or 0)}",
    ]
    if (
        poison_readout
        and state.screen == "overworld"
        and not state.in_battle
        and state.party_owner == "player"
        and any(
            poisoned(m.status) and (m.hp or 0) > 0 and not m.diagnostic for m in state.party or ()
        )
    ):
        lines.append(POISON_WARNING)
    if BERRY not in off:
        lines.extend(bag_berry_lines(state.resources))
        if state.screen == "overworld" and not state.in_battle:
            lines.extend(state.berry_readout or ())
    # blackout-readout-v1: the first observation back on the field after CB2_WhiteOut.
    if whiteout is not None and BLACKOUT not in off:
        lines.append(whiteout_line(whiteout, state))
    if state.field_controls_locked is not None and "field-control-lock" not in off:
        # warp-arrival-settle-v1: a lock held by the game's door/warp task is the animation.
        animation = warp_animation and "warp-arrival-settle-v1" not in off
        # readout-truth-v1: no message or menu explains the lock; say what holds it.
        truth_lock = lock_line(state) if truth and state.field_controls_locked else None
        lines.append(
            WARP_ANIMATION_LOCK
            if state.field_controls_locked and animation
            else truth_lock
            if truth_lock is not None
            else "Field controls: locked (dialog, menu, or script; direction presses cannot move)"
            if state.field_controls_locked
            else "Field controls: available (terrain and objects can still block a direction)"
        )
    observation = state.map_observation if MAP_OBSERVABILITY not in off else None
    puzzle = (
        observation is None
        and MAUVILLE_PUZZLE not in off
        and "live-map-v1" not in off
        and state.screen == "overworld"
        and not state.in_battle
    )
    puzzle_map = None
    if state.local_map is not None and "live-map-v1" not in off:
        configured_whole = "full-map-navigation-v1" not in off
        whole = state.full_map is not None and configured_whole
        shown = state.full_map if whole else state.nearby
        warp_guidance = "warp-activation-guidance-v1" not in off
        ledges = "ledge-hops-v1" not in off
        edge_walls = "one-way-tiles-v1" not in off
        counters = "counter-talk-v1" not in off
        terrain_note = ""
        terrain = FIELD_MOVES not in off and observation is None
        if terrain and shown is not None:
            from pokebench_env.terrain_visibility import terrain_view

            shown, terrain_note = terrain_view(shown, state.field_obstacles)
        # elevation-aware-map-v1: tiles the player cannot step onto from this elevation draw L.
        elevation_note = ""
        elevation = ELEVATION_MAP not in off and shown is not None and observation is None
        if ELEVATION_MAP not in off and shown is not None:
            elevation_shown, elevation_note = elevation_view(
                shown,
                state.player_elevation,
                None if state.running is None else state.running.avatar_flags,
            )
            if elevation:
                shown = elevation_shown
            elif observation is not None:
                elevation_note = elevation_note.replace(
                    "Other levels (L)", "Other levels (Lv tokens)"
                )
        puzzle_note = ""
        if puzzle and shown is not None:
            puzzle_map = shown
            shown, puzzle_note = puzzle_view(shown, state.map_id)
        # adjacent-tiles-v1: the four neighbours in words, from the same cells the map draws.
        neighbours = (
            next_tiles(
                shown,
                state.position,
                coordinates="live-player-position-v1" not in off,
                ledges=ledges,
                edge_walls=edge_walls,
                counters=counters,
                warp_guidance=warp_guidance,
                topology=state.topology
                if world_destinations and "world-destinations-v1" not in off
                else None,
                on_foot=walking(None if state.running is None else state.running.avatar_flags),
                terrain=FIELD_MOVES not in off,
                elevation=state.player_elevation if elevation_note else None,
                observation=observation,
            )
            if shown is not None and adjacent_tiles and "adjacent-tiles-v1" not in off
            else None
        )
        lines.append(
            shown.text(
                grid="world-coordinate-grid-v1" not in off,
                warp_guidance=warp_guidance,
                ledges=ledges,
                edge_walls=edge_walls,
                counters=counters,
                destinations=destinations,
                warp_labels=warp_labels,
                dynamic=dynamic,
                next_tiles=neighbours,
                rendered=render_observation(
                    shown,
                    observation,
                    ledges=ledges,
                    edge_walls=edge_walls,
                    counters=counters,
                    terrain=FIELD_MOVES not in off,
                )
                if observation is not None
                else None,
                # A local-map fallback keeps its legend: the prompt describes the whole map.
                rules_in_prompt=rules and whole == configured_whole,
            )
            if shown is not None
            else state.local_map
        )
        if puzzle_note:
            lines.append(puzzle_note)
        if terrain_note:
            lines.append(terrain_note)
        if elevation_note:
            lines.append(elevation_note)
    # screen-center-player-v1: the map's top layer hides the sprite at the screen's center.
    if state.overhead_cover is not None and state.overhead_cover.tiles and SCREEN_CENTER not in off:
        lines.append(cover_line(state.overhead_cover))
    if sections is not None:
        lines.append(
            "Terrain sections distinguish areas of the same map; "
            "arrows preserve one-way movement. Terrain paths do not account for "
            "temporary objects and scripts."
        )
    if state.world_context is not None:
        context = state.world_context.text(
            objects="live-object-sprites-v1" not in off,
            triggers="coordinate-script-conditions-v1" not in off,
            dialogue="active-field-message-buffer-v1" not in off,
            message=message_phase and "field-dialogue-phase-v1" not in off,
            rules_in_prompt=rules,
        )
        if context != "":
            lines.append(context)
    # offscreen-objects-v1: the map's objects the window above leaves out, and their tiles.
    offscreen = (
        state.offscreen_objects
        if OFFSCREEN not in off and "live-object-sprites-v1" not in off
        else None
    )
    if offscreen is not None and state.map_id is not None:
        lines.append(offscreen_text(offscreen, state.map_id))
    if state.static_npc_templates is not None and "static-npc-template-approach-v1" not in off:
        lines.append(
            "Static scripted object templates on this map "
            "(current presence and position unverified; scripts may relocate them):"
        )
        for template in state.static_npc_templates.templates:
            template_target_text = (
                f'; navigate_to_target target {{"kind":"static_object",'
                f'"local_id":{template.local_id}}}'
                if "semantic-navigation-v1" not in off or "semantic-navigation-v2" not in off
                else ""
            )
            lines.append(
                f"- object {template.local_id} template at ({template.x},{template.y}); "
                f"approach only, no interaction{template_target_text}"
            )
    # semantic-navigation-v2: listed targets carry the navigate_to_target argument.
    semantic = SEMANTIC_V2 not in off and "world-targets-v1" not in off
    if state.story_characters is not None and "character-presence-v1" not in off:
        lines.append(
            state.story_characters.text(
                None if offscreen is None else {o.local_id: o for o in offscreen},
                listed_objects(state.interaction_targets) if semantic else None,
            )
        )
    # surf-gated-exits-v1: exits reachable only across water while Surf cannot be used.
    gate = state.surf_gate if SURF_GATE not in off else None
    # surf-gated-exits-v2: the notes name no badge and no move.
    plain = SURF_GATE_V2 not in off

    # exit-reachability-v1: exits reachable neither on foot nor across water from here.
    reach = state.exit_reach if EXIT_REACH not in off else None
    # field-move-gates-v1: the closed obstacles and the exits every way to which passes one.
    field = state.field_obstacles if reach is not None and FIELD_MOVES not in off else None
    # The names the Warp destination lines use (OFF of named-warp-destinations-v1 keeps the
    # internal map-table names, as those lines do).
    names = (
        {(g, n): places.get((g, n), name) for g, n, name in state.destination_names}
        if destinations is None
        else destinations
    )

    def across(t: InteractionTarget) -> bool:
        return gate is not None and t.kind == "warp" and gate.blocks_warp(t.x, t.y)

    def cut_off(t: InteractionTarget) -> bool:
        return reach is not None and t.kind == "warp" and reach.blocks_warp(t.x, t.y)

    def warp_note(t: InteractionTarget) -> str:
        obstacle = None if field is None else field.warp_note(t.x, t.y)
        return (
            gate.warp_note(plain=plain)
            if gate is not None and across(t)
            else (obstacle or reach.warp_note())
            if reach is not None and cut_off(t)
            else ""
        )

    def warp_name(tile: tuple[int, int]) -> str:
        target = next(
            (
                t
                for t in state.interaction_targets or ()
                if t.kind == "warp" and (t.x, t.y) == tile and t.destination is not None
            ),
            None,
        )
        at = f"({tile[0]},{tile[1]})"
        if target is None or target.destination is None:
            return at
        if tile in warp_labels:
            return f"{at} -> {warp_labels[tile]}"
        g, n, _ = target.destination
        if (g, n) == (127, 127):
            return f"{at} -> {dynamic or 'dynamic destination'}"
        return f"{at} -> {names.get((g, n), f'map {g}/{n}')} (map {g}/{n})"

    def connection_name(key: ConnectionKey) -> str:
        direction, (g, n), offset = key
        if sections is not None:
            label = next(
                (
                    c.label
                    for c in sections.connections
                    if (c.direction, c.offset, c.destination) == (direction, offset, (g, n))
                ),
                None,
            )
            if label is not None:
                return f"{direction} edge -> {label}"
        return f"{direction} edge -> {names.get((g, n), f'map {g}/{n}')} (map {g}/{n})"

    unavailable = []
    if "world-targets-v1" not in off:
        for t in unavailable_warps:
            if t.destination is None:
                continue
            g, n, _ = t.destination
            # Reuse the same provenance-filtered names as the original choices.
            label = warp_labels.get((t.x, t.y)) or (
                dynamic or "dynamic destination"
                if (g, n) == (127, 127)
                else names.get((g, n), f"map {g}/{n}")
            )
            reason = (
                "crosses water you cannot cross yet"
                if across(t)
                else "not reachable on foot from where you stand"
            )
            unavailable.append(f"warp ({t.x},{t.y}) → {label} ({reason})")
    if world_destinations and "world-destinations-v1" not in off:
        for c in unavailable_connections:
            reason = (
                "crosses water you cannot cross yet"
                if gate is not None and gate.blocks_connection(c.direction)
                else "not reachable on foot from where you stand"
            )
            unavailable.append(
                f"{c.direction} edge → {names.get(c.destination, c.destination_name)} ({reason})"
            )
    if unavailable:
        lines.append("Unavailable from here: " + "; ".join(unavailable))

    if field is not None:
        lines.extend(field.lines(warp_name, connection_name))

    def distinct(t: InteractionTarget) -> bool:
        # semantic-navigation-v2: the tool tells these apart by kind and tile only.
        return t.kind == "object" or same_tile(state.interaction_targets, t) == 1

    if state.interaction_targets is not None and "world-targets-v1" not in off:
        lines.append("Map interaction candidates (world coordinates; flags/scripts may gate use):")

        def target_text(t: InteractionTarget) -> str:
            name = (
                switch_name(puzzle_map, state.map_id, t.x, t.y)
                if t.kind == "coordinate_trigger"
                else None
            )
            return (replace(t, name=name) if name is not None else t).text(
                named=name is not None
                or (
                    observation is not None
                    and t.name is not None
                    and any(
                        (e.x, e.y) == (t.x, t.y)
                        and e.edge is None
                        and (
                            (t.kind == "coordinate_trigger" and e.kind == "switch")
                            or (
                                (t.kind == "background" or t.kind.startswith("metatile_"))
                                and e.kind in ("door", "generator")
                            )
                        )
                        for e in observation.elements
                    )
                )
                or (named_interactions and "named-interactions-v1" not in off),
                destinations=destinations,
                dynamic=dynamic,
                warp_label=warp_labels.get((t.x, t.y)) if t.kind == "warp" else None,
            )

        lines.extend(
            target_text(t)
            + warp_note(t)
            + (
                interaction_suffix(t)
                if semantic and not cut_off(t) and not across(t) and distinct(t)
                else ""
            )
            for t in state.interaction_targets
        )
    if bounded_navigation and "bounded-navigation-v1" not in off and state.map_id is not None:
        lines.append(f"Navigation map_id: [{state.map_id[0]},{state.map_id[1]}] (current map only)")
    if world_destinations and "world-destinations-v1" not in off:
        notes = (
            {}
            if state.topology is None
            else connection_notes(state.topology, gate, reach, plain=plain, field=field)
        )
        lines.append(
            "Map topology: unavailable"
            if state.topology is None
            else state.topology.text(
                notes or None,
                targets=SEMANTIC_V2 not in off,
                labels=None
                if sections is None
                else {
                    i: label.label
                    for i, connection in enumerate(state.topology.connections)
                    for label in sections.connections
                    if (label.direction, label.offset, label.destination)
                    == (connection.direction, connection.offset, connection.destination)
                },
            )
        )
        if state.interaction_targets is not None:
            # ON reuses the same provenance-filtered owner as the map and interaction lines.
            # OFF preserves the incumbent internal-map-table rendering byte for byte (names).
            for target in state.interaction_targets:
                if target.destination is not None:
                    if (
                        sections is not None
                        and (
                            section_exit := next(
                                (w for w in sections.warps if (w.x, w.y) == (target.x, target.y)),
                                None,
                            )
                        )
                        is not None
                    ):
                        lines.append(
                            f"Warp destination at ({target.x},{target.y}): "
                            f"{section_exit.label}{warp_note(target)}. {section_exit.detail}"
                        )
                        continue
                    g, n, _ = target.destination
                    name = (
                        dynamic or "dynamic destination"
                        if (g, n) == (127, 127)
                        else names.get(
                            (g, n),
                            f"unknown map {g}/{n}" if destinations is None else f"map {g}/{n}",
                        )
                    )
                    labelled = labels is not None and name == names.get((g, n))
                    lines.append(
                        f"Warp destination at ({target.x},{target.y}): {name}"
                        + (f" (map {g}/{n})" if labelled else "")
                        + (
                            gate.destination_note(plain=plain)
                            if gate is not None and across(target)
                            else reach.destination_note()
                            if reach is not None and cut_off(target)
                            else ""
                        )
                        + (
                            (labels.arrival(target.x, target.y) or "")
                            if labels is not None and labelled
                            else ""
                        )
                    )
    return "\n".join(lines)


def connection_notes(
    topology: Topology,
    gate: SurfGate | None,
    reach: ExitReach | None,
    *,
    plain: bool = False,
    field: FieldObstacles[ConnectionKey] | None = None,
) -> dict[int, str]:
    """The note each map connection line carries instead of its walk-off instruction, by index.

    surf-gated-exits-v1 by direction, as before; exit-reachability-v1 per connection, naming the
    obstacles every way passes with field-move-gates-v1.
    """
    notes: dict[int, str] = {}
    for i, c in enumerate(topology.connections):
        if gate is not None and gate.blocks_connection(c.direction):
            notes[i] = gate.connection_note(plain=plain)
        elif reach is not None and reach.blocks_connection(c.direction, c.destination, c.offset):
            obstacle = (
                None
                if field is None
                else field.connection_note((c.direction, c.destination, c.offset))
            )
            notes[i] = obstacle or reach.connection_note()
    return notes


def _location_display(state: GameState) -> dict[str, str]:
    # displayed-place-names-v1: the Location line's name; absent when the switch is off.
    shown = next((name for g, n, name in state.displayed_places if (g, n) == state.map_id), None)
    return {} if shown is None else {"location_display": shown}


def _grid_objects(
    state: GameState, objects: tuple[tuple[int, int, int], ...], radius: int | None
) -> list[dict[str, int]]:
    """elevation-aware-map-v1: one entry per occupied tile and object, with its elevation.

    Off (no elevations read): the listed objects' current tiles, as before.
    """
    if state.object_elevations is None or state.position is None:
        return [{"x": x, "y": y} for _, x, y in objects]
    px, py = state.position
    return [
        {"x": x, "y": y, "elevation": e}
        for x, y, e in state.object_elevations
        if radius is None or (abs(x - px) <= radius and abs(y - py) <= radius)
    ]


def state_json(state: GameState) -> dict[str, object]:
    # map_grid exists only with full-map-navigation-v1 or window-escape-route-v1,
    # so switch-off state is unchanged.
    full: dict[str, object] = (
        {}
        if state.full_map is None
        else {
            "map_grid": state.full_map.json(state.player_elevation)
            | {"objects": _grid_objects(state, state.full_map.objects, None)}
        }
    )
    # exp-next-level-v1: the NEXT LV. numbers, for the agent's Training block; absent when off.
    if state.party_next_level is not None:
        full = {**full, "party_next_level": list(state.party_next_level)}
    if state.map_observation is not None:
        full = {**full, "map_observation": state.map_observation.json()}
    return {
        **full,
        **(
            {}
            if state.static_npc_templates is None
            else {"static_npc_templates": state.static_npc_templates.json()}
        ),
        "screen": state.screen,
        "active_ui": None if state.active_ui is None else state.active_ui.json(),
        "story": None if state.story is None else state.story.json(),
        "naming": None if state.naming is None else state.naming.json(),
        "world_context": None if state.world_context is None else state.world_context.json(),
        "field_controls_locked": state.field_controls_locked,
        "local_map": state.local_map,
        "topology": None if state.topology is None else state.topology.json(),
        "navigation_grid": None
        if state.nearby is None or not state.nearby.tiles
        else {
            "elevation": state.player_elevation,
            "tiles": [
                {
                    "x": t.x,
                    "y": t.y,
                    "collision": t.collision,
                    "behavior": t.behavior,
                    "elevation": t.elevation,
                }
                for t in state.nearby.tiles
            ],
            "objects": _grid_objects(state, state.nearby.objects, 7),
            "warps": [{"x": x, "y": y} for x, y, _, _ in state.nearby.warps],
        },
        "interaction_targets": None
        if state.interaction_targets is None
        else [t.json() for t in state.interaction_targets],
        # semantic-navigation-v1: absent when off, preserving incumbent state bytes.
        **(
            {}
            if state.interaction_object_slots is None
            else {
                "interaction_object_slots": [slot.json() for slot in state.interaction_object_slots]
            }
        ),
        "started": state.started,
        "name": state.name,
        "location": state.location,
        **_location_display(state),
        **({} if state.exit_sections is None else {"exit_sections": state.exit_sections.json()}),
        "map_id": None if state.map_id is None else list(state.map_id),
        "position": None
        if state.position is None
        else {"x": state.position[0], "y": state.position[1]},
        "facing": state.facing,
        "in_battle": state.in_battle,
        # tutorial-party-owner-v1: left out when ownership could not be established.
        **({} if state.party_owner is None else {"party_owner": state.party_owner}),
        "party_ownership": None if state.party_ownership is None else state.party_ownership.json(),
        "party": [asdict(mon) for mon in state.party or ()],
        "game_stats": state.game_stats,
        "story_progress": None if state.story_progress is None else state.story_progress.json(),
        "route103_rival": None if state.route103_rival is None else state.route103_rival.json(),
        "trainer_opponent": None
        if state.trainer_opponent is None
        else state.trainer_opponent.json(),
        "resources": None if state.resources is None else state.resources.json(),
        "battle": None if state.battle is None else state.battle.json(),
        "running": None if state.running is None else state.running.json(),
        "blackout_active": state.blackout_active,
        "money": state.money,
        "badges": list(state.badges or ()),
        "play_time_s": _play_seconds(state),
        # surf-gated-exits-v1: present only with the switch, so switch-off state is unchanged.
        **({} if state.surf_gate is None else {"surf_gate": state.surf_gate.json()}),
        # exit-reachability-v1: present only with the switch, so switch-off state is unchanged.
        **({} if state.exit_reach is None else {"exit_reach": state.exit_reach.json()}),
        # field-move-gates-v1: present only with the switch, so switch-off state is unchanged.
        **(
            {}
            if state.field_obstacles is None
            else {"field_obstacles": state.field_obstacles.json()}
        ),
        # heal-before-trainers-v1: present only with the switch, so switch-off state is unchanged.
        **(
            {}
            if state.heal_trainers is None
            else {"heal_before_trainers": state.heal_trainers.json()}
        ),
        # type-gap-team-v1: present only with the switch, so switch-off state is unchanged.
        **({} if state.type_gap is None else {"type_gap": state.type_gap.json()}),
    }
