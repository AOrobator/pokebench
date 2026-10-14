import struct

import pytest

from pokebench_env.menu_nav import NAV_CALLBACK, NAV_CALLBACK_TABLE, NAV_POINTER, read_nav_ui
from tests.env.test_menus import put_task
from tests.env.test_ui_state import Memory, text, window

RESOURCE = 0x02010000
HANDLER = 0x02027000
MON_LIST = 0x02026000
LIST = 0x02023000
GRAPH = 0x02014000
CALL = 0x02028000
SUMMARY = 0x02029000
REGION = 0x02020000
INPUTS = [0x081C941D] * 6 + [
    0x081CC555,
    0x081CD071,
    0x081CEFDD,
    0x081CD071,
    0x081CEFDD,
    0x081CAB25,
    0x081CFA35,
    0x081D04A1,
    0x081CFA35,
]


def nav(index: int = 0, state: int = 3) -> Memory:
    memory = Memory()
    memory.put(NAV_POINTER, struct.pack("<I", RESOURCE))
    memory.put(RESOURCE, struct.pack("<IIH", INPUTS[index], index, 0))
    memory.put(NAV_CALLBACK_TABLE + index * 28 + 4, struct.pack("<I", INPUTS[index]))
    put_task(memory, 0, 0x081C742D, [state])
    memory.put(RESOURCE + 16 + 1 * 4, struct.pack("<I", HANDLER))
    memory.put(HANDLER, struct.pack("<HhHHII", 0, 1, 1, 0, 100000, 0x081C943D))
    memory.put(RESOURCE + 16 + 18 * 4, struct.pack("<I", MON_LIST))
    memory.put(MON_LIST, struct.pack("<HHBBHBBH", 2, 0, 14, 0, 3, 14, 1, 5))
    memory.put(RESOURCE + 16 + 11 * 4, struct.pack("<I", GRAPH))
    memory.put(GRAPH + 0x6304, struct.pack("<I", 0x081CD08D))
    memory.put(RESOURCE + 16 + 17 * 4, struct.pack("<I", LIST))
    memory.put(LIST + 8, struct.pack("<H", 2))
    memory.put(LIST + 0x888, struct.pack("<5H2xII", 0, 2, 0, 0, 2, 4, 0x02025000))
    memory.put(0x02025000, struct.pack("<BBHBBH", 14, 0, 3, 14, 1, 5))
    window(memory, 2, 0, 16, 16, True)
    memory.put(RESOURCE + 16 + 16 * 4, struct.pack("<I", REGION))
    memory.put(0x0203A144, struct.pack("<I", REGION))
    memory.put(REGION, struct.pack("<HBB", 0, 2, 0))
    memory.put(REGION + 4, text("LITTLEROOT TOWN") + b"\xff")
    memory.put(REGION + 0x18, struct.pack("<I", 0x081230C5))
    memory.put(REGION + 0x54, struct.pack("<HH", 4, 12))
    memory.put(RESOURCE + 16 + 5 * 4, struct.pack("<I", CALL))
    memory.put(CALL + 24, struct.pack("<I", 0x081CAB45))
    memory.put(RESOURCE + 16 + 13 * 4, struct.pack("<I", SUMMARY))
    memory.put(SUMMARY + 8, struct.pack("<I", MON_LIST))
    memory.put(SUMMARY + 12, struct.pack("<4H", 0, 0, 2, 1))
    memory.put(SUMMARY + 20, struct.pack("<2I", 0, 1))
    memory.put(SUMMARY + 120, struct.pack("<I", 25))
    memory.put(SUMMARY + 0x98, struct.pack("<I", 0x081D04C5))
    memory.put(0x03005D8C, struct.pack("<I", 0x02030000))
    memory.put(0x02030000 + 0x31A8, bytes([1]))
    for table in (0x086239AC, 0x08623DF8):
        for ribbon in range(2):
            memory.put(table + ribbon * 8, struct.pack("<II", 0x08014000, 0x08015000))
    memory.put(0x08014000, text("CHAMPION RIBBON") + b"\xff")
    memory.put(0x08015000, text("FOR BEATING THE CHAMPION") + b"\xff")
    if index == 11:
        memory.put(0x02025000, struct.pack("<BBHBBH", 0, 0, 0, 0, 1, 0))
        memory.put(0x085500A4, struct.pack("<H", 1))
        memory.put(0x08310030 + 40 + 1, bytes([0]))
        memory.put(0x08310030 + 40 + 4, text("ROXANNE") + b"\xff")
        memory.put(0x0830FCD4, text("LEADER") + b"\xff")
    return memory


