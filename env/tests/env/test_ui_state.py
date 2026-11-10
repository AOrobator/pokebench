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
        with pytest.raises(ValueError, match="unknown text glyph"):
            decode_message(b"\x7f")
        assert decode_message(b"\xac") == "?"

    def test_a_truncated_control_code_ends_the_text(self) -> None:
        with pytest.raises(ValueError, match="text control"):
            decode_message(text("Hi") + b"\xfc")


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
        from pokebench_env.game_screen import TASKS, Screen
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
        from pokebench_env.game_screen import TASKS, Screen
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
        from pokebench_env.game_screen import TASKS, Screen
        from pokebench_env.ui_state import read_active_ui

        memory = Memory()
        memory.put(TASKS, struct.pack("<IB", 0x08030E39, 1))
        menu(memory, cursor, 1, 1)
        window(memory, 1, 0, 6, 4, True)
        ui = read_active_ui(memory.read, Screen("birch_speech", 0, 0x0802F6B1))
        assert ui.phase == "gender_selection" and ui.selected == selected and ui.ready

    def test_unknown_owner_has_bounded_diagnostic_not_guessed_cursor(self) -> None:
        from pokebench_env.game_screen import TASKS, Screen
        from pokebench_env.ui_state import read_active_ui

        memory = Memory()
        memory.put(TASKS, struct.pack("<IB", 0x08039999, 1))
        ui = read_active_ui(memory.read, Screen("unknown", 0, 0x0802F6B1))
        assert ui.phase == "unsupported" and ui.ready is None and ui.selected is None
        assert "0x08039999" in ui.diagnostic and "0x0802F6B1" in ui.diagnostic

    def test_unrelated_screen_and_known_intro_have_no_invented_menu(self) -> None:
        from pokebench_env.game_screen import Screen
        from pokebench_env.ui_state import read_active_ui

        title = read_active_ui(Memory().read, Screen("title", 0, 0x080AA7A5))
        assert title.phase == "title_initializing" and not title.ready and title.selected is None
        assert read_active_ui(Memory().read, Screen("birch_speech", 0, 0x0802F6B1)) is None

    def test_invalid_owned_menu_is_a_coverage_error(self) -> None:
        from pokebench_env.game_screen import TASKS, Screen
        from pokebench_env.ui_state import read_active_ui

        memory = Memory()
        memory.put(TASKS, struct.pack("<IB", 0x08031189, 1))
        ui = read_active_ui(memory.read, Screen("birch_speech", 0, 0x0802F6B1))
        assert ui.ready is None and ui.selected is None and "invalid" in ui.diagnostic
        menu(memory, 0, 2, 1)
        window(memory, 1, 0, 6, 4, True)
        assert read_active_ui(memory.read, Screen("birch_speech", 0, 0x0802F6B1)).ready is None

    def test_conflicting_owners_and_short_reads_are_not_trusted(self) -> None:
        from pokebench_env.game_screen import TASKS, Screen
        from pokebench_env.ui_state import read_active_ui

        memory = Memory()
        memory.put(TASKS, struct.pack("<IB", 0x08031189, 1))
        memory.put(TASKS + 0x28, struct.pack("<IB", 0x08030E39, 1))
        assert (
            read_active_ui(memory.read, Screen("birch_speech", 0, 0x0802F6B1)).phase
            == "unsupported"
        )
        with pytest.raises(ValueError, match="short active UI"):
            read_active_ui(lambda a, n: b"", Screen("unknown", 0, 0))

    def test_prompt_readiness_is_distinct_from_transition(self) -> None:
        from pokebench_env.game_screen import TASKS, Screen
        from pokebench_env.ui_state import read_active_ui

        memory = Memory()
        memory.put(TASKS, struct.pack("<IB", 0x08031041, 1))
        ui = read_active_ui(memory.read, Screen("birch_speech", 0, 0x0802F6B1))
        assert ui.ready and "A or B" in ui.controls
        assert "input ready" in ui.text()
        memory.put(TASKS, struct.pack("<IB", 0x0803261D, 1))
        assert not read_active_ui(memory.read, Screen("birch_speech", 0, 0x0802F6B1)).ready


@pytest.mark.parametrize("callback", [0x08085FFD, 0x080860F5])
def test_source_matched_map_loader_is_explicitly_not_ready(callback: int) -> None:
    from pokebench_env.game_screen import Screen
    from pokebench_env.ui_state import read_active_ui

    ui = read_active_ui(Memory().read, Screen("field_transition", 0, callback))
    assert ui.phase == "field_transition" and ui.ready is False and ui.diagnostic is None


