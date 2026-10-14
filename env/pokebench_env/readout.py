"""The model's text readout and the typed JSON state, both from `GameState`.

Observation switches (harness feature ids, set per run) remove their own text
from the readout only; the typed JSON state used for measurement is unchanged.
"""

from collections.abc import Mapping
from dataclasses import asdict, replace

from pokebench_env.game_state import GameState

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
    "field-dialogue-phase-v1",
    "active-field-message-buffer-v1",
    "naming-cursor-v1",
    "story-state-v1",
    "coordinate-script-conditions-v1",
    "field-control-lock",
    "warp-activation-guidance-v1",
    "ledge-hops-v1",
    "one-way-tiles-v1",
)


def features_off_from_env(env: Mapping[str, str]) -> frozenset[str]:
    raw = env.get(
        "POKEBENCH_FEATURES_OFF",
        "named-interactions-v1,world-destinations-v1,bounded-navigation-v1,expanded-menu-battle-information-v1,field-dialogue-phase-v1",
    )
    if raw == "":
        return frozenset()
    ids = raw.split(",")
    if any(item not in SERVER_FEATURES for item in ids):
        raise ValueError(f"POKEBENCH_FEATURES_OFF names an unknown observation feature: {raw!r}")
    return frozenset(ids)


PRE_GAME_TEXT = "Game not started: no save data (player, location, party) exists yet."


def _clock(seconds: int) -> str:
    return f"{seconds // 3600}:{seconds // 60 % 60:02d}:{seconds % 60:02d}"


def _play_seconds(state: GameState) -> int | None:
    if state.play_time is None:
        return None
    hours, minutes, seconds = state.play_time
    return hours * 3600 + minutes * 60 + seconds


def _menu(state: GameState) -> str:
    if state.active_ui is not None and state.active_ui.selected is not None:
        return f"Menu: {state.active_ui.phase}; selected {state.active_ui.selected}"
    if state.menu is None:
        return "Menu: unavailable (active owner not verified)"
    return (
        f"Unverified menu buffer: cursor {state.menu.selected} of {state.menu.options}"
        "; active menu owner unavailable"
    )


