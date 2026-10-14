import pytest

from pokebench_env.menu_ereader import PHASES, read_ereader_ui
from pokebench_env.ui_state import STRING_VAR4
from tests.env.test_menus import put_task
from tests.env.test_ui_state import Memory, text, window


def state(index, text_state=0):
    m = Memory()
    put_task(m, 0, 0x081D5085, [12, 0, 0, 0, index + text_state * 256, 0, 0, 1])
    window(m, 1, 0, 28, 4, True)
    m.put(STRING_VAR4, text("CONNECT E-READER") + b"\xff")
    return m


@pytest.mark.parametrize("index", [i for i in range(len(PHASES)) if i not in (24, 25)])
def test_source_ereader_phases_and_text(index):
    ui = read_ereader_ui(state(index).read, 0x08018439)
    assert ui.phase == "ereader_" + PHASES[index] and ui.diagnostic is None
    assert ui.details["message"] == "CONNECT E-READER"


def test_actual_message_and_receive_controls():
    assert read_ereader_ui(state(0, 0).read, 0x08018439).ready is False
    assert read_ereader_ui(state(0, 1).read, 0x08018439).selected == "A OR B: CONTINUE"
    for receive in range(6):
        ui = read_ereader_ui(state(13, receive).read, 0x08018439)
        assert ui.ready == (receive in (0, 2))
    m = state(19)
    put_task(m, 1, 0x080A3141, [])
    assert not read_ereader_ui(m.read, 0x08018439).ready


@pytest.mark.parametrize("index,text_state", [(24, 0), (25, 0), (27, 0), (0, 3), (13, 6)])
def test_unknown_native_phases_are_bugs(index, text_state):
    ui = read_ereader_ui(state(index, text_state).read, 0x08018439)
    assert ui.diagnostic and not ui.ready


def test_ordinary_mystery_gift_has_no_ereader_owner():
    assert read_ereader_ui(Memory().read, 0x08018439) is None