@pytest.mark.parametrize(
    ("fn", "phase", "ready"),
    [
        (0x08134CE9, "clock_adjustment", True),
        (0x08134CB9, "clock_transition", False),
        (0x08134F41, "clock_view", True),
    ],
)
def test_clock_owner_value_and_readiness(fn: int, phase: str, ready: bool) -> None:
    from pokebench_env.game_screen import TASKS, Screen
    from pokebench_env.ui_state import read_active_ui

    memory = Memory()
    memory.put(TASKS, struct.pack("<IB", fn, 1))
    memory.put(TASKS + 12, struct.pack("<hh", 13, 42))
    memory.put(TASKS + 18, struct.pack("<h", 1))
    ui = read_active_ui(memory.read, Screen("clock", 0, 0x08134C9D))
    assert ui.phase == phase and ui.ready == ready and ui.value == "1:42 PM"


@pytest.mark.parametrize(("cursor", "selected"), [(0, "YES"), (1, "NO")])
def test_clock_confirmation_selected_value(cursor: int, selected: str) -> None:
    from pokebench_env.game_screen import TASKS, Screen
    from pokebench_env.ui_state import read_active_ui

    memory = Memory()
    memory.put(TASKS, struct.pack("<IB", 0x08134E31, 1))
    menu(memory, cursor, 1, 2)
    window(memory, 2, 0, 5, 4, True)
    ui = read_active_ui(memory.read, Screen("clock", 0, 0x08134C9D))
    assert ui.selected == selected and ui.ready and ui.value == "12:00 AM"
    assert "value 12:00 AM" in ui.text()


@pytest.mark.parametrize(
    "fault", ["missing", "conflict", "hours", "minutes", "period", "menu", "menu_options", "short"]
)
def test_clock_invalid_owner_or_data_stays_unavailable(fault: str) -> None:
    from pokebench_env.game_screen import TASKS, Screen
    from pokebench_env.ui_state import read_active_ui

    memory = Memory()
    memory.put(TASKS, struct.pack("<IB", 0x08134E31, 1))
    if fault == "missing":
        memory.put(TASKS, b"\0" * 5)
    if fault == "conflict":
        memory.put(TASKS + 0x28, struct.pack("<IB", 0x08134CE9, 1))
    if fault == "hours":
        memory.put(TASKS + 12, struct.pack("<h", 24))
    if fault == "minutes":
        memory.put(TASKS + 14, struct.pack("<h", 60))
    if fault == "period":
        memory.put(TASKS + 18, struct.pack("<h", 2))
    if fault == "menu_options":
        menu(memory, 0, 2, 2)
        window(memory, 2, 0, 5, 4, True)
    if fault == "short":
        with pytest.raises(ValueError, match="short clock"):
            read_active_ui(lambda a, n: b"", Screen("clock", 0, 0x08134C9D))
    else:
        ui = read_active_ui(memory.read, Screen("clock", 0, 0x08134C9D))
        assert ui.ready is None and ui.diagnostic
        if fault in ("missing", "conflict"):
            assert ui.phase == "unsupported"
        if fault in ("hours", "minutes", "period"):
            assert ui.diagnostic == "invalid clock task hours/minutes/period"
        if fault in ("menu", "menu_options"):
            assert ui.diagnostic == "invalid or undrawn clock confirmation menu"


def test_clock_motion_between_ticks_does_not_claim_confirmation_input_ready() -> None:
    from pokebench_env.game_screen import TASKS, Screen
    from pokebench_env.ui_state import read_active_ui

    memory = Memory()
    memory.put(TASKS, struct.pack("<IB", 0x08134CE9, 1))
    memory.put(TASKS + 8, struct.pack("<h", 1))
    assert read_active_ui(memory.read, Screen("clock", 0, 0x08134C9D)).ready is False


@pytest.mark.parametrize("owner", [0x08030C19, 0x08030C91, 0x08030CD5, 0x08030D85])
def test_observed_birch_sprite_transitions_have_owned_not_ready_phase(owner: int) -> None:
    from pokebench_env.game_screen import GMAIN, TASKS, read_screen
    from pokebench_env.ui_state import read_active_ui

    memory = Memory()
    memory.put(GMAIN, struct.pack("<II", 0, 0x0802F6B1))
    memory.put(TASKS, struct.pack("<IB", owner, 1))
    screen = read_screen(memory.read)
    assert screen.kind == "birch_speech"
    ui = read_active_ui(memory.read, screen)
    assert ui.phase == "birch_transition" and ui.ready is False and ui.diagnostic is None


