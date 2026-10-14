import struct
from pathlib import Path

import pytest

from pokebench_env.menu_field_people import (
    DAYCARE,
    MATCH_CALL,
    PRINTERS,
    SE_PLAYERS,
    STORIES,
    STORYTELLER,
    TRADER,
    read_field_people_menu,
)
from pokebench_env.menus import PALETTE_FADE
from tests.env.test_menus import put_task
from tests.env.test_pokemon import fixture
from tests.env.test_ui_state import Memory, menu, text, window


def npc(function, data=None):
    m = Memory()
    put_task(m, 0, function, data or [0] * 16)
    window(m, 0, 0, 18, 10, True)
    m.put(0x03005D8C, struct.pack("<I", 0x02015000))
    m.put(0x085EB7EA, text("EXIT") + b"\xff")
    return m


def list_task(m, task, window_id, items, index):
    from pokebench_env.game_screen import TASKS
    from pokebench_env.menus import LIST_TASK

    raw = bytearray(40)
    struct.pack_into("<I", raw, 0, LIST_TASK)
    raw[4] = 1
    struct.pack_into("<I", raw, 8, 0x02011000)
    struct.pack_into("<HH", raw, 20, len(items), len(items))
    raw[24] = window_id
    struct.pack_into("<HH", raw, 32, 0, index)
    m.put(TASKS + task * 40, raw)
    for i, (label, item) in enumerate(items):
        m.put(0x02011000 + 8 * i, struct.pack("<Ii", 0x02012000 + 64 * i, item))
        m.put(0x02012000 + 64 * i, text(label) + b"\xff")
    body, read = fixture()
    for address, size in [
        (0x083185C8 + 11 * 280, 11),
        (0x085839A0 + 44 * 13, 16),
        (0x0831977C + 13 * 55, 13),
        (0x0831977C + 13 * 78, 13),
        (0x0831977C + 13 * 33, 13),
        (0x0831C898 + 12 * 55 + 4, 1),
        (0x0831C898 + 12 * 78 + 4, 1),
        (0x0831C898 + 12 * 33 + 4, 1),
    ]:
        m.put(address, read(address, size))
    for i, name in enumerate(("MARILL", "SHROOMISH")):
        mon = bytearray(body[:80])
        mon[8:18] = (text(name) + b"\xff").ljust(10, b"\xff")
        mon[18] = 2
        m.put(0x02015000 + 0x3030 + 140 * i, mon)
    species = bytearray(28)
    species[16] = 255
    m.put(0x083203CC + 28 * 280, species)
    m.put(0x0831F72C, struct.pack("<101I", *(i**3 for i in range(101))))


def test_daycare_real_list_items_and_exit():
    m = npc(DAYCARE, [1, 0])
    list_task(m, 1, 0, [("MARILL Lv5", 0), ("SHROOMISH Lv5", 1), ("EXIT", 2)], 1)
    ui = read_field_people_menu(m.read, 0x08085E5D)
    assert (ui.phase, ui.selected, ui.ready) == ("daycare_level_selection", "SHROOMISH Lv5", True)
    assert ui.details["options"] == ["MARILL Lv5", "SHROOMISH Lv5", "EXIT"]
    assert ui.details["daycare_mon_index"] == 1
    list_task(m, 1, 0, [("MARILL Lv5", 0), ("SHROOMISH Lv5", 1), ("EXIT", 2)], 2)
    assert read_field_people_menu(m.read, 0x08085E5D).details["daycare_mon_index"] is None


def trader():
    m = npc(TRADER)
    raw = bytearray(64)
    raw[1:5] = bytes((1, 2, 3, 255))
    raw[49] = 1
    for i in range(4):
        raw[5 + 11 * i : 5 + 11 * i + 4] = text("BOB") + b"\xff"
        raw[50 + i] = 2
    m.put(0x02015000 + 0x2E28, raw)
    for i, label in enumerate(["NONE", "SMALL DESK", "POKEMON DESK", "HEAVY DESK"]):
        m.put(0x085A5C09 + 32 * i, text(label) + b"\xff")
    m.put(0x085E8D38, text("?????") + b"\xff")
    menu(m, 3, 4, 0)
    return m


def test_trader_source_placeholder_and_saved_previous_owners():
    m = trader()
    ui = read_field_people_menu(m.read, 0x08085E5D)
    assert ui.selected == "?????" and ui.ready
    assert ui.details["previous_owner_names"] == ["BOB"] * 4
    assert ui.details["decoration_ids"] == [1, 2, 3, 255]
    assert ui.details["already_traded"] is True
    menu(m, 4, 4, 0)
    assert read_field_people_menu(m.read, 0x08085E5D).selected == "EXIT"
    m.put(PALETTE_FADE + 7, b"\x80")
    assert read_field_people_menu(m.read, 0x08085E5D).ready is False


