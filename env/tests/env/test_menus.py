import struct

import pytest

from pokebench_env.game_screen import TASKS, Screen
from pokebench_env.menus import STARTER_CALLBACK, read_starter_ui, task_snapshot
from pokebench_env.ui_state import read_active_ui
from tests.env.test_ui_state import Memory, menu, window


def owner(memory: Memory, function: int, selection: int = 1) -> None:
    task = bytearray(40)
    struct.pack_into("<I", task, 0, function)
    task[4] = 1
    struct.pack_into("<h", task, 8, selection)
    memory.put(TASKS, task)


@pytest.mark.parametrize("index,name", [(0, "TREECKO"), (1, "TORCHIC"), (2, "MUDKIP")])
def test_starter_selection(index: int, name: str) -> None:
    memory = Memory()
    owner(memory, 0x0813425D, index)
    ui = read_active_ui(memory.read, Screen("unknown", 0, STARTER_CALLBACK))
    assert ui is not None
    assert (ui.phase, ui.selected, ui.ready) == ("starter_selection", name, True)
    assert ui.details["selected_index"] == index
    assert f"selected {name}" in ui.text()


def test_confirmation_and_cancel_selection() -> None:
    memory = Memory()
    owner(memory, 0x08134401, 2)
    menu(memory, 1, 1, 0)
    window(memory, 0, 0, 5, 4, True)
    ui = read_starter_ui(memory.read)
    assert (ui.selected, ui.value, ui.ready) == ("NO", "MUDKIP", True)
    assert ui.details["confirmation_index"] == 1
    owner(memory, 0x081344AD, 2)
    assert read_starter_ui(memory.read).ready is False


@pytest.mark.parametrize("function", [0x081341FD, 0x08134341, 0x08134391, 0x08134641, 0x08134669])
def test_transition_not_input_ready(function: int) -> None:
    memory = Memory()
    owner(memory, function)
    assert read_starter_ui(memory.read).ready is False


def test_invalid_owner_or_selection_is_diagnostic() -> None:
    memory = Memory()
    assert read_starter_ui(memory.read).diagnostic is not None
    owner(memory, 0x0813425D, 3)
    assert read_starter_ui(memory.read).selected is None
    assert read_starter_ui(memory.read).ready is None
    owner(memory, 0x08134401)
    assert read_starter_ui(memory.read).diagnostic is not None


def test_task_snapshot_short_read() -> None:
    with pytest.raises(ValueError, match="short menu"):
        task_snapshot(lambda address, length: b"")


def put_task(memory: Memory, task_id: int, fn: int, data: list[int]) -> None:
    raw = bytearray(40)
    struct.pack_into("<I", raw, 0, fn)
    raw[4] = 1
    struct.pack_into("<16h", raw, 8, *(data + [0] * (16 - len(data))))
    memory.put(TASKS + task_id * 40, raw)


def test_start_menu_dynamic_actions() -> None:
    from pokebench_env.menus import MENU_CALLBACK, START_ACTIONS, START_CURSOR, read_menu_family

    memory = Memory()
    put_task(memory, 0, 0x0809FA35, [1])
    memory.put(MENU_CALLBACK, struct.pack("<I", 0x0809FAC5))
    memory.put(START_CURSOR, bytes([1, 3]))
    memory.put(START_ACTIONS, bytes([1, 2, 7]))
    menu(memory, 1, 2, 0)
    window(memory, 0, 0, 5, 8, True)
    ui = read_menu_family(memory.read, 0x08085E5D)
    assert ui.selected == "BAG"
    assert ui.details["options"] == ["POKEMON", "BAG", "EXIT"]
    memory.put(START_CURSOR, bytes([3, 3]))
    assert read_menu_family(memory.read, 0x08085E5D).diagnostic


@pytest.mark.parametrize("action,slot,second,expected", [(0, 1, 0, 1), (8, 1, 3, 3), (10, 1, 2, 2)])
def test_party_slot_switching(action: int, slot: int, second: int, expected: int) -> None:
    from pokebench_env.menus import PARTY_CALLBACK, PARTY_MENU, read_menu_family

    memory = Memory()
    put_task(memory, 0, 0x081B1371, [])
    memory.put(PARTY_MENU + 9, struct.pack("<bbB", slot, second, action))
    ui = read_menu_family(memory.read, PARTY_CALLBACK)
    assert ui.details["selected_index"] == expected
    assert ui.selected == f"PARTY SLOT {expected + 1}"


