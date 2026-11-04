"""Static template facts: exact native structure, hide flag and map identity guards."""

import struct
from dataclasses import replace

from test_game_state import MAPS, OVERWORLD, SB1, game

from pokebench_env.character_presence import TEMPLATES
from pokebench_env.live_map import MAP_HEADER, MAP_OFFSET, OBJECT_EVENTS
from pokebench_env.readout import SERVER_FEATURES, state_json
from pokebench_env.rerender import read_state, render
from pokebench_env.static_npc_templates import SWITCH, read_static_npc_templates

EVENTS, CANONICAL, SCRIPT = 0x08010000, 0x08011000, 0x08012000


def setup(movement=7, flag=0x52, trainer_type=0):
    m = game(OVERWORLD)
    m.put(MAP_HEADER + 4, struct.pack("<I", EVENTS))
    m.put(EVENTS, struct.pack("<BBBBI", 1, 0, 0, 0, CANONICAL))
    row = bytearray(24)
    row[0], row[8], row[9] = 2, 3, movement
    struct.pack_into("<hhH", row, 4, 3, 0, 3 | movement << 8)
    struct.pack_into("<H", row, 0xC, trainer_type)
    struct.pack_into("<I", row, 0x10, SCRIPT)
    struct.pack_into("<H", row, 0x14, flag)
    m.put(SB1 + TEMPLATES, row)
    m.put(CANONICAL, row)
    m.put(SCRIPT, bytes([2, 0, 0, 0]))
    return m


def test_stationary_unloaded_scripted_template_has_qualified_provenance():
    m = setup()
    facts = read_static_npc_templates(m.read, SB1, (0, 9))
    assert facts is not None
    assert facts.json() == {
        "map_id": [0, 9],
        "source": "saveblock1_templates",
        "templates": [
            {"local_id": 2, "x": 3, "y": 0, "elevation": 3, "movement_type": 7, "hide_flag": 0x52}
        ],
    }


def test_hidden_loaded_moving_trainer_wrong_map_and_unknown_templates_are_excluded():
    for movement in (1, 2, 11, 255):
        m = setup(movement)
        assert read_static_npc_templates(m.read, SB1, (0, 9)).templates == ()
    m = setup(trainer_type=1)
    assert read_static_npc_templates(m.read, SB1, (0, 9)).templates == ()
    m = setup()
    m.put(SCRIPT, bytes([0x5C, 0, 1, 0]))
    assert read_static_npc_templates(m.read, SB1, (0, 9)).templates == ()
    m = setup()
    m.put(SB1 + 0x1270 + 0x52 // 8, bytes([1 << (0x52 % 8)]))
    assert read_static_npc_templates(m.read, SB1, (0, 9)).templates == ()
    m = setup()
    body = bytearray(0x24)
    body[0], body[8], body[9], body[10] = 1, 2, 9, 0
    struct.pack_into("<hh", body, 0x10, 3 + MAP_OFFSET, MAP_OFFSET)
    m.put(OBJECT_EVENTS + 0x24, body)
    assert read_static_npc_templates(m.read, SB1, (0, 9)).templates == ()
    assert read_static_npc_templates(m.read, SB1, (0, 8)) is None
    assert read_static_npc_templates(m.read, 0, (0, 9)) is None


def test_production_reader_state_and_text_are_exactly_old_when_off():
    m = setup()
    off = frozenset(SERVER_FEATURES) - {"ram-state-v1"}
    before = read_state(m.read, MAPS, active_ui=False, off=off)
    on = read_state(m.read, MAPS, active_ui=False, off=off - {SWITCH})
    assert on.static_npc_templates is not None
    assert "static_npc_templates" in state_json(on)
    assert "static_npc_templates" not in state_json(before)
    assert state_json(replace(on, static_npc_templates=None)) == state_json(before)
    assert "current presence and position unverified" in render(on, off - {SWITCH})
    assert render(replace(on, static_npc_templates=None), off) == render(before, off)


def test_fail_closed_invalid_source_structure_and_flags():
    for offset, value in (
        (2, b"\x01"),
        (8, b"\x10"),
        (0, b"\xff"),
        (0x14, b"\x00\x40"),
        (4, b"\xff\xff"),
        (0x10, bytes(4)),
    ):
        m = setup()
        m.put(SB1 + TEMPLATES + offset, value)
        assert read_static_npc_templates(m.read, SB1, (0, 9)).templates == ()
    m = setup()
    m.put(MAP_HEADER + 4, bytes(4))
    assert read_static_npc_templates(m.read, SB1, (0, 9)) is None
    m = setup()
    m.put(EVENTS, bytes([65]))
    assert read_static_npc_templates(m.read, SB1, (0, 9)) is None
    m = setup()
    m.put(CANONICAL, b"\x03")
    assert read_static_npc_templates(m.read, SB1, (0, 9)).templates == ()
    m = setup()
    m.put(EVENTS, struct.pack("<BBBBI", 2, 0, 0, 0, CANONICAL))
    row = m.read(SB1 + TEMPLATES, 24)
    m.put(SB1 + TEMPLATES + 24, row)
    m.put(CANONICAL + 24, row)
    assert read_static_npc_templates(m.read, SB1, (0, 9)) is None
    assert read_static_npc_templates(lambda _a, _s: b"", SB1, (0, 9)) is None
