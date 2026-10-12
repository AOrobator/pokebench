import struct

from pokebench_env.game_state import decode_text
from pokebench_env.world_context import read_world_context
from tests.env.test_game_state import Memory, text

HEADER, EVENTS, COORDS, SAVE = 0x02037318, 0x08010000, 0x08010100, 0x02025000


def world(value: int = 0) -> Memory:
    m = Memory()
    m.put(HEADER, struct.pack("<II", 0, EVENTS))
    m.put(EVENTS, bytes([0, 0, 1, 0]) + bytes(8) + struct.pack("<I", COORDS))
    m.put(COORDS, struct.pack("<hhBxHH2xI", 10, 1, 3, 0x4050, 0, 0x08011000))
    m.put(SAVE + 0x139C + (0x4050 - 0x4000) * 2, struct.pack("<H", value))
    body = bytearray(0x24)
    body[0] = 1
    body[5] = 6
    body[8] = 1
    body[9] = 9
    struct.pack_into("<hh", body, 0x10, 14, 9)
    m.put(0x02037350, body)
    return m


def test_live_sprite_identity_and_map_scoped_id() -> None:
    c = read_world_context(world().read, (10, 2), (0, 9), SAVE, decode_text)
    assert c.objects[0].sprite_kind == "TWIN"
    assert c.objects[0].local_id == 1 and c.objects[0].map_id == (0, 9)
    assert (c.objects[0].x, c.objects[0].y) == (7, 2)
    assert "not globally unique" in c.text()


def test_script_tile_condition_changes_with_live_save_variable() -> None:
    c = read_world_context(world(0).read, (10, 2), (0, 9), SAVE, decode_text)
    assert c.triggers[0].condition_met is True
    assert c.triggers[0].current_value == 0
    assert "script-trigger" in c.text()
    assert (
        read_world_context(world(1).read, (10, 2), (0, 9), SAVE, decode_text)
        .triggers[0]
        .condition_met
        is False
    )


def test_dialogue_buffer_is_gated_by_the_active_field_message_owner() -> None:
    m = world()
    m.put(0x020375BC, b"\x02")
    m.put(0x02021FC4, text("Wild POKEMON!") + b"\xff")
    assert (
        read_world_context(m.read, (10, 2), (0, 9), SAVE, decode_text).dialogue == "Wild POKEMON!"
    )
    m.put(0x020375BC, b"\x00")
    assert read_world_context(m.read, (10, 2), (0, 9), SAVE, decode_text).dialogue is None


def test_invalid_headers_foreign_objects_and_unavailable_values() -> None:
    m = world()
    m.put(HEADER + 4, bytes(4))
    assert read_world_context(m.read, (10, 2), (0, 9), SAVE, decode_text) is None
    m = world()
    m.put(0x02037350 + 9, b"\x08")
    assert not read_world_context(m.read, (10, 2), (0, 9), SAVE, decode_text).objects
    m = world()
    m.put(COORDS + 6, struct.pack("<H", 0x8000))
    c = read_world_context(m.read, (10, 2), (0, 9), SAVE, decode_text)
    assert c.triggers[0].condition_met is None
    assert "unavailable" in c.text()
    m = world()
    m.put(COORDS + 6, bytes(2))
    assert (
        read_world_context(m.read, (10, 2), (0, 9), SAVE, decode_text).triggers[0].condition_met
        is True
    )
    m = world()
    m.put(COORDS + 6, struct.pack("<H", 1))
    assert (
        read_world_context(m.read, (10, 2), (0, 9), SAVE, decode_text).triggers[0].current_value
        == 1
    )


