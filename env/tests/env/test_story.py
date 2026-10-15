import struct

import pytest

from pokebench_env.game_state import read_game_state
from pokebench_env.readout import format_readout, state_json
from tests.env.test_game_state import MAPS, NAMING, OVERWORLD, SB1, game


def test_story_reader_propagates_exact_game_variables_flags_and_text() -> None:
    m = game(OVERWORLD)
    for var, value in [(0x4092, 6), (0x408D, 3), (0x4084, 2), (0x4085, 2), (0x4098, 1)]:
        m.put(SB1 + 0x139C + 2 * (var - 0x4000), struct.pack("<H", value))
    for flag in [0x51, 0x82, 0x8E4, 0x112, 0x74, 0x4F0, 0x867, 0xA5]:
        address = SB1 + 0x1270 + (flag >> 3)
        m.put(address, bytes([m.read(address, 1)[0] | (1 << (flag & 7))]))
    state = read_game_state(m.read, MAPS)
    body = state_json(state)
    from pokebench_env.story import INITIAL_TRAINER_FLAGS

    assert body["story"] == {
        **{field: False for field in INITIAL_TRAINER_FLAGS},
        "name_confirmed": True,
        "intro_stage": 6,
        "rival_stage": 3,
        "birch_lab_stage": 2,
        "petalburg_gym_stage": 2,
        "woods_stage": 1,
        "town_stage": 0,
        "clock_set": True,
        "rival_battle_won": True,
        "pokedex_received": True,
        "running_shoes_received": True,
        "starter_tutorial_complete": True,
        "rustboro_gym_complete": True,
        "stone_badge": True,
        "rock_tomb_received": True,
        "rustboro_josh_defeated": None,
        "rustboro_tommy_defeated": None,
        "rustboro_marc_defeated": None,
    }
    assert "clock set; rival met; Birch rescue complete" in format_readout(state)
    # Adjacent bits do not certify an event.
    m.put(SB1 + 0x1270 + (0x51 >> 3), b"\xfd")
    assert state_json(read_game_state(m.read, MAPS))["story"]["clock_set"] is False


def test_story_does_not_expose_save_defaults_before_gameplay() -> None:
    body = state_json(read_game_state(game(NAMING).read, MAPS))
    assert body["story"]["clock_set"] is None
    assert body["story"]["intro_stage"] is None


def test_name_confirmation_requires_the_post_yes_task_and_active_owner() -> None:
    from pokebench_env.game_screen import read_screen
    from pokebench_env.story import read_story

    m = game((0, 0x0802F6B1))
    m.put(0x03005E00, struct.pack("<I", 0x08031189) + b"\x01")
    assert read_story(m.read, read_screen(m.read)).name_confirmed is False
    m.put(0x03005E00, struct.pack("<I", 0x08031221) + b"\x01")
    assert read_story(m.read, read_screen(m.read)).name_confirmed is True
    m.put(0x03005E00 + 4, b"\x00")
    assert read_story(m.read, read_screen(m.read)).name_confirmed is None
    m.put(0x03005E00 + 4, b"\x01")
    m.put(0x030022C0, struct.pack("<II", 0, 0x080AA7A5))
    assert read_story(m.read, read_screen(m.read)).name_confirmed is None


def test_invalid_variable_pointer_or_short_memory_stays_unavailable() -> None:
    from pokebench_env.game_screen import read_screen
    from pokebench_env.story import read_story

    m = game(OVERWORLD)
    m.put(SB1 + 0x139C + 2 * (0x4092 - 0x4000), b"\xff\xff")
    s = read_story(m.read, read_screen(m.read), SB1)
    assert s.intro_stage is None and s.clock_set is False
    assert read_story(m.read, read_screen(m.read), 0).clock_set is None
    with pytest.raises(ValueError, match="short story read"):
        read_story(lambda _a, _n: b"", read_screen(m.read), SB1)


@pytest.mark.parametrize(
    ("field", "flag"),
    [
        ("clock_set", 0x51),
        ("rival_battle_won", 0x82),
        ("pokedex_received", 0x8E4),
        ("running_shoes_received", 0x112),
        ("starter_tutorial_complete", 0x74),
        ("rustboro_gym_complete", 0x4F0),
        ("stone_badge", 0x867),
        ("rock_tomb_received", 0xA5),
    ],
)
def test_each_flag_bit_is_independently_grounded(field: str, flag: int) -> None:
    from pokebench_env.story import FLAG_FIELDS

    m = game(OVERWORLD)
    m.put(SB1 + 0x1270 + (flag >> 3), bytes([1 << (flag & 7)]))
    body = state_json(read_game_state(m.read, MAPS))["story"]
    assert {key: body[key] for key in FLAG_FIELDS} == {key: key == field for key in FLAG_FIELDS}