@pytest.mark.parametrize("index", range(15))
def test_each_nav_family_has_owned_selection(index: int) -> None:
    ui = read_nav_ui(nav(index).read, NAV_CALLBACK)
    assert ui.diagnostic is None
    assert ui.selected is not None
    assert ui.ready is True
    assert ui.details["pokenav_menu_index"] == index


@pytest.mark.parametrize(
    "menu_type,cursor,label",
    [
        (0, 2, "SWITCH OFF"),
        (1, 2, "MATCH CALL"),
        (2, 3, "RIBBONS"),
        (3, 1, "SEARCH"),
        (4, 4, "TOUGH"),
    ],
)
def test_dynamic_nav_menu_options(menu_type: int, cursor: int, label: str) -> None:
    memory = nav()
    memory.put(HANDLER, struct.pack("<Hh", menu_type, cursor))
    ui = read_nav_ui(memory.read, NAV_CALLBACK)
    assert ui.selected == label


def test_root_and_inner_transition_readiness() -> None:
    assert read_nav_ui(nav(state=2).read, NAV_CALLBACK).ready is False
    memory = nav()
    memory.put(HANDLER + 12, struct.pack("<I", 0x081C9601))
    assert read_nav_ui(memory.read, NAV_CALLBACK).ready is False


def test_party_condition_cancel_is_not_a_pokemon() -> None:
    memory = nav(7)
    memory.put(MON_LIST + 2, struct.pack("<H", 1))
    ui = read_nav_ui(memory.read, NAV_CALLBACK)
    assert ui.selected == "CANCEL"
    assert ui.details["is_cancel"] is True


def test_match_call_options_are_owned_not_stale() -> None:
    memory = nav(11)
    memory.put(CALL, struct.pack("<HHI", 1, 2, 0x08010000))
    memory.put(0x08010000, bytes([0, 1, 2]))
    ui = read_nav_ui(memory.read, NAV_CALLBACK)
    assert ui.selected == "ROXANNE"
    memory.put(CALL + 24, struct.pack("<I", 0x081CAC05))
    ui = read_nav_ui(memory.read, NAV_CALLBACK)
    assert ui.selected == "CHECK"
    assert ui.details["options"] == ["CALL", "CHECK", "CANCEL"]


def test_ribbon_gift_gap_and_empty() -> None:
    memory = nav(13)
    memory.put(SUMMARY + 12, struct.pack("<H", 27))
    assert read_nav_ui(memory.read, NAV_CALLBACK).details["ribbon_id"] == 25
    memory.put(SUMMARY + 16, b"\0" * 4)
    assert read_nav_ui(memory.read, NAV_CALLBACK).selected == "NO RIBBONS"


@pytest.mark.parametrize(
    "fault",
    [
        "pointer",
        "handler",
        "menuindex",
        "mode",
        "rootowner",
        "rootstate",
        "submenu",
        "cursor",
        "subpointer",
    ],
)
def test_nav_invalid_owner_data(fault: str) -> None:
    memory = nav()
    if fault == "pointer":
        memory.put(NAV_POINTER, b"\0" * 4)
    if fault == "handler":
        memory.put(RESOURCE, b"\0" * 4)
    if fault == "menuindex":
        memory.put(RESOURCE + 4, struct.pack("<I", 15))
    if fault == "mode":
        memory.put(RESOURCE + 8, b"\5\0")
    if fault == "rootowner":
        memory.put(0x03005E00, b"\0" * 4)
    if fault == "rootstate":
        put_task(memory, 0, 0x081C742D, [8])
    if fault == "submenu":
        memory.put(HANDLER, b"\5\0")
    if fault == "cursor":
        memory.put(HANDLER + 2, b"\3\0")
    if fault == "subpointer":
        memory.put(RESOURCE + 20, b"\0" * 4)
    ui = read_nav_ui(memory.read, NAV_CALLBACK)
    assert ui.diagnostic
    assert ui.selected is None
    assert ui.ready is None


@pytest.mark.parametrize("fault", ["count", "row", "items", "window", "box", "slot"])
def test_nav_list_validation(fault: str) -> None:
    memory = nav(8)
    if fault == "count":
        memory.put(LIST + 0x88A, b"\0" * 2)
    if fault == "row":
        memory.put(LIST + 0x88E, b"\2\0")
    if fault == "items":
        memory.put(LIST + 0x898, b"\0" * 4)
    if fault == "window":
        memory.put(LIST + 8, b"\0" * 2)
    if fault == "box":
        memory.put(0x02025000, b"\x0f")
    if fault == "slot":
        memory.put(0x02025001, b"\6")
    assert read_nav_ui(memory.read, NAV_CALLBACK).diagnostic


