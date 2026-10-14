import struct

import pytest
from test_ui_state import Memory, text, window

from pokebench_env.game_screen import GMAIN
from pokebench_env.menu_legacy import MYSTERY_CALLBACKS, SAVE_CALLBACKS, read_legacy_menu
from pokebench_env.ui_state import STRING_VAR4


def fixture():
    m = Memory()
    window(m, 0, 0, 28, 6, True)
    window(m, 1, 0, 16, 4, True)
    for address, value in (
        (0x085EC86F, "BACKUP DAMAGED"),
        (0x085EC8D4, "CANNOT CONTINUE"),
        (0x085EC9A2, "SAVE COMPLETE PRESS A"),
        (0x085EC94F, "SAVE COMPLETE CANNOT CONTINUE"),
        (0x085EE765, "LINK STANDBY"),
        (0x085EE788, "PRESS A TO LOAD"),
        (0x085EE7CE, "DONT REMOVE CABLE"),
        (0x085EE7BF, "LOADING"),
        (STRING_VAR4, "EVENT LOADED"),
    ):
        m.put(address, text(value) + b"\xff")
    m.put(GMAIN + 0x0C, struct.pack("<I", 0x08179455))
    return m


@pytest.mark.parametrize("callback", [0x08178FDD, 0x08179289, 0x08179429, 0x08178975])
def test_loading_owners_do_not_claim_input(callback):
    assert read_legacy_menu(fixture().read, callback).ready is False


@pytest.mark.parametrize(
    "callback,vblank,damaged,continuation,message",
    [
        (0x08179391, 0, 1, 0, "BACKUP DAMAGED"),
        (0x081793E1, 0x08178FC9, 1, 0, "CANNOT CONTINUE"),
        (0x081793E1, 0x08179455, 0x80000000, 0, "BACKUP DAMAGED"),
        (0x081793E1, 0x08179455, 0, 0x08085E5D, "SAVE COMPLETE PRESS A"),
        (0x081793E1, 0x08179455, 0, 0, "SAVE COMPLETE CANNOT CONTINUE"),
    ],
)
def test_source_recovery_path_selects_actual_result(
    callback, vblank, damaged, continuation, message
):
    m = fixture()
    m.put(GMAIN + 0x0C, struct.pack("<I", vblank))
    m.put(0x030061FC, struct.pack("<I", damaged))
    m.put(0x03006214, struct.pack("<I", continuation))
    state = read_legacy_menu(m.read, callback)
    assert state.ready is True and state.details["message"] == message
    assert state.details["damaged_sectors"] == damaged


@pytest.mark.parametrize(
    "state,link,ready",
    [
        (0, 0, False),
        (1, 0, False),
        (2, 0, False),
        (3, 0, True),
        (4, 0, False),
        (5, 8, True),
        (5, 4, False),
        (6, 8, True),
        (6, 0x68, False),
        (7, 0, False),
        (8, 0, False),
        (9, 0, False),
        (10, 0, False),
        (11, 0, False),
        (12, 0, False),
        (13, 0, False),
        (14, 0, True),
        (15, 0, False),
        (16, 0, False),
        (3, 0x48, False),
    ],
)
def test_every_mystery_phase_observes_its_native_input_guard(state, link, ready):
    m = fixture()
    m.put(GMAIN + 0x438, bytes([state]))
    m.put(0x030030E0, struct.pack("<I", link))
    result = read_legacy_menu(m.read, 0x08178A79)
    assert result.diagnostic is None and result.ready is ready
    assert result.details["state"] == state
    assert result.details["player_count"] == (link & 0x1C) >> 2
    if state == 6:
        assert result.details["loading_message"] == "LOADING"
    if state in (13, 14):
        assert result.details["message"] == "EVENT LOADED"


