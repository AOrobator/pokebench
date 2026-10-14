import struct

import pytest

from pokebench_env.game_screen import TASKS
from pokebench_env.menu_pc import (
    FIELD_CALLBACK,
    MULTICHOICE_TABLE,
    MULTICHOICE_TASK,
    PC_ITEM_ACTION_TASK,
    PC_ITEM_LIST_TASK,
    PC_ITEM_QUANTITY_TASK,
    PC_MAIL_ACTION_TASK,
    PC_MAIL_LIST_TASK,
    PC_STORAGE_HEAP,
    PC_TOP_TASK,
    STORAGE_CALLBACK,
    YESNO_TASK,
    read_pc_ui,
)
from pokebench_env.menus import LIST_TASK, PALETTE_FADE
from tests.env.test_menus import put_task
from tests.env.test_ui_state import Memory, menu, text, window


def setup(function, selection=0, count=2, data=None):
    m = Memory()
    put_task(m, 0, function, data or [])
    menu(m, selection, count - 1, 0)
    window(m, 0, 0, 8, count * 2, True)
    for index, name in enumerate(["TAKE OUT ITEMS", "STORE ITEMS", "THROW AWAY ITEMS", "GO BACK"]):
        address = 0x085F8000 + index * 64
        m.put(address, text(name) + b"\xff")
        m.put(0x085DFEA4 + index * 4, struct.pack("<I", address))
    m.put(0x03005D8C, struct.pack("<I", 0x02030000))
    m.put(0x02030000 + 0x498 + 7 * 4, struct.pack("<HH", 13, 1))
    m.put(0x085839A0 + 13 * 44, text("POTION") + b"\xff")
    m.put(0x085839A0 + 13 * 44 + 14, struct.pack("<H", 13))
    m.put(0x085839A0 + 13 * 44 + 20, struct.pack("<I", 0x085F9000))
    m.put(0x085F9000, text("RESTORES HP") + b"\xff")
    return m


def options(m, pointer, names):
    for index, name in enumerate(names):
        address = 0x085F0000 + index * 64
        m.put(address, text(name) + b"\xff")
        m.put(pointer + index * 8, struct.pack("<II", address, 0))


def test_standard_field_multichoice_native_labels_and_delay():
    m = setup(MULTICHOICE_TASK, 1, 3, [0, 0, 0, 0, 0, 0, 0, 2])
    pointer = 0x085E0000
    m.put(MULTICHOICE_TABLE + 2 * 8, struct.pack("<IB3x", pointer, 3))
    options(m, pointer, ["ENTER", "INFO", "CANCEL"])
    ui = read_pc_ui(m.read, FIELD_CALLBACK)
    assert (ui.phase, ui.selected, ui.ready) == ("field_multichoice", "INFO", True)
    assert ui.details["options"] == ["ENTER", "INFO", "CANCEL"]
    m.put(0x02039F90, b"\x02")
    assert read_pc_ui(m.read, FIELD_CALLBACK).ready is False
    m.put(MULTICHOICE_TABLE + 2 * 8 + 4, b"\x02")
    assert read_pc_ui(m.read, FIELD_CALLBACK).diagnostic.startswith("harness bug:")


@pytest.mark.parametrize(
    "champion,lanette", [(False, False), (False, True), (True, False), (True, True)]
)
def test_dynamic_pc_access_options_follow_native_flags(champion, lanette):
    m = setup(MULTICHOICE_TASK, 0, 4 if champion else 3, [0, 0, 0, 0, 0, 0, 0, 1])
    save = 0x02030000
    m.put(0x03005D8C, struct.pack("<I", save))
    for flag, value in [(0x864, champion), (0x8AB, lanette)]:
        if value:
            address = save + 0x1270 + (flag >> 3)
            m.put(address, bytes([m.read(address, 1)[0] | (1 << (flag & 7))]))
    ui = read_pc_ui(m.read, FIELD_CALLBACK)
    assert ui.selected == ("LANETTE'S PC" if lanette else "SOMEONE'S PC")
    assert ("HALL OF FAME" in ui.details["options"]) == champion
    assert ui.details["options"][-1] == "LOG OFF"


def test_yes_no_waits_for_owner_delay():
    m = setup(YESNO_TASK, 1, 2, [0, 0, 4])
    assert read_pc_ui(m.read, FIELD_CALLBACK).selected == "NO"
    assert read_pc_ui(m.read, FIELD_CALLBACK).ready is False
    put_task(m, 0, YESNO_TASK, [0, 0, 5])
    assert read_pc_ui(m.read, FIELD_CALLBACK).ready is True


