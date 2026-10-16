import struct

import pytest

from pokebench_env.game_state import read_game_state
from pokebench_env.readout import format_readout, state_json
from pokebench_env.route103_rival import RIVAL_TRAINERS, read_route103_rival
from tests.env.test_game_state import MAPS, OVERWORLD, SB1, Memory, game

OPPONENT, TYPE_FLAGS, IN_BATTLE = 0x02038BCA, 0x02022FEC, 0x030026F9


def set_flag(m: Memory, flag: int) -> None:
    address = SB1 + 0x1270 + (flag >> 3)
    m.put(address, bytes([m.read(address, 1)[0] | 1 << (flag & 7)]))


def oldale(m: Memory, value: int) -> None:
    m.put(SB1 + 0x139C + 2 * (0x40C7 - 0x4000), struct.pack("<H", value))


def test_the_six_rival_trainers_come_from_opponents_h() -> None:
    assert RIVAL_TRAINERS == (520, 523, 526, 529, 532, 535)


@pytest.mark.parametrize("trainer", [520, 523, 526, 529, 532, 535])
def test_a_trainer_battle_against_any_route_103_rival_is_active(trainer: int) -> None:
    m = Memory()
    m.put(OPPONENT, struct.pack("<H", trainer))
    m.put(TYPE_FLAGS, struct.pack("<I", 1 << 3 | 1 << 2))
    assert read_route103_rival(m.read, SB1, True).battle_active is True
    assert read_route103_rival(m.read, SB1, False).battle_active is False


@pytest.mark.parametrize(("trainer", "flags"), [(535, 1 << 2), (536, 1 << 3), (0, 1 << 3)])
def test_wild_battles_other_trainers_and_cleared_opponents_are_not_the_rival(
    trainer: int, flags: int
) -> None:
    m = Memory()
    m.put(OPPONENT, struct.pack("<H", trainer))
    m.put(TYPE_FLAGS, struct.pack("<I", flags))
    assert read_route103_rival(m.read, SB1, True).battle_active is False


@pytest.mark.parametrize("trainer", [520, 535])
def test_defeat_is_the_rival_trainer_flag_not_the_scene_flag(trainer: int) -> None:
    m = Memory()
    set_flag(m, 0x82)
    assert read_route103_rival(m.read, SB1, False).defeated is False
    set_flag(m, 0x500 + trainer)
    assert read_route103_rival(m.read, SB1, False).defeated is True


@pytest.mark.parametrize(("value", "expected"), [(0, 0), (1, 1), (2, 2), (3, None), (0xFFFF, None)])
def test_oldale_rival_stage_is_bounded(value: int, expected: int | None) -> None:
    m = Memory()
    oldale(m, value)
    assert read_route103_rival(m.read, SB1, False).oldale_stage == expected


def test_short_reads_are_errors() -> None:
    with pytest.raises(ValueError, match="short route 103 rival read"):
        read_route103_rival(lambda _a, _n: b"", SB1, False)


def test_game_state_json_carries_the_field_and_the_readout_text_is_unchanged() -> None:
    m = game(OVERWORLD)
    before = format_readout(read_game_state(m.read, MAPS))
    set_flag(m, 0x717)
    oldale(m, 1)
    m.put(IN_BATTLE, bytes([0x02]))
    m.put(OPPONENT, struct.pack("<H", 535))
    m.put(TYPE_FLAGS, struct.pack("<I", 1 << 3))
    state = read_game_state(m.read, MAPS)
    assert state_json(state)["route103_rival"] == {
        "battle_active": True,
        "defeated": True,
        "oldale_stage": 1,
    }
    m.put(IN_BATTLE, bytes([0]))
    assert format_readout(read_game_state(m.read, MAPS)) == before
    assert state.story is not None and state.story == read_game_state(game(OVERWORLD).read, MAPS).story


def test_before_the_game_starts_there_is_no_route_103_rival_state() -> None:
    from tests.env.test_game_state import NAMING

    assert state_json(read_game_state(game(NAMING).read, MAPS))["route103_rival"] is None
