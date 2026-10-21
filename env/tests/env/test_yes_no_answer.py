"""yes-no-answer-readout-v1 against pret/pokeemerald 731ad5bfd6e6f265508d0efcca0ba42f9dcf5881.

Every YES/NO box below is drawn YES above NO; from NO, DPAD_UP reaches YES and from YES,
DPAD_DOWN reaches NO, and A answers the highlighted row. B takes the NO branch in each listed
active_ui phase and battle-script box (Menu_ProcessInputNoWrap callers with
`case MENU_B_PRESSED: case 1:`, Cmd_yesnobox's B sets CURSOR_POSITION 1); the forfeit box
(PlayerHandleYesNoInput) closes on B without choosing, so B is not described there.
"""

import json
from dataclasses import replace
from pathlib import Path

import pytest
from fastapi import FastAPI
from test_view import get

from pokebench_env.battle_state import BattleInput, BattleState
from pokebench_env.battle_text import BattlePrompt
from pokebench_env.game_state import GameState, MapNames
from pokebench_env.readout import SERVER_FEATURES, features_off_from_env, format_readout
from pokebench_env.rerender import read_state, render
from pokebench_env.ui_state import ActiveUi
from pokebench_env.yes_no_answer import FIELD_PROMPTS, SWITCH

YES_LINE = "To answer YES, press UP, then A. Pressing A now answers NO. B also answers NO."
NO_LINE = "To answer NO, press DOWN, then A. Pressing A now answers YES. B also answers NO."

# Every YES/NO box the harness readers recognize, with the source handler checked.
EXPECTED_PHASES = {
    "name_confirmation",
    "clock_confirmation",
    "starter_confirmation",
    "party_cancel_choice_confirmation",
    "party_cancel_participation_confirmation",
    "party_switch_held_item_confirmation",
    "party_toss_held_item_confirmation",
    "party_send_mail_to_pc_confirmation",
    "party_lose_mail_confirmation",
    "party_spin_trade_confirmation",
    "party_field_move_exit_confirmation",
    "party_replace_move_confirmation",
    "party_stop_learning_confirmation",
    "party_switch_item_from_bag_confirmation",
    "evolution_move_confirmation",
    "egg_hatch_nickname_confirmation",
    "pokeblock_feed_confirmation",
    "slots_quit_confirmation",
    "menu_confirmation",
    "shop_purchase_confirmation",
    "bag_tmhm_use_confirmation",
    "bag_toss_confirmation",
    "bag_sell_confirmation",
    "pokeblock_toss_confirmation",
    "pyramid_toss_confirmation",
    "decoration_place_confirmation",
    "decoration_cancel_confirmation",
    "decoration_put_away_confirmation",
    "decoration_stop_put_away_confirmation",
    "decoration_toss_confirmation",
    "secret_base_registry_delete_confirmation",
    "field_confirmation",
    "pc_toss_confirmation",
    "field_yes_no",
    "pc_confirmation",
    "move_relearner_teach_confirmation",
    "move_relearner_exit_confirmation",
    "move_relearner_forget_confirmation",
    "move_relearner_stop_confirmation",
    "save_confirmation",
    "save_overwrite_confirmation",
    "pyramid_retire_confirmation",
    "clear_save_confirmation",
    "frontier_record_confirmation",
    "dodrio_ask_play_again",
    "pokemon_jump_ask_play_again",
    "berry_crush_ask_play_again",
    "berry_blender_play_again",
    "trade_confirm",
    "trade_cancel_confirm",
    "union_room_chat_quit",
    "union_room_chat_save_and_exit",
    "union_room_handle_activity_request",
    "union_room_cancel_registration_prompt",
    "union_room_trade_prompt",
    "wireless_group_confirmation",
    "factory_rental_confirm",
    "factory_swap_confirm",
}
LEFT_OUT = {
    "easy_chat",
    "mystery_gift",
    "union_room_try_accept_chat_request",
    "wireless_leader_confirmation",
    "gender_selection",
    "battle_input",
    "battle_resolving",
}

ON: frozenset[str] = frozenset()
OFF = frozenset({SWITCH})


def field(ui: ActiveUi | None, battle: BattleState | None = None) -> GameState:
    return GameState(
        screen="battle" if battle is not None else "overworld",
        started=True,
        name="GREEN",
        location="GREEN's HOUSE 2F",
        map_id=(1, 1),
        position=(5, 2),
        facing="up",
        in_battle=battle is not None,
        party=(),
        money=3000,
        badges=(),
        play_time=(0, 7, 57),
        active_ui=ui,
        battle=battle,
    )