@pytest.mark.parametrize(
    "fn,phase,expected",
    [
        (PC_TOP_TASK, "pc_player_menu", "TURN OFF"),
        (PC_ITEM_ACTION_TASK, "pc_item_storage_menu", "TOSS ITEM"),
        (PC_MAIL_ACTION_TASK, "pc_mail_action", "GIVE"),
    ],
)
def test_player_pc_action_menus(fn, phase, expected):
    m = setup(fn, 2, 3 if fn == PC_TOP_TASK else 4)
    m.put(0x0203BCB4, b"\x03")
    m.put(0x0203BCB0, struct.pack("<I", 0x085DF000))
    m.put(0x085DF000, bytes([0, 1, 3]))
    ui = read_pc_ui(m.read, FIELD_CALLBACK)
    assert (ui.phase, ui.selected) == (phase, expected)
    m.put(PALETTE_FADE + 7, b"\x80")
    assert read_pc_ui(m.read, FIELD_CALLBACK).ready is False


@pytest.mark.parametrize("fn", [PC_ITEM_LIST_TASK, PC_MAIL_LIST_TASK])
def test_pc_lists_have_exact_active_list_owner(fn):
    m = setup(fn, data=[0, 0, 0, 0, 0, 1])
    body = bytearray(40)
    struct.pack_into("<I", body, 0, LIST_TASK)
    body[4] = 1
    struct.pack_into("<I", body, 8, 0x02010000)
    struct.pack_into("<HH", body, 20, 2, 2)
    body[24] = 0
    struct.pack_into("<HH", body, 32, 0, 1)
    m.put(TASKS + 40, body)
    m.put(0x02010008, struct.pack("<Ii", 0x02010100, 7))
    m.put(0x02010100, text("POTION") + b"\xff")
    ui = read_pc_ui(m.read, FIELD_CALLBACK)
    assert ui.selected == "POTION"
    assert ui.details["list_id"] == 7
    body[4] = 0
    m.put(TASKS + 40, body)
    assert read_pc_ui(m.read, FIELD_CALLBACK).selected is None


def test_pc_quantity_native_plain_quantity_and_selected_slot():
    m = setup(PC_ITEM_QUANTITY_TASK, data=[0, 0, 3, 0])
    m.put(0x03005D8C, struct.pack("<I", 0x02030000))
    m.put(0x0203BCB8, struct.pack("<HH", 1, 2))
    m.put(0x02030000 + 0x498 + 3 * 4, struct.pack("<HH", 13, 7))
    item = 0x085839A0 + 13 * 44
    m.put(item, text("POTION") + b"\xff")
    m.put(item + 14, struct.pack("<H", 13))
    ui = read_pc_ui(m.read, FIELD_CALLBACK)
    assert (ui.selected, ui.value) == ("POTION", "3")
    assert ui.details["maximum"] == 7
    put_task(m, 0, PC_ITEM_QUANTITY_TASK, [0, 0, 8, 0])
    assert read_pc_ui(m.read, FIELD_CALLBACK).selected is None


def test_storage_cursor_and_action_menu_with_native_heap():
    m = Memory()
    heap = 0x02010000
    m.put(PC_STORAGE_HEAP, struct.pack("<I", heap))
    m.put(heap, b"\x00\x02")
    m.put(0x02039D78, bytes([0, 29]))
    m.put(0x03005D94, struct.pack("<I", 0x02028000))
    m.put(0x02028000, b"\x05")
    put_task(m, 0, 0x080C82AD, [])
    ui = read_pc_ui(m.read, STORAGE_CALLBACK)
    assert (ui.selected, ui.ready) == ("box slot 29", True)
    assert ui.details["box"] == 5
    assert ui.details["operation"] == "move_pokemon"
    m.put(heap, b"\x01")
    assert read_pc_ui(m.read, STORAGE_CALLBACK).ready is False
    menu(m, 1, 2, 0)
    window(m, 0, 0, 8, 6, True)
    m.put(heap + 0xCAC, b"\x03")
    m.put(heap + 0xCB0, struct.pack("<H", 0))
    options(m, heap + 0xC74, ["MOVE", "SUMMARY", "CANCEL"])
    ui = read_pc_ui(m.read, STORAGE_CALLBACK)
    assert (ui.phase, ui.selected) == ("pc_pokemon_action", "SUMMARY")


def test_unowned_undrawn_duplicate_and_invalid_data_never_guess():
    m = Memory()
    assert read_pc_ui(m.read, FIELD_CALLBACK) is None
    assert read_pc_ui(m.read, 0) is None
    put_task(m, 0, PC_ITEM_ACTION_TASK, [])
    assert read_pc_ui(m.read, FIELD_CALLBACK).diagnostic is not None
    put_task(m, 1, PC_ITEM_ACTION_TASK, [])
    assert read_pc_ui(m.read, FIELD_CALLBACK).diagnostic is not None
    ui = read_pc_ui(m.read, STORAGE_CALLBACK)
    assert ui.selected is None and "heap" in ui.diagnostic


