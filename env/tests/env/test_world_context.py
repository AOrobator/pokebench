import struct
from hashlib import sha256

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
    m.put(0x02021FC4, b"\x0a\xff")
    assert read_world_context(m.read, (10, 2), (0, 9), SAVE, decode_text).dialogue is None
    m.put(0x02021FC4, b"\xfc\x19\xff")
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


def test_qualified_field_printer_reports_page_wait_and_withholds_stale_owner() -> None:
    from pokebench_env.ui_state import WINDOWS
    from pokebench_env.world_context import read_field_message

    m = world()
    m.put(WINDOWS, struct.pack("<BBBBBBHI", 0, 0, 0, 1, 1, 0, 0, 0x02030000))
    m.put(0x02030000, bytes([1, 2]) * 16)
    m.put(0x020375BC, b"\x02")
    m.put(0x03005E00, struct.pack("<I", 0x08098155) + b"\x01" + bytes(3) + struct.pack("<h", 2))
    m.put(0x020201B0, struct.pack("<I", 0x02021FE2) + bytes([0]))
    m.put(0x020201B0 + 0x1B, bytes([1, 2]))
    assert read_field_message(m.read).json() == {"phase": "page_wait", "cursor": 30, "ready": True}
    m.put(0x03005E00 + 4, b"\x00")
    assert read_field_message(m.read) is None


def field_printer(mode: int = 2, state: int = 2) -> Memory:
    from pokebench_env.ui_state import WINDOWS

    m = world()
    m.put(WINDOWS, struct.pack("<BBBBBBHI", 0, 0, 0, 1, 1, 0, 0, 0x02030000))
    m.put(0x02030000, bytes([1, 2]) * 16)
    m.put(0x020375BC, bytes([mode]))
    m.put(0x03005E00, struct.pack("<I", 0x08098155) + b"\x01" + bytes(3) + struct.pack("<h", 2))
    m.put(0x020201B0, struct.pack("<I", 0x02021FE2) + bytes([0]))
    m.put(0x020201B0 + 0x1B, bytes([1, state]))
    m.put(0x02021FC4, text("Box") + b"\xff")
    return m


def test_field_message_phases_and_final_dismissal_are_source_owned() -> None:
    from pokebench_env.world_context import read_field_message

    for mode in (2, 3):
        for state, phase in enumerate(
            (
                "printing",
                "button_wait",
                "page_wait",
                "scroll_wait",
                "scrolling",
                "audio_wait",
                "printing_pause",
            )
        ):
            value = read_field_message(field_printer(mode, state).read)
            assert value.json() == {
                "phase": phase,
                "cursor": 30,
                "ready": mode == 2 and state in (1, 2, 3),
            }
    m = field_printer(0)
    m.put(0x020201B0 + 0x1B, b"\x00")
    m.put(0x03000E40 + 1, b"\x02")
    m.put(0x03000E40 + 4, struct.pack("<I", 0x0809AC99))
    assert read_field_message(m.read).json() == {
        "phase": "dismiss_wait",
        "cursor": 30,
        "ready": True,
    }
    c = read_world_context(m.read, (10, 2), (0, 9), SAVE, decode_text, message_phase=True)
    assert c.dialogue == "Box"
    assert "A or B advances" in c.text(message=True)
    m.put(0x03000E38, b"\x01")
    assert read_field_message(m.read) is None


def test_unqualified_printer_operands_do_not_invent_readiness() -> None:
    from pokebench_env.world_context import read_field_message

    mutations = [
        (0x020375BC, b"\x01"),
        (0x02020004, b"\xff"),
        (0x03005E00, bytes(4)),
        (0x03005E00 + 8, b"\x01"),
        (0x020201B0 + 4, b"\x01"),
        (0x020201B0 + 0x1B, b"\x00"),
        (0x020201B0, bytes(4)),
        (0x020201B0, struct.pack("<I", 0x02021FC4 + 1000)),
        (0x020201B0 + 0x1C, b"\xff"),
    ]
    for address, value in mutations:
        m = field_printer()
        m.put(address, value)
        assert read_field_message(m.read) is None, (address, value)
    m = field_printer()
    m.put(0x03005E00 + 0x28, m.read(0x03005E00, 0x28))
    assert read_field_message(m.read) is None


