import struct

import pytest

from pokebench_env.game_state import GBA_TEXT
from pokebench_env.ui_state import (
    MENU,
    STRING_VAR4,
    WINDOWS,
    Menu,
    decode_message,
    read_dialog,
    read_menu,
)

TILE_DATA = 0x02002000


class Memory:
    def __init__(self) -> None:
        self.cells: dict[int, int] = {}

    def put(self, address: int, data: bytes) -> None:
        for i, b in enumerate(data):
            self.cells[address + i] = b

    def read(self, address: int, length: int) -> bytes:
        return bytes(self.cells.get(address + i, 0) for i in range(length))


def text(s: str) -> bytes:
    inverse = {v: k for k, v in GBA_TEXT.items()}
    return bytes(inverse[c] for c in s)


def message(memory: Memory, raw: bytes) -> None:
    memory.put(STRING_VAR4, raw + b"\xff")


MOM = text("MOM") + b"\xf0" + text(" See, AAAAAAA?") + b"\xfe" + text("Isn't it nice in here, too?")


class TestDecodeMessage:
    def test_line_breaks_join_with_spaces_and_paragraphs_with_a_bar(self) -> None:
        raw = text("Hi!") + b"\xfe" + text("Bye.") + b"\xfb" + text("Next") + b"\xfa" + text("page")
        assert decode_message(raw) == "Hi! Bye. | Next page"

    def test_a_message_ending_on_a_page_break_has_no_trailing_bar(self) -> None:
        assert decode_message(text("Bye.") + b"\xfb") == "Bye."

    def test_stops_at_the_terminator(self) -> None:
        assert decode_message(text("Yes") + b"\xff" + text("junk")) == "Yes"

    def test_skips_control_codes_with_their_arguments(self) -> None:
        raw = b"\xfc\x01\x02" + text("Red") + b"\xfc\x04\x01\x02\x03" + text(" text") + b"\xfc\x09"
        assert decode_message(raw) == "Red text"

    def test_decodes_punctuation_used_in_dialog(self) -> None:
        raw = text("POK") + b"\x1b" + text("MON") + b"\xf0" + b"\xb1" + text("A") + b"\xb2"
        assert decode_message(raw) == "POKéMON:“A”"

    def test_marks_unknown_bytes(self) -> None:
        assert decode_message(b"\x7f") == "?"

    def test_a_truncated_control_code_ends_the_text(self) -> None:
        assert decode_message(text("Hi") + b"\xfc") == "Hi"


def menu(memory: Memory, cursor: int, maximum: int, window: int) -> None:
    memory.put(MENU, bytes([0, 1, cursor, 0, maximum, window, 1, 0, 16, 0, 0, 0]))


def window(memory: Memory, index: int, bg: int, width: int, height: int, drawn: bool) -> None:
    buffer = TILE_DATA + 0x1000 * index
    memory.put(
        WINDOWS + 12 * index,
        struct.pack("<BBBBBBHI", bg, 22, 1, width, height, 15, 0x139, buffer),
    )
    size = width * height * 32
    pixels = bytes([0x11] * size)
    if drawn:
        pixels = pixels[:40] + b"\x1f\xf1" + pixels[42:]
    memory.put(buffer, pixels)


def message_box(memory: Memory, drawn: bool) -> None:
    window(memory, 0, bg=0, width=27, height=4, drawn=drawn)


class TestReadDialog:
    @pytest.mark.parametrize("screen", ["overworld", "birch_speech"])
    def test_a_drawn_message_box_shows_the_message(self, screen: str) -> None:
        memory = Memory()
        message(memory, MOM)
        message_box(memory, drawn=True)
        assert read_dialog(memory.read, screen) == "MOM: See, AAAAAAA? Isn't it nice in here, too?"

    def test_a_cleared_message_box_leaves_stale_text_that_is_not_shown(self) -> None:
        memory = Memory()
        message(memory, MOM)
        message_box(memory, drawn=False)
        assert read_dialog(memory.read, "overworld") is None

    def test_a_removed_or_empty_message_window_is_not_dialog(self) -> None:
        memory = Memory()
        message(memory, MOM)
        window(memory, 0, bg=0xFF, width=27, height=4, drawn=True)
        assert read_dialog(memory.read, "overworld") is None
        window(memory, 0, bg=0, width=0, height=4, drawn=True)
        assert read_dialog(memory.read, "overworld") is None

    def test_screens_not_checked_for_window_0_report_nothing(self) -> None:
        memory = Memory()
        message(memory, MOM)
        message_box(memory, drawn=True)
        assert read_dialog(memory.read, "naming") is None

    def test_an_empty_message_is_not_dialog(self) -> None:
        memory = Memory()
        message(memory, b"")
        message_box(memory, drawn=True)
        assert read_dialog(memory.read, "overworld") is None