@pytest.mark.parametrize("failure", ["area", "operation", "slot", "pointer", "box", "count"])
def test_storage_invalid_native_fields_are_harness_bugs(failure):
    m = Memory()
    heap = 0x02010000
    m.put(PC_STORAGE_HEAP, struct.pack("<I", heap))
    m.put(heap, b"\x00\x02")
    m.put(0x02039D78, bytes([0, 29]))
    m.put(0x03005D94, struct.pack("<I", 0x02028000))
    if failure == "area":
        m.put(0x02039D78, b"\x04")
    elif failure == "operation":
        m.put(heap + 1, b"\x04")
    elif failure == "slot":
        m.put(0x02039D79, b"\x1e")
    elif failure == "pointer":
        m.put(0x03005D94, bytes(4))
    elif failure == "box":
        m.put(0x02028000, b"\x0e")
    else:
        menu(m, 0, 2, 0)
        window(m, 0, 0, 8, 6, True)
        m.put(heap + 0xCAC, b"\x02")
        options(m, heap + 0xC74, ["MOVE", "CANCEL"])
    ui = read_pc_ui(m.read, STORAGE_CALLBACK)
    assert ui.selected is None
    assert ui.diagnostic.startswith("harness bug:")


@pytest.mark.parametrize("failure", ["id", "pointer", "count", "pc_save", "pc_flags", "pc_order"])
def test_field_invalid_options_never_report_plausible_selection(failure):
    m = setup(MULTICHOICE_TASK, 0, 2, [0, 0, 0, 0, 0, 0, 0, 2])
    m.put(MULTICHOICE_TABLE + 16, struct.pack("<IB3x", 0x085E0000, 2))
    options(m, 0x085E0000, ["ENTER", "CANCEL"])
    if failure == "id":
        put_task(m, 0, MULTICHOICE_TASK, [0, 0, 0, 0, 0, 0, 0, 114])
    elif failure == "pointer":
        m.put(MULTICHOICE_TABLE + 16, bytes(4))
    elif failure == "count":
        m.put(MULTICHOICE_TABLE + 20, b"\x21")
    elif failure in ("pc_save", "pc_flags"):
        put_task(m, 0, MULTICHOICE_TASK, [0, 0, 0, 0, 0, 0, 0, 1])
        if failure == "pc_flags":
            m.put(0x03005D8C, struct.pack("<I", 0x02030000))
    else:
        put_task(m, 0, PC_TOP_TASK, [])
        m.put(0x0203BCB4, b"\x03")
        m.put(0x0203BCB0, struct.pack("<I", 0x085DF000))
        m.put(0x085DF000, bytes([0, 1, 4]))
    ui = read_pc_ui(m.read, FIELD_CALLBACK)
    assert ui.selected is None
    assert ui.diagnostic.startswith("harness bug:")


def test_grid_recovers_exact_pending_bytecode_id_without_matching_counts():
    from pokebench_env.menu_pc import GRID_TASK

    m = setup(GRID_TASK, 2, 4)
    pc = 0x08200006
    context = bytearray(12)
    context[1] = 1
    struct.pack_into("<I", context, 8, pc)
    m.put(0x03000E40, context)
    m.put(0x03000E38, b"\x01")
    m.put(pc - 6, bytes([0x71, 0, 0, 4, 2, 0]))
    m.put(0x0203CD90 + 9, bytes([2, 2]))
    m.put(MULTICHOICE_TABLE + 4 * 8, struct.pack("<IB3x", 0x085E0000, 4))
    options(m, 0x085E0000, ["COOL", "BEAUTY", "CUTE", "SMART"])
    ui = read_pc_ui(m.read, FIELD_CALLBACK)
    assert (ui.phase, ui.selected) == ("field_multichoice_grid", "CUTE")
    assert ui.details["menu_id"] == 4
    m.put(pc - 6, b"\x70")
    assert read_pc_ui(m.read, FIELD_CALLBACK).selected is None


def test_dynamic_tidal_list_reports_actual_ticket_filtered_destinations():
    m = setup(MULTICHOICE_TASK, 1, 3, [0, 0, 0, 0, 0, 0, 0, 8])
    m.put(0x03001124, bytes([0, 5, 6, 255, 255, 255, 255]))
    ui = read_pc_ui(m.read, FIELD_CALLBACK)
    assert ui.selected == "FARAWAY ISLAND"
    assert ui.details["options"] == ["SLATEPORT CITY", "FARAWAY ISLAND", "EXIT"]
    m.put(0x03001124, bytes([0, 7, 6, 255, 255, 255, 255]))
    assert read_pc_ui(m.read, FIELD_CALLBACK).selected is None


