"""The model's text readout and the typed JSON state, both from `GameState`.

Observation switches (harness feature ids, set per run) remove their own text
from the readout only; the typed JSON state used for measurement is unchanged.
"""

from collections.abc import Mapping

from pokebench_env.game_state import GameState

SERVER_FEATURES = (
    "ram-state-v1",
    "live-map-v1",
    "live-player-position-v1",
    "world-coordinate-grid-v1",
    "live-object-sprites-v1",
    "world-targets-v1",
    "active-field-message-buffer-v1",
    "naming-cursor-v1",
    "story-state-v1",
    "coordinate-script-conditions-v1",
    "field-control-lock",
    "warp-activation-guidance-v1",
)


def features_off_from_env(env: Mapping[str, str]) -> frozenset[str]:
    raw = env.get("POKEBENCH_FEATURES_OFF", "")
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


def format_readout(state: GameState, off: frozenset[str] = frozenset()) -> str:
    if "ram-state-v1" in off:
        return ""
    dialog = "none" if state.dialog is None else f'"{state.dialog}"'
    lines = [f"Screen: {state.screen}", f"Dialog: {dialog}", _menu(state)]
    if state.active_ui is not None:
        lines.append(state.active_ui.text())
    if state.story is not None and "story-state-v1" not in off:
        lines.append(state.story.text())
    if state.naming is not None and "naming-cursor-v1" not in off:
        lines.append(state.naming.readout())
    if not state.started or state.position is None:
        return "\n".join([*lines, PRE_GAME_TEXT])
    x, y = state.position
    facing = "" if state.facing is None else f", facing {state.facing}"
    party = "; ".join(f"{m.species} Lv{m.level} HP {m.hp}/{m.max_hp}" for m in state.party or ())
    lines += [f"Player: {state.name}", f"Location: {state.location}"]
    if "live-player-position-v1" not in off:
        lines.append(f"Position: X={x}, Y={y}{facing}")
    lines += [
        f"Party: {party or 'none'}",
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
            )
            if state.nearby is not None
            else state.local_map
        )
    if state.world_context is not None:
        context = state.world_context.text(
            objects="live-object-sprites-v1" not in off,
            triggers="coordinate-script-conditions-v1" not in off,
            dialogue="active-field-message-buffer-v1" not in off,
        )
        if context != "":
            lines.append(context)
    if state.interaction_targets is not None and "world-targets-v1" not in off:
        lines.append("Map interaction candidates (world coordinates; flags/scripts may gate use):")
        lines.extend(t.text() for t in state.interaction_targets)
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
        "party": [
            {"species": m.species, "level": m.level, "hp": m.hp, "max_hp": m.max_hp}
            for m in state.party or ()
        ],
        "money": state.money,
        "badges": list(state.badges or ()),
        "play_time_s": _play_seconds(state),
    }