def ui(phase: str, selected: str | None, ready: bool | None = True, **kw: object) -> ActiveUi:
    return ActiveUi(phase, selected, ready, "UP/DOWN selects; A confirms; B declines", **kw)  # type: ignore[arg-type]


def lines(state: GameState, off: frozenset[str]) -> list[str]:
    return format_readout(state, off).split("\n")


def test_the_listed_prompts_are_exactly_the_grounded_ones() -> None:
    assert set(FIELD_PROMPTS) == EXPECTED_PHASES
    assert not set(FIELD_PROMPTS) & LEFT_OUT


@pytest.mark.parametrize("phase", sorted(EXPECTED_PHASES))
@pytest.mark.parametrize(("selected", "line"), [("NO", YES_LINE), ("YES", NO_LINE)])
def test_line_follows_the_interface_line_for_the_highlighted_option(
    phase: str, selected: str, line: str
) -> None:
    state = field(ui(phase, selected))
    on, off = lines(state, ON), lines(state, OFF)
    at = next(i for i, text in enumerate(on) if text.startswith("Interface: "))
    assert on[at + 1] == line
    assert on[: at + 1] + on[at + 2 :] == off
    assert sum(text.startswith("To answer") for text in on) == 1


@pytest.mark.parametrize(
    "state",
    [
        field(ui("clock_confirmation", None, None, diagnostic="invalid or undrawn menu")),
        field(ui("clock_confirmation", None)),
        field(ui("clock_confirmation", "NO", False)),
        field(ui("clock_confirmation", "NO", None)),
        field(ui("clock_confirmation", "NO", True, diagnostic="coverage error")),
        field(ui("clock_adjustment", None)),
        field(ui("easy_chat", "NO")),
        field(ui("mystery_gift", "YES")),
        field(ui("union_room_try_accept_chat_request", "NO")),
        field(ui("wireless_leader_confirmation", "NO")),
        field(ui("gender_selection", "GIRL")),
        field(ui("party_menu", "TORCHIC")),
        field(None),
    ],
    ids=lambda s: "none" if s.active_ui is None else f"{s.active_ui.phase}-{s.active_ui.selected}",
)
def test_no_line_when_the_selection_is_unknown_not_ready_or_not_a_listed_box(
    state: GameState,
) -> None:
    on = lines(state, ON)
    assert not any(text.startswith("To answer") for text in on)
    assert on == lines(state, OFF)


BATTLE = BattleState(active=True, initialized=True, phase="resolving", ready=False)


@pytest.mark.parametrize("kind", ["learn_move", "stop_learning_move", "yes_no", "nickname_caught"])
@pytest.mark.parametrize(("selected", "line"), [("NO", YES_LINE), ("YES", NO_LINE)])
def test_battle_script_boxes_get_the_line(kind: str, selected: str, line: str) -> None:
    battle = replace(BATTLE, text_phase="prompt", prompt=BattlePrompt(kind, True, selected))  # type: ignore[arg-type]
    state = field(ui("battle_resolving", None, False), battle)
    on = lines(state, ON)
    at = next(i for i, text in enumerate(on) if text.startswith("Interface: "))
    assert on[at + 1] == line
    assert on[: at + 1] + on[at + 2 :] == lines(state, OFF)


@pytest.mark.parametrize(
    "battle",
    [
        replace(BATTLE, text_phase="prompt", prompt=BattlePrompt("yes_no", False, None)),
        replace(BATTLE, text_phase="prompt", prompt=BattlePrompt("yes_no", True, None)),
        replace(BATTLE, text_phase="busy", prompt=BattlePrompt("yes_no", True, "NO")),
        replace(BATTLE, text_phase="prompt", prompt=None),
        replace(BATTLE, player_inputs=(BattleInput(0, 0, "yes_no", False, selected="NO"),)),
        replace(BATTLE, player_inputs=(BattleInput(0, 0, "yes_no", True, selected=None),)),
        replace(BATTLE, player_inputs=(BattleInput(0, 0, "action", True, selected="FIGHT"),)),
    ],
)
def test_battle_boxes_that_are_not_ready_or_unknown_get_nothing(battle: BattleState) -> None:
    state = field(ui("battle_resolving", None, False), battle)
    assert not any(text.startswith("To answer") for text in lines(state, ON))