def format_readout(
    state: GameState,
    off: frozenset[str] = frozenset(),
    *,
    named_interactions: bool = False,
    world_destinations: bool = False,
    bounded_navigation: bool = False,
    message_phase: bool = False,
) -> str:
    if "ram-state-v1" in off:
        return ""
    expanded = "expanded-menu-battle-information-v1" not in off
    ui = state.active_ui
    from pokebench_env.ui_state import BIRCH_PHASES, CLOCK_PHASES

    incumbent_phases = {
        *BIRCH_PHASES.values(),
        *CLOCK_PHASES.values(),
        "unsupported",
        "naming_transition",
        "field_transition",
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
        lines = [f"Screen: {state.screen}", f"Dialog: {dialog}", _menu(state)]
        if ui is not None:
            lines.append((ui if expanded else replace(ui, details=None)).text())
    if state.resources is not None:
        if expanded and state.resources.bag is not None:
            lines.append(
                "Bag: "
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
        if expanded:
            lines.append(
                f"Battle state: {battle.phase}; input {battle.ready}; "
                f"turn {battle.turn}; outcome {battle.outcome}"
            )
            if battle.playback is not None:
                lines.append(
                    f"Battle playback: {battle.playback.controls}; "
                    f"stoppable {battle.playback.stoppable}; finished {battle.playback.finished}"
                )
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
            if battle.current_execution is not None:
                execution = battle.current_execution
                lines.append(
                    f"Battle execution: {execution.phase}; attacker {execution.attacker}; "
                    f"target {execution.target}; move ID {execution.move_id}; "
                    f"result flags {execution.move_result_flags}. "
                    "Completion and damage are separate recorded signals."
                )
        else:
            lines.append("Battle details: unprovided")
    if state.story is not None and "story-state-v1" not in off:
        lines.append(state.story.text())
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
        return "\n".join(
            [*lines, "Save-backed world state unavailable: save data is not initialized or valid."]
        )
    x, y = state.position
    facing = "" if state.facing is None else f", facing {state.facing}"
    party = "; ".join(
        f"{m.species or 'UNKNOWN'} Lv{m.level} HP {m.hp}/{m.max_hp}"
        + (f" · STATUS {m.status}" if expanded and m.status else "")
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
        for m in state.party or ()
    )
    lines += [f"Player: {state.name}", f"Location: {state.location}"]
    if "live-player-position-v1" not in off:
        lines.append(f"Position: X={x}, Y={y}{facing}")
    lines += [
        f"Party ({state.party_owner}): {party or 'none'}",
        f"Money: ₽{state.money}",
        f"Badges: {', '.join(state.badges or ()) or 'none'}",
        f"In battle: {'yes' if state.in_battle else 'no'}",
        f"Play time: {_clock(_play_seconds(state) or 0)}",
    ]
    if state.field_controls_locked is not None and "field-control-lock" not in off:
        lines.append(
            "Field controls: locked (dialog, menu, or script; direction presses cannot move)"
            if state.field_controls_locked
            else "Field controls: available (terrain and objects can still block a direction)"
        )
    if state.local_map is not None and "live-map-v1" not in off:
        lines.append(
            state.nearby.text(
                grid="world-coordinate-grid-v1" not in off,
                warp_guidance="warp-activation-guidance-v1" not in off,
                ledges="ledge-hops-v1" not in off,
                edge_walls="one-way-tiles-v1" not in off,
            )
            if state.nearby is not None
            else state.local_map
        )
    if state.world_context is not None:
        context = state.world_context.text(
            objects="live-object-sprites-v1" not in off,
            triggers="coordinate-script-conditions-v1" not in off,
            dialogue="active-field-message-buffer-v1" not in off,
            message=message_phase and "field-dialogue-phase-v1" not in off,
        )
        if context != "":
            lines.append(context)
    if state.interaction_targets is not None and "world-targets-v1" not in off:
        lines.append("Map interaction candidates (world coordinates; flags/scripts may gate use):")
        lines.extend(
            t.text(named=named_interactions and "named-interactions-v1" not in off)
            for t in state.interaction_targets
        )
    if bounded_navigation and "bounded-navigation-v1" not in off and state.map_id is not None:
        lines.append(f"Navigation map_id: [{state.map_id[0]},{state.map_id[1]}] (current map only)")
    if world_destinations and "world-destinations-v1" not in off:
        lines.append(
            "Map topology: unavailable" if state.topology is None else state.topology.text()
        )
        if state.interaction_targets is not None:
            names = {(g, n): name for g, n, name in state.destination_names}
            for target in state.interaction_targets:
                if target.destination is not None:
                    g, n, _ = target.destination
                    name = (
                        "dynamic destination"
                        if (g, n) == (127, 127)
                        else names.get((g, n), f"unknown map {g}/{n}")
                    )
                    lines.append(f"Warp destination at ({target.x},{target.y}): {name}")
    return "\n".join(lines)


def state_json(state: GameState) -> dict[str, object]:
    return {
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
            "objects": [{"x": x, "y": y} for _, x, y in state.nearby.objects],
            "warps": [{"x": x, "y": y} for x, y, _, _ in state.nearby.warps],
        },
        "interaction_targets": None
        if state.interaction_targets is None
        else [t.json() for t in state.interaction_targets],
        "started": state.started,
        "name": state.name,
        "location": state.location,
        "map_id": None if state.map_id is None else list(state.map_id),
        "position": None
        if state.position is None
        else {"x": state.position[0], "y": state.position[1]},
        "facing": state.facing,
        "in_battle": state.in_battle,
        "party_owner": state.party_owner,
        "party_ownership": None if state.party_ownership is None else state.party_ownership.json(),
        "party": [asdict(mon) for mon in state.party or ()],
        "game_stats": state.game_stats,
        "resources": None if state.resources is None else state.resources.json(),
        "battle": None if state.battle is None else state.battle.json(),
        "running": None if state.running is None else state.running.json(),
        "blackout_active": state.blackout_active,
        "money": state.money,
        "badges": list(state.badges or ()),
        "play_time_s": _play_seconds(state),
    }
