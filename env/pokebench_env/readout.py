"""The model's text readout and the typed JSON state, both from `GameState`."""

from pokebench_env.game_state import GameState

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


def format_readout(state: GameState) -> str:
    dialog = "none" if state.dialog is None else f'"{state.dialog}"'
    lines = [f"Screen: {state.screen}", f"Dialog: {dialog}", _menu(state)]
    if state.active_ui is not None:
        lines.append(state.active_ui.text())
    if state.story is not None:
        lines.append(state.story.text())
    if state.naming is not None:
        lines.append(state.naming.readout())
    if not state.started or state.position is None:
        return "\n".join([*lines, PRE_GAME_TEXT])
    x, y = state.position
    facing = "" if state.facing is None else f", facing {state.facing}"
    party = "; ".join(f"{m.species} Lv{m.level} HP {m.hp}/{m.max_hp}" for m in state.party or ())
    lines += [
        f"Player: {state.name}",
        f"Location: {state.location}",
        f"Position: X={x}, Y={y}{facing}",
        f"Party: {party or 'none'}",
        f"Money: ₽{state.money}",
        f"Badges: {', '.join(state.badges or ()) or 'none'}",
        f"In battle: {'yes' if state.in_battle else 'no'}",
        f"Play time: {_clock(_play_seconds(state) or 0)}",
    ]
    if state.field_controls_locked is not None:
        lines.append(
            "Field controls: locked (dialog, menu, or script; direction presses cannot move)"
            if state.field_controls_locked
            else "Field controls: available (terrain and objects can still block a direction)"
        )
    if state.local_map is not None:
        lines.append(state.local_map)
    if state.world_context is not None:
        lines.append(state.world_context.text())
    if state.interaction_targets is not None:
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