def test_phase_switch_off_preserves_json_and_model_text() -> None:
    from pokebench_env.game_state import read_game_state
    from pokebench_env.readout import format_readout, state_json
    from tests.env.test_game_state import MAPS, OVERWORLD, game

    m = game(OVERWORLD)
    m.cells.update(field_printer().cells)
    # Restore the live player object required by the production state owner.
    base = game(OVERWORLD)
    m.put(0x02037350, base.read(0x02037350, 0x24))
    state = read_game_state(m.read, MAPS, message_phase_enabled=True)
    assert state.world_context.message.json() == {
        "phase": "page_wait",
        "cursor": 30,
        "ready": True,
        "identity": sha256(text("Box")).hexdigest(),
    }
    assert "Field-message phase: page_wait" in format_readout(state, message_phase=True)
    assert "Field-message phase" not in format_readout(
        state, frozenset({"field-dialogue-phase-v1"}), message_phase=True
    )
    assert state_json(state)["world_context"]["message"]["cursor"] == 30
    reference = read_game_state(m.read, MAPS)
    assert "message" not in state_json(reference)["world_context"]


def test_visible_unqualified_owner_records_evidence_as_coverage_error() -> None:
    m = field_printer()
    m.put(0x03005E00, struct.pack("<I", 0x080ABCDE))
    c = read_world_context(m.read, (10, 2), (0, 9), SAVE, decode_text, message_phase=True)
    assert c.message is None
    assert "STATE COVERAGE ERROR" in c.text(message=True)
    assert "0x080ABCDE" in c.json()["message_diagnostic"]
    assert "mode 2" in c.json()["message_diagnostic"]


def test_automatic_text_flags_withhold_manual_page_readiness() -> None:
    from pokebench_env.world_context import read_field_message

    m = field_printer()
    m.put(0x03003014, b"\x04")
    assert read_field_message(m.read).ready is False


def test_final_dismiss_rejects_wrong_native_and_inactive_context_operands() -> None:
    from pokebench_env.world_context import read_field_message

    for address, value in (
        (0x03000E40 + 4, struct.pack("<I", 0x0809833D)),
        (0x03000E40 + 1, b"\x01"),
        (0x03000E38, b"\x01"),
        (0x020201B0 + 0x1B, b"\x01"),
        (0x020201B0 + 4, b"\x01"),
        (0x020201B0, bytes(4)),
        (0x02020004, b"\xff"),
    ):
        m = field_printer(0)
        m.put(0x020201B0 + 0x1B, b"\x00")
        m.put(0x03000E40 + 1, b"\x02")
        m.put(0x03000E40 + 4, struct.pack("<I", 0x0809AC99))
        assert read_field_message(m.read).ready is True
        m.put(address, value)
        assert read_field_message(m.read) is None, (hex(address), value)


def test_qualified_raw_message_identity_survives_unsupported_controls() -> None:
    m = field_printer()
    raw = text("Box") + b"\xfc\x19\x00\x01\x02" + b"\xff"
    m.put(0x02021FC4, raw)
    c = read_world_context(m.read, (10, 2), (0, 9), SAVE, decode_text, message_phase=True)
    assert c.dialogue is None
    assert "field-message text" in c.message_diagnostic
    assert c.message.identity == sha256(m.read(0x02021FC4, 1000)).hexdigest()