@pytest.mark.parametrize(
    "callback,address,raw",
    [
        (0x081793E1, GMAIN + 0x0C, bytes(4)),
        (0x08179391, 0x0203BD0E, b"\xff"),
        (0x08179391, 0x0203BCFC, b"\x00\x01"),
        (0x08179391, 0x02020004, b"\xff"),
        (0x08178A79, GMAIN + 0x438, b"\xff"),
        (0x08178A79, 0x03003124, b"\x02"),
        (0x08178A79, 0x020201CB, b"\x02"),
    ],
)
def test_invalid_owner_fields_produce_explicit_defect(callback, address, raw):
    m = fixture()
    m.put(address, raw)
    assert "harness bug" in read_legacy_menu(m.read, callback).diagnostic


def test_mystery_windows_and_text_are_required_not_guessed():
    m = fixture()
    m.put(GMAIN + 0x438, b"\x06")
    m.put(0x02020004 + 12, b"\xff")
    assert "loading window" in read_legacy_menu(m.read, 0x08178A79).diagnostic
    m = fixture()
    m.put(GMAIN + 0x438, b"\x03")
    m.put(0x02020004, b"\xff")
    assert "message window" in read_legacy_menu(m.read, 0x08178A79).diagnostic
    m = fixture()
    m.put(GMAIN + 0x438, b"\x0e")
    m.put(STRING_VAR4, b"\x0a\xff")
    assert "glyph" in read_legacy_menu(m.read, 0x08178A79).diagnostic
    assert read_legacy_menu(lambda a, n: bytes(n), 0x08085E5D) is None
    assert len(SAVE_CALLBACKS) == 5 and len(MYSTERY_CALLBACKS) == 2


@pytest.mark.parametrize(
    "state,scene,ready",
    [
        (0, 6, False),
        (1, 5, True),
        (1, 6, False),
        (1, 0, False),
        (2, 0, True),
        (3, 1, False),
        (4, 1, False),
        (5, 2, False),
        (6, 3, True),
        (7, 4, True),
    ],
)
def test_berry_update_native_scene_and_input_guards(state, scene, ready):
    m = fixture()
    pointer = 0x02010000
    m.put(0x030012B8, struct.pack("<I", pointer))
    body = bytearray(80)
    body[:4] = bytes([state, scene, 181, 0])
    body[0x21:0x23] = b"\x02\x02"
    m.put(pointer, body)
    m.put(0x08618160, struct.pack("<6I", *([0x085EE7BF] * 6)))
    result = read_legacy_menu(m.read, 0x081BF3DD)
    assert result.diagnostic is None and result.ready is ready
    assert result.details["timer"] == 181
    assert result.details["client_bits"] == 2
    if scene != 6:
        assert result.details["message"] == "LOADING"
    assert read_legacy_menu(m.read, 0x080AAF29).ready is False
    assert read_legacy_menu(m.read, 0x081BF385).ready is False


def test_berry_invalid_heap_state_window_and_text_remain_defects():
    m = fixture()
    for pointer in [0, 0x02010001, 0x02040000 - 79]:
        m.put(0x030012B8, struct.pack("<I", pointer))
        assert "heap" in read_legacy_menu(m.read, 0x081BF3DD).diagnostic
    m.put(0x030012B8, struct.pack("<I", 0x02010000))
    for state, scene in [(8, 0), (1, 7)]:
        m.put(0x02010000, bytes([state, scene]))
        assert "state" in read_legacy_menu(m.read, 0x081BF3DD).diagnostic
    m.put(0x02010000, b"\x01\x05")
    m.put(0x08618160 + 20, bytes(4))
    assert "text" in read_legacy_menu(m.read, 0x081BF3DD).diagnostic
    m.put(0x02020004 + 12, b"\xff")
    assert "window" in read_legacy_menu(m.read, 0x081BF3DD).diagnostic
    assert (
        "short"
        in read_legacy_menu(
            lambda a, n: b"" if a == 0x0203BCFC else m.read(a, n), 0x08179391
        ).diagnostic
    )
    assert (
        "state"
        in read_legacy_menu(
            lambda a, n: b"" if a == 0x02010000 else m.read(a, n), 0x081BF3DD
        ).diagnostic
    )