def test_naming_initialization_is_explicitly_not_ready_without_invented_cursor() -> None:
    from pokebench_env.game_screen import Screen
    from pokebench_env.ui_state import read_active_ui

    ui = read_active_ui(Memory().read, Screen("naming", 0, 0x080E2E05))
    assert ui.phase == "naming_transition" and ui.ready is False and ui.diagnostic is None
    ui = read_active_ui(Memory().read, Screen("naming", 0, 0x080E4F59))
    assert ui.phase == "unsupported" and ui.ready is None and "pointer 0x00000000" in ui.diagnostic


def test_initialized_naming_readiness_uses_existing_owned_cursor_decoder() -> None:
    from pokebench_env.game_screen import Screen
    from pokebench_env.ui_state import read_active_ui
    from tests.env.test_naming import keyboard

    screen = Screen("naming", 0, 0x080E4F59)
    editor = read_active_ui(keyboard(phase=2).read, screen)
    assert editor.phase == "naming_editor"
    assert editor.ready is True
    assert editor.details["naming_owner"] == "player"
    ui = read_active_ui(keyboard(phase=1).read, screen)
    assert ui.phase == "naming_transition" and ui.ready is False


@pytest.mark.parametrize(("flag", "enabled"), [(None, True), ("1", True), ("0", False)])
def test_active_ui_exposure_flag_defaults_on_and_accepts_explicit_ablation(flag, enabled) -> None:
    from pokebench_env.ui_state import active_ui_enabled_from_env

    assert (
        active_ui_enabled_from_env({} if flag is None else {"POKEBENCH_ACTIVE_UI": flag}) is enabled
    )


def test_invalid_active_ui_exposure_flag_is_not_silently_coerced() -> None:
    from pokebench_env.ui_state import active_ui_enabled_from_env

    with pytest.raises(ValueError, match="POKEBENCH_ACTIVE_UI must be 0 or 1"):
        active_ui_enabled_from_env({"POKEBENCH_ACTIVE_UI": "false"})


def test_unknown_clock_task_is_logged_as_actionable_coverage_error() -> None:
    from pokebench_env.game_screen import TASKS, Screen
    from pokebench_env.ui_state import read_active_ui

    memory = Memory()
    memory.put(TASKS, struct.pack("<IB", 0x08139999, 1))
    ui = read_active_ui(memory.read, Screen("clock", 0, 0x08134C9D))
    assert ui.phase == "unsupported" and "0x08139999" in ui.diagnostic


def test_nonstandard_window_zero_does_not_claim_stale_field_dialog() -> None:
    memory = Memory()
    message(memory, MOM)
    window(memory, 0, bg=0, width=22, height=2, drawn=True)
    assert read_dialog(memory.read, "overworld") is None


def test_pc_owned_standard_window_does_not_claim_stale_string_var4() -> None:
    from pokebench_env.game_screen import TASKS
    from pokebench_env.menu_pc import PC_ITEM_ACTION_TASK

    memory = Memory()
    message(memory, MOM)
    message_box(memory, drawn=True)
    memory.put(TASKS, struct.pack("<IB", PC_ITEM_ACTION_TASK, 1))
    assert read_dialog(memory.read, "overworld") is None
    memory.put(TASKS + 4, b"\0")
    assert read_dialog(memory.read, "overworld") is not None


def test_battle_ui_uses_native_controller_input_and_keeps_external_menu():
    from pokebench_env.game_screen import Screen
    from pokebench_env.ui_state import read_active_ui
    from tests.env.test_battle_state import fixture
    from tests.env.test_menus import put_task

    memory = fixture()
    ui = read_active_ui(memory.read, Screen("battle", 0, 0x08038421))
    assert ui.phase == "battle_input" and ui.ready is True
    assert "FIGHT" in ui.selected
    assert ui.details["battler_0_action_cursor"] == 0
    assert "battlers" not in ui.details
    # The native battle flag remains on while a party menu owns the screen.
    put_task(memory, 0, 0x081B1371, [])
    memory.put(0x0203CEC8 + 9, bytes([1, 0, 0]))
    ui = read_active_ui(memory.read, Screen("party_menu", 0, 0x081B01B1))
    assert ui.phase == "party_menu" and ui.selected == "PARTY SLOT 2"