def test_party_action_menu() -> None:
    from pokebench_env.menus import PARTY_CALLBACK, PARTY_INTERNAL, read_menu_family

    memory = Memory()
    put_task(memory, 0, 0x081B3731, [])
    memory.put(PARTY_INTERNAL, struct.pack("<I", 0x02010000))
    memory.put(0x02010000 + 15, bytes([0, 1, 2]))
    memory.put(0x02010000 + 23, bytes([3]))
    menu(memory, 1, 2, 2)
    window(memory, 2, 0, 6, 6, True)
    ui = read_menu_family(memory.read, PARTY_CALLBACK)
    assert ui.selected == "SWITCH"
    assert ui.details["options"] == ["SUMMARY", "SWITCH", "CANCEL"]


def list_task(memory: Memory, task_id: int) -> None:
    from pokebench_env.menus import LIST_TASK
    from tests.env.test_ui_state import text

    raw = bytearray(40)
    struct.pack_into("<I", raw, 0, LIST_TASK)
    raw[4] = 1
    struct.pack_into("<I", raw, 8, 0x02011000)
    struct.pack_into("<HH", raw, 20, 1, 1)
    raw[24] = 3
    memory.put(TASKS + task_id * 40, raw)
    memory.put(0x02011000, struct.pack("<Ii", 0x02012000, 13))
    memory.put(0x02012000, text("POTION") + b"\xff")
    window(memory, 3, 0, 12, 12, True)


@pytest.mark.parametrize(
    "callback,fn,list_offset", [(0x081AAD5D, 0x081ABD29, 0), (0x080DFD65, 0x080E0AC9, 7)]
)
def test_bag_and_shop_lists(callback: int, fn: int, list_offset: int) -> None:
    from pokebench_env.menus import read_menu_family

    memory = Memory()
    data = [0] * 16
    data[list_offset] = 1
    put_task(memory, 0, fn, data)
    list_task(memory, 1)
    memory.put(0x02039DD8, struct.pack("<IB3x", 0x02013000, 20))
    memory.put(0x02013000 + 13 * 4, struct.pack("<H", 13))
    memory.put(0x02039F60 + 8, struct.pack("<IH", 0x08020000, 20))
    memory.put(0x08020000 + 13 * 2, struct.pack("<H", 13))
    ui = read_menu_family(memory.read, callback)
    assert ui.selected == "POTION"
    assert ui.details["list_item_id"] == 13


@pytest.mark.parametrize(
    "fn,phase",
    [
        (0x081ACC05, "bag_context_menu"),
        (0x081ACC79, "bag_context_menu"),
        (0x081AD045, "bag_quantity"),
    ],
)
def test_bag_context_quantity(fn: int, phase: str) -> None:
    from pokebench_env.menus import BAG_CALLBACK, read_menu_family

    memory = Memory()
    put_task(memory, 0, fn, [0, 2, 4, 0, 0, 0, 0, 0, 2])
    memory.put(0x0203CE54, struct.pack("<I", 0x02010000))
    memory.put(0x02010820, struct.pack("<I", 0x02011000))
    memory.put(0x02010828, bytes([3]))
    memory.put(0x02010817, bytes([2]))
    memory.put(0x02011000, bytes([0, 1, 4]))
    menu(memory, 1, 2, 2)
    window(memory, 2, 0, 6, 6, True)
    ui = read_menu_family(memory.read, BAG_CALLBACK)
    assert ui.phase == phase
    assert ui.details["quantity_available"] == 4
    if phase == "bag_context_menu":
        assert ui.selected == "TOSS"
    else:
        assert ui.details["quantity"] == 2


def test_shop_quantity() -> None:
    from pokebench_env.menus import SHOP_CALLBACK, read_menu_family

    memory = Memory()
    put_task(memory, 0, 0x080E0D89, [0, 3, 0, 0, 0, 13])
    ui = read_menu_family(memory.read, SHOP_CALLBACK)
    assert ui.details["item_id"] == 13
    assert ui.details["quantity"] == 3


