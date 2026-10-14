import struct

import pytest
from test_game_state import Memory

from pokebench_env.battle_choices import IN_BATTLE
from pokebench_env.game_screen import GMAIN
from pokebench_env.running import (
    FIELD_LOCK,
    MAP_HEADER,
    NO_RUNNING_TILES,
    OBJECT_EVENTS,
    OVERWORLD_CB1,
    OVERWORLD_CB2,
    PLAYER_AVATAR,
    RUNNING_SHOES_FLAG,
    SAVE1,
    read_running_permission,
)


def fixture():
    m = Memory()
    m.put(GMAIN, struct.pack("<II", OVERWORLD_CB1, OVERWORLD_CB2))
    m.put(PLAYER_AVATAR, bytes([1, 0, 0, 0, 0, 0, 0, 0]))
    obj = bytearray(0x24)
    obj[0], obj[2] = 1, 1
    m.put(OBJECT_EVENTS, obj)
    header = bytearray(0x1C)
    struct.pack_into("<I", header, 0, 0x08500000)
    header[0x1A] = 4
    header[0x17] = 8
    m.put(MAP_HEADER, header)
    m.put(SAVE1, struct.pack("<I", 0x02025000))
    m.put(0x02025000 + 0x1270 + RUNNING_SHOES_FLAG // 8, b"\x01")
    return m


def test_native_header_allows_running_even_in_indoor_map():
    state = read_running_permission(fixture().read)
    assert state.permitted is True
    assert state.map_type == 8


@pytest.mark.parametrize("tile", sorted(NO_RUNNING_TILES))
def test_disallowed_metatiles(tile):
    m = fixture()
    m.put(OBJECT_EVENTS + 0x1E, bytes([tile]))
    assert read_running_permission(m.read).reason == "metatile_disallows_running"


@pytest.mark.parametrize("elevation,permitted", [(0, False), (1, True), (2, False), (3, True)])
def test_fortree_bridge_uses_previous_elevation(elevation, permitted):
    m = fixture()
    m.put(OBJECT_EVENTS + 0x1E, b"\x78")
    m.put(OBJECT_EVENTS + 0xB, bytes([elevation << 4]))
    assert read_running_permission(m.read).permitted is permitted


@pytest.mark.parametrize(
    "address,value,reason",
    [
        (IN_BATTLE, 2, "battle"),
        (FIELD_LOCK, 1, "field_controls_locked"),
        (PLAYER_AVATAR + 6, 1, "player_step_blocked"),
        (PLAYER_AVATAR + 1, 1, "forced_or_transitioning"),
        (OBJECT_EVENTS + 0x1E, 0x40, "forced_or_transitioning"),
        (PLAYER_AVATAR, 3, "not_on_foot"),
        (MAP_HEADER + 0x1A, 0, "map_disallows_running"),
        (0x02025000 + 0x1270 + RUNNING_SHOES_FLAG // 8, 0, "no_running_shoes"),
    ],
)
def test_native_restrictions(address, value, reason):
    m = fixture()
    m.put(address, bytes([value]))
    s = read_running_permission(m.read)
    assert s.permitted is False and s.reason == reason


def test_external_menu_owner_cannot_receive_automatic_b():
    m = fixture()
    m.put(GMAIN + 4, struct.pack("<I", 0x081A0001))
    assert read_running_permission(m.read).reason == "external_owner"


def test_unknown_native_player_is_diagnostic_not_permission():
    m = fixture()
    m.put(OBJECT_EVENTS, b"\x00")
    s = read_running_permission(m.read)
    assert s.permitted is None
    assert "harness bug" in s.diagnostic


@pytest.mark.parametrize(
    "address,body,message",
    [
        (FIELD_LOCK, b"\x02", "field-control lock"),
        (PLAYER_AVATAR + 5, b"\x10", "player-avatar state"),
        (MAP_HEADER, bytes(4), "map-layout pointer"),
    ],
)
def test_corrupt_native_running_permission_fails_closed(address, body, message):
    m = fixture()
    m.put(address, body)
    state = read_running_permission(m.read)
    assert state.permitted is None and state.controllable is None
    assert message in state.diagnostic


def test_invalid_save_pointer_cannot_claim_running_shoes():
    m = fixture()
    m.put(SAVE1, bytes(4))
    state = read_running_permission(m.read)
    assert state.permitted is None and state.shoes is None
    assert "SaveBlock1 pointer" in state.diagnostic