def test_whole_native_message_decodes_controls_and_preserves_strict_errors():
    m = field_printer()
    raw = text("POK") + b"\x1b" + text("MON") + b"\xfc\x04\x00\x01\x02\xfe" + text("Box") + b"\xff"
    m.put(0x02021FC4, raw)
    c = read_world_context(m.read, (10, 2), (0, 9), SAVE, decode_text, message_phase=True)
    assert c.dialogue == "POKéMON\nBox"
    assert c.message_diagnostic is None
    identity = c.message.identity
    m.put(0x02021FC4, text("POK") + b"\x0a\xff")
    bad = read_world_context(m.read, (10, 2), (0, 9), SAVE, decode_text, message_phase=True)
    assert bad.dialogue is None and "0x0A" in bad.message_diagnostic
    assert bad.message.phase == c.message.phase and bad.message.identity != identity
    m.put(0x02021FC4, bytes([0xBB]) * 1000)
    unterminated = read_world_context(
        m.read, (10, 2), (0, 9), SAVE, decode_text, message_phase=True
    )
    assert "unterminated" in unterminated.message_diagnostic
    assert c.json()["message"]["identity"] == sha256(raw[:-1]).hexdigest()


def test_corrected_field_characters_are_common_even_when_phase_information_is_off() -> None:
    m = field_printer()
    raw = text("POK") + b"\x1b" + text("MON ") + b"\x2d\x00\x5c" + text("Box") + b"\x5d\xff"
    m.put(0x02021FC4, raw)
    c = read_world_context(m.read, (10, 2), (0, 9), SAVE, decode_text, message_phase=True)
    assert c.dialogue == "POKéMON & (Box)"
    assert (
        read_world_context(m.read, (10, 2), (0, 9), SAVE, decode_text).dialogue == "POKéMON & (Box)"
    )
    m.put(0x02021FC4, bytes(1000))
    c = read_world_context(m.read, (10, 2), (0, 9), SAVE, decode_text, message_phase=True)
    assert c.message.identity == sha256(bytes(1000)).hexdigest() and c.dialogue is None


def test_retained_window_reports_qualified_script_activity_not_an_input_ready_message():
    for native, phase in ((0x08099D95, "script_pause"), (0x0809A671, "movement_wait"), (0x0809833D, "message_close_wait")):
        m = field_printer(0)
        m.put(0x020201B0 + 0x1B, b"\x00")
        m.put(0x03000E40 + 1, b"\x02")
        m.put(0x03000E40 + 4, struct.pack("<I", native))
        c = read_world_context(m.read, (10, 2), (0, 9), SAVE, decode_text, message_phase=True)
        assert c.message is None and c.dialogue is None
        assert c.message_diagnostic is None
        assert c.json()["field_activity"] == {"phase": phase, "owner": native}
        assert "not an input-ready field message" in c.text(message=True)
        assert "STATE COVERAGE ERROR" not in c.text(message=True)
        # Stale native pointers in a stopped/waiting context do not qualify.
        for address, value in ((0x03000E38, b"\x01"), (0x03000E40 + 1, b"\x00"), (0x03000E40 + 4, struct.pack("<I", 0x080ABCDE)), (0x020201B0 + 0x1B, b"\x01")):
            previous = m.read(address, len(value))
            m.put(address, value)
            bad = read_world_context(m.read, (10, 2), (0, 9), SAVE, decode_text, message_phase=True)
            assert bad.message is None and bad.message_diagnostic is not None
            assert "field_activity" not in bad.json()
            m.put(address, previous)


def test_field_message_initialization_is_owned_but_not_ready():
    for step in (0, 1):
        m = field_printer()
        m.put(0x03005E00 + 8, bytes([step, 0]))
        c = read_world_context(m.read, (10, 2), (0, 9), SAVE, decode_text, message_phase=True)
        assert c.message is None and c.message_diagnostic is None
        assert c.json()["field_activity"] == {"phase": "message_initializing", "owner": 0x08098155}
        m.put(0x03005E00 + 0x28, m.read(0x03005E00, 0x28))
        assert read_world_context(m.read, (10, 2), (0, 9), SAVE, decode_text, message_phase=True).message_diagnostic is not None
