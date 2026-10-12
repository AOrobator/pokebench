from pokebench_env.game_state import GameState, PartyMon
from pokebench_env.readout import format_readout, state_json

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
        "Screen: naming\nGame not started: no save data (player, location, party) exists yet."
    )


def test_state_json_is_plain_json() -> None:
    assert state_json(IN_GAME) == {
        "screen": "overworld",
        "naming": None,
        "field_controls_locked": None,
        "local_map": None,
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
        "naming": None,
        "field_controls_locked": None,
        "local_map": None,
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