class TestReadMenu:
    def test_a_drawn_menu_reports_the_selected_option(self) -> None:
        memory = Memory()
        menu(memory, cursor=2, maximum=4, window=1)
        window(memory, 1, bg=0, width=7, height=12, drawn=True)
        assert read_menu(memory.read) == Menu(selected=3, options=5)

    def test_no_menu_has_been_set_up(self) -> None:
        memory = Memory()
        window(memory, 0, bg=0, width=27, height=4, drawn=True)
        assert read_menu(memory.read) is None

    def test_a_removed_window_means_the_menu_closed(self) -> None:
        memory = Memory()
        menu(memory, cursor=1, maximum=4, window=1)
        window(memory, 1, bg=0xFF, width=7, height=12, drawn=True)
        assert read_menu(memory.read) is None

    def test_a_cleared_window_means_the_menu_is_gone(self) -> None:
        memory = Memory()
        menu(memory, cursor=0, maximum=1, window=1)
        window(memory, 1, bg=0, width=6, height=4, drawn=False)
        assert read_menu(memory.read) is None

    @pytest.mark.parametrize("pointer", [0, 0x08000000, 0x02040000, 0x0203FF00])
    def test_a_window_without_a_ram_pixel_buffer_is_not_a_menu(self, pointer: int) -> None:
        memory = Memory()
        menu(memory, cursor=0, maximum=1, window=3)
        memory.put(WINDOWS + 36, struct.pack("<BBBBBBHI", 0, 3, 2, 5, 4, 15, 0x100, pointer))
        assert read_menu(memory.read) is None

    def test_a_cursor_past_the_last_option_is_not_trusted(self) -> None:
        memory = Memory()
        menu(memory, cursor=5, maximum=4, window=1)
        window(memory, 1, bg=0, width=7, height=12, drawn=True)
        assert read_menu(memory.read) is None


class TestActiveBirchUi:
    @pytest.mark.parametrize(("cursor", "selected"), [(0, "YES"), (1, "NO")])
    def test_name_confirmation_reads_owned_selection(self, cursor: int, selected: str) -> None:
        from pokebench_env.game_screen import Screen, TASKS
        from pokebench_env.ui_state import read_active_ui

        memory = Memory()
        memory.put(TASKS + 2 * 0x28, struct.pack("<IB", 0x08031189, 1))
        menu(memory, cursor, 1, 1)
        window(memory, 1, 0, 6, 4, True)
        ui = read_active_ui(memory.read, Screen("birch_speech", 0, 0x0802F6B1))
        assert ui.phase == "name_confirmation"
        assert ui.selected == selected
        assert ui.ready is True
        assert "B declines" in ui.controls

    def test_printing_phase_does_not_reuse_stale_yes_no_menu(self) -> None:
        from pokebench_env.game_screen import Screen, TASKS
        from pokebench_env.ui_state import read_active_ui

        memory = Memory()
        memory.put(TASKS, struct.pack("<IB", 0x08031145, 1))
        menu(memory, 0, 1, 1)
        window(memory, 1, 0, 6, 4, True)
        ui = read_active_ui(memory.read, Screen("birch_speech", 0, 0x0802F6B1))
        assert ui.phase == "name_confirmation_printing"
        assert ui.ready is False and ui.selected is None

    @pytest.mark.parametrize(("cursor", "selected"), [(0, "BOY"), (1, "GIRL")])
    def test_gender_selection_is_owned(self, cursor: int, selected: str) -> None:
        from pokebench_env.game_screen import Screen, TASKS
        from pokebench_env.ui_state import read_active_ui

        memory = Memory()
        memory.put(TASKS, struct.pack("<IB", 0x08030E39, 1))
        menu(memory, cursor, 1, 1)
        window(memory, 1, 0, 6, 4, True)
        ui = read_active_ui(memory.read, Screen("birch_speech", 0, 0x0802F6B1))
        assert ui.phase == "gender_selection" and ui.selected == selected and ui.ready

    def test_unknown_owner_has_bounded_diagnostic_not_guessed_cursor(self) -> None:
        from pokebench_env.game_screen import Screen, TASKS
        from pokebench_env.ui_state import read_active_ui

        memory = Memory()
        memory.put(TASKS, struct.pack("<IB", 0x08039999, 1))
        ui = read_active_ui(memory.read, Screen("unknown", 0, 0x0802F6B1))
        assert ui.phase == "unsupported" and ui.ready is None and ui.selected is None
        assert "0x08039999" in ui.diagnostic and "0x0802F6B1" in ui.diagnostic