@pytest.mark.parametrize(
    "fn,phase",
    [
        (0x081C0511, "pokemon_summary"),
        (0x081C0F45, "summary_move_selection"),
        (0x081C12E5, "summary_move_reorder"),
        (0x081C174D, "summary_move_forget"),
    ],
)
def test_summary_moves(fn: int, phase: str) -> None:
    from pokebench_env.menus import SUMMARY_CALLBACK, read_menu_family

    memory = Memory()
    put_task(memory, 0, fn, [])
    pointer = 0x02010000
    memory.put(0x0203CF1C, struct.pack("<I", pointer))
    memory.put(pointer + 0x84, struct.pack("<4H", 33, 45, 55, 0))
    from pokebench_env.pokemon import MOVE_NAMES
    from tests.env.test_ui_state import text

    for move, name in [(33, "TACKLE"), (45, "GROWL"), (55, "WATER GUN"), (73, "LEECH SEED")]:
        memory.put(MOVE_NAMES + move * 13, text(name) + b"\xff")
    memory.put(pointer + 0x40BC, bytes([0, 0, 0, 5, 2, 0, 3, 0, 73, 0, 2, 1, 0, 0]))
    ui = read_menu_family(memory.read, SUMMARY_CALLBACK)
    assert ui.phase == phase
    assert ui.details["move_ids"] == [33, 45, 55, 0]
    assert ui.details["new_move_id"] == 73


def test_options_live_values() -> None:
    from pokebench_env.menus import OPTIONS_CALLBACK, read_menu_family

    memory = Memory()
    put_task(memory, 0, 0x080BA86D, [3, 2, 0, 1, 0, 2, 19])
    ui = read_menu_family(memory.read, OPTIONS_CALLBACK)
    assert ui.selected == "SOUND"
    assert ui.details["window_frame"] == 19


@pytest.mark.parametrize("callback", [0x081B01B1, 0x081AAD5D, 0x080DFD65, 0x081BFAB5, 0x080BA4B1])
def test_missing_live_owner_is_never_guessed(callback: int) -> None:
    from pokebench_env.menus import read_menu_family

    ui = read_menu_family(Memory().read, callback)
    assert ui.ready is None
    assert ui.selected is None
    assert ui.diagnostic


@pytest.mark.parametrize(
    "template,label", [(0, "player"), (1, "box"), (2, "caught_mon"), (3, "nickname"), (4, "walda")]
)
def test_naming_editor_owner(template: int, label: str) -> None:
    from pokebench_env.naming import NAMING_POINTER
    from tests.env.test_naming import keyboard

    memory = keyboard(phase=2)
    pointer = int.from_bytes(memory.read(NAMING_POINTER, 4), "little")
    memory.put(pointer + 0x1E2C, bytes([template]))
    ui = read_active_ui(memory.read, Screen("naming", 0, 0x080E4F59))
    assert ui.details["naming_owner"] == label
    assert ui.selected == "A"


@pytest.mark.parametrize(
    "pointer,raw,message",
    [
        (0, b"", "pointer"),
        (0x02010000, b"A" * 64, "unterminated"),
        (0x02010000, b"\x7f\xff", "glyph"),
    ],
)
def test_menu_text_rejects_unverified_data(pointer: int, raw: bytes, message: str) -> None:
    from pokebench_env.menus import _text_pointer

    memory = Memory()
    memory.put(pointer, raw)
    with pytest.raises(ValueError, match=message):
        _text_pointer(memory.read, pointer)


@pytest.mark.parametrize("fault", ["task_id", "owner", "count", "pointer", "cursor", "window"])
def test_list_owner_data_validation(fault: str) -> None:
    from pokebench_env.menus import _list_selection

    memory = Memory()
    list_task(memory, 1)
    address = TASKS + 40
    if fault == "owner":
        memory.put(address, b"\0" * 4)
    if fault == "count":
        memory.put(address + 20, b"\0" * 4)
    if fault == "pointer":
        memory.put(address + 8, b"\0" * 4)
    if fault == "cursor":
        memory.put(address + 34, struct.pack("<H", 2))
    if fault == "window":
        memory.put(address + 24, bytes([0]))
    with pytest.raises(ValueError):
        _list_selection(memory.read, 16 if fault == "task_id" else 1)


def test_shop_action_menu_and_unowned_field() -> None:
    from pokebench_env.menus import read_menu_family

    memory = Memory()
    assert read_menu_family(memory.read, 0x08085E5D) is None
    put_task(memory, 0, 0x080DFB89, [])
    menu(memory, 1, 2, 2)
    window(memory, 2, 0, 8, 6, True)
    assert read_menu_family(memory.read, 0x08085E5D).selected == "SELL"
    memory.put(0x02039F60 + 15, b"\1")
    menu(memory, 1, 1, 2)
    assert read_menu_family(memory.read, 0x08085E5D).selected == "QUIT"
    menu(memory, 0, 2, 2)
    assert read_menu_family(memory.read, 0x08085E5D).diagnostic


