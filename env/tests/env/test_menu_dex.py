import struct

import pytest

from pokebench_env.menu_dex import DEX_CALLBACK, DEX_POINTER, read_dex_ui
from tests.env.test_menus import put_task
from tests.env.test_ui_state import Memory, text

POINTER = 0x02010000


def dex(fn: int, data: list[int] | None = None) -> Memory:
    memory = Memory()
    memory.put(DEX_POINTER, struct.pack("<I", POINTER))
    memory.put(POINTER, struct.pack("<HHHH", 7, 3, 25, 1))
    memory.put(POINTER + 0x60C, struct.pack("<HH", 2, 1))
    put_task(memory, 0, fn, data or [])
    return memory


@pytest.mark.parametrize("fn", [0x080BB7D5, 0x080BBEB9])
def test_dex_list_selected_entry(fn: int) -> None:
    ui = read_dex_ui(dex(fn).read, DEX_CALLBACK)
    assert ui.selected == "POKEDEX #25"
    assert ui.ready is True
    assert ui.details["selected_index"] == 1
    assert ui.details["seen"] is True
    assert ui.details["owned"] is False


@pytest.mark.parametrize("fn,height,count", [(0x080BBA79, 80, 4), (0x080BC0F9, 96, 5)])
def test_dex_list_action_slide_readiness(fn: int, height: int, count: int) -> None:
    memory = dex(fn)
    memory.put(POINTER + 0x650, struct.pack("<Hh", count - 1, height - 8))
    assert read_dex_ui(memory.read, DEX_CALLBACK).ready is False
    memory.put(POINTER + 0x652, struct.pack("<h", height))
    ui = read_dex_ui(memory.read, DEX_CALLBACK)
    assert ui.selected == "CLOSE POKEDEX"
    assert ui.ready is True
    assert len(ui.details["options"]) == count


@pytest.mark.parametrize("fn", [0x080BEDF5, 0x080BF5CD, 0x080BFBB1])
def test_detail_owned_selection(fn: int) -> None:
    memory = dex(fn)
    memory.put(POINTER + 0x64D, b"\2")
    ui = read_dex_ui(memory.read, DEX_CALLBACK)
    assert ui.selected == "SIZE"
    assert ui.details["dex_number"] == 25


@pytest.mark.parametrize("fn,label", [(0x080C15B1, "SHIFT"), (0x080C170D, "COLOR")])
def test_search_navigation_owned_task_values(fn: int, label: str) -> None:
    ui = read_dex_ui(dex(fn, [1, 1]).read, DEX_CALLBACK)
    assert ui.selected == label
    assert ui.details["search_parameter_indices"] == [0] * 6


def test_search_parameter_owned_table() -> None:
    memory = dex(0x080C1BCD, [0, 0, 0, 0, 0, 0, 1])
    memory.put(0x0856EFC8, struct.pack("<IBBH", 0x08010000, 6, 7, 2))
    memory.put(0x08010000 + 4, struct.pack("<I", 0x08011000))
    memory.put(0x08010000 + 12, struct.pack("<I", 0x08012000))
    memory.put(0x08011000, text("NONE") + b"\xff")
    memory.put(0x08012000, text("ABC") + b"\xff")
    ui = read_dex_ui(memory.read, DEX_CALLBACK)
    assert ui.selected == "ABC"
    assert ui.details["options"] == ["NONE", "ABC"]


def test_no_results_is_valid_search_result_message() -> None:
    memory = dex(0x080C1AB9)
    memory.put(POINTER + 0x60C, b"\0" * 4)
    ui = read_dex_ui(memory.read, DEX_CALLBACK)
    assert ui.diagnostic is None
    assert ui.details["list_count"] == 0


def test_caught_entry_owned_dex_number() -> None:
    memory = dex(0x080C0089, [0, 7])
    memory.put(POINTER + 0x60C, b"\0" * 4)
    assert read_dex_ui(memory.read, DEX_CALLBACK).details["dex_number"] == 7


