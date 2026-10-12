import struct

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
    import pytest

    from pokebench_env.game_screen import read_screen
    from pokebench_env.story import read_story

    m = game(OVERWORLD)
    m.put(SB1 + 0x139C + 2 * (0x4092 - 0x4000), b"\xff\xff")
    s = read_story(m.read, read_screen(m.read), SB1)
    assert s.intro_stage is None and s.clock_set is False
    assert read_story(m.read, read_screen(m.read), 0).clock_set is None
    with pytest.raises(ValueError, match="short story read"):
        read_story(lambda _a, _n: b"", read_screen(m.read), SB1)