@pytest.mark.parametrize("fault", ["mode", "move", "cursor", "owner"])
def test_summary_invalid_selected_state(fault: str) -> None:
    from pokebench_env.menus import SUMMARY_CALLBACK, read_menu_family

    memory = Memory()
    pointer = 0x02010000
    memory.put(0x0203CF1C, struct.pack("<I", pointer))
    put_task(memory, 0, 0x081C0F45, [])
    if fault == "mode":
        memory.put(pointer + 0x40BC, b"\5")
    if fault == "move":
        memory.put(pointer + 0x84, struct.pack("<H", 355))
    if fault == "cursor":
        memory.put(pointer + 0x40C6, b"\5")
    if fault == "owner":
        memory.put(TASKS, b"\0" * 4)
    assert read_menu_family(memory.read, SUMMARY_CALLBACK).diagnostic


def test_options_invalid_values_and_palette_fade() -> None:
    from pokebench_env.menus import OPTIONS_CALLBACK, PALETTE_FADE, read_menu_family

    memory = Memory()
    put_task(memory, 0, 0x080BA86D, [7])
    assert read_menu_family(memory.read, OPTIONS_CALLBACK).diagnostic
    put_task(memory, 0, 0x080BA86D, [0])
    memory.put(PALETTE_FADE + 7, b"\x80")
    assert read_menu_family(memory.read, OPTIONS_CALLBACK).ready is False


def test_model_readout_includes_choices_and_values_without_raw_owner_noise() -> None:
    from pokebench_env.ui_state import ActiveUi

    ui = ActiveUi(
        "options_menu",
        "TEXT SPEED",
        True,
        "Directions change",
        details={
            "callback2": "0x080BA4B1",
            "task_functions": ["0x080BA86D"],
            "task_data": [0] * 16,
            "owner_task": 0,
            "options": ["TEXT SPEED", "BATTLE SCENE"],
            "text_speed": 2,
            "battle_scene_off": 0,
            "selected_index": 0,
            "can_fly": True,
        },
    )
    readout = ui.text()
    assert "options: TEXT SPEED | BATTLE SCENE" in readout
    assert "text speed: FAST" in readout
    assert "battle scene: ON" in readout
    assert "can fly: YES" in readout
    assert "0x080" not in readout
    assert "task" not in readout
    assert ActiveUi("field_transition", None, False, "Wait").text().endswith("Wait")


def test_menu_literal_glyphs_and_controls_are_not_uncertainty() -> None:
    from pokebench_env.menus import _text_pointer
    from tests.env.test_ui_state import text

    memory = Memory()
    memory.put(0x02010000, b"\xfc\x01\x02\x55\x56\x57\x58\x59" + text(" ?") + b"\xff")
    assert _text_pointer(memory.read, 0x02010000) == "POKéBLOCK ?"
    memory.put(0x02010000, b"\xfc\xff")
    with pytest.raises(ValueError, match="control"):
        _text_pointer(memory.read, 0x02010000)
    from pokebench_env.ui_state import decode_message

    with pytest.raises(ValueError, match="arguments"):
        decode_message(b"\xfc\x04\x01")


@pytest.mark.parametrize(
    "fn,phase", [(0x081AD795, "bag_sell_quantity"), (0x081ADA7D, "bag_deposit_quantity")]
)
def test_bag_transaction_quantity_owner(fn, phase):
    from pokebench_env.menus import BAG_CALLBACK, read_menu_family

    memory = Memory()
    put_task(memory, 0, fn, [0, 0, 4, 0, 0, 0, 0, 0, 3])
    memory.put(0x0203CE54, struct.pack("<I", 0x02010000))
    memory.put(0x02010817, bytes([2, 2]))
    window(memory, 2, 0, 6, 6, True)
    ui = read_menu_family(memory.read, BAG_CALLBACK)
    assert ui.phase == phase and ui.selected == "3" and ui.ready
    memory.put(TASKS + 24, struct.pack("<h", 5))
    assert read_menu_family(memory.read, BAG_CALLBACK).diagnostic


def test_single_action_context_is_valid_only_with_exact_owner():
    from pokebench_env.menus import BAG_CALLBACK, read_menu_family
    from pokebench_env.ui_state import read_menu

    memory = Memory()
    put_task(memory, 0, 0x081ACC05, [])
    memory.put(0x0203CE54, struct.pack("<I", 0x02010000))
    memory.put(0x02010820, struct.pack("<I", 0x02011000))
    memory.put(0x02010828, b"\1")
    memory.put(0x02011000, b"\4")
    menu(memory, 0, 0, 2)
    window(memory, 2, 0, 6, 6, True)
    assert read_menu(memory.read) is None
    ui = read_menu_family(memory.read, BAG_CALLBACK)
    assert ui.selected == "CANCEL" and ui.ready


