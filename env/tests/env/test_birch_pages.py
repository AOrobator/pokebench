"""birch-speech-pages-v1: a Birch intro page waiting for A or B reads input-ready.

The recorded cook-run frames (sh02 T35/T36) are in test_readout_truth.py; these cases build
the printer, window and buffer by hand.
"""

import struct
from collections.abc import Callable

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
from pokebench_env.ui_state import STRING_VAR4, WINDOWS, read_active_ui
from tests.env.test_game_state import BIRCH_SPEECH, MAPS, game, text
from tests.env.test_ui_state import TILE_DATA, Memory, window

YOURE_PLAYER = text("Ah, okay!") + b"\xfb" + text("You're MAY who's moving") + b"\xfe"


def task_record(owner: int = 0x0803133D, *, faded: int = 1) -> bytes:
    """One gTasks entry: func, isActive, then data[5] = tIsDoneFadingSprites (main_menu.c)."""
    task = bytearray(40)
    struct.pack_into("<I", task, 0, owner)
    task[4] = 1
    struct.pack_into("<h", task, 8 + 2 * 5, faded)
    return bytes(task)


def page_memory(
    *, state: int = 2, active: int = 1, cursor: int = 10, flags: int = 1, faded: int = 1
) -> Memory:
    m = Memory()
    m.put(TASKS, task_record(faded=faded))
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
    ui = read_birch_page(page_memory().read, task_record())
    assert ui is not None
    assert (ui.phase, ui.selected, ui.ready, ui.value, ui.controls) == (
        PHASE,
        None,
        True,
        "Ah, okay!",
        CONTROLS,
    )
    assert read_birch_page(page_memory(state=3).read, task_record(0x080314C5)) is not None
    assert read_birch_page(page_memory(state=1).read, task_record(0x080314C5)) is not None


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
    assert read_birch_page(memory.read, task_record()) is None


def test_other_owners_undrawn_window_and_empty_page_are_not_pages() -> None:
    assert read_birch_page(page_memory().read, task_record(0x080313E5)) is None
    m = page_memory()
    window(m, 0, 0, 27, 4, False)
    assert read_birch_page(m.read, task_record()) is None
    m = page_memory(cursor=1)
    m.put(STRING_VAR4, b"\xfb\xff")
    assert read_birch_page(m.read, task_record()) is None
    assert PAGE_TASKS == frozenset({0x0803133D, 0x080314C5})


def test_a_page_before_the_sprite_fade_is_done_is_not_ready() -> None:
    # Both page tasks run the printer and take A/B only once tIsDoneFadingSprites (data[5])
    # is set (main_menu.c:1257, 1684, 1732); before that the old not-ready line stays.
    assert read_birch_page(page_memory(faded=0).read, task_record(faded=0)) is None
    assert read_birch_page(page_memory().read, task_record(0x080314C5, faded=0)) is None
    screen = Screen("birch_speech", 0, BIRCH_SPEECH)
    fading = read_active_ui(page_memory(faded=0).read, screen, birch_pages=True)
    assert fading is not None and (fading.phase, fading.ready) == ("name_confirmed_transition", False)
    # A short task record cannot prove the fade is done.
    assert read_birch_page(page_memory().read, task_record()[:18]) is None


def _short(memory: Memory, address: int) -> Callable[[int, int], bytes]:
    def read(at: int, size: int) -> bytes:
        data = memory.read(at, size)
        return data[: size - 1] if at == address else data

    return read


@pytest.mark.parametrize(
    "address",
    [PRINTER, TEXT_FLAGS, WINDOWS, TILE_DATA, STRING_VAR4],
    ids=["printer", "text-flags", "window-header", "window-pixels", "page-buffer"],
)
def test_a_short_read_keeps_the_old_hedge_without_raising(address: int) -> None:
    m = page_memory()
    assert read_birch_page(m.read, task_record()) is not None
    assert read_birch_page(_short(m, address), task_record()) is None
    screen = Screen("birch_speech", 0, BIRCH_SPEECH)
    ui = read_active_ui(_short(m, address), screen, birch_pages=True)
    assert ui is not None and (ui.phase, ui.ready) == ("name_confirmed_transition", False)


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