@pytest.mark.parametrize(
    ("field", "variable", "value"),
    [
        ("intro_stage", 0x4092, 6),
        ("rival_stage", 0x408D, 3),
        ("birch_lab_stage", 0x4084, 2),
        ("petalburg_gym_stage", 0x4085, 2),
        ("woods_stage", 0x4098, 1),
        ("town_stage", 0x4050, 2),
    ],
)
def test_each_story_variable_is_independently_grounded(
    field: str, variable: int, value: int
) -> None:
    from pokebench_env.story import VAR_FIELDS

    m = game(OVERWORLD)
    m.put(SB1 + 0x139C + 2 * (variable - 0x4000), struct.pack("<H", value))
    body = state_json(read_game_state(m.read, MAPS))["story"]
    assert {key: body[key] for key in VAR_FIELDS} == {
        key: value if key == field else 0 for key in VAR_FIELDS
    }


def test_town_stage_sendoff_is_the_north_exit_commit_not_the_meeting() -> None:
    from pokebench_env.game_screen import read_screen
    from pokebench_env.story import read_story

    def stage(value: int) -> tuple[object, str]:
        m = game(OVERWORLD)
        m.put(SB1 + 0x139C + 2 * (0x4050 - 0x4000), struct.pack("<H", value))
        state = read_game_state(m.read, MAPS)
        return state_json(state)["story"]["town_stage"], format_readout(state)

    assert stage(1)[0] == 1 and "sent to save Birch" not in stage(1)[1]
    assert stage(2)[0] == 2 and "sent to save Birch" in stage(2)[1]
    assert stage(4)[0] == 4 and "sent to save Birch" in stage(4)[1]
    # The next save variable is not town state. An out-of-range value stays unknown.
    m = game(OVERWORLD)
    m.put(SB1 + 0x139C + 2 * (0x4051 - 0x4000), struct.pack("<H", 2))
    m.put(SB1 + 0x139C + 2 * (0x4050 - 0x4000), struct.pack("<H", 5))
    assert read_story(m.read, read_screen(m.read)).town_stage is None


# Exact US-ROM roots from the qualified main_menu.c graph. These precede the
# separate YES acceptance; a screen label or a populated name is insufficient.
PRE_CONFIRMATION_ROOTS = [
    ("Init", 0x080307B1),
    ("WaitToShowBirch", 0x080308B1),
    ("WaitForSpriteFadeInWelcome", 0x08030929),
    ("ThisIsAPokemon", 0x080309CD),
    ("MainSpeech", 0x08030A2D),
    ("AndYouAre", 0x08030BCD),
    ("StartBirchLotadPlatformFade", 0x08030C19),
    ("SlidePlatformAway", 0x08030C91),
    ("StartPlayerFadeIn", 0x08030CD5),
    ("WaitForPlayerFadeIn", 0x08030D85),
    ("BoyOrGirl", 0x08030DC9),
    ("WaitToShowGenderMenu", 0x08030E09),
    ("ChooseGender", 0x08030E39),
    ("SlideOutOldGenderSprite", 0x08030ED5),
    ("SlideInNewGenderSprite", 0x08030F7D),
    ("WhatsYourName", 0x08030FD5),
    ("WaitForWhatsYourNameToPrint", 0x08031015),
    ("WaitPressBeforeNameChoice", 0x08031041),
    ("StartNamingScreen", 0x08031091),
    ("ReturnFromNamingScreenShowTextbox", 0x0803261D),
    ("SoItsPlayerName", 0x08031105),
    ("CreateNameYesNo", 0x08031145),
    ("ProcessNameYesNoMenu", 0x08031189),
]


@pytest.mark.parametrize(
    ("root", "function"), PRE_CONFIRMATION_ROOTS, ids=[name for name, _ in PRE_CONFIRMATION_ROOTS]
)
def test_pre_confirmation_root_reaches_native_json_and_readout(root: str, function: int) -> None:
    m = game((0, 0x0802F6B1))
    m.put(0x03005E00, struct.pack("<IB", function, 1))
    state = read_game_state(m.read, MAPS)
    body = state_json(state)
    assert body["story"]["name_confirmed"] is False, (root, body)
    assert all(value is None for key, value in body["story"].items() if key != "name_confirmed")
    assert body["screen"] == "birch_speech" and body["started"] is False, body
    assert body["name"] is None and body["position"] is None, body
    assert "Story: no completion confirmed" in format_readout(state)