def story(state=1):
    m = npc(STORYTELLER, [state])
    raw = bytearray(64)
    raw[4:6] = bytes((10, 11))
    for i in range(2):
        raw[8 + 7 * i : 12 + 7 * i] = text("BOB") + b"\xff"
        raw[52 + i] = 2
        struct.pack_into("<I", raw, 36 + 4 * i, 120 + i)
    m.put(0x02015000 + 0x2E28, raw)
    for i in range(36):
        pointer = 0x085D0000 + i * 64
        m.put(STORIES + 16 * i, struct.pack("<BB2xIII", 10 + i, 1, pointer, 0, 0))
        m.put(pointer, text("STORY " + str(i)) + b"\xff")
    menu(m, 1, 2, 0)
    return m


def test_story_list_retains_native_titles_records_and_initialization():
    m = story()
    ui = read_field_people_menu(m.read, 0x08085E5D)
    assert ui.selected == "STORY 1" and ui.ready
    assert ui.details["recorded_stat_values"] == [120, 121]
    assert ui.details["story_stat_ids"] == [10, 11]
    assert ui.details["story_trainer_names"] == ["BOB", "BOB"]
    assert read_field_people_menu(story(0).read, 0x08085E5D).ready is False
    m.put(0x02015000 + 0x2E28 + 4, b"\xfa")  # game source falls back to final story row
    menu(m, 0, 2, 0)
    assert read_field_people_menu(m.read, 0x08085E5D).selected == "STORY 35"


def call(state=5):
    m = npc(MATCH_CALL, [state, 0, 0])
    m.put(0x0203CD80, struct.pack("<IHBB", 55, 100, 8, 1))
    m.put(0x02021FC4, text("CALL ME!") + b"\xff")
    return m


def test_match_call_waits_for_printing_and_both_native_sound_players():
    m = call()
    ui = read_field_people_menu(m.read, 0x08085E5D)
    assert (ui.phase, ui.selected, ui.ready) == ("field_match_call_message", "CONTINUE", True)
    assert ui.details["message"] == "CALL ME!"
    assert ui.details["trainer_id"] == 100 and ui.details["triggered_from_script"]
    m.put(PRINTERS + 0x1B, b"\x01")
    assert read_field_people_menu(m.read, 0x08085E5D).ready is False
    m.put(PRINTERS + 0x1B, b"\x00")
    for pointer in SE_PLAYERS:
        m.put(pointer + 4, struct.pack("<I", 1))
        assert read_field_people_menu(m.read, 0x08085E5D).ready is False
        m.put(pointer + 4, struct.pack("<I", 0))
    for pointer in SE_PLAYERS:
        m.put(pointer + 4, struct.pack("<I", 0x80000001))
    assert read_field_people_menu(m.read, 0x08085E5D).ready is True
    assert read_field_people_menu(call(4).read, 0x08085E5D).ready is False
    assert read_field_people_menu(call(2).read, 0x08085E5D).phase == "field_match_call_transition"


@pytest.mark.parametrize(
    "kind",
    [
        "language",
        "save",
        "cursor",
        "story_phase",
        "call_phase",
        "call_window",
        "daycare_id",
        "daycare_count",
        "multiple",
    ],
)
def test_corrupt_owned_npc_state_is_explicit_harness_bug(kind):
    m = trader()
    if kind == "language":
        m.put(0x02015000 + 0x2E28 + 50, b"\x00")
    elif kind == "save":
        m.put(0x03005D8C, b"\x00" * 4)
    elif kind == "cursor":
        menu(m, 0, 1, 0)
    elif kind == "story_phase":
        m = story(2)
    elif kind == "call_phase":
        m = call(8)
    elif kind == "call_window":
        m = call()
        window(m, 0, 0, 18, 10, False)
    elif kind in ("daycare_id", "daycare_count"):
        m = npc(DAYCARE, [1, 0])
        values = [("A", 0), ("B", 1), ("EXIT", 3 if kind == "daycare_id" else 2)]
        list_task(m, 1, 0, values[:2] if kind == "daycare_count" else values, 0)
    else:
        put_task(m, 1, MATCH_CALL, [0])
    ui = read_field_people_menu(m.read, 0x08085E5D)
    assert ui.ready is None and ui.diagnostic.startswith("harness bug:")
    assert ui.details["callback2"] == "0x08085E5D"


def test_unowned_callbacks_do_not_consult_unrelated_npc_ram():
    assert read_field_people_menu(lambda a, n: b"", 0) is None
    assert read_field_people_menu(Memory().read, 0x08085E5D) is None


