import struct

import pytest
from test_game_state import Memory, text

from pokebench_env.menu_frontier import (
    DOME_CALLBACK,
    DOME_INFO_HEAP,
    DOME_INFO_INPUT,
    DOME_RESULTS_INPUT,
    DOME_TREE_INIT,
    DOME_TREE_INPUT,
    EXPECTED_TREE_IDS,
    FACILITY_MONS_POINTER,
    FRONTIER_MONS,
    TREE_TRAINER_IDS,
    read_frontier_ui,
)
from pokebench_env.pokemon import SPECIES_NAMES
from tests.env.test_menus import put_task


def fixture(owner=DOME_TREE_INPUT, data=None):
    m = Memory()
    put_task(m, 0, owner, data or [2, 0])
    m.put(TREE_TRAINER_IDS, EXPECTED_TREE_IDS)
    m.put(0x03005D90, struct.pack("<I", 0x02025000))
    m.put(FACILITY_MONS_POINTER, struct.pack("<I", FRONTIER_MONS))
    m.put(FRONTIER_MONS, struct.pack("<H", 25))
    m.put(SPECIES_NAMES + 25 * 11, text("PIKACHU") + b"\xff")
    m.put(DOME_INFO_HEAP, struct.pack("<I", 0x02030000))
    m.put(0x02030000, bytes(20))
    return m


@pytest.mark.parametrize(
    "cursor,label",
    [(0, "TRAINER 1"), (1, "TRAINER 9"), (16, "MATCH 1"), (30, "MATCH 15"), (31, "CLOSE")],
)
def test_exact_native_dome_bracket_selection(cursor, label):
    s = read_frontier_ui(fixture(data=[2, cursor]).read, DOME_CALLBACK)
    assert s.ready and s.selected == label and s.diagnostic is None
    assert len(s.details["team_species"]) == 48
    assert s.details["team_species"] == ["PIKACHU"] * 48


@pytest.mark.parametrize(
    "mode,label", [(0, "NEXT OPPONENT"), (1, "TRAINER INFORMATION"), (2, "MATCH INFORMATION")]
)
def test_exact_info_card_mode_and_dormant_tree_owner(mode, label):
    m = fixture(DOME_INFO_INPUT, [2, 0, 0, mode, 1])
    put_task(m, 1, DOME_TREE_INPUT, [3, 0])
    s = read_frontier_ui(m.read, DOME_CALLBACK)
    assert s.ready and s.selected == label and s.diagnostic is None
    assert s.details["parent_task"] == 1


def test_results_input_waits_until_native_delay_finishes():
    s = read_frontier_ui(fixture(DOME_RESULTS_INPUT, [2, 0, 0, 64]).read, DOME_CALLBACK)
    assert not s.ready and s.details["delay_frames"] == 64
    s = read_frontier_ui(fixture(DOME_RESULTS_INPUT, [3, 0, 0, 0]).read, DOME_CALLBACK)
    assert s.ready


def test_initialization_is_not_fabricated_as_input():
    s = read_frontier_ui(fixture(DOME_TREE_INIT, [1]).read, DOME_CALLBACK)
    assert s.phase == "frontier_dome_transition" and s.ready is False


@pytest.mark.parametrize(
    "address,body,message",
    [
        (TREE_TRAINER_IDS, bytes(16), "trainer-order"),
        (FACILITY_MONS_POINTER, struct.pack("<I", 0x08500000), "table owner"),
        (FRONTIER_MONS, bytes(2), "Pokémon species"),
        (0x02025000 + 0xCB2, struct.pack("<H", 5), "tournament round"),
    ],
)
def test_corruption_is_diagnostic_not_unknown_pokemon(address, body, message):
    m = fixture()
    m.put(address, body)
    s = read_frontier_ui(m.read, DOME_CALLBACK)
    assert s.ready is None and "harness bug" in s.diagnostic and message in s.diagnostic