@pytest.mark.parametrize(
    "fault",
    [
        "pointer",
        "owner",
        "count",
        "selection",
        "entry",
        "flags",
        "cursor",
        "detail",
        "search",
        "caught",
        "empty",
    ],
)
def test_invalid_dex_data_never_guesses(fault: str) -> None:
    memory = dex(0x080BB7D5)
    if fault == "pointer":
        memory.put(DEX_POINTER, b"\0" * 4)
    if fault == "owner":
        memory.put(0x03005E00, b"\0" * 4)
    if fault == "count":
        memory.put(POINTER + 0x60C, struct.pack("<H", 387))
    if fault == "selection":
        memory.put(POINTER + 0x60E, struct.pack("<H", 2))
    if fault == "entry":
        memory.put(POINTER + 4, b"\0" * 2)
    if fault == "flags":
        memory.put(POINTER + 6, b"\x04\0")
    if fault == "cursor":
        put_task(memory, 0, 0x080BBA79, [])
        memory.put(POINTER + 0x650, b"\4\0")
    if fault == "detail":
        put_task(memory, 0, 0x080BEDF5, [])
        memory.put(POINTER + 0x64D, b"\4")
    if fault == "search":
        put_task(memory, 0, 0x080C15B1, [3])
    if fault == "caught":
        put_task(memory, 0, 0x080C0089, [0, 387])
    if fault == "empty":
        memory.put(POINTER + 0x60C, b"\0" * 4)
    ui = read_dex_ui(memory.read, DEX_CALLBACK)
    assert ui.diagnostic
    assert ui.selected is None
    assert ui.ready is None


@pytest.mark.parametrize("fault", ["table", "index", "pointer"])
def test_invalid_search_parameter_owner(fault: str) -> None:
    memory = dex(0x080C1BCD, [0, 0])
    memory.put(0x0856EFC8, struct.pack("<IBBH", 0x08010000, 6, 7, 2))
    if fault == "table":
        memory.put(0x0856EFC8 + 4, b"\x10")
    if fault == "index":
        put_task(memory, 0, 0x080C1BCD, [0, 0, 0, 0, 0, 0, 2])
    if fault == "pointer":
        memory.put(0x0856EFC8, b"\0" * 4)
    assert read_dex_ui(memory.read, DEX_CALLBACK).diagnostic


def test_other_callback_and_info_scrolling() -> None:
    assert read_dex_ui(Memory().read, 0) is None
    ui = read_dex_ui(dex(0x080BEDF5, [1]).read, DEX_CALLBACK)
    assert ui.ready is False


@pytest.mark.parametrize("phase,ready", [(0, False), (1, True), (2, False), (3, False)])
def test_area_screen_native_overlay_controls_and_complete_maps(phase, ready):
    from pokebench_env.menu_dex import read_dex_area_ui
    from tests.env.test_ui_state import text

    m = Memory()
    put_task(m, 0, 0x0813D5A1, [phase])
    m.put(0x0203AB7C, struct.pack("<I", 0x02026000))
    m.put(0x02026000 + 14, struct.pack("<H", 25))
    m.put(0x083185C8 + 25 * 11, text("PIKACHU") + b"\xff")
    m.put(0x02026000 + 0x110, struct.pack("<HH", 1, 1))
    m.put(0x02026000 + 16, struct.pack("<BBH", 0, 33, 17))
    m.put(0x02026000 + 0x620, struct.pack("<H", 42))
    for section, name in [(17, "ROUTE 101"), (42, "SAFARI ZONE")]:
        ptr = 0x08020000 + section * 128
        m.put(0x085A147C + section * 8 + 4, struct.pack("<I", ptr))
        m.put(ptr, text(name) + b"\xff")
    ui = read_dex_area_ui(m.read, DEX_CALLBACK)
    assert ui.ready is ready and ui.diagnostic is None
    assert ui.details["species"] == "PIKACHU" and ui.details["region_names"] == [
        "ROUTE 101",
        "SAFARI ZONE",
    ]
    m.put(0x02026000 + 0x110, struct.pack("<H", 65))
    assert read_dex_area_ui(m.read, DEX_CALLBACK).diagnostic