def test_battle_callback_without_battle_flag_is_a_handoff():
    from pokebench_env.game_screen import Screen
    from pokebench_env.ui_state import read_active_ui

    ui = read_active_ui(Memory().read, Screen("battle", 0, 0x08038421))
    assert ui.phase == "battle_transition" and ui.ready is False and ui.diagnostic is None


@pytest.mark.parametrize("callback", [0x080B1159, 0x080B11A9, 0x08036761])
def test_source_owned_starter_battle_entry_needs_no_input(callback):
    from pokebench_env.game_screen import Screen
    from pokebench_env.ui_state import read_active_ui

    # These automatic owners precede battle flags and may still retain the
    # previous screen's tasks; callback ownership is sufficient for this phase.
    memory = Memory()
    memory.put(0x03005D04, struct.pack("<IB", 0x08134401, 1))
    ui = read_active_ui(memory.read, Screen("transition", 0, callback))
    assert ui.phase == "battle_transition"
    assert ui.ready is False and ui.selected is None and ui.diagnostic is None


def test_wild_battle_entry_qualifies_native_start_task():
    from pokebench_env.game_screen import Screen
    from pokebench_env.ui_state import read_active_ui
    from tests.env.test_menus import put_task

    m = Memory()
    put_task(m, 0, 0x080B05F1, [1, 0])
    ui = read_active_ui(m.read, Screen("transition", 0, 0x08085E51))
    assert ui.phase == "battle_transition" and not ui.ready and ui.diagnostic is None


def test_opus_credits_uses_the_native_end_task() -> None:
    from pokebench_env.game_screen import TASKS, Screen
    from pokebench_env.menus import PALETTE_FADE
    from pokebench_env.ui_state import read_active_ui

    memory = Memory()
    screen = Screen("credits", 0x08085E05, 0x081754DD)
    memory.put(TASKS, struct.pack("<IB", 0x08175775, 1))
    rolling = read_active_ui(memory.read, screen, opus_trace_correctness=True)
    assert rolling is not None and rolling.phase == "credits" and rolling.ready is False
    assert rolling.controls == "The credits are rolling"

    memory.put(TASKS, struct.pack("<IB", 0x08175C35, 1))
    end = read_active_ui(memory.read, screen, opus_trace_correctness=True)
    assert end is not None and end.phase == "credits_the_end" and end.ready is True
    memory.put(PALETTE_FADE + 7, b"\x80")
    fading = read_active_ui(memory.read, screen, opus_trace_correctness=True)
    assert fading is not None and fading.ready is False

    memory.put(TASKS, struct.pack("<IB", 0x08175CC9, 1))
    restart = read_active_ui(memory.read, screen, opus_trace_correctness=True)
    assert restart is not None and restart.phase == "credits_restart" and restart.ready is False

    memory.put(TASKS, struct.pack("<IB", 0x08175B91, 1))
    transition = read_active_ui(memory.read, screen, opus_trace_correctness=True)
    assert transition is not None and transition.controls == "Credits sequence in progress"


def test_opus_party_field_move_refusal_requires_the_drawn_owner_window() -> None:
    from pokebench_env.game_screen import TASKS, Screen
    from pokebench_env.menus import PARTY_INTERNAL
    from pokebench_env.ui_state import WINDOW_SIZE, read_active_ui

    memory = Memory()
    screen = Screen("party_menu", 0, 0x081B01B1)
    internal, window = 0x02000010, 8
    memory.put(TASKS, struct.pack("<IB", 0x081B57B5, 1))
    memory.put(PARTY_INTERNAL, struct.pack("<I", internal))
    memory.put(internal + 13, bytes([window]))
    message(memory, text("Can't use that here."))
    memory.put(
        WINDOWS + WINDOW_SIZE * window, struct.pack("<BBBBBBHI", 0, 1, 1, 3, 2, 0, 0, TILE_DATA)
    )
    memory.put(TILE_DATA, b"\x01\x00")
    ui = read_active_ui(memory.read, screen, opus_trace_correctness=True)
    assert ui is not None and ui.phase == "party_field_move_refusal" and ui.ready is True
    assert ui.details is not None and ui.details["message"] == "Can't use that here."
    memory.put(TILE_DATA, b"\x00")
    unknown = read_active_ui(memory.read, screen, opus_trace_correctness=True)
    assert unknown is not None and unknown.phase != "party_field_move_refusal"