@pytest.mark.parametrize(
    ("selected", "line"),
    [
        ("NO", "To answer YES, press UP, then A. Pressing A now answers NO."),
        ("YES", "To answer NO, press DOWN, then A. Pressing A now answers YES."),
    ],
)
def test_forfeit_box_gets_the_line_without_b(selected: str, line: str) -> None:
    battle = replace(BATTLE, player_inputs=(BattleInput(0, 0, "yes_no", True, selected=selected),))
    state = field(ui("battle_input", f"battler 0: {selected}", True), battle)
    on = lines(state, ON)
    at = next(i for i, text in enumerate(on) if text.startswith("Interface: "))
    assert on[at + 1] == line


def test_off_golden_is_todays_readout() -> None:
    state = field(
        ActiveUi(
            "clock_confirmation",
            "NO",
            True,
            "UP/DOWN selects; A accepts selection; B returns to adjustment",
            value="11:24 AM",
        )
    )
    assert format_readout(state, OFF) == (
        "Screen: overworld\n"
        "Dialog: none\n"
        "Menu: clock_confirmation; selected NO\n"
        "Interface: clock_confirmation; input ready; selected NO; value 11:24 AM; "
        "UP/DOWN selects; A accepts selection; B returns to adjustment\n"
        "Player: GREEN\n"
        "Location: GREEN's HOUSE 2F\n"
        "Position: X=5, Y=2, facing up\n"
        "Party (player): none\n"
        "Money: ₽3000\n"
        "Badges: none\n"
        "In battle: no\n"
        "Play time: 0:07:57"
    )


def test_switch_is_a_default_off_server_feature() -> None:
    assert SERVER_FEATURES[-10] == SWITCH
    assert SWITCH in features_off_from_env({})
    assert SWITCH not in features_off_from_env({"POKEBENCH_FEATURES_OFF": ""})


# --- ef9f evidence: turn 156 saw the clock confirmation with NO highlighted ---

FIXTURE = json.loads((Path(__file__).parent / "fixtures/yes-no-ef9f-1468.json").read_text())


def fixture_read(address: int, length: int) -> bytes:
    key = f"{address:#x}:{length}"
    if key not in FIXTURE["memory"]:
        raise ValueError(f"read outside the fixture {key}")
    return bytes.fromhex(FIXTURE["memory"][key])


def test_ef9f_turn_156_state_reads_the_clock_box_and_says_how_to_answer_yes() -> None:
    assert FIXTURE["source"]["sequence"] == 1468 and FIXTURE["event_seq"] == 3902
    recorded = FIXTURE["recorded_readout"].split("\n")
    default_off = features_off_from_env({})
    state = read_state(fixture_read, MapNames({}), active_ui=True, off=default_off)
    assert state.active_ui is not None and state.active_ui.selected == "NO"
    off_text = render(state, default_off).split("\n")
    on_text = render(state, default_off - {SWITCH}).split("\n")
    # OFF: the Screen..Interface lines the model was shown, byte for byte.
    assert (
        off_text[:4]
        == recorded[:4]
        == [
            "Screen: clock",
            "Dialog: none",
            "Menu: clock_confirmation; selected NO",
            "Interface: clock_confirmation; input ready; selected NO; value 11:24 AM; "
            "UP/DOWN selects; A accepts selection; B returns to adjustment",
        ]
    )
    assert on_text[4] == YES_LINE
    assert on_text[:4] + on_text[5:] == off_text


def test_production_observation_route_honours_the_switch(monkeypatch: pytest.MonkeyPatch) -> None:
    from test_feature_switches import _Shot

    from pokebench_env.observation import install_observation

    texts = {}
    for switch_off in (True, False):
        off = features_off_from_env({}) - (set() if switch_off else {SWITCH})
        monkeypatch.setenv("POKEBENCH_FEATURES_OFF", ",".join(sorted(off)))
        monkeypatch.setenv("POKEBENCH_ACTIVE_UI", "1")
        app = FastAPI()
        install_observation(app, lambda: _Shot(), fixture_read, MapNames({}))
        status, _, body = get(app, "/pokebench/observation")
        assert status == 200, body
        texts[switch_off] = json.loads(body)["state_text"]
    assert YES_LINE not in texts[True]
    assert f"B returns to adjustment\n{YES_LINE}\n" in texts[False]
    assert texts[False].replace(f"{YES_LINE}\n", "") == texts[True]
