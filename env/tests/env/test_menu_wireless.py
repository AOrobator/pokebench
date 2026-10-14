import struct

import pytest

from pokebench_env.game_screen import TASKS
from pokebench_env.menu_wireless import (
    GROUP_TASK,
    LEADER_TASK,
    LINK_MAIN,
    RFU_STATUS,
    read_wireless_ui,
)
from tests.env.test_menus import list_task, put_task
from tests.env.test_ui_state import Memory, menu, text, window

CALLBACK = 0x08085E5D
PLAYERS = 0x02010000


def lobby(leader=False, state=None, text_state=0):
    m = Memory()
    put_task(m, 0, LEADER_TASK if leader else GROUP_TASK, [])
    raw = bytearray(32)
    struct.pack_into("<I", raw, 0, PLAYERS)
    raw[12 if leader else 8] = state if state is not None else (6 if leader else 3)
    raw[13 if leader else 9] = text_state
    raw[18 if leader else 14] = 1
    raw[19 if leader else 15] = 1
    m.put(TASKS + 8, raw)
    m.put(LINK_MAIN, struct.pack("<I", TASKS + 8))
    list_task(m, 1)
    m.put(TASKS + 40 + 20, struct.pack("<HH", 2, 2))
    window(m, 0, 0, 12, 6, True)
    for i in range(2):
        player = bytearray(32)
        struct.pack_into("<H", player, 2, 123 + i)
        player[10] = 4
        player[16:24] = (text("ANDREW" if i == 0 else "MAY") + b"\xff").ljust(8, b"\xff")
        player[26] = 1
        m.put(PLAYERS + i * 32, player)
    return m


def test_group_cursor_and_empty_unavailable_candidate():
    m = lobby()
    ui = read_wireless_ui(m.read, CALLBACK)
    assert ui.ready and ui.selected == "ANDREW"
    assert ui.details["player_trainer_ids"] == [123, 124]
    m.put(PLAYERS + 26, b"\0")
    ui = read_wireless_ui(m.read, CALLBACK)
    assert ui.selected == "EMPTY SLOT 1" and ui.details["selected_available"] is False


def test_leader_wait_and_confirmation():
    m = lobby(True)
    ui = read_wireless_ui(m.read, CALLBACK)
    assert ui.selected == "WAIT FOR PLAYERS" and ui.ready
    m = lobby(True, 11, 1)
    menu(m, 1, 1, 0)
    ui = read_wireless_ui(m.read, CALLBACK)
    assert ui.selected == "NO" and ui.ready
    m = lobby(True, 11, 0)
    assert read_wireless_ui(m.read, CALLBACK).ready is False


def test_group_wait_status_and_confirmation():
    m = lobby(False, 6)
    assert read_wireless_ui(m.read, CALLBACK).ready
    m.put(RFU_STATUS, b"\1")
    assert read_wireless_ui(m.read, CALLBACK).ready is False
    m = lobby(False, 8, 1)
    menu(m, 0, 1, 0)
    ui = read_wireless_ui(m.read, CALLBACK)
    assert ui.selected == "YES" and ui.ready


@pytest.mark.parametrize(
    "mutation",
    [
        "pointer",
        "duplicate",
        "state",
        "text",
        "menu",
        "listtask",
        "listcursor",
        "players",
        "emptyname",
    ],
)
def test_invalid_lobby_owner(mutation):
    m = lobby(False, 8, 1) if mutation in ("text", "menu") else lobby()
    if mutation == "pointer":
        m.put(LINK_MAIN, b"\0" * 4)
    elif mutation == "duplicate":
        put_task(m, 2, LEADER_TASK, [])
    elif mutation == "state":
        m.put(TASKS + 16, b"\xff")
    elif mutation == "text":
        m.put(TASKS + 17, b"\3")
    elif mutation == "menu":
        pass
    elif mutation == "listtask":
        m.put(TASKS + 40, b"\0" * 4)
    elif mutation == "listcursor":
        m.put(TASKS + 40 + 32, struct.pack("<H", 99))
    elif mutation == "players":
        m.put(TASKS + 8, b"\0" * 4)
    elif mutation == "emptyname":
        m.put(PLAYERS + 16, b"\xff")
    assert read_wireless_ui(m.read, CALLBACK).diagnostic


def test_no_lobby_and_transition():
    m = Memory()
    assert read_wireless_ui(m.read, CALLBACK) is None
    assert read_wireless_ui(m.read, 0) is None
    m = lobby(False, 0)
    assert read_wireless_ui(m.read, CALLBACK).ready is False