@pytest.mark.parametrize(
    ("callback", "function", "active"),
    [
        (0x0816CC01, 0x08030A2D, 1),  # Intro alone cannot certify a new-game choice.
        (0x080AA7A5, 0x08030A2D, 1),  # Title with stale task bytes.
        (0x080E2E05, 0x08030A2D, 1),  # Shared naming initializer.
        (0x080E4F59, 0x08030A2D, 1),  # Player/Pokemon/box naming share this program.
        (0x0802F6B1, 0x08030A2D, 0),  # Inactive root cannot establish ownership.
        (0x0802F6B1, 0x08030A2D, 2),  # Invalid active flag is not TRUE.
        (0x0802F6B1, 0x08030B15, 1),  # Pokeball helper is not a Birch root.
        (0x0802F6B1, 0x08030A2F, 1),  # Neighboring address is not a named task.
    ],
)
def test_pre_confirmation_requires_exact_active_root_and_callback(
    callback: int, function: int, active: int
) -> None:
    from pokebench_env.game_screen import Screen
    from pokebench_env.story import read_story

    m = game((0, callback))
    m.put(0x03005E00, struct.pack("<IB", function, active))
    observed = read_story(m.read, Screen("birch_speech", 0, callback))
    assert observed.name_confirmed is None, (hex(callback), hex(function), active, observed)


def test_return_from_player_naming_has_negative_evidence_under_its_own_callback() -> None:
    m = game((0, 0x08031679))
    m.put(0x03005E00, struct.pack("<IB", 0x0803261D, 1))
    body = state_json(read_game_state(m.read, MAPS))
    assert body["story"]["name_confirmed"] is False, body


@pytest.mark.parametrize(
    ("function", "expected"),
    [
        (0x08031221, True),
        (0x08031259, True),
        (0x0803133D, True),
        (0x080313E5, True),
        (0x080314C5, True),
        (0x08031581, None),
        (0x080315BD, None),
        (0x08031631, None),
    ],
)
def test_post_yes_roots_never_become_negative(function: int, expected: bool | None) -> None:
    m = game((0, 0x0802F6B1))
    m.put(0x03005E00, struct.pack("<IB", function, 1))
    body = state_json(read_game_state(m.read, MAPS))
    assert body["story"]["name_confirmed"] is expected, (hex(function), body)


def test_existing_positive_owner_keeps_precedence_over_negative_candidate() -> None:
    m = game((0, 0x0802F6B1))
    m.put(0x03005E00, struct.pack("<IB", 0x08030A2D, 1))
    m.put(0x03005E00 + 0x28, struct.pack("<IB", 0x08031221, 1))
    body = state_json(read_game_state(m.read, MAPS))
    assert body["story"]["name_confirmed"] is True, body


GYM_TRAINERS = [
    ("rustboro_josh_defeated", 0x640, "Josh"),
    ("rustboro_tommy_defeated", 0x641, "Tommy"),
    ("rustboro_marc_defeated", 0x73B, "Marc"),
]


def _set_story_flag(memory, flag: int) -> None:
    address = SB1 + 0x1270 + (flag >> 3)
    memory.put(address, bytes([memory.read(address, 1)[0] | (1 << (flag & 7))]))


@pytest.mark.parametrize(("field", "flag", "name"), GYM_TRAINERS)
def test_rustboro_trainer_exact_flag_propagates_independently(field, flag, name) -> None:
    from pokebench_env.story import GYM_TRAINER_FLAGS

    m = game(OVERWORLD)
    _set_story_flag(m, flag)
    state = read_game_state(m.read, MAPS)
    body = state_json(state)["story"]
    assert GYM_TRAINER_FLAGS == {key: bit for key, bit, _ in GYM_TRAINERS}
    assert {key: body[key] for key, _, _ in GYM_TRAINERS} == {
        key: key == field for key, _, _ in GYM_TRAINERS
    }
    assert f"Rustboro Gym {name} defeated" in format_readout(state)
    assert body["rustboro_gym_complete"] is False
    assert body["stone_badge"] is False


@pytest.mark.parametrize(("field", "flag", "name"), GYM_TRAINERS)
def test_rustboro_trainer_adjacent_bit_does_not_certify_defeat(field, flag, name) -> None:
    m = game(OVERWORLD)
    _set_story_flag(m, flag ^ 1)
    state = read_game_state(m.read, MAPS)
    assert state_json(state)["story"][field] is False
    assert f"Rustboro Gym {name} defeated" not in format_readout(state)