def test_bag_pocket_and_transaction_message_are_explicit_phases():
    from pokebench_env.menus import BAG_CALLBACK, read_menu_family

    memory = Memory()
    put_task(memory, 0, 0x081AC10D, [0] * 16)
    ui = read_menu_family(memory.read, BAG_CALLBACK)
    assert ui.phase == "bag_pocket_transition" and ui.ready is False and ui.selected is None
    put_task(memory, 0, 0x081AD9C1, [])
    ui = read_menu_family(memory.read, BAG_CALLBACK)
    assert ui.phase == "bag_transaction_message" and ui.ready


def test_party_field_move_actions_have_source_names():
    from pokebench_env.menus import PARTY_CALLBACK, PARTY_INTERNAL, read_menu_family

    memory = Memory()
    put_task(memory, 0, 0x081B3731, [])
    memory.put(PARTY_INTERNAL, struct.pack("<I", 0x02010000))
    memory.put(0x02010000 + 15, bytes([19, 24, 32]))
    memory.put(0x02010000 + 23, b"\3")
    menu(memory, 1, 2, 2)
    window(memory, 2, 0, 6, 6, True)
    ui = read_menu_family(memory.read, PARTY_CALLBACK)
    assert ui.selected == "FLY" and ui.details["options"] == ["CUT", "FLY", "SWEET SCENT"]


@pytest.mark.parametrize(
    "fn,phase",
    [
        (0x081B1E61, "party_hp_animation"),
        (0x081B672D, "party_healed_message_transition"),
        (0x081B6795, "party_item_message"),
        (0x081B12F9, "party_close_transition"),
    ],
)
def test_party_item_animation_messages_are_not_input(fn, phase):
    from pokebench_env.menus import PARTY_CALLBACK, read_menu_family

    memory = Memory()
    put_task(memory, 0, fn, [])
    ui = read_menu_family(memory.read, PARTY_CALLBACK)
    assert ui.phase == phase and ui.ready is False and ui.selected is None


def test_party_printed_healing_message_is_recorded():
    from pokebench_env.menus import PARTY_CALLBACK, read_menu_family
    from pokebench_env.ui_state import STRING_VAR4
    from tests.env.test_ui_state import text

    memory = Memory()
    put_task(memory, 0, 0x081B6795, [])
    put_task(memory, 1, 0x081B1B8D, [])
    window(memory, 6, 0, 27, 4, True)
    memory.put(STRING_VAR4, text("MUDKIP HP WAS RESTORED") + b"\xff")
    ui = read_menu_family(memory.read, PARTY_CALLBACK)
    assert ui.details["message"] == "MUDKIP HP WAS RESTORED" and ui.ready is False
    window(memory, 6, 0, 27, 4, False)
    assert read_menu_family(memory.read, PARTY_CALLBACK).diagnostic


def test_bag_close_handoff_has_no_selected_item_or_input():
    from pokebench_env.menus import BAG_CALLBACK, read_menu_family

    memory = Memory()
    put_task(memory, 0, 0x081AB931, [])
    ui = read_menu_family(memory.read, BAG_CALLBACK)
    assert ui.phase == "bag_close_transition" and ui.selected is None and ui.ready is False


@pytest.mark.parametrize(
    "fn",
    [
        0x081B1709,
        0x081B227D,
        0x081B43DD,
        0x081B48DD,
        0x081B4BA1,
        0x081B4C95,
        0x081B5431,
        0x081B56D9,
        0x081B7029,
        0x081B72C9,
        0x081B82D5,
    ],
)
def test_party_subsidiary_confirmation_cursor(fn):
    from pokebench_env.menus import PARTY_CALLBACK, read_menu_family

    memory = Memory()
    put_task(memory, 0, fn, [])
    menu(memory, 1, 1, 2)
    window(memory, 2, 0, 5, 4, True)
    ui = read_menu_family(memory.read, PARTY_CALLBACK)
    assert ui.phase.endswith("confirmation") and ui.selected == "NO" and ui.ready
    put_task(memory, 1, 0x081B1B8D, [])
    assert read_menu_family(memory.read, PARTY_CALLBACK).ready is False