@pytest.mark.parametrize("fault", ["owner", "section", "type", "cursor", "input"])
def test_nav_map_validation(fault: str) -> None:
    memory = nav(6)
    if fault == "owner":
        memory.put(0x0203A144, b"\0" * 4)
    if fault == "section":
        memory.put(REGION, struct.pack("<H", 214))
    if fault == "type":
        memory.put(REGION + 2, b"\5")
    if fault == "cursor":
        memory.put(REGION + 0x54, b"\0" * 4)
    if fault == "input":
        memory.put(REGION + 0x18, b"\0" * 4)
    assert read_nav_ui(memory.read, NAV_CALLBACK).diagnostic


@pytest.mark.parametrize(
    "fault",
    [
        "monpointer",
        "moncount",
        "monbox",
        "monindex",
        "ribboncount",
        "ribboncursor",
        "option",
        "optionid",
    ],
)
def test_nav_inner_selections_validation(fault: str) -> None:
    memory = nav(13)
    if fault == "monpointer":
        memory.put(SUMMARY + 8, b"\0" * 4)
    if fault == "moncount":
        memory.put(MON_LIST, b"\0" * 2)
    if fault == "monbox":
        memory.put(MON_LIST + 4, b"\x0f")
    if fault == "monindex":
        memory.put(MON_LIST + 2, b"\2\0")
    if fault == "ribboncount":
        memory.put(SUMMARY + 16, b"\x1a\0")
    if fault == "ribboncursor":
        memory.put(SUMMARY + 12, b"\x1a\0")
    if fault in ("option", "optionid"):
        memory = nav(11)
        memory.put(CALL + 24, struct.pack("<I", 0x081CAC05))
        memory.put(CALL, struct.pack("<HHI", 3 if fault == "option" else 0, 2, 0x08010000))
        memory.put(0x08010000, bytes([3, 1, 2]))
    assert read_nav_ui(memory.read, NAV_CALLBACK).diagnostic


def test_non_nav_callback_returns_none() -> None:
    assert read_nav_ui(Memory().read, 0) is None


def test_match_call_hidden_check_and_call_have_actual_trainer():
    from pokebench_env.ui_state import STRING_VAR4

    memory = nav(11)
    memory.put(CALL + 24, struct.pack("<I", 0x081CACB9))
    window(memory, 2, 0, 16, 16, False)
    ui = read_nav_ui(memory.read, NAV_CALLBACK)
    assert ui.phase == "pokenav_match_call_check_page" and ui.selected == "ROXANNE" and ui.ready
    memory.put(CALL + 24, struct.pack("<I", 0x081CACF9))
    memory.put(STRING_VAR4, text("HELLO") + b"\xff")
    ui = read_nav_ui(memory.read, NAV_CALLBACK)
    assert ui.phase == "pokenav_match_call_call" and ui.details["message"] == "HELLO"


def test_special_match_call_header_names_and_ribbon_input_owner():
    memory = nav(11)
    memory.put(0x02025000, struct.pack("<BBH", 1, 0, 0))
    memory.put(0x086252A8, struct.pack("<I", 0x08010000))
    memory.put(0x08010000, struct.pack("<BBHII", 0, 0, 0, 0x08011000, 0x08012000))
    memory.put(0x08011000, text("PRESIDENT") + b"\xff")
    memory.put(0x08012000, text("MR. STONE") + b"\xff")
    ui = read_nav_ui(memory.read, NAV_CALLBACK)
    assert ui.selected == "MR. STONE" and ui.details["trainer_description"] == "PRESIDENT"
    memory = nav(13)
    memory.put(SUMMARY + 0x98, struct.pack("<I", 0x081D0549))
    ui = read_nav_ui(memory.read, NAV_CALLBACK)
    assert ui.ready and ui.details["expanded"] is True
    memory.put(SUMMARY + 0x98, struct.pack("<I", 0x081D05D5))
    assert read_nav_ui(memory.read, NAV_CALLBACK).ready is False


def test_match_call_check_flavor_reads_all_four_native_fields():
    memory = nav(11)
    memory.put(CALL + 24, struct.pack("<I", 0x081CACB9))
    pointers = [0x08016000 + i * 128 for i in range(4)]
    memory.put(0x08622028, struct.pack("<4I", *pointers))
    values = ["TYPE EFFECTIVE MOVES", "ROCK POKEMON", "I TRAIN DAILY", "FOR MY STUDENTS"]
    for pointer, value in zip(pointers, values, strict=False):
        memory.put(pointer, text(value) + b"\xff")
    ui = read_nav_ui(memory.read, NAV_CALLBACK)
    assert ui.details["flavor_texts"] == values and ui.ready