@pytest.mark.parametrize("function", [0x080C8D79, 0x080C99D9])
def test_storage_box_selector_uses_active_choose_box_context(function):
    m = Memory()
    heap = 0x02010000
    m.put(PC_STORAGE_HEAP, struct.pack("<I", heap))
    m.put(heap, bytes([1, 2]))
    m.put(0x02039D78, bytes([0, 3]))
    m.put(0x03005D94, struct.pack("<I", 0x02028000))
    choose = 0x02020000
    m.put(0x02039D04, struct.pack("<I", choose))
    m.put(choose + 0x244, b"\x0d")
    put_task(m, 0, function, [])
    ui = read_pc_ui(m.read, STORAGE_CALLBACK)
    assert (ui.phase, ui.selected) == ("pc_choose_box", "box 13")
    m.put(choose + 0x244, b"\x0e")
    assert read_pc_ui(m.read, STORAGE_CALLBACK).selected is None


@pytest.mark.parametrize(
    "function,state,action",
    [
        (0x080C8EB5, 1, "release_pokemon"),
        (0x080C954D, 1, "put_held_item_in_bag"),
        (0x080C9BE9, 2, "exit_storage"),
        (0x080C9D1D, 2, "continue_storage"),
    ],
)
def test_pc_confirmation_has_exact_task_and_native_phase(function, state, action):
    m = setup(function, 1, 2)
    heap = 0x02010000
    m.put(PC_STORAGE_HEAP, struct.pack("<I", heap))
    m.put(heap, bytes([state, 2]))
    m.put(0x02039D78, bytes([0, 3]))
    m.put(0x03005D94, struct.pack("<I", 0x02028000))
    ui = read_pc_ui(m.read, STORAGE_CALLBACK)
    assert (ui.phase, ui.selected) == ("pc_confirmation", "NO")
    assert ui.details["action"] == action
    m.put(heap, b"\x00")
    assert read_pc_ui(m.read, STORAGE_CALLBACK).phase != "pc_confirmation"


def test_callback_confirmation_binds_native_yesno_functions():
    from pokebench_env.menu_pc import CALLBACK_YESNO_TASK

    m = setup(CALLBACK_YESNO_TASK, 1, 2, [0, 0, 3, 1])
    m.put(0x0203A138, struct.pack("<II", 0x0816CA95, 0x0816CAC9))
    ui = read_pc_ui(m.read, FIELD_CALLBACK)
    assert (ui.phase, ui.selected) == ("pc_toss_confirmation", "NO")
    assert ui.details["quantity"] == 3
    m.put(0x0203A138, struct.pack("<II", 0x08012345, 0x08054321))
    assert read_pc_ui(m.read, FIELD_CALLBACK).phase == "field_confirmation"
    m.put(0x0203A138, bytes(8))
    assert read_pc_ui(m.read, FIELD_CALLBACK).selected is None


def test_mail_reader_records_game_converted_message_and_sender():
    from pokebench_env.menu_pc import MAIL_CALLBACK, MAIL_INITIALIZE_CALLBACK

    m = Memory()
    heap = 0x02010000
    m.put(0x0203A134, struct.pack("<I", heap))
    body = bytearray(0x1C)
    struct.pack_into("<II", body, 0, 0x08121CC1, 0x02030000)
    body[8] = 1
    body[10] = 3
    struct.pack_into("<I", body, 0x18, 0x085F0000)
    m.put(heap + 0x210, body)
    m.put(0x085F0000, b"\x02")
    m.put(heap, text("HELLO FRIEND") + b"\xff")
    m.put(heap + 64, text("THANK YOU") + b"\xff")
    m.put(heap + 0x200, text("ANDREW") + b"\xff")
    m.put(0x02030000, struct.pack("<9H", *range(9)))
    m.put(0x02030020, struct.pack("<H", 121))
    ui = read_pc_ui(m.read, MAIL_CALLBACK)
    assert ui.phase == "mail_reading" and ui.ready is True
    assert ui.details["message"] == "HELLO FRIEND THANK YOU"
    assert ui.details["sender"] == "ANDREW"
    assert ui.details["word_ids"] == list(range(9))
    assert read_pc_ui(m.read, MAIL_INITIALIZE_CALLBACK).ready is False
    struct.pack_into("<I", body, 0, 0x08121C99)
    m.put(heap + 0x210, body)
    assert read_pc_ui(m.read, MAIL_CALLBACK).ready is False
    m.put(0x085F0000, b"\x09")
    assert read_pc_ui(m.read, MAIL_CALLBACK).diagnostic.startswith("harness bug:")
