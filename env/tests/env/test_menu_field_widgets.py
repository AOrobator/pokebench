import struct

import pytest

from pokebench_env.game_screen import TASKS
from pokebench_env.menu_field_widgets import LINK_RECORDS_PC, read_field_widget_ui
from pokebench_env.pokemon import SPECIES_NAMES
from tests.env.test_menus import put_task
from tests.env.test_ui_state import Memory, text, window


def test_picture_native_species_and_no_invented_button():
    m = Memory()
    put_task(m, 0, 0x080E2899, [1, 25, 2, 0, 0, 1])
    window(m, 1, 0, 8, 8, True)
    m.put(SPECIES_NAMES + 25 * 11, text("PIKACHU") + b"\xff")
    ui = read_field_widget_ui(m.read, 0x08085E5D)
    assert ui.details["species"] == "PIKACHU" and not ui.ready and ui.selected is None
    put_task(m, 0, 0x080E2899, [1, 0, 2, 0, 0, 1])
    assert read_field_widget_ui(m.read, 0x08085E5D).diagnostic


def scroll():
    m = Memory()
    put_task(m, 0, 0x0813A4ED, [2, 2, 1, 1, 5, 4, 0, 0, 0, 0, 0, 1, 0, 1, 1])
    put_task(m, 1, 0x081AE459, [])
    m.put(
        TASKS + 40 + 8,
        struct.pack("<IIIHHBBBBHHHH", 0x02003000, 0, 0, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0),
    )
    window(m, 1, 0, 8, 4, True)
    for i, label in enumerate(["BLUE FLUTE", "EXIT"]):
        ptr = 0x08500000 + i * 128
        m.put(ptr, text(label) + b"\xff")
        m.put(0x02003000 + i * 8, struct.pack("<Ii", ptr, i))
        m.put(0x085B2CF0 + (16 + i) * 4, struct.pack("<I", ptr))
    return m


def test_custom_scroll_list_reads_full_rom_bound_contents():
    m = scroll()
    ui = read_field_widget_ui(m.read, 0x08085E5D)
    assert (
        ui.ready and ui.selected == "BLUE FLUTE" and ui.details["options"] == ["BLUE FLUTE", "EXIT"]
    )
    m.put(TASKS + 40 + 34, struct.pack("<H", 1))
    assert read_field_widget_ui(m.read, 0x08085E5D).selected == "EXIT"
    m.put(0x02003000 + 12, struct.pack("<i", 9))
    assert read_field_widget_ui(m.read, 0x08085E5D).diagnostic


@pytest.mark.parametrize("function", [0x0813A2DD, 0x0813A601, 0x0813A665])
def test_scroll_initial_and_suspended_owners_are_not_input(function):
    m = scroll()
    put_task(m, 0, function, [2, 2, 1, 1, 5, 4, 0, 0, 0, 0, 0, 1, 0, 1, 1])
    assert not read_field_widget_ui(m.read, 0x08085E5D).ready


def save(m):
    m.put(0x03005D8C, struct.pack("<II", 0x02028000, 0x0202C000))


@pytest.mark.parametrize(
    "function,ready",
    [(0x0813C5BD, False), (0x0813C5ED, True), (0x0813C62D, False), (0x0813C665, False)],
)
def test_trainer_hill_records_times_and_controls(function, ready):
    m = Memory()
    save(m)
    put_task(m, 0, function, [])
    window(m, 0, 0, 26, 18, True)
    m.put(0x02028000 + 0x3718, struct.pack("<4I", 3660, 215999, 0, 600))
    ui = read_field_widget_ui(m.read, 0x0813C8ED)
    assert ui.diagnostic is None and ui.ready is ready
    assert ui.details["record_times"] == ["1:01.00", "59:59.99", "0:00.00", "0:10.00"]


def test_link_battle_records_exact_script_and_native_stats():
    m = Memory()
    save(m)
    window(m, 1, 0, 26, 17, True)
    m.put(0x0203AB74, b"\1")
    m.put(0x03000E48, struct.pack("<I", LINK_RECORDS_PC))
    m.put(LINK_RECORDS_PC - 4, b"\x25\xc7\0\x6d\x25\x0c\x02")
    m.put(0x03000E41, b"\2")
    m.put(0x03000E44, struct.pack("<I", 0x0809AC99))
    m.put(0x02028000 + 0x3150, text("ANDREW") + b"\xff\xff" + struct.pack("<4H", 1234, 5, 3, 1))
    m.put(0x02028000 + 0x3150 + 80, b"\2" * 5)
    m.put(0x0202C000 + 0xAC, struct.pack("<I", 123))
    for index, value in zip((23, 24, 25), (8, 4, 2), strict=False):
        m.put(0x02028000 + 0x159C + index * 4, struct.pack("<I", value ^ 123))
    ui = read_field_widget_ui(m.read, 0x08085E5D)
    assert ui.ready and ui.details["totals"] == [8, 4, 2]
    assert ui.details["records"][0] == "ANDREW (ID 1234): 5 wins, 3 losses, 1 draws"
    m.put(LINK_RECORDS_PC - 1, b"\0")
    assert read_field_widget_ui(m.read, 0x08085E5D).diagnostic
