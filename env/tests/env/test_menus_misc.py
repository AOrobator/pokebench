import struct

import pytest

from pokebench_env.game_screen import TASKS
from pokebench_env.menus import PALETTE_FADE
from pokebench_env.menus_misc import (
    DECOR_ACTIONS,
    DECOR_CATEGORIES,
    DECOR_CONTEXT,
    DECORATIONS,
    HOF_POINTER,
    PRINTERS,
    SPRITES,
    read_misc_menu,
)
from pokebench_env.pokemon import SPECIES_NAMES
from tests.env.test_menus import list_task, put_task
from tests.env.test_ui_state import Memory, menu, message, text, window

SCREEN = 0x02015000


def decoration(m, index, label):
    body = bytearray(32)
    body[0] = index
    body[1 : 1 + len(label) + 1] = text(label) + b"\xff"
    pointer = 0x085F0000 + index * 256
    struct.pack_into("<I", body, 24, pointer)
    m.put(DECORATIONS + 32 * index, body)
    m.put(pointer, text("A DESK.") + b"\xff")


def decor(function=0x08126B81):
    m = Memory()
    for category, capacity in enumerate((10, 10, 10, 30, 30, 10, 40, 10)):
        m.put(0x0203BC40 + 8 * category, struct.pack("<IB", SCREEN + 128 + 64 * category, capacity))
    put_task(m, 0, function, [7, 8, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 1])
    m.put(DECOR_CONTEXT, struct.pack("<IIBB", SCREEN, SCREEN + 32, 16, 0))
    for i, label in enumerate(["DECORATE", "PUT AWAY", "TOSS", "CANCEL"]):
        pointer = 0x085E0000 + i * 64
        m.put(DECOR_ACTIONS + 8 * i, struct.pack("<I", pointer))
        m.put(pointer, text(label) + b"\xff")
    for i, label in enumerate(
        ["DESK", "CHAIR", "PLANT", "ORNAMENT", "MAT", "POSTER", "DOLL", "CUSHION"]
    ):
        pointer = 0x085E1000 + i * 64
        m.put(DECOR_CATEGORIES + 4 * i, struct.pack("<I", pointer))
        m.put(pointer, text(label) + b"\xff")
    menu(m, 0, 3, 0)
    window(m, 0, 0, 18, 8, True)
    return m


def test_decoration_main_actions_and_room_context_are_observable():
    m = decor()
    ui = read_misc_menu(m.read, 0x08085E5D)
    assert (ui.phase, ui.selected, ui.ready) == ("decoration_actions", "DECORATE", True)
    assert ui.details["options"] == ["DECORATE", "PUT AWAY", "TOSS", "CANCEL"]
    menu(m, 2, 3, 0)
    m.put(DECOR_CONTEXT + 9, b"\x01")
    ui = read_misc_menu(m.read, 0x08085E5D)
    assert ui.selected == "TOSS" and ui.details["room_context"] == "player_room"
    m.put(PALETTE_FADE + 7, b"\x80")
    assert read_misc_menu(m.read, 0x08085E5D).ready is False
    # The same suspended task cannot own an unrelated screen.
    assert read_misc_menu(m.read, 0x081BFAB5) is None


def test_decoration_category_cursor_includes_real_cancel_label():
    m = decor(0x08127089)
    menu(m, 7, 8, 0)
    window(m, 0, 0, 13, 18, True)
    assert read_misc_menu(m.read, 0x08085E5D).selected == "CUSHION"
    menu(m, 8, 8, 0)
    assert read_misc_menu(m.read, 0x08085E5D).selected == "CANCEL"
    window(m, 0, 0, 13, 18, False)
    assert "undrawn" in read_misc_menu(m.read, 0x08085E5D).diagnostic


def test_decoration_owned_inventory_follows_id_table_not_list_row_id():
    m = decor(0x0812764D)
    m.put(0x0203A14C, struct.pack("<I", SCREEN + 64))
    m.put(0x0203A151, b"\x02")
    m.put(SCREEN + 64, b"\x01\x02")
    decoration(m, 1, "SMALL DESK")
    decoration(m, 2, "POKEMON DESK")
    list_task(m, 1)
    m.put(0x02011000 + 4, struct.pack("<i", 1))
    ui = read_misc_menu(m.read, 0x08085E5D)
    assert ui.details["decoration_id"] == 2 and ui.details["decoration_name"] == "POKEMON DESK"
    m.put(0x02011000 + 4, struct.pack("<i", 2))
    assert "outside" in read_misc_menu(m.read, 0x08085E5D).diagnostic


@pytest.mark.parametrize(
    "progress,pending,ready", [(0, 0, True), (1, 0, False), (7, 0, False), (0, 1, False)]
)
def test_decoration_location_world_cursor_and_interpolation(progress, pending, ready):
    m = decor(0x08128E19)
    put_task(m, 0, 0x08128E19, [10, 14, 0, 0, 0, 2, 3, 0, 0, 0, pending, 0, 0])
    m.put(0x0203AA38, b"\x02")
    m.put(SPRITES + 2 * 0x44 + 0x36, struct.pack("<h", progress))
    ui = read_misc_menu(m.read, 0x08085E5D)
    assert ui.selected == "(3, 7)" and ui.ready is ready
    assert ui.details["decoration_width"] == 2
    put_task(m, 0, 0x08128E19, [10, 14, 0, 0, 0, 2, 3, 0, 0, 0, pending, 0, 1])
    assert read_misc_menu(m.read, 0x08085E5D).phase == "decoration_put_away_location"