def test_match_call_steven_override_follows_actual_native_flag():
    from pokebench_env.menu_nav import _match_call_flavor

    memory = Memory()
    memory.put(0x086252A8 + 7 * 4, struct.pack("<I", 0x08016000))
    memory.put(0x08016000, bytes([0]) + b"\0" * 15)
    for index, flag, pointers in [(0, 65535, [0x08017000] * 4), (1, 1270, [0x08018000] * 4)]:
        memory.put(0x08625388 + index * 24, struct.pack("<HHI4I", 7, 75, flag, *pointers))
    memory.put(0x08017000, text("BEFORE GYM") + b"\xff")
    memory.put(0x08018000, text("AFTER GYM") + b"\xff")
    memory.put(0x03005D8C, struct.pack("<I", 0x02028000))
    assert _match_call_flavor(memory.read, 1, 7) == ["BEFORE GYM"] * 4
    memory.put(0x02028000 + 0x1270 + 1270 // 8, bytes([1 << (1270 % 8)]))
    assert _match_call_flavor(memory.read, 1, 7) == ["AFTER GYM"] * 4


def special_match_call(kind=0):
    memory = nav(11)
    memory.put(0x02025000, struct.pack("<BBHBBH", 1, 0, 7, 1, 0, 7))
    memory.put(0x086252A8 + 7 * 4, struct.pack("<I", 0x08017000))
    raw = bytearray(16)
    raw[0] = kind
    if kind in (0, 3, 4):
        struct.pack_into("<II", raw, 4, 0x08018000, 0x08018100)
    else:
        struct.pack_into("<H", raw, 4, 0)
        struct.pack_into("<I", raw, 8, 0x08018000)
        if kind != 2:
            struct.pack_into("<I", raw, 12, 0x08018100)
    memory.put(0x08017000, raw)
    memory.put(0x08018000, text("POKEMON TRAINER") + b"\xff")
    memory.put(0x08018100, text("STEVEN") + b"\xff")
    return memory


@pytest.mark.parametrize("kind", range(6))
def test_special_match_call_actual_rom_header_families(kind):
    m = special_match_call(kind)
    ui = read_nav_ui(m.read, NAV_CALLBACK)
    assert ui.diagnostic is None and ui.ready
    assert ui.selected == ("ROXANNE" if kind == 2 else "STEVEN")
    assert ui.details["trainer_description"] == "POKEMON TRAINER"
    assert ui.selected in ui.text()


@pytest.mark.parametrize(
    "fault", ["special", "header", "pointer", "kind", "rematch", "trainer", "class"]
)
def test_match_call_invalid_header_and_name_owners_never_guess(fault):
    m = special_match_call(2)
    if fault == "special":
        m.put(0x02025000, b"\2")
    elif fault == "header":
        m.put(0x02025002, struct.pack("<H", 21))
    elif fault == "pointer":
        m.put(0x086252A8 + 7 * 4, b"\0" * 4)
    elif fault == "kind":
        m.put(0x08017000, b"\6")
    elif fault == "rematch":
        m.put(0x08017004, struct.pack("<H", 78))
    elif fault == "trainer":
        m.put(0x085500A4, struct.pack("<H", 855))
    elif fault == "class":
        m.put(0x08310030 + 40 + 1, b"\x42")
    ui = read_nav_ui(m.read, NAV_CALLBACK)
    assert ui.diagnostic and ui.selected is None


@pytest.mark.parametrize("gift", [1, 64])
def test_gift_ribbon_cursor_resolves_native_save_value_and_rom_description(gift):
    m = nav(13)
    m.put(SUMMARY + 12, struct.pack("<4H", 27, 0, 0, 1))
    m.put(0x02030000 + 0x31A8, bytes([gift]))
    m.put(0x08623DF8 + (gift - 1) * 8, struct.pack("<II", 0x08014000, 0x08015000))
    ui = read_nav_ui(m.read, NAV_CALLBACK)
    assert ui.ready and ui.diagnostic is None and ui.details["gift_ribbon_value"] == gift
    assert ui.details["ribbon_description"] == "FOR BEATING THE CHAMPION"


@pytest.mark.parametrize("fault", ["save", "giftzero", "giftlarge", "ribbonlarge"])
def test_gift_ribbon_uncertain_native_owner_is_explicit_bug(fault):
    m = nav(13)
    m.put(SUMMARY + 12, struct.pack("<4H", 27, 0, 0, 1))
    if fault == "save":
        m.put(0x03005D8C, b"\0" * 4)
    elif fault == "giftzero":
        m.put(0x02030000 + 0x31A8, b"\0")
    elif fault == "giftlarge":
        m.put(0x02030000 + 0x31A8, b"\x41")
    elif fault == "ribbonlarge":
        m.put(SUMMARY + 120, struct.pack("<I", 32))
    ui = read_nav_ui(m.read, NAV_CALLBACK)
    assert ui.diagnostic and ui.selected is None