def test_exact_rom_source_owner_and_table_qualification():
    rom = Path.home().joinpath(".roms/pokemon-emerald.gba")
    if not rom.exists():
        pytest.skip("qualified local US ROM unavailable")
    raw = rom.read_bytes()
    for address, expected in [
        (0x08120E9C, STORIES),
        (0x08133AE4, 0x085EB7EA),
        (0x08133AE8, 0x085E8D38),
        (0x080A38D0, SE_PLAYERS[0]),
        (0x080A38D4, SE_PLAYERS[1]),
        (0x08196128, 0x0860EF78),
        (0x08069124, 0x0831F72C),
        (0x08069128, 0x083203CC),
    ]:
        assert struct.unpack_from("<I", raw, address - 0x08000000)[0] == expected
    assert struct.unpack_from("<8I", raw, 0x0860EF78 - 0x08000000)[5] == 0x08196331
    assert raw[MATCH_CALL - 1 - 0x08000000 : MATCH_CALL + 1 - 0x08000000] == b"\x30\xb5"


def test_daycare_print_callback_uses_box_records_not_empty_list_text():
    m = npc(DAYCARE, [1, 0])
    list_task(m, 1, 0, [(" ", 0), (" ", 1), ("EXIT", 2)], 0)
    # Source ListMenu texts are empty; DaycarePrintMonInfo owns displayed names.
    m.put(0x02012000, b"\xff")
    m.put(0x02012040, b"\xff")
    m.put(0x083203CC + 28 * 280 + 16, b"\xfe")
    m.put(0x02015000 + 0x3030 + 136, struct.pack("<I", 159))  # 125+159 crosses level6
    ui = read_field_people_menu(m.read, 0x08085E5D)
    assert ui.selected == "MARILL♀ Lv6"
    assert ui.details["daycare_0_displayed_level"] == 6
    assert ui.details["daycare_0_steps"] == 159
    assert ui.details["daycare_0_move_ids"] == [55, 78, 0, 33]
    m.put(0x083203CC + 28 * 280 + 16, b"\x00")
    assert read_field_people_menu(m.read, 0x08085E5D).selected == "MARILL♂ Lv6"
    m.put(0x02015000 + 0x3030 + 8, text("MARILL♂") + b"\xff")
    assert read_field_people_menu(m.read, 0x08085E5D).selected == "MARILL♂ Lv6"


@pytest.mark.parametrize("corruption", ["checksum", "nickname", "growth", "save", "id"])
def test_daycare_decode_or_owner_failures_retain_native_bug(corruption):
    m = npc(DAYCARE, [1, 0])
    list_task(m, 1, 0, [(" ", 0), (" ", 1), ("EXIT", 2)], 0)
    if corruption == "checksum":
        m.put(0x02015000 + 0x3030 + 28, b"\x00\x00")
    elif corruption == "nickname":
        m.put(0x02015000 + 0x3030 + 8, b"\xfd")
    elif corruption == "growth":
        m.put(0x083203CC + 28 * 280 + 19, b"\x06")
    elif corruption == "save":
        m.put(0x03005D8C, struct.pack("<I", 0))
    else:
        m.put(0x02011000 + 4, struct.pack("<i", 99))
    ui = read_field_people_menu(m.read, 0x08085E5D)
    assert ui.ready is None and ui.diagnostic.startswith("harness bug:")
    if corruption in ("checksum", "nickname"):
        assert len(ui.details["daycare_0_raw_hex"]) == 160


@pytest.mark.parametrize(
    "state,exit_flag,ready",
    [(0, 0, False), (1, 0, True), (1, 1, False), (2, 0, False), (3, 1, False)],
)
def test_ss_tidal_porthole_a_exit_is_bound_to_its_scene_phase(state, exit_flag, ready):
    from pokebench_env.menu_field_people import PORTHOLE

    m = npc(PORTHOLE, [state, exit_flag])
    m.put(0x02015000 + 0x139C + 2 * 0xB4, struct.pack("<H", 2))
    m.put(0x02015000 + 4, bytes((25, 11)))
    ui = read_field_people_menu(m.read, 0x08085E5D)
    assert ui.phase == "ss_tidal_porthole" and ui.ready is ready
    assert ui.selected == ("EXIT" if ready else None)
    assert ui.details["exit_requested"] is bool(exit_flag)
    assert (ui.details["map_group"], ui.details["map_number"]) == (25, 11)
    assert ui.details["cruise_state"] == 2


@pytest.mark.parametrize("state,exit_flag", [(4, 0), (1, 2)])
def test_ss_tidal_invalid_owner_phase_is_a_harness_bug(state, exit_flag):
    from pokebench_env.menu_field_people import PORTHOLE

    ui = read_field_people_menu(npc(PORTHOLE, [state, exit_flag]).read, 0x08085E5D)
    assert ui.ready is None and "porthole" in ui.diagnostic