def test_player_and_brain_species_are_direct_native_ids():
    m = fixture()
    m.put(0x02025000 + 0xD24, struct.pack("<H", 1023))
    m.put(0x02025000 + 0xD64, struct.pack("<3H", 25, 25, 25))
    s = read_frontier_ui(m.read, DOME_CALLBACK)
    assert s.diagnostic is None and s.details["team_species_ids"][:3] == [25] * 3


def test_unrelated_callback_is_not_claimed_as_frontier_interface():
    assert read_frontier_ui(fixture().read, 0x08085E5D) is None


def records_fixture(facility, mode):
    from pokebench_env.menu_frontier import RECORDS_SCRIPTS
    from tests.env.test_ui_state import window

    m = fixture()
    pc = next(pc for pc, owner in RECORDS_SCRIPTS.items() if owner == (facility, mode))
    prefix = b"\x16\x04\x80\x07\0\x16\x05\x80" + struct.pack("<H", facility)
    if mode is not None:
        prefix += b"\x16\x06\x80" + struct.pack("<H", mode)
    prefix += b"\x25\xea\0\x6d"
    m.put(pc - len(prefix), prefix + b"\x25\x0c\x02")
    m.put(0x03000E41, b"\x02")
    m.put(0x03000E44, struct.pack("<II", 0x0809AC99, pc))
    m.put(0x020375E0, struct.pack("<HHH", 7, facility, mode or 0))
    window(m, 0, 0, 26, 18, True)
    return m


@pytest.mark.parametrize(
    "facility,mode",
    [(0, 0), (0, 3), (1, 1), (2, 1), (3, None), (4, 1), (5, None), (6, None), (7, None)],
)
def test_frontier_records_require_exact_native_script_wait_and_drawn_window(facility, mode):
    s = read_frontier_ui(records_fixture(facility, mode).read, 0x08085E5D)
    assert s.diagnostic is None and s.ready is True
    assert s.phase == "frontier_records"
    assert s.details["battle_mode"] == mode


def test_records_decode_current_previous_and_native_count():
    m = records_fixture(1, 1)
    m.put(0x02025000 + 0xD0C + 4, struct.pack("<2H", 20, 10000))
    m.put(0x02025000 + 0xD14 + 4, struct.pack("<2H", 40, 50))
    m.put(0x02025000 + 0xCDC, struct.pack("<I", 1 << 20))
    s = read_frontier_ui(m.read, 0x08085E5D)
    assert s.details["native_current_streaks"] == [20, 10000]
    assert s.details["displayed_current_streaks"] == [20, 9999]
    assert s.details["streak_labels"] == ["CURRENT", "PREVIOUS"]
    assert s.details["native_record_streaks"] == [40, 50]


def test_records_stale_script_wait_is_explicit_harness_bug():
    m = records_fixture(5, None)
    m.put(0x03000E44, bytes(4))
    s = read_frontier_ui(m.read, 0x08085E5D)
    assert s.ready is None and "native controller" in s.diagnostic


def test_recorded_battle_screen_exposes_b_stop_without_fabricated_move():
    m = fixture()
    m.put(0x02022FEC, struct.pack("<I", 1 << 24))
    s = read_frontier_ui(m.read, 0x08038421)
    assert s.phase == "frontier_battle_replay" and s.ready and s.selected is None
    assert "B" in s.controls


@pytest.mark.parametrize("cursor,label", [(0, "YES"), (1, "NO")])
def test_post_link_record_battle_confirmation_has_exact_owner_and_cursor(cursor, label):
    from tests.env.test_ui_state import window

    m = fixture()
    m.put(0x02024332, bytes([5, cursor]))
    window(m, 12, 0, 6, 4, True)
    m.put(0x085CD28F, text("Record battle?") + b"\xff")
    s = read_frontier_ui(m.read, 0x0803937D)
    assert s.ready and s.selected == label and s.diagnostic is None
    assert s.details["message"] == "Record battle?"


