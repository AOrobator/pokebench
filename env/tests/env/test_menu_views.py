import struct

import pytest

from pokebench_env.menu_views import (
    BERRY_CALLBACK,
    CARD_CALLBACK,
    FIELD_MAP_CALLBACK,
    FLY_CALLBACK,
    _buffer_text,
    read_view_ui,
)
from pokebench_env.pokemon import ITEMS
from tests.env.test_menus import put_task
from tests.env.test_ui_state import Memory, text

POINTER = 0x02010000


def card(state: int = 10) -> Memory:
    memory = Memory()
    memory.put(0x02039CE8, struct.pack("<I", POINTER))
    memory.put(POINTER, bytes([state]))
    memory.put(POINTER + 0x534 + 0x30, text("RED") + b"\xff")
    put_task(memory, 0, 0x080C2761, [])
    return memory


@pytest.mark.parametrize(
    "state,ready",
    [
        (0, False),
        (10, True),
        (11, True),
        (12, False),
        (13, False),
        (14, False),
        (15, False),
        (16, False),
    ],
)
def test_card_input_state(state: int, ready: bool) -> None:
    ui = read_view_ui(card(state).read, CARD_CALLBACK)
    assert ui.ready is ready
    assert ui.details["player_name"] == "RED"


def test_card_back_and_stats() -> None:
    memory = card(11)
    memory.put(POINTER + 8, b"\1")
    memory.put(POINTER + 0x534 + 0x24, struct.pack("<I", 3000))
    ui = read_view_ui(memory.read, CARD_CALLBACK)
    assert ui.selected == "BACK"
    assert ui.details["money"] == 3000


@pytest.mark.parametrize("fault", ["pointer", "owner", "state", "gender", "stars"])
def test_card_invalid_owned_data(fault: str) -> None:
    memory = card()
    if fault == "pointer":
        memory.put(0x02039CE8, b"\0" * 4)
    if fault == "owner":
        memory.put(0x03005E00, b"\0" * 4)
    if fault == "state":
        memory.put(POINTER, b"\x11")
    if fault == "gender":
        memory.put(POINTER + 0x534, b"\2")
    if fault == "stars":
        memory.put(POINTER + 0x535, b"\6")
    assert read_view_ui(memory.read, CARD_CALLBACK).diagnostic


def berry() -> Memory:
    memory = Memory()
    memory.put(0x0203BCF4, struct.pack("<I", POINTER))
    memory.put(POINTER + 0x1800, struct.pack("<H", 1))
    memory.put(ITEMS + 44 * 133, text("CHERI BERRY") + b"\xff")
    memory.put(ITEMS + 44 * 133 + 14, struct.pack("<H", 133))
    put_task(memory, 0, 0x08178655, [])
    return memory


def test_berry_tag_actual_item_identity() -> None:
    ui = read_view_ui(berry().read, BERRY_CALLBACK)
    assert ui.selected == "CHERI BERRY"
    assert ui.details["item_id"] == 133


@pytest.mark.parametrize("fault", ["pointer", "id", "owner"])
def test_berry_invalid_owned_data(fault: str) -> None:
    memory = berry()
    if fault == "pointer":
        memory.put(0x0203BCF4, b"\0" * 4)
    if fault == "id":
        memory.put(POINTER + 0x1800, b"\0" * 2)
    if fault == "owner":
        memory.put(0x03005E00, b"\0" * 4)
    assert read_view_ui(memory.read, BERRY_CALLBACK).diagnostic


def region(callback: int) -> Memory:
    memory = Memory()
    memory.put(0x0203A148 if callback == FLY_CALLBACK else 0x0203BCD0, struct.pack("<I", POINTER))
    memory.put(0x0203A144, struct.pack("<I", POINTER + 8))
    memory.put(POINTER + 8, struct.pack("<HBB", 0, 2, 0))
    memory.put(POINTER + 12, text("LITTLEROOT TOWN") + b"\xff")
    memory.put(POINTER + 8 + 0x18, struct.pack("<I", 0x081230C5))
    memory.put(POINTER + 8 + 0x54, struct.pack("<HH", 4, 12))
    memory.put(POINTER + 0x88C, struct.pack("<H", 4))
    memory.put(POINTER, struct.pack("<IH", 0x08124D65, 0))
    return memory


@pytest.mark.parametrize("callback", [FIELD_MAP_CALLBACK, FLY_CALLBACK])
def test_map_cursor_destination_and_phase(callback: int) -> None:
    memory = region(callback)
    ui = read_view_ui(memory.read, callback)
    assert ui.selected == "LITTLEROOT TOWN"
    assert ui.details["column"] == 4
    assert ui.ready is True
    memory.put(POINTER + 8 + 0x18, struct.pack("<I", 0x08123191))
    assert read_view_ui(memory.read, callback).ready is False


@pytest.mark.parametrize("fault", ["pointer", "owner", "id", "type", "zoom", "cursor", "input"])
def test_map_invalid_owned_data(fault: str) -> None:
    memory = region(FIELD_MAP_CALLBACK)
    if fault == "pointer":
        memory.put(0x0203BCD0, b"\0" * 4)
    if fault == "owner":
        memory.put(0x0203A144, b"\0" * 4)
    if fault == "id":
        memory.put(POINTER + 8, struct.pack("<H", 214))
    if fault == "type":
        memory.put(POINTER + 10, b"\5")
    if fault == "zoom":
        memory.put(POINTER + 8 + 0x78, b"\2")
    if fault == "cursor":
        memory.put(POINTER + 8 + 0x54, b"\0" * 4)
    if fault == "input":
        memory.put(POINTER + 8 + 0x18, b"\0" * 4)
    assert read_view_ui(memory.read, FIELD_MAP_CALLBACK).diagnostic


def test_menu_text_unknown_and_valid_question_mark() -> None:
    assert _buffer_text(text("?") + b"\xff") == "?"
    with pytest.raises(ValueError):
        _buffer_text(b"\x7f\xff")
    with pytest.raises(ValueError):
        _buffer_text(b"A")
    assert read_view_ui(Memory().read, 0) is None
