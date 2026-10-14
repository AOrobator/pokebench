import pytest

from pokebench_env.menu_prelude import MAIN_CALLBACK, MAIN_OPTIONS, read_prelude_ui
from tests.env.test_menus import put_task
from tests.env.test_ui_state import Memory, text, window


def saved_header(m, *, national=False):
    import struct

    save1, save2 = 0x02028000, 0x0202C000
    m.put(0x03005D8C, struct.pack("<II", save1, save2))
    m.put(save2, text("ANDREW") + b"\xff")
    m.put(save2 + 8, bytes([1]))
    m.put(save2 + 0xE, struct.pack("<HBB", 5, 12, 34))
    m.put(save1 + 4, bytes([0, 0]))
    m.put(0x08486578, struct.pack("<I", 0x08010000))
    m.put(0x08010000, struct.pack("<I", 0x08020000))
    m.put(0x08020000 + 0x14, bytes([0]))
    m.put(0x085A147C + 4, struct.pack("<I", 0x08030000))
    m.put(0x08030000, text("LITTLEROOT TOWN") + b"\xff")
    for flag in (0x861, 0x867):
        address = save1 + 0x1270 + (flag >> 3)
        m.put(address, bytes([m.read(address, 1)[0] | (1 << (flag & 7))]))
    for pointer in (save2 + 0x28, save2 + 0x5C, save1 + 0x988, save1 + 0x3B24):
        m.put(pointer, b"\1")
    m.put(0x0831DFB8, struct.pack("<202H", *range(1, 203)))
    if national:
        m.put(save2 + 0x1A, b"\xda")
        m.put(save1 + 0x139C + 0x46 * 2, struct.pack("<H", 0x302))
        m.put(save1 + 0x1270 + (0x896 >> 3), bytes([1 << (0x896 & 7)]))
    return save1, save2


@pytest.mark.parametrize("variant", range(4))
def test_main_variants_selected_options(variant):
    m = Memory()
    data = [0] * 16
    data[0] = variant
    data[1] = variant + 1
    data[12] = variant + 2
    put_task(m, 0, 0x0803024D, data)
    if variant:
        saved_header(m)
    window(m, (variant + 1) if variant == 0 else variant + 3, 0, 20, 6, True)
    ui = read_prelude_ui(m.read, MAIN_CALLBACK)
    assert (
        ui.selected == "OPTION"
        and ui.ready
        and ui.details["options"] == list(MAIN_OPTIONS[variant])
    )
    put_task(m, 0, 0x080300B1, data)
    assert read_prelude_ui(m.read, MAIN_CALLBACK).ready is False


@pytest.mark.parametrize(
    "fn", [0x0802F8D9, 0x0802FAB1, 0x0802FBA5, 0x0803027D, 0x08030545, 0x080305A5]
)
def test_main_transitions_have_no_selection(fn):
    m = Memory()
    put_task(m, 0, fn, [])
    ui = read_prelude_ui(m.read, MAIN_CALLBACK)
    assert ui.ready is False and ui.selected is None


@pytest.mark.parametrize("fn", [0x0802FA5D, 0x0802FB51])
def test_warning_printer_owns_continue_readiness(fn):
    m = Memory()
    put_task(m, 0, fn, [])
    window(m, 7, 0, 27, 4, True)
    m.put(0x03006210, b"\x02\0")
    m.put(0x085E8453, text("BATTERY WARNING") + b"\xff")
    m.put(0x085E8405, text("SAVE ERASED") + b"\xff")
    ui = read_prelude_ui(m.read, MAIN_CALLBACK)
    assert ui.selected == "CONTINUE" and ui.ready
    m.put(0x020201B0 + 7 * 0x24 + 0x1B, b"\1")
    ui = read_prelude_ui(m.read, MAIN_CALLBACK)
    assert ui.ready is False and ui.selected is None


@pytest.mark.parametrize(
    "mutation", ["cursor", "count", "window", "duplicate", "warning_window", "warning_flag"]
)
def test_main_invalid_owner(mutation):
    m = Memory()
    data = [0] * 16
    data[12] = 2
    if mutation == "cursor":
        data[1] = 2
    elif mutation == "count":
        data[12] = 4
    put_task(m, 0, 0x0803024D, data)
    if mutation != "window":
        window(m, 0, 0, 20, 6, True)
    if mutation == "duplicate":
        put_task(m, 1, 0x0803024D, data)
    if mutation.startswith("warning"):
        put_task(m, 0, 0x0802FB51, [])
        if mutation == "warning_flag":
            window(m, 7, 0, 27, 4, True)
            m.put(0x020201B0 + 7 * 0x24 + 0x1B, b"\2")
    ui = read_prelude_ui(m.read, MAIN_CALLBACK)
    assert ui.diagnostic and ui.ready is None


def test_other_callbacks_and_birch_are_not_main_menu():
    m = Memory()
    assert read_prelude_ui(m.read, 0) is None
    assert read_prelude_ui(m.read, MAIN_CALLBACK) is None


@pytest.mark.parametrize("national", [False, True])
def test_continue_saved_header_contents_without_field_coordinates(national):
    from pokebench_env.menu_prelude import _saved_header

    m = Memory()
    save1, save2 = saved_header(m, national=national)
    details = _saved_header(m.read)
    assert details["saved_player_name"] == "ANDREW" and details["saved_player_gender"] == "FEMALE"
    assert details["saved_map_name"] == "LITTLEROOT TOWN"
    assert details["saved_badges"] == ["STONE"] and details["saved_badge_count"] == 1
    assert details["saved_pokedex_mode"] == ("NATIONAL" if national else "HOENN")
    assert details["saved_pokedex_caught"] == 1
    assert details["saved_play_hours"] == 5 and details["saved_play_minutes"] == 12
    assert "position" not in details and "x" not in details
    m.put(save1 + 0x988, b"\0")
    with pytest.raises(ValueError, match="Pokedex copies"):
        _saved_header(m.read)
