import struct

import pytest

from pokebench_env.game_state import read_game_state
from pokebench_env.readout import format_readout, state_json
from pokebench_env.trainer_opponent import (
    GTRAINERS,
    TRAINER_SIZE,
    TRAINERS_COUNT,
    TrainerOpponent,
    read_trainer_opponent,
)
from tests.env.test_game_state import MAPS, OVERWORLD, SB1, Memory, game

OPPONENT, TYPE_FLAGS, IN_BATTLE = 0x02038BCA, 0x02022FEC, 0x030026F9
# Gen 3 charset: A=0xBB .. Z=0xD4, terminator 0xFF.
MAY = bytes([0xC7, 0xBB, 0xD3, 0xFF])


def trainer(m: Memory, trainer_id: int, trainer_class: int, name: bytes) -> None:
    entry = GTRAINERS + trainer_id * TRAINER_SIZE
    m.put(entry + 1, bytes([trainer_class]))
    m.put(entry + 4, name + bytes(11 - len(name)))


def opponent(m: Memory, trainer_id: int, battle_types: int = 0) -> None:
    m.put(OPPONENT, struct.pack("<H", trainer_id))
    m.put(TYPE_FLAGS, struct.pack("<I", battle_types))


def set_flag(m: Memory, flag: int) -> None:
    address = SB1 + 0x1270 + (flag >> 3)
    m.put(address, bytes([m.read(address, 1)[0] | 1 << (flag & 7)]))


def test_the_constants_come_from_pokeemerald() -> None:
    # include/constants/opponents.h TRAINERS_COUNT; include/data.h struct Trainer is 0x28 bytes.
    assert (TRAINERS_COUNT, TRAINER_SIZE, GTRAINERS) == (855, 0x28, 0x08310030)


def test_the_opponent_is_read_with_its_rom_name_class_and_flag() -> None:
    m = Memory()
    trainer(m, 535, 0x32, MAY)
    opponent(m, 535, 1 << 3 | 1 << 2)
    assert read_trainer_opponent(m.read, SB1, True) == TrainerOpponent(
        trainer_id=535, trainer_class=0x32, name="MAY", defeated=False, battle_active=True
    )
    set_flag(m, 0x500 + 535)
    assert read_trainer_opponent(m.read, SB1, False) == TrainerOpponent(
        trainer_id=535, trainer_class=0x32, name="MAY", defeated=True, battle_active=False
    )


def test_only_the_opponents_own_flag_counts() -> None:
    m = Memory()
    trainer(m, 535, 0x32, MAY)
    opponent(m, 535, 1 << 3)
    set_flag(m, 0x500 + 534)
    set_flag(m, 0x500 + 536)
    found = read_trainer_opponent(m.read, SB1, True)
    assert found is not None and found.defeated is False


@pytest.mark.parametrize("types", [0, 1 << 2, 1 << 4])
def test_a_battle_without_the_trainer_bit_is_not_a_trainer_battle(types: int) -> None:
    m = Memory()
    trainer(m, 535, 0x32, MAY)
    opponent(m, 535, types)
    found = read_trainer_opponent(m.read, SB1, True)
    assert found is not None and found.battle_active is False


@pytest.mark.parametrize("trainer_id", [0, TRAINERS_COUNT, 0xFFFF])
def test_no_or_out_of_range_opponent_is_none(trainer_id: int) -> None:
    m = Memory()
    opponent(m, trainer_id, 1 << 3)
    assert read_trainer_opponent(m.read, SB1, True) is None


def test_a_name_without_a_terminator_is_unknown() -> None:
    m = Memory()
    trainer(m, 12, 2, bytes([0xBB] * 11))
    opponent(m, 12, 1 << 3)
    found = read_trainer_opponent(m.read, SB1, True)
    assert found is not None and found.name is None


def test_short_reads_are_errors() -> None:
    with pytest.raises(ValueError, match="short trainer opponent read"):
        read_trainer_opponent(lambda _a, _n: b"", SB1, False)


def test_game_state_json_carries_the_field_and_the_readout_text_is_unchanged() -> None:
    m = game(OVERWORLD)
    before = format_readout(read_game_state(m.read, MAPS))
    assert state_json(read_game_state(m.read, MAPS))["trainer_opponent"] is None
    trainer(m, 535, 0x32, MAY)
    opponent(m, 535, 1 << 3)
    m.put(IN_BATTLE, bytes([0x02]))
    state = read_game_state(m.read, MAPS)
    assert state_json(state)["trainer_opponent"] == {
        "trainer_id": 535,
        "trainer_class": 0x32,
        "name": "MAY",
        "defeated": False,
        "battle_active": True,
    }
    m.put(IN_BATTLE, bytes([0]))
    after = read_game_state(m.read, MAPS)
    assert state_json(after)["trainer_opponent"]["battle_active"] is False  # type: ignore[index]
    assert format_readout(after) == before


def test_before_the_game_starts_there_is_no_trainer_opponent() -> None:
    from tests.env.test_game_state import NAMING

    assert state_json(read_game_state(game(NAMING).read, MAPS))["trainer_opponent"] is None