def test_two_rustboro_trainers_can_complete_in_one_snapshot() -> None:
    m = game(OVERWORLD)
    _set_story_flag(m, 0x640)
    _set_story_flag(m, 0x641)
    state = read_game_state(m.read, MAPS)
    body = state_json(state)["story"]
    assert body["rustboro_josh_defeated"] is True
    assert body["rustboro_tommy_defeated"] is True
    assert body["rustboro_marc_defeated"] is False
    assert "Rustboro Gym Josh defeated; Rustboro Gym Tommy defeated" in format_readout(state)


@pytest.mark.parametrize("trainer_bits", [False, True])
def test_gym_clear_makes_trainer_bits_ambiguous(trainer_bits: bool) -> None:
    m = game(OVERWORLD)
    _set_story_flag(m, 0x4F0)
    _set_story_flag(m, 0x867)
    if trainer_bits:
        for _, flag, _ in GYM_TRAINERS:
            _set_story_flag(m, flag)
    state = read_game_state(m.read, MAPS)
    body = state_json(state)["story"]
    assert body["rustboro_gym_complete"] is True
    assert body["stone_badge"] is True
    for field, _, name in GYM_TRAINERS:
        assert body[field] is None
        assert f"Rustboro Gym {name} defeated" not in format_readout(state)


@pytest.mark.parametrize("screen", [NAMING, (0, 0x0802F6B1)])
def test_pregame_trainer_flags_are_unavailable(screen) -> None:
    m = game(screen)
    if screen == (0, 0x0802F6B1):
        m.put(0x03005E00, struct.pack("<IB", 0x08030A2D, 1))
    for _, flag, _ in GYM_TRAINERS:
        _set_story_flag(m, flag)
    body = state_json(read_game_state(m.read, MAPS))["story"]
    assert all(body[field] is None for field, _, _ in GYM_TRAINERS)


@pytest.mark.parametrize(
    ("field", "trainer_id"),
    [
        ("petalburg_woods_lyle_defeated", 616),
        ("petalburg_woods_james_defeated", 621),
        ("petalburg_woods_aqua_grunt_defeated", 10),
        ("route116_joey_defeated", 322),
        ("route116_jose_defeated", 617),
        ("route116_jerry_defeated", 273),
        ("route116_clark_defeated", 631),
        ("route116_janice_defeated", 605),
        ("route116_karen_defeated", 280),
        ("route116_sarah_defeated", 695),
        ("route116_dawson_defeated", 694),
        ("route116_devan_defeated", 753),
        ("route116_johnson_defeated", 754),
        ("roxanne_defeated", 265),
        ("route102_calvin_defeated", 318),
        ("route102_rick_defeated", 615),
        ("route102_tiana_defeated", 603),
        ("route102_allen_defeated", 333),
        ("route104_ivan_defeated", 337),
        ("route104_billy_defeated", 319),
        ("route104_haley_defeated", 604),
        ("route104_winston_defeated", 136),
        ("route104_cindy_defeated", 114),
        ("route104_gina_mia_defeated", 483),
        ("route104_darian_defeated", 696),
    ],
)
def test_initial_trainer_flag_exact_bit_and_adjacent_negative(field, trainer_id) -> None:
    from pokebench_env.story import INITIAL_TRAINER_FLAGS

    flag = 0x500 + trainer_id
    assert INITIAL_TRAINER_FLAGS[field] == flag
    m = game(OVERWORLD)
    _set_story_flag(m, flag ^ 1)
    assert state_json(read_game_state(m.read, MAPS))["story"][field] is False
    m = game(OVERWORLD)
    _set_story_flag(m, flag)
    _set_story_flag(m, 0x4F0)
    story = state_json(read_game_state(m.read, MAPS))["story"]
    assert story[field] is True
    assert all(story[key] is False for key in INITIAL_TRAINER_FLAGS if key != field)
    assert state_json(read_game_state(game(NAMING).read, MAPS))["story"][field] is None


def test_story_line_says_unavailable_when_no_field_is_readable_not_that_nothing_is_done() -> None:
    from pokebench_env.story import StoryState

    assert StoryState().text() == (
        "Story: unavailable while the game state reloads; progress already confirmed still stands"
    )
    assert StoryState(name_confirmed=False).text() == "Story: no completion confirmed"