@pytest.mark.parametrize(
    "continuation,expects_input",
    [(0x08127A5D, True), (0x08129021, True), (0x08129D65, True), (0x08126DA5, False)],
)
def test_decoration_message_wait_uses_actual_printer_lifetime(continuation, expects_input):
    m = decor(0x08121F3D)
    m.put(0x0300117C, struct.pack("<I", continuation))
    m.put(0x0203A140, b"\x00")
    message(m, text("CANNOT PLACE HERE."))
    m.put(PRINTERS + 0x1B, b"\x01")
    assert read_misc_menu(m.read, 0x08085E5D).ready is False
    m.put(PRINTERS + 0x1B, b"\x00")
    ui = read_misc_menu(m.read, 0x08085E5D)
    assert ui.ready is expects_input
    assert ui.details["message"] == "CANNOT PLACE HERE."


def hof(pc=True, function=None):
    m = Memory()
    m.put(HOF_POINTER, struct.pack("<I", SCREEN))
    for species, label in [(283, "MUDKIP"), (412, "EGG")]:
        m.put(SPECIES_NAMES + 11 * species, text(label) + b"\xff")
    raw = bytearray(120)
    for i, (species, nickname) in enumerate([(283, "WATER"), (412, "EGG")]):
        struct.pack_into("<IIH", raw, i * 20, 10 + i, 50 + i, species | (5 << 9))
        value = text(nickname) + b"\xff"
        raw[i * 20 + 10 : i * 20 + 10 + len(value)] = value
    m.put(SCREEN, raw)
    put_task(
        m,
        0,
        function or (0x08174729 if pc else 0x08174029),
        [0, 4 if pc else 1, 1 if pc else 2, 0, 2],
    )
    return m


def test_hof_pc_packed_species_level_identity_and_egg_are_decoded():
    m = hof()
    ui = read_misc_menu(m.read, 0x08173561)
    assert ui.selected == "EGG" and ui.ready is True
    assert ui.details["species_ids"] == [283, 412]
    assert ui.details["levels"] == [5, 5] and ui.details["identities"] == [
        "00000032:0000000a",
        "00000033:0000000b",
    ]
    assert ui.details["page_number"] == 4
    put_task(m, 0, 0x08174729, [0, 4, 0, 0, 2])
    assert read_misc_menu(m.read, 0x08173561).selected == "MUDKIP"


def test_hof_pc_120_byte_team_stride_and_ten_char_nickname():
    m = hof()
    raw = m.read(SCREEN, 120)
    m.put(SCREEN + 120, raw)
    m.put(SCREEN + 120 + 10, text("ABCDEFGHIJ"))
    put_task(m, 0, 0x08174729, [1, 3, 0, 0, 2])
    ui = read_misc_menu(m.read, 0x08173561)
    assert ui.details["nicknames"][0] == "ABCDEFGHIJ" and ui.details["team_index"] == 1


@pytest.mark.parametrize("packed", [413 | (5 << 9), 283, 283 | (101 << 9)])
def test_hof_invalid_record_has_bounded_raw_diagnostic(packed):
    m = hof()
    m.put(SCREEN + 8, struct.pack("<H", packed))
    ui = read_misc_menu(m.read, 0x08173561)
    assert ui.ready is None and "species/level" in ui.diagnostic
    assert len(ui.details["team_raw_hex"]) == 240


def test_hof_player_info_exit_corrupt_screen_and_init_are_distinct():
    m = hof(False)
    ui = read_misc_menu(m.read, 0x08173561)
    assert ui.selected == "CONTINUE" and ui.phase == "hall_of_fame_player_info"
    put_task(m, 0, 0x08174A09, [])
    ui = read_misc_menu(m.read, 0x08173561)
    assert (
        ui.phase == "hall_of_fame_save_corrupted"
        and ui.selected == "EXIT"
        and ui.diagnostic is None
    )
    m.put(TASKS + 4, b"\x00")
    assert read_misc_menu(m.read, 0x08174195).ready is False


def test_hof_impossible_cursor_and_duplicate_owner_are_harness_bugs():
    m = hof()
    put_task(m, 0, 0x08174729, [0, 4, 2, 0, 2])
    assert read_misc_menu(m.read, 0x08173561).diagnostic
    put_task(m, 1, 0x08174029, [])
    assert "multiple" in read_misc_menu(m.read, 0x08173561).diagnostic


def test_secret_base_registry_list_cancel_and_actions():
    m = Memory()
    put_task(m, 0, 0x080E9E91, [2, 0, 0, 2, 0, 1])
    list_task(m, 1)
    m.put(0x02011000 + 4, struct.pack("<i", 17))
    ui = read_misc_menu(m.read, 0x08085E5D)
    assert ui.selected == "POTION" and ui.details["selected_base_id"] == 17
    m.put(0x02011000 + 4, struct.pack("<i", -2))
    assert read_misc_menu(m.read, 0x08085E5D).details["selected_base_id"] == -2
    put_task(m, 0, 0x080E9FB1, [2, 0, 0, 2, 17, 1])
    for i, label in enumerate(["DEL REGIST", "CANCEL"]):
        address = 0x085F2000 + i * 64
        m.put(0x0858D048 + 8 * i, struct.pack("<I", address))
        m.put(address, text(label) + b"\xff")
    menu(m, 1, 1, 0)
    window(m, 0, 0, 5, 4, True)
    assert read_misc_menu(m.read, 0x08085E5D).selected == "CANCEL"


def test_unrelated_callback_never_reads_stale_tasks():
    def unreadable(address, length):
        raise AssertionError("unrelated callback must not read memory")

    assert read_misc_menu(unreadable, 0) is None
