import struct

import pytest
from test_game_state import MAPS, SB1, SB2, game

from pokebench_env.game_screen import read_screen
from pokebench_env.game_state import read_game_state
from pokebench_env.readout import format_readout, state_json
from pokebench_env.story import FLAG_FIELDS, SAVE_FLAGS, read_story


@pytest.mark.parametrize("callback", [0x08085FFD, 0x080860F5, 0x08085FCD, 0x08137201])
def test_loading_does_not_read_or_claim_save_owned_progress(callback):
    m = game((0, callback))
    # Actual incident: map defaults0/0 and plausible-but-false flags.
    m.put(SB1, bytes(6))
    for flag in FLAG_FIELDS.values():
        m.put(SB1 + SAVE_FLAGS + (flag >> 3), b"\xff")

    def guarded(address, length):
        assert not (SB1 <= address < SB1 + 0x159C or SB2 <= address < SB2 + 0xB0), (
            "Transition dereferenced save data"
        )
        return m.read(address, length)

    state = read_game_state(guarded, MAPS)
    body = state_json(state)
    assert body["location"] is None and body["map_id"] is None
    assert body["story"]["clock_set"] is None
    assert body["story"]["rival_battle_won"] is None
    assert body["money"] is None and body["name"] is None
    assert "unavailable" in format_readout(state)
    assert "Game not started" not in format_readout(state)


def test_story_reader_independently_withholds_transition_flags():
    m = game((0, 0x08085FFD))
    flag = FLAG_FIELDS["clock_set"]
    m.put(SB1 + SAVE_FLAGS + (flag >> 3), bytes([1 << (flag & 7)]))
    assert read_story(m.read, read_screen(m.read), SB1).clock_set is None


@pytest.mark.parametrize(
    "slot,pointer",
    [
        (0, 0),
        (0, 0x08000000),
        (0, SB1 + 1),
        (0, 0x0203FFFF),
        (1, 0),
        (1, 0x08000000),
        (1, SB2 + 1),
        (1, 0x0203FFFF),
    ],
)
def test_invalid_save_pointer_is_unavailable_without_dereferencing(slot, pointer):
    from test_game_state import OVERWORLD

    m = game(OVERWORLD)
    m.put(0x03005D8C + slot * 4, struct.pack("<I", pointer))

    def guarded(address, length):
        assert address != pointer, "Invalid save pointer dereferenced"
        return m.read(address, length)

    state = read_game_state(guarded, MAPS)
    assert state.location is None and state.story.clock_set is None
    assert "unavailable" in format_readout(state)
