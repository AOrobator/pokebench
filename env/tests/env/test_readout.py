from pokebench_env.game_state import GameState, PartyMon
from pokebench_env.readout import format_readout, state_json
from pokebench_env.ui_state import Menu

IN_GAME = GameState(
    screen="overworld",
    started=True,
    name="MAY",
    location="LITTLEROOT TOWN",
    map_id=(0, 9),
    position=(7, 9),
    facing="right",
    in_battle=False,
    party=(PartyMon("TORCHIC", 5, 18, 20), PartyMon("POOCHYENA", 3, 0, 12)),
    money=3000,
    badges=("STONE",),
    play_time=(1, 2, 3),
)

PRE_GAME = GameState("naming", False, None, None, None, None, None, False, None, None, None, None)


def test_in_game_readout_lists_every_field() -> None:
    assert format_readout(IN_GAME) == (
        "Screen: overworld\n"
        "Dialog: none\n"
        "Menu: unavailable (active owner not verified)\n"
        "Player: MAY\n"
        "Location: LITTLEROOT TOWN\n"
        "Position: X=7, Y=9, facing right\n"
        "Party: TORCHIC Lv5 HP 18/20; POOCHYENA Lv3 HP 0/12\n"
        "Money: ₽3000\n"
        "Badges: STONE\n"
        "In battle: no\n"
        "Play time: 1:02:03"
    )


def test_empty_party_badges_unknown_facing_and_battle() -> None:
    state = GameState(
        **{**IN_GAME.__dict__, "party": (), "badges": (), "facing": None, "in_battle": True}
    )
    text = format_readout(state)
    assert "Party: none" in text
    assert "Badges: none" in text
    assert "Position: X=7, Y=9\n" in text
    assert "In battle: yes" in text


def test_pre_game_readout_reports_only_the_screen() -> None:
    assert format_readout(PRE_GAME) == (
        "Screen: naming\nDialog: none\nMenu: unavailable (active owner not verified)\n"
        "Game not started: no save data (player, location, party) exists yet."
    )


def test_open_dialog_and_menu_lead_the_readout() -> None:
    state = GameState(
        **{**PRE_GAME.__dict__, "dialog": "So it's A?", "menu": Menu(selected=2, options=2)}
    )
    assert format_readout(state).splitlines()[:3] == [
        "Screen: naming",
        'Dialog: "So it\'s A?"',
        "Unverified menu buffer: cursor 2 of 2; active menu owner unavailable",
    ]


def test_state_json_is_plain_json() -> None:
    assert state_json(IN_GAME) == {
        "screen": "overworld",
        "active_ui": None,
        "story": None,
        "naming": None,
        "world_context": None,
        "field_controls_locked": None,
        "local_map": None,
        "topology": None,
        "navigation_grid": None,
        "interaction_targets": None,
        "started": True,
        "name": "MAY",
        "location": "LITTLEROOT TOWN",
        "map_id": [0, 9],
        "position": {"x": 7, "y": 9},
        "facing": "right",
        "in_battle": False,
        "party": [
            {"species": "TORCHIC", "level": 5, "hp": 18, "max_hp": 20},
            {"species": "POOCHYENA", "level": 3, "hp": 0, "max_hp": 12},
        ],
        "money": 3000,
        "badges": ["STONE"],
        "play_time_s": 3723,
    }
    assert state_json(PRE_GAME) == {
        "screen": "naming",
        "active_ui": None,
        "story": None,
        "naming": None,
        "world_context": None,
        "field_controls_locked": None,
        "local_map": None,
        "topology": None,
        "navigation_grid": None,
        "interaction_targets": None,
        "started": False,
        "name": None,
        "location": None,
        "map_id": None,
        "position": None,
        "facing": None,
        "in_battle": False,
        "party": [],
        "money": None,
        "badges": [],
        "play_time_s": None,
    }


def test_locked_controls_warn_that_directions_cannot_move() -> None:
    state = GameState(**{**IN_GAME.__dict__, "field_controls_locked": True})
    assert (
        "Field controls: locked (dialog, menu, or script; direction presses cannot move)"
        in format_readout(state)
    )
    assert state_json(state)["field_controls_locked"] is True


def test_available_controls_still_allow_for_collision() -> None:
    state = GameState(**{**IN_GAME.__dict__, "field_controls_locked": False})
    assert "terrain and objects can still block a direction" in format_readout(state)
    assert state_json(state)["field_controls_locked"] is False


def test_live_map_is_in_the_model_readout_and_state_json() -> None:
    state = GameState(**{**IN_GAME.__dict__, "local_map": "Local map from live memory:\n.@N"})
    assert format_readout(state).endswith("Local map from live memory:\n.@N")
    assert state_json(state)["local_map"] == state.local_map


def test_active_ui_is_in_exact_model_text_and_json() -> None:
    from dataclasses import replace

    from pokebench_env.ui_state import ActiveUi

    ui = ActiveUi("name_confirmation", "NO", True, "UP/DOWN selects; B declines")
    state = replace(IN_GAME, active_ui=ui)
    assert "Interface: name_confirmation; input ready; selected NO" in format_readout(state)
    assert state_json(state)["active_ui"] == ui.json()
    diagnostic = replace(
        state, active_ui=ActiveUi("unsupported", None, None, "Observe", "callback2 0x08039999")
    )
    assert "STATE COVERAGE ERROR: callback2 0x08039999" in format_readout(diagnostic)


def test_verified_menu_does_not_call_its_owner_unavailable() -> None:
    from dataclasses import replace

    from pokebench_env.ui_state import ActiveUi

    state = replace(PRE_GAME, active_ui=ActiveUi("name_confirmation", "YES", True, "A accepts"))
    assert "Menu: name_confirmation; selected YES" in format_readout(state)
    assert "active owner unavailable" not in format_readout(state)
