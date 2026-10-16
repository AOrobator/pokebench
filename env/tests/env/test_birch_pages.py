"""birch-speech-pages-v1: a Birch intro page waiting for A or B reads input-ready.

The recorded cook-run frames (sh02 T35/T36) are in test_readout_truth.py; these cases build
the printer, window and buffer by hand.
"""

import struct

import pytest

from pokebench_env.birch_pages import (
    CONTROLS,
    PAGE_TASKS,
    PHASE,
    PRINTER,
    SWITCH,
    TEXT_FLAGS,
    page_text,
    read_birch_page,
)
from pokebench_env.game_screen import TASKS, Screen
from pokebench_env.readout import SERVER_FEATURES, features_off_from_env, format_readout
from pokebench_env.ui_state import STRING_VAR4, read_active_ui
from tests.env.test_game_state import BIRCH_SPEECH, MAPS, game, text
from tests.env.test_ui_state import Memory, window

YOURE_PLAYER = text("Ah, okay!") + b"\xfb" + text("You're MAY who's moving") + b"\xfe"


def page_memory(*, state: int = 2, active: int = 1, cursor: int = 10, flags: int = 1) -> Memory:
    m = Memory()
    task = bytearray(40)
    struct.pack_into("<I", task, 0, 0x0803133D)
    task[4] = 1
    m.put(TASKS, task)
    printer = bytearray(0x24)
    struct.pack_into("<I", printer, 0, STRING_VAR4 + cursor)
    printer[0x1B], printer[0x1C] = active, state
    m.put(PRINTER, printer)
    m.put(TEXT_FLAGS, bytes([flags]))
    m.put(STRING_VAR4, YOURE_PLAYER + b"\xff")
    window(m, 0, 0, 27, 4, True)
    return m


def test_page_text_is_the_page_written_up_to_the_cursor() -> None:
    assert page_text(YOURE_PLAYER, 10) == "Ah, okay!"
    assert page_text(YOURE_PLAYER, len(YOURE_PLAYER)) == "You're MAY who's moving"
    assert page_text(YOURE_PLAYER, 3) == "Ah,"
    # Control codes and their argument bytes are skipped whole, never read as a page break.
    coded = text("A") + b"\xfc\x01\xfb" + text("B") + b"\xfd\x01" + b"\xfb" + text("C")
    assert page_text(coded, len(coded)) == "C"
    assert page_text(coded, 5) == "AB"


def test_page_waiting_for_a_is_ready_with_the_page_as_value() -> None:
    ui = read_birch_page(page_memory().read, 0x0803133D)
    assert ui is not None
    assert (ui.phase, ui.selected, ui.ready, ui.value, ui.controls) == (
        PHASE,
        None,
        True,
        "Ah, okay!",
        CONTROLS,
    )
    assert read_birch_page(page_memory(state=3).read, 0x080314C5) is not None
    assert read_birch_page(page_memory(state=1).read, 0x080314C5) is not None


@pytest.mark.parametrize(
    "memory",
    [
        page_memory(state=0),
        page_memory(state=4),
        page_memory(active=0),
        page_memory(flags=5),
        page_memory(cursor=0),
        page_memory(cursor=1001),
    ],
)
def test_printing_scrolling_autoscroll_or_bad_cursor_is_not_a_ready_page(memory: Memory) -> None:
    assert read_birch_page(memory.read, 0x0803133D) is None


def test_other_owners_undrawn_window_and_empty_page_are_not_pages() -> None:
    assert read_birch_page(page_memory().read, 0x080313E5) is None
    m = page_memory()
    window(m, 0, 0, 27, 4, False)
    assert read_birch_page(m.read, 0x0803133D) is None
    m = page_memory(cursor=1)
    m.put(STRING_VAR4, b"\xfb\xff")
    assert read_birch_page(m.read, 0x0803133D) is None
    assert PAGE_TASKS == frozenset({0x0803133D, 0x080314C5})


def test_read_active_ui_reads_the_page_only_with_the_switch() -> None:
    m = page_memory()
    screen = Screen("birch_speech", 0, BIRCH_SPEECH)
    old = read_active_ui(m.read, screen)
    new = read_active_ui(m.read, screen, birch_pages=True)
    assert old is not None and (old.phase, old.ready) == ("name_confirmed_transition", False)
    assert new is not None and (new.phase, new.ready, new.value) == (PHASE, True, "Ah, okay!")
    # A printing page falls back to the old line with the switch on.
    printing = read_active_ui(page_memory(state=0).read, screen, birch_pages=True)
    assert printing is not None and printing.phase == "name_confirmed_transition"


def test_page_shows_in_the_arm_without_expanded_menu_text() -> None:
    m = game((0, BIRCH_SPEECH))
    for address, value in page_memory().cells.items():
        m.put(address, bytes([value]))
    from pokebench_env.game_state import read_game_state

    state = read_game_state(m.read, MAPS, birch_pages_enabled=True)
    hidden = frozenset({"expanded-menu-battle-information-v1"})
    lines = format_readout(state, hidden).split("\n")
    assert f"Interface: {PHASE}; input ready; value Ah, okay!; {CONTROLS}" in lines
    gone = format_readout(state, hidden | {SWITCH}).split("\n")
    assert "Menu: detailed controls unprovided" in gone


def test_switch_is_a_default_off_server_feature() -> None:
    assert SWITCH in SERVER_FEATURES
    assert SWITCH in features_off_from_env({})
