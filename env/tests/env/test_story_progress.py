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


def test_campaign_variables_and_avatar_are_measurement_only():
    m = game(OVERWORLD)
    m.put(SB1 + 0x139C + 2 * (0x409F - 0x4000), struct.pack("<H", 3))
    m.put(0x02037590, b"\x01")
    state = read_game_state(m.read, MAPS)
    progress = state_json(state)["story_progress"]
    assert len(progress["variables"]) == 1024
    assert bytes.fromhex(progress["variables"])[318:320] == b"\x03\x00"
    assert progress["avatar_flags"] == 1
    assert format_readout(state) == format_readout(replace(state, story_progress=None))


def test_retained_beach_archive_proves_landing_through_the_production_reader():
    import json
    from pathlib import Path

    from pokebench_env.raw_ram import load_raw_ram
    from tests.env.test_move_learn import _rom

    fixtures = Path(__file__).parent / "fixtures"
    provenance = json.loads((fixtures / "campaign-beach-0d5d.provenance.json").read_text())
    read = load_raw_ram(
        fixtures / "campaign-beach-0d5d.json.gz",
        provenance["raw_ram"]["sha256"],
        rom=_rom(),
    )
    assert read.metadata["rom_sha1"] == provenance["rom_sha1"]
    assert read.metadata["frame"] == provenance["raw_ram"]["frame"]
    state = read_game_state(read, MAPS)
    assert state.map_id == (0, 24)
    assert state.position == (21, 23)
    assert state.field_controls_locked is False
    assert state.story_progress is not None
    assert state.story_progress.avatar_flags is not None
    assert state.story_progress.avatar_flags & 7
    assert not state.story_progress.avatar_flags & 24
    assert format_readout(state) == format_readout(replace(state, story_progress=None))
