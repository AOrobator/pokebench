import struct
from dataclasses import replace

import pytest

from pokebench_env.game_state import read_game_state
from pokebench_env.readout import format_readout, state_json
from tests.env.test_game_state import MAPS, NAMING, OVERWORLD, SB1, game


def test_native_progress_is_recorded_but_readout_is_identical():
    m = game(OVERWORLD)
    m.put(SB1 + 0x1270 + (0x8F >> 3), bytes([1 << (0x8F & 7)]))
    m.put(SB1 + 0x139C + 2 * (0x405A - 0x4000), struct.pack("<H", 7))
    state = read_game_state(m.read, MAPS)
    progress = state_json(state)["story_progress"]
    assert progress["flags"][2 * (0x8F >> 3) : 2 * (0x8F >> 3) + 2] == "80"
    assert progress["rustboro_stage"] == 7
    assert len(progress["flags"]) == 600
    assert format_readout(state) == format_readout(replace(state, story_progress=None))


def test_progress_unavailable_before_gameplay_and_on_bad_variable():
    assert state_json(read_game_state(game(NAMING).read, MAPS))["story_progress"] is None
    m = game(OVERWORLD)
    m.put(SB1 + 0x139C + 2 * (0x405A - 0x4000), b"\xff\xff")
    assert state_json(read_game_state(m.read, MAPS))["story_progress"]["rustboro_stage"] is None


def test_progress_rejects_short_flags_and_unaligned_pointer():
    from pokebench_env.story_progress import read_story_progress

    with pytest.raises(ValueError, match="short"):
        read_story_progress(lambda _a, _n: b"", SB1, None)
    assert read_story_progress(lambda _a, n: bytes(n), SB1 + 1, None) is None
