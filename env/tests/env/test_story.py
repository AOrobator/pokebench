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
    assert body["story"] == {
        "name_confirmed": True,
        "intro_stage": 6,
        "rival_stage": 3,
        "birch_lab_stage": 2,
        "petalburg_gym_stage": 2,
        "woods_stage": 1,
        "clock_set": True,
        "rival_battle_won": True,
        "pokedex_received": True,
        "running_shoes_received": True,
        "starter_tutorial_complete": True,
        "rustboro_gym_complete": True,
        "stone_badge": True,
        "rock_tomb_received": True,
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