def test_far_objects_unknown_graphics_weather_and_far_scripts() -> None:
    m = world()
    m.put(0x02037350 + 5, b"\xff")
    c = read_world_context(m.read, (10, 2), (0, 9), SAVE, decode_text)
    assert c.objects[0].sprite_kind is None and "unknown" in c.text()
    m.put(0x02037350 + 0x10, struct.pack("<hh", 100, 100))
    m.put(COORDS + 12, bytes(4))
    assert not read_world_context(m.read, (10, 2), (0, 9), SAVE, decode_text).triggers
    m = world()
    m.put(COORDS, struct.pack("<h", 100))
    assert not read_world_context(m.read, (10, 2), (0, 9), SAVE, decode_text).triggers
    m = world()
    m.put(EVENTS + 12, bytes(4))
    assert not read_world_context(m.read, (10, 2), (0, 9), SAVE, decode_text).triggers


def test_multiline_text_unknown_modes_and_controls_fail_unavailable() -> None:
    m = world()
    m.put(0x020375BC, b"\x02")
    m.put(0x02021FC4, text("A") + b"\xfe" + text("B") + b"\xff")
    c = read_world_context(m.read, (10, 2), (0, 9), SAVE, decode_text)
    assert c.dialogue == "A\nB" and "Active field-message" in c.text()
    m.put(0x02021FC4, text("MOM: See?") + b"\xff")
    assert read_world_context(m.read, (10, 2), (0, 9), SAVE, decode_text).dialogue == "MOM: See?"
    m.put(0x02021FC4, b"\x01\xff")
    assert read_world_context(m.read, (10, 2), (0, 9), SAVE, decode_text).dialogue is None
    m.put(0x02021FC4, b"\xfc\x01\xff")
    assert read_world_context(m.read, (10, 2), (0, 9), SAVE, decode_text).dialogue is None
    m.put(0x02021FC4, bytes(1000))
    assert read_world_context(m.read, (10, 2), (0, 9), SAVE, decode_text).dialogue is None
    m.put(0x020375BC, b"\x01")
    assert read_world_context(m.read, (10, 2), (0, 9), SAVE, decode_text).dialogue is None


def test_map_scoped_id_one_can_be_mom_in_another_map() -> None:
    m = world()
    m.put(0x02037350 + 5, b"\xd7")
    m.put(0x02037350 + 9, b"\x00")
    m.put(0x02037350 + 10, b"\x01")
    c = read_world_context(m.read, (7, 2), (1, 0), SAVE, decode_text)
    assert c.objects[0].sprite_kind == "MOM" and c.objects[0].local_id == 1


def test_production_state_reader_delivers_context_to_model_and_json() -> None:
    from pokebench_env.game_state import read_game_state
    from pokebench_env.readout import format_readout, state_json
    from tests.env.test_game_state import MAPS, OVERWORLD, SB1, game

    m = game(OVERWORLD)
    context = world()
    context.put(COORDS + 2, struct.pack("<h", 2))
    m.cells.update(context.cells)
    m.put(0x02037350, bytes(16 * 0x24))
    m.put(0x02037350, b"\x01\x00\x01")
    m.put(0x02037350 + 0x10, struct.pack("<hh", 17, 9))
    m.put(0x02037350 + 0x18, b"\x44")
    m.put(0x02037350 + 0x24, context.read(0x02037350, 0x24))
    m.put(SB1 + 0x139C + (0x4050 - 0x4000) * 2, struct.pack("<H", 1))
    state = read_game_state(m.read, MAPS)
    assert state.world_context is not None, state
    assert state.world_context.objects[0].sprite_kind == "TWIN", state.world_context
    assert "sprite TWIN (graphics 6) at (7,2)" in format_readout(state), format_readout(state)
    encoded = state_json(state)["world_context"]
    assert encoded == state.world_context.json(), encoded
    assert state.world_context.triggers[0].condition_met is False, state.world_context


def test_autoscroll_mode_owns_valid_message_buffer() -> None:
    m = world()
    m.put(0x020375BC, b"\x03")
    m.put(0x02021FC4, text("Wild POKEMON!") + b"\xff")
    c = read_world_context(m.read, (10, 2), (0, 9), SAVE, decode_text)
    assert c.dialogue == "Wild POKEMON!", c
    m.put(0x020375BC, b"\x01")
    assert read_world_context(m.read, (10, 2), (0, 9), SAVE, decode_text).dialogue is None
