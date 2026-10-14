from pokebench_env.game_state import GameState, PartyMon
from pokebench_env.readout import format_readout, state_json
from pokebench_env.ui_state import Menu

MON_UNKNOWN = dict.fromkeys(
    (
        "identity",
        "language",
        "nickname",
        "nickname_diagnostic",
        "species_id",
        "personality",
        "ot_id",
        "is_egg",
        "status",
        "held_item",
        "experience",
        "moves",
        "decode_mode",
        "diagnostic",
        "raw_hex",
        "held_item_name",
        "cpu_context",
    )
)

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
        "Party (player): TORCHIC Lv5 HP 18/20; POOCHYENA Lv3 HP 0/12\n"
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
    assert "Party (player): none" in text
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
        "party_owner": "player",
        "party_ownership": None,
        "resources": None,
        "battle": None,
        "running": None,
        "party": [
            {"species": "TORCHIC", "level": 5, "hp": 18, "max_hp": 20, **MON_UNKNOWN},
            {"species": "POOCHYENA", "level": 3, "hp": 0, "max_hp": 12, **MON_UNKNOWN},
        ],
        "game_stats": None,
        "blackout_active": None,
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
        "party_owner": "player",
        "party_ownership": None,
        "resources": None,
        "battle": None,
        "running": None,
        "party": [],
        "game_stats": None,
        "blackout_active": None,
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


def test_information_ablation_hides_new_controls_without_hiding_diagnostics_or_typed_state():
    from dataclasses import replace

    from pokebench_env.pokemon import PokemonMove
    from pokebench_env.ui_state import ActiveUi

    state = replace(
        IN_GAME,
        active_ui=ActiveUi(
            "party_menu",
            "MARILL",
            True,
            "A opens actions",
            details={"moves": ["WATER GUN"], "party_slot": 0},
        ),
        party=(replace(IN_GAME.party[0], moves=(PokemonMove(55, 25, 0, "WATER GUN", 25),)),),
    )
    before = state_json(state)
    off = frozenset({"expanded-menu-battle-information-v1"})
    assert "WATER GUN" in format_readout(state)
    hidden = format_readout(state, off)
    assert "WATER GUN" not in hidden
    assert "MARILL" not in hidden
    assert "detailed controls unprovided" in hidden
    assert "TORCHIC Lv5 HP 18/20" in hidden
    assert state_json(state) == before
    bad = replace(state, active_ui=replace(state.active_ui, diagnostic="bad menu owner"))
    assert "STATE COVERAGE ERROR: bad menu owner" in format_readout(bad, off)


def test_continuous_battle_information_treatment_preserves_raw_recording_and_defects():
    from dataclasses import replace

    from test_battle_state import fixture

    from pokebench_env.battle_state import read_battle_state
    from pokebench_env.resources import ResourceDiagnostic, ResourceItem, Resources

    battle = read_battle_state(fixture().read)
    state = replace(
        IN_GAME,
        screen="battle",
        in_battle=True,
        battle=battle,
        resources=Resources(bag=(ResourceItem(0, 13, 1, name="POTION"),)),
        party=(replace(IN_GAME.party[0], nickname="FLAME", status=8),),
    )
    observed = format_readout(state)
    assert "Battle state: input; input True" in observed
    assert "Battler 0 TORCHIC Lv5 HP 18/20" in observed
    assert "SCRATCH PP 35/35" in observed and "selected FIGHT" in observed
    assert "Bag: POTION ×1" in observed and "nickname FLAME" in observed
    off = frozenset({"expanded-menu-battle-information-v1"})
    hidden = format_readout(state, off)
    assert "Battle details: unprovided" in hidden
    assert "SCRATCH" not in hidden and "FLAME" not in hidden and "Bag:" not in hidden
    assert state_json(state)["battle"] == battle.json()
    bad = replace(
        state,
        battle=replace(battle, diagnostic="invalid native battle"),
        resources=Resources(diagnostics=(ResourceDiagnostic("bag", "invalid item", "ff"),)),
        party=(replace(state.party[0], nickname_diagnostic="invalid native nickname"),),
    )
    assert "HARNESS BUG (battle): invalid native battle" in format_readout(bad, off)
    assert "HARNESS BUG (bag): invalid item" in format_readout(bad, off)
    assert "invalid native nickname" in format_readout(bad, off)


def test_daycare_and_party_ownership_defects_survive_information_ablation():
    from dataclasses import replace

    from pokebench_env.daycare import DaycarePokemon
    from pokebench_env.party_ownership import PartyOwnership
    from pokebench_env.resources import Resources

    daycare = DaycarePokemon(0, IN_GAME.party[0], 120, 6)
    ownership = PartyOwnership(None, "unqualified", diagnostic="invalid native owner")
    state = replace(IN_GAME, resources=Resources(daycare=(daycare,)), party_ownership=ownership)
    assert "Daycare: slot 1 TORCHIC Lv6; steps 120" in format_readout(state)
    hidden = format_readout(state, frozenset({"expanded-menu-battle-information-v1"}))
    assert "Daycare:" not in hidden
    assert "HARNESS BUG (party ownership): invalid native owner" in hidden
    assert state_json(state)["party_ownership"] == ownership.json()


def test_playback_and_execution_descriptions_are_separate_from_completed_damage():
    from dataclasses import replace

    from test_battle_state import fixture

    from pokebench_env.battle_state import BattlePlayback, read_battle_state

    battle = read_battle_state(fixture().read)
    state = replace(IN_GAME, battle=replace(battle, playback=BattlePlayback(True, False)))
    assert "B stops playback" in format_readout(state)
    assert "stoppable True; finished False" in format_readout(state)
    assert "B stops playback" not in format_readout(
        state, frozenset({"expanded-menu-battle-information-v1"})
    )