@pytest.mark.parametrize(
    "address,body,message",
    [
        (0x020375E2, struct.pack("<H", 6), "source mismatch"),
        (0x0203AB74, b"\xff", "not drawn"),
        (0x03005D90, bytes(4), "SaveBlock2"),
        (0x08249D65, b"\0", "ROM mismatch"),
    ],
)
def test_records_owner_guards_reject_stale_and_corrupt_sources(address, body, message):
    m = records_fixture(1, 0)
    m.put(address, body)
    s = read_frontier_ui(m.read, 0x08085E5D)
    assert s.ready is None and message in s.diagnostic


@pytest.mark.parametrize("finished,ready", [(1, False), (2, None)])
def test_playback_completion_and_corruption_are_not_live_controls(finished, ready):
    m = fixture()
    m.put(0x02022FEC, struct.pack("<I", 1 << 24))
    m.put(0x0203CCD0, bytes([finished]))
    s = read_frontier_ui(m.read, 0x08038421)
    assert s.ready is ready
    if ready is None:
        assert "harness bug" in s.diagnostic


@pytest.mark.parametrize(
    "data,heap,position,message",
    [
        ([2, 0, 0, 3, 1], 0x02030000, 0, "mode"),
        ([2, 0, 0, 1, 1], 0, 0, "heap"),
        ([2, 0, 0, 1, 1], 0x02030000, 5, "page"),
    ],
)
def test_info_card_corruption_cannot_fabricate_selected_trainer(data, heap, position, message):
    m = fixture(DOME_INFO_INPUT, data)
    m.put(DOME_INFO_HEAP, struct.pack("<I", heap))
    m.put(0x02030010, bytes([position]))
    s = read_frontier_ui(m.read, DOME_CALLBACK)
    assert s.ready is None and s.selected is None and message in s.diagnostic


def test_dome_ambiguous_live_owners_are_a_coverage_bug():
    m = fixture()
    put_task(m, 1, DOME_RESULTS_INPUT, [3])
    assert "ambiguous" in read_frontier_ui(m.read, DOME_CALLBACK).diagnostic


def test_dome_unknown_owner_and_invalid_cursor_are_coverage_bugs():
    m = fixture(0x08000001)
    assert "verified" in read_frontier_ui(m.read, DOME_CALLBACK).diagnostic
    m = fixture(data=[2, 32])
    assert "cursor" in read_frontier_ui(m.read, DOME_CALLBACK).diagnostic


def test_recording_confirmation_requires_correct_state_cursor_and_drawn_window():
    m = fixture()
    m.put(0x02024332, bytes([5, 2]))
    assert "cursor" in read_frontier_ui(m.read, 0x0803937D).diagnostic
    m.put(0x02024332, bytes([5, 1]))
    assert "not drawn" in read_frontier_ui(m.read, 0x0803937D).diagnostic


def test_recording_saving_is_a_progress_phase_without_live_yes_no():
    m = fixture()
    m.put(0x02024332, bytes([10, 1]))
    s = read_frontier_ui(m.read, 0x0803937D)
    assert s.phase == "frontier_record_saving" and not s.ready and s.selected is None


@pytest.mark.parametrize(
    "address,body,message",
    [
        (SPECIES_NAMES + 25 * 11, b"\xff", "species table"),
        (0x03005D90, bytes(4), "SaveBlock2"),
        (0x02025000 + 0xD64, struct.pack("<H", 882), "Pokémon index"),
    ],
)
def test_dome_content_invalid_native_tables_are_not_fabricated(address, body, message):
    m = fixture()
    m.put(address, body)
    state = read_frontier_ui(m.read, DOME_CALLBACK)
    assert state.ready is None and state.selected is None and message in state.diagnostic


def test_dome_results_rejects_unrecognized_controller_stage():
    m = fixture(DOME_RESULTS_INPUT, [5])
    assert "results controller state" in read_frontier_ui(m.read, DOME_CALLBACK).diagnostic


def test_recording_confirmation_invalid_rom_message_is_a_diagnostic():
    from tests.env.test_ui_state import window

    m = fixture()
    m.put(0x02024332, bytes([5, 0]))
    window(m, 12, 0, 27, 4, True)
    m.put(0x085CD28F, b"\xff")
    state = read_frontier_ui(m.read, 0x0803937D)
    assert state.selected is None and "question ROM text" in state.diagnostic
