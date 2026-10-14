import struct

import pytest
from test_game_state import Memory, text

from pokebench_env.menu_apprentice import (
    ACK_TASK,
    ANSWER_TASK,
    APPRENTICE_SPECIES_TABLE,
    PRINTING_TASK,
    QUESTION_POINTER,
    read_apprentice_ui,
)
from pokebench_env.pokemon import MOVE_NAMES, SPECIES_NAMES
from tests.env.test_menus import put_task
from tests.env.test_ui_state import menu, window


def fixture(mode=0, cursor=0):
    m = Memory()
    put_task(m, 0, ANSWER_TASK, [0, 0, 0, 0, 1, 0, 0])
    menu(m, cursor, 2 if mode == 1 else 1, 0)
    window(m, 0, 0, 12, 6 if mode == 1 else 4, True)
    m.put(0x020375E2, bytes([mode]))
    m.put(0x03005D90, struct.pack("<I", 0x02025000))
    m.put(0x020250B0, bytes(8))
    for addr, label in [
        (0x085EAEB1, "Lv. 50"),
        (0x085EAEB8, "OPEN LEVEL"),
        (0x085ED193, "GIVE"),
        (0x085ED198, "NO NEED"),
        (0x085EAE62, "YES"),
        (0x085EAE66, "NO"),
    ]:
        m.put(addr, text(label) + b"\xff")
    m.put(SPECIES_NAMES + 25 * 11, text("PIKACHU") + b"\xff")
    m.put(SPECIES_NAMES + 74 * 11, text("GEODUDE") + b"\xff")
    m.put(MOVE_NAMES + 33 * 13, text("TACKLE") + b"\xff")
    m.put(MOVE_NAMES + 45 * 13, text("GROWL") + b"\xff")
    m.put(APPRENTICE_SPECIES_TABLE, struct.pack("<H", 25))
    m.put(QUESTION_POINTER, struct.pack("<I", 0x02030000))
    m.put(0x02030000, struct.pack("<4H", 25, 74, 33, 45))
    return m


@pytest.mark.parametrize(
    "mode,cursor,label",
    [
        (0, 0, "Lv. 50"),
        (0, 1, "OPEN LEVEL"),
        (1, 2, "PIKACHU"),
        (2, 1, "GEODUDE"),
        (3, 0, "TACKLE"),
        (3, 1, "GROWL"),
        (4, 1, "NO NEED"),
        (6, 1, "NO"),
    ],
)
def test_mandatory_answer_options_come_from_native_source(mode, cursor, label):
    s = read_apprentice_ui(fixture(mode, cursor).read, 0x08085E5D)
    assert s.ready and s.selected == label and s.diagnostic is None
    assert s.details["mandatory_answer"] and not s.details["b_cancels"]
    assert "ignored" in s.controls


def test_three_species_menu_uses_native_party_selection_nibbles():
    m = fixture(1)
    m.put(0x020250B2, b"\x01")
    m.put(0x020250B4, b"\x10")
    m.put(APPRENTICE_SPECIES_TABLE + 2, struct.pack("<H", 74))
    s = read_apprentice_ui(m.read, 0x08085E5D)
    assert s.details["species_ids"] == [74, 25, 25]


def test_move_question_records_correct_subject_species():
    s = read_apprentice_ui(fixture(3).read, 0x08085E5D)
    assert s.details["move_ids"] == [33, 45] and s.details["subject_species"] == "PIKACHU"


@pytest.mark.parametrize(
    "mode,address,body,message",
    [
        (2, QUESTION_POINTER, bytes(4), "pointer"),
        (2, 0x02030000, bytes(2), "species"),
        (3, 0x02030004, struct.pack("<H", 999), "move"),
        (1, 0x020250B4, b"\x0f", "table index"),
        (0, 0x020250B0, b"\x10", "identity"),
        (0, 0x020375E2, b"\x05", "type"),
    ],
)
def test_native_species_move_and_owner_uncertainty_is_harness_bug(mode, address, body, message):
    m = fixture(mode)
    m.put(address, body)
    s = read_apprentice_ui(m.read, 0x08085E5D)
    assert (
        s.ready is None
        and s.selected is None
        and "harness bug" in s.diagnostic
        and message in s.diagnostic
    )


def test_b_button_must_not_be_falsely_advertised_as_cancel():
    m = fixture()
    put_task(m, 0, ANSWER_TASK, [0, 0, 0, 0, 0, 0, 0])
    s = read_apprentice_ui(m.read, 0x08085E5D)
    assert s.ready is None and "mandatory" in s.diagnostic


def test_message_printing_and_wait_have_distinct_readiness():
    m = fixture()
    put_task(m, 0, PRINTING_TASK, [])
    s = read_apprentice_ui(m.read, 0x08085E5D)
    assert s.phase == "apprentice_message_printing" and not s.ready
    put_task(m, 0, ACK_TASK, [0x8F21 - 65536, 0x0809])
    s = read_apprentice_ui(m.read, 0x08085E5D)
    assert s.phase == "apprentice_message_wait" and s.ready
    assert s.details["continuation_callback"] == "0x08098F21"


def test_ambiguous_tasks_and_stale_stage_do_not_create_guess():
    m = fixture()
    put_task(m, 1, ACK_TASK, [0x8F21 - 65536, 0x0809])
    assert "ambiguous" in read_apprentice_ui(m.read, 0x08085E5D).diagnostic
    m = fixture(2)
    m.put(0x020250B1, b"\x0c")
    assert "stage" in read_apprentice_ui(m.read, 0x08085E5D).diagnostic


def test_unrelated_owner_is_not_an_apprentice_menu():
    assert read_apprentice_ui(fixture().read, 0x081AAD5D) is None
    m = fixture()
    put_task(m, 0, 0x08000001, [])
    assert read_apprentice_ui(m.read, 0x08085E5D) is None
