"""readout-truth-v1: readout lines say what the game shows (cook harness audit 2026-10-16).

The fixture holds RAM windows (never ROM bytes) of recorded cook-run states, read while
re-rendering them with each new switch off and on, plus the tool result the model got:

- sh02 2984 (T143): a push-back script walks the player back, no message open.
- sh02 7780 (T334): a field YES/NO box after Birch's nickname question.
- sh02 7443 (T317): battle_resolving with a stale sMenu buffer "cursor 1 of 2".
- sh02 620 / 632 (T35 / T36): Birch's speech, a page waiting for A / a page printing.
- sh02 1492 (T76): free field, stale sMenu buffer "cursor 4 of 4".
- 2919 941 (T65): the moving truck holds field controls from a task, no script.
- 54a7 3380 (T153): RIVAL_MAY_NORMAL live on screen while her template's hide flag is set.
- show 15183 (T526): the START menu redrawn after the party menu closed (0x080AF661).
- show 19097 (T768): CB2_WhiteOut running after the loss.
"""

import functools
import json
import os
import struct
from collections import Counter
from dataclasses import replace
from pathlib import Path

import pytest

from pokebench_env import rerender
from pokebench_env.game_state import GameState, MapNames, read_game_state
from pokebench_env.readout import (
    SERVER_FEATURES,
    features_off_from_env,
    format_readout,
    state_json,
)
from pokebench_env.readout_truth import (
    LOCK_SCRIPT,
    LOCK_TASK,
    MENU_NONE,
    MENU_OTHER,
    SWITCH,
    lock_line,
    menu_line,
)
from pokebench_env.rom import EMERALD_SHA1, RomError, resolve_rom
from pokebench_env.story import StoryState
from pokebench_env.ui_state import ActiveUi, Menu
from pokebench_env.world_context import (
    DRAW_FIELD_MESSAGE,
    FIELD_MESSAGE_MODE,
    FIELD_PRINTER,
    GLOBAL_SCRIPT,
    GLOBAL_SCRIPT_STATUS,
    NoMessage,
    WorldContext,
    read_field_activity,
    read_no_message,
    read_world_context,
)
from tests.env.test_game_state import MAPS, OVERWORLD, SB1, Memory, decode_text, game

FIXTURE = json.loads((Path(__file__).parent / "fixtures/readout-truth-cook.json").read_text())
CURRENT = json.loads(
    (Path(__file__).parent / "fixtures/readout-truth-current-warp-names.json").read_text()
)["cases"]
NEW = frozenset(
    {
        "readout-truth-v1",
        "birch-speech-pages-v1",
        "blackout-readout-v1",
        "surf-gated-exits-v1",
        "exit-reachability-v1",
        "heal-before-trainers-v1",
        "tutorial-party-owner-v1",
        "mid-frame-readout-v1",
        "unset-dynamic-warp-v1",
        "status-names-v1",
        "surf-gated-exits-v2",
        "battle-effective-damage-v1",
        "semantic-navigation-v2",
        "exit-labels-v2",
    }
)
ROM_START = 0x08000000
HEDGE_TEXT = "Field-message text: unavailable; do not infer that the dialogue box is closed."
HEDGE_PHASE = (
    "Field-message phase: unavailable; do not infer a cutscene or an input-ready dialogue."
)
NONE_TEXT = "Field-message text: none (no message box is open)."
IDLE_PHASE = "Field-message phase: no message is open and no script is running."
SCRIPT_PHASE = "Field-message phase: no message is open; a script is running (movement_wait)."
OLD_LOCK = "Field controls: locked (dialog, menu, or script; direction presses cannot move)"
STORY_7 = "Mom told you PROF. BIRCH lives next door (after the Petalburg Gym TV report)"


@functools.cache
def operator_rom() -> bytes:
    try:
        return resolve_rom(os.environ, EMERALD_SHA1).read_bytes()
    except RomError:
        pytest.skip("POKEBENCH_ROM is not set to the Emerald ROM")


# The map names these frames look up, recorded with the fixture: no porymap reads here
# (MapNames.load has its own tests).
MAP_NAMES = MapNames(
    {
        (int(key.split("/")[0]), int(key.split("/")[1])): name
        for key, name in FIXTURE["maps"].items()
    }
)
FRAMES = {f["state_seq"]: f for f in FIXTURE["frames"]}


def map_names() -> MapNames:
    return MAP_NAMES


def frame(seq: int) -> dict[str, object]:
    return FRAMES[seq]  # type: ignore[no-any-return]


@functools.cache
def cells(seq: int) -> dict[int, int]:
    out: dict[int, int] = {}
    for window in frame(seq)["windows"]:  # type: ignore[attr-defined]
        start = int(window["address"], 16)
        for offset, value in enumerate(bytes.fromhex(window["hex"])):
            out[start + offset] = value
    return out


def reader(seq: int):  # type: ignore[no-untyped-def]
    rom = operator_rom()
    ram = cells(seq)

    def read(address: int, length: int) -> bytes:
        if address >= ROM_START:
            return rom[address - ROM_START : address - ROM_START + length]
        return bytes(ram[address + i] for i in range(length))

    return read


def recorded_off(seq: int) -> frozenset[str]:
    return frozenset(frame(seq)["recorded_off"]) | NEW  # type: ignore[arg-type]


def state(seq: int, on: frozenset[str] = frozenset()) -> GameState:
    off = recorded_off(seq) - on
    active = bool(frame(seq)["active_ui"])
    return rerender.read_state(reader(seq), map_names(), active_ui=active, off=off)


def render(seq: int, on: frozenset[str] = frozenset()) -> str:
    off = recorded_off(seq) - on
    return rerender.render(state(seq, on), off)


def changed(seq: int, on: frozenset[str]) -> tuple[list[str], list[str]]:
    """Lines removed and added, counting repeats (a duplicate line dropped is a change)."""
    return diff_lines(render(seq).split("\n"), render(seq, on).split("\n"))


def diff_lines(old: list[str], new: list[str]) -> tuple[list[str], list[str]]:
    left, right = Counter(new), Counter(old)
    removed = []
    for line in old:
        if left[line] > 0:
            left[line] -= 1
        else:
            removed.append(line)
    added = []
    for line in new:
        if right[line] > 0:
            right[line] -= 1
        else:
            added.append(line)
    return removed, added


def test_diff_lines_counts_repeated_lines() -> None:
    assert diff_lines(["a", "b", "b"], ["a", "b"]) == (["b"], [])
    assert diff_lines(["a"], ["b", "a", "a"]) == ([], ["b", "a"])


TRUTH = frozenset({SWITCH})
RECEIVED = [f["state_seq"] for f in FIXTURE["frames"] if f["received"] is not None]


# --- cook runs, real ROM ---------------------------------------------------------------------


@pytest.mark.parametrize("seq", RECEIVED)
def test_off_matches_current_policy_without_rewriting_what_the_model_received(seq: int) -> None:
    # The archived tool result remains source evidence; current policy has a separate snapshot.
    text, received = render(seq), str(frame(seq)["received"])
    assert text == CURRENT[f"readout-truth:{seq}"]
    at = received.index("Screen: ")
    head, archived_readout = received[:at], received[at:]
    assert head == "" or head.endswith("\n")
    # The tail starts at the readout's first line: no "Screen:" line is left in the head
    # (only press lines or a frame note come before it), so a dropped first line fails.
    assert text.startswith("Screen: ")
    assert not any(line.startswith("Screen: ") for line in head.split("\n"))
    assert archived_readout.startswith("Screen: ")


def test_push_back_script_lock_reads_as_a_script_with_no_message() -> None:
    removed, added = changed(2984, TRUTH)
    assert removed == [
        "Menu: unavailable (active owner not verified)",
        "Bag: ",
        "Story: player name confirmed; Mom clock instruction received; clock set; "
        "Mom rival instruction received",
        OLD_LOCK,
        HEDGE_TEXT,
        HEDGE_PHASE,
    ]
    assert added == [
        MENU_NONE,
        "Bag: empty",
        f"Story: player name confirmed; Mom clock instruction received; clock set; {STORY_7}",
        LOCK_SCRIPT,
        NONE_TEXT,
        SCRIPT_PHASE,
    ]


def test_free_field_with_a_stale_menu_buffer_says_nothing_is_open() -> None:
    removed, added = changed(1492, TRUTH)
    assert "Unverified menu buffer: cursor 4 of 4; active menu owner unavailable" in removed
    assert MENU_NONE in added and IDLE_PHASE in added and NONE_TEXT in added
    assert "Field controls: available (terrain and objects can still block a direction)" in (
        render(1492, TRUTH).split("\n")
    )


def test_truck_task_lock_says_no_script_is_running() -> None:
    removed, added = changed(941, TRUTH)
    assert OLD_LOCK in removed and LOCK_TASK in added
    assert IDLE_PHASE in added


def test_field_yes_no_box_is_a_known_owner_not_a_coverage_error() -> None:
    old, new = render(7780), render(7780, TRUTH)
    assert "STATE COVERAGE ERROR: field-message owner unqualified" in old
    assert "STATE COVERAGE ERROR" not in new
    assert (
        "Field activity: other_interface; not an input-ready field message. Inspect the "
        "active interface and control lock before acting." in new.split("\n")
    )
    assert state(7780, TRUTH).world_context.field_activity.owner == 0x080E215D  # type: ignore[union-attr]


def test_battle_does_not_quote_the_stale_menu_buffer() -> None:
    removed, added = changed(7443, TRUTH)
    assert removed[0] == "Unverified menu buffer: cursor 1 of 2; active menu owner unavailable"
    assert added[0] == MENU_OTHER


def test_live_may_on_screen_is_here_although_her_template_flag_is_set() -> None:
    removed, added = changed(3380, TRUTH)
    story = [line for line in added if line.startswith("Story characters here")]
    assert story == [
        "Story characters here (from this map's own object list): MAY at 1,3. Not on this map: "
        "PROF. BIRCH, BRENDAN, MOM, NORMAN, WALLY, ROXANNE, STEVEN. Sprite kinds such as "
        "SCIENTIST_1 or FAT_MAN are not these characters."
    ]
    assert any("Not on this map: PROF. BIRCH, MAY," in line for line in removed)


def test_reopened_start_menu_reads_as_the_start_menu_not_yet_accepting_input() -> None:
    ui = state(15183, TRUTH).active_ui
    assert ui is not None and (ui.phase, ui.selected, ui.ready) == ("start_menu", "POKEMON", False)
    assert ui.diagnostic is None
    assert state(15183).active_ui is None
    # The showcase arm had expanded menu text off, so its readout hides menu details either way.
    assert "Menu: detailed controls unprovided" in render(15183, TRUTH).split("\n")


BIRCH = frozenset({"birch-speech-pages-v1"})
BLACKOUT = frozenset({"blackout-readout-v1"})
OLD_BIRCH = (
    "Interface: name_confirmed_transition; input not ready; "
    "Transition or text printing; selection input is not active"
)


def test_birch_page_waiting_for_a_is_input_ready_with_the_page_as_its_value() -> None:
    removed, added = changed(620, BIRCH)
    assert removed == [OLD_BIRCH]
    assert added == [
        "Interface: birch_speech_page; input ready; value Ah, okay!; "
        "A or B shows the next page (the value is the page on screen)"
    ]
    ui = state(620, BIRCH).active_ui
    assert ui is not None and (ui.phase, ui.ready, ui.value) == (
        "birch_speech_page",
        True,
        "Ah, okay!",
    )
    # A page still being written keeps the old not-ready line.
    assert changed(632, BIRCH) == ([], [])


def test_whiteout_running_is_said_from_the_observations_own_state() -> None:
    removed, added = changed(19097, BLACKOUT)
    assert removed == []
    assert added == [
        "Whiting out: your party has no usable Pokémon left; the game is taking you back "
        "to the last place you healed."
    ]


def test_each_switch_changes_only_its_own_lines() -> None:
    assert changed(620, TRUTH)[1] == [MENU_OTHER]
    # 19097's Interface line is a coverage error, not a verified owner: the Menu line stays.
    assert changed(19097, TRUTH)[1] == [
        "Story: player name confirmed; Mom clock instruction received; clock set; "
        f"{STORY_7}; rival met; sent to save Birch; Birch rescue complete; "
        "Birch starter handoff complete",
    ]
    assert changed(2984, BIRCH | BLACKOUT) == ([], [])


def test_state_json_is_unchanged_where_no_interface_owner_changes() -> None:
    for seq in (2984, 1492, 941, 3380, 7443):
        assert state_json(state(seq, TRUTH)) == state_json(state(seq))


def test_switch_is_a_default_off_server_feature() -> None:
    assert SWITCH in SERVER_FEATURES
    assert SWITCH in features_off_from_env({})
    assert SERVER_FEATURES[-20:-17] == (
        "readout-truth-v1",
        "birch-speech-pages-v1",
        "blackout-readout-v1",
    )


# --- synthetic RAM ---------------------------------------------------------------------------


def quiet() -> Memory:
    m = Memory()
    m.put(GLOBAL_SCRIPT_STATUS, b"\x02")
    return m


def test_no_message_needs_hidden_box_undrawn_window_idle_printer_and_no_message_task() -> None:
    assert read_no_message(quiet().read) == NoMessage(None)
    m = quiet()
    m.put(FIELD_MESSAGE_MODE, b"\x02")
    assert read_no_message(m.read) is None
    m = quiet()
    m.put(FIELD_PRINTER + 0x1B, b"\x01")
    assert read_no_message(m.read) is None
    m = quiet()
    m.put(0x03005E00, struct.pack("<I", DRAW_FIELD_MESSAGE) + b"\x01")
    assert read_no_message(m.read) is None
    m = quiet()
    # Window 0 drawn: a 1x1 tile window with non-blank pixels.
    m.put(0x02020004, struct.pack("<BBBBBBHI", 0, 0, 0, 1, 1, 0, 0, 0x02010000))
    m.put(0x02010000, bytes(range(32)))
    assert read_no_message(m.read) is None


@pytest.mark.parametrize(
    ("status", "mode", "native", "expected"),
    [
        (2, 2, 0x0809A671, None),
        (0, 0, 0, None),
        (0, 1, 0, "script_running"),
        (1, 1, 0, "script_running"),
        (0, 2, 0x0809A671, "movement_wait"),
        (0, 2, 0x08099D95, "script_pause"),
        (0, 2, 0x0809833D, "message_close_wait"),
        (0, 2, 0x08001235, "script_running"),
    ],
)
def test_no_message_names_what_the_script_context_is_doing(
    status: int, mode: int, native: int, expected: str | None
) -> None:
    m = Memory()
    m.put(GLOBAL_SCRIPT_STATUS, bytes([status]))
    m.put(GLOBAL_SCRIPT, bytes([0, mode, 0, 0]) + struct.pack("<I", native))
    assert read_no_message(m.read) == NoMessage(expected)


def test_world_context_text_and_json() -> None:
    base = WorldContext((), (), None)
    closed = replace(base, no_message=NoMessage(None))
    script = replace(base, no_message=NoMessage("movement_wait"))
    assert "no_message" not in closed.json() and closed.json() == base.json()
    text = closed.text(objects=False, triggers=False, message=True).split("\n")
    assert text == [NONE_TEXT, IDLE_PHASE]
    assert script.text(objects=False, triggers=False, message=True).split("\n") == [
        NONE_TEXT,
        SCRIPT_PHASE,
    ]
    assert base.text(objects=False, triggers=False, message=True).split("\n") == [
        HEDGE_TEXT,
        HEDGE_PHASE,
    ]


HEADER, EVENTS = 0x02037318, 0x08010000


def context_memory() -> Memory:
    m = quiet()
    m.put(HEADER, struct.pack("<II", 0, EVENTS))
    m.put(EVENTS, bytes(16))
    return m


def test_read_world_context_sets_no_message_only_with_the_switch() -> None:
    m = context_memory()
    on = read_world_context(m.read, (5, 5), (0, 9), SB1, decode_text, truth=True)
    off = read_world_context(m.read, (5, 5), (0, 9), SB1, decode_text)
    assert on is not None and on.no_message == NoMessage(None)
    assert off is not None and off.no_message is None
    # A real read failure keeps "unavailable": malformed text in an open message box.
    m.put(FIELD_MESSAGE_MODE, b"\x02")
    m.put(0x02021FC4, b"\xfc\x7f")
    failed = read_world_context(m.read, (5, 5), (0, 9), SB1, decode_text, truth=True)
    assert failed is not None and failed.message_diagnostic is not None
    assert failed.no_message is None


def test_field_yes_no_owner_needs_the_switch_and_one_task() -> None:
    m = Memory()
    m.put(0x03005E00, struct.pack("<I", 0x080E215D) + b"\x01")
    ui = ActiveUi("field_yes_no", "YES", True, "UP/DOWN selects")
    assert read_field_activity(m.read, ui) is None
    activity = read_field_activity(m.read, ui, truth=True)
    assert activity is not None and (activity.phase, activity.owner) == (
        "other_interface",
        0x080E215D,
    )
    m.put(0x03005E28, struct.pack("<I", 0x080E215D) + b"\x01")
    assert read_field_activity(m.read, ui, truth=True) is None
    assert read_field_activity(m.read, replace(ui, diagnostic="x"), truth=True) is None


def field(**kw: object) -> GameState:
    base = read_game_state(game(OVERWORLD).read, MAPS)
    return replace(base, **kw)  # type: ignore[arg-type]


def test_menu_line_says_none_open_only_when_the_game_state_proves_it() -> None:
    menu = Menu(4, 4)
    ui = ActiveUi("battle_resolving", None, False, "x")
    assert menu_line(field(active_ui_read=False)) is None
    assert menu_line(field(active_ui_read=True, active_ui=ui)) == MENU_OTHER
    unknown = ActiveUi("unsupported", None, None, "x", "callback2 0x08085F59; active tasks")
    assert menu_line(field(active_ui_read=True, active_ui=unknown)) is None
    drawn = {"active_ui_read": True, "menu_window_drawn": True}
    assert menu_line(field(**drawn, field_controls_locked=False, menu=menu)) == MENU_NONE
    assert (
        menu_line(field(active_ui_read=True, field_controls_locked=True, menu_window_drawn=False))
        == MENU_NONE
    )
    # Locked controls and a drawn menu window with no owner: an unsupported menu may be open,
    # also when its cursor does not decode (menu None).
    assert menu_line(field(**drawn, field_controls_locked=True, menu=menu)) is None
    assert menu_line(field(**drawn, field_controls_locked=True, menu=None)) is None
    assert menu_line(field(**drawn, field_controls_locked=None, menu=menu)) is None
    assert menu_line(field(active_ui_read=True, field_controls_locked=True)) is None


def test_lock_line_needs_no_message_no_owner_and_no_menu_window() -> None:
    script = WorldContext((), (), None, no_message=NoMessage("movement_wait"))
    task = WorldContext((), (), None, no_message=NoMessage(None))
    ok = {"active_ui_read": True, "field_controls_locked": True, "menu_window_drawn": False}
    assert lock_line(field(world_context=script, **ok)) == LOCK_SCRIPT
    assert lock_line(field(world_context=task, **ok)) == LOCK_TASK
    assert lock_line(field(world_context=WorldContext((), (), None), **ok)) is None
    assert lock_line(field(world_context=None, **ok)) is None
    ui = ActiveUi("field_yes_no", "YES", True, "x")
    assert lock_line(field(world_context=task, **{**ok, "active_ui": ui})) is None
    assert lock_line(field(world_context=task, **{**ok, "menu_window_drawn": True})) is None
    assert lock_line(field(world_context=task, **{**ok, "menu_window_drawn": None})) is None
    assert lock_line(field(world_context=task, **{**ok, "active_ui_read": False})) is None


def test_format_readout_uses_the_lines_only_with_the_switch() -> None:
    current = field(
        active_ui_read=True,
        menu_window_drawn=False,
        field_controls_locked=True,
        world_context=WorldContext((), (), None, no_message=NoMessage("movement_wait")),
    )
    on, off = format_readout(current), format_readout(current, TRUTH)
    assert MENU_NONE in on.split("\n") and LOCK_SCRIPT in on.split("\n")
    assert "Menu: unavailable (active owner not verified)" in off.split("\n")
    assert OLD_LOCK in off.split("\n")
    animating = format_readout(current, warp_animation=True)
    assert LOCK_SCRIPT not in animating and "door/stairs/warp animation" in animating


def test_empty_bag_reads_empty_on_the_field_only_with_the_switch() -> None:
    current = field()
    assert current.resources is not None and current.resources.bag == ()
    assert "Bag: empty" in format_readout(current, frozenset({"battle-details-v2"})).split("\n")
    assert "Bag: " in format_readout(current, frozenset({"battle-details-v2", SWITCH})).split("\n")


def test_story_stage_seven_names_what_mom_said() -> None:
    story = StoryState(intro_stage=7)
    assert STORY_7 in story.text(truth=True)
    assert "Mom rival instruction received" in story.text()
    assert "rival" not in story.text(truth=True).replace("Mom clock", "")


def test_reader_sets_active_ui_read_only_with_both_switches() -> None:
    m = game(OVERWORLD)
    assert read_game_state(m.read, MAPS, readout_truth_enabled=True).active_ui_read is True
    assert read_game_state(m.read, MAPS).active_ui_read is False
    assert (
        read_game_state(
            m.read, MAPS, readout_truth_enabled=True, active_ui_enabled=False
        ).active_ui_read
        is False
    )


# --- menus: the reopened START menu and the party Cancel/Confirm buttons ------------------------


def test_reopened_start_menu_from_the_wait_for_fade_task() -> None:
    from pokebench_env.menus import (
        START_ACTIONS,
        START_CURSOR,
        START_MENU_REOPEN_TASK,
        read_menu_family,
    )
    from tests.env.test_menus import put_task
    from tests.env.test_ui_state import Memory as UiMemory
    from tests.env.test_ui_state import menu, window

    memory = UiMemory()
    put_task(memory, 6, START_MENU_REOPEN_TASK, [0])
    memory.put(START_CURSOR, bytes([1, 3]))
    memory.put(START_ACTIONS, bytes([1, 2, 7]))
    menu(memory, 1, 2, 0)
    window(memory, 0, 0, 5, 8, True)
    assert read_menu_family(memory.read, 0x08085E5D) is None
    ui = read_menu_family(memory.read, 0x08085E5D, truth=True)
    assert ui is not None
    assert (ui.phase, ui.selected, ui.ready, ui.diagnostic) == ("start_menu", "BAG", False, None)
    assert ui.details is not None and ui.details["options"] == ["POKEMON", "BAG", "EXIT"]
    assert "input is not active" in ui.controls
    memory.put(START_CURSOR, bytes([2, 3]))
    stale = read_menu_family(memory.read, 0x08085E5D, truth=True)
    assert (
        stale is not None
        and stale.diagnostic == "reopened Start menu cursor is stale or window undrawn"
    )
    memory.put(START_CURSOR, bytes([3, 3]))
    bad = read_menu_family(memory.read, 0x08085E5D, truth=True)
    assert bad is not None and bad.diagnostic == "invalid reopened Start menu actions/cursor"
    # With Task_ShowStartMenu live too, the ordinary START menu owner decides.
    put_task(memory, 5, 0x0809FA35, [0])
    memory.put(START_CURSOR, bytes([1, 3]))
    assert read_menu_family(memory.read, 0x08085E5D, truth=True) is None


@pytest.mark.parametrize("fn", [0x081B12F9, 0x081B1709])
def test_party_cancel_slot_seven_is_valid_only_with_the_switch(fn: int) -> None:
    from pokebench_env.menus import PARTY_CALLBACK, PARTY_MENU, read_menu_family
    from tests.env.test_menus import put_task
    from tests.env.test_ui_state import Memory as UiMemory
    from tests.env.test_ui_state import menu, window

    memory = UiMemory()
    put_task(memory, 0, fn, [])
    memory.put(PARTY_MENU + 9, struct.pack("<bbB", 7, -1, 0))
    menu(memory, 0, 1, 0)
    window(memory, 0, 0, 5, 8, True)
    old = read_menu_family(memory.read, PARTY_CALLBACK)
    new = read_menu_family(memory.read, PARTY_CALLBACK, truth=True)
    assert old is not None and old.diagnostic is not None
    assert new is not None and new.diagnostic is None


@pytest.mark.parametrize(
    ("action", "slot", "second", "old", "new"),
    [
        (0, 7, -1, None, "CANCEL"),
        (0, 6, -1, "CANCEL", "CONFIRM"),
        (0, 2, -1, "PARTY SLOT 3", "PARTY SLOT 3"),
        (8, 1, 7, None, "CANCEL"),
    ],
)
def test_party_cursor_names_confirm_and_cancel_buttons(
    action: int, slot: int, second: int, old: str | None, new: str
) -> None:
    from pokebench_env.menus import PARTY_CALLBACK, PARTY_MENU, read_menu_family
    from tests.env.test_menus import put_task
    from tests.env.test_ui_state import Memory as UiMemory

    memory = UiMemory()
    put_task(memory, 0, 0x081B1371, [])
    memory.put(PARTY_MENU + 9, struct.pack("<bbB", slot, second, action))
    before = read_menu_family(memory.read, PARTY_CALLBACK)
    after = read_menu_family(memory.read, PARTY_CALLBACK, truth=True)
    assert before is not None and before.selected == old
    assert after is not None and after.selected == new and after.diagnostic is None


def test_read_active_ui_threads_the_switch_to_the_menu_family() -> None:
    from pokebench_env.game_screen import Screen
    from pokebench_env.menus import PARTY_CALLBACK, PARTY_MENU
    from pokebench_env.ui_state import read_active_ui
    from tests.env.test_menus import put_task
    from tests.env.test_ui_state import Memory as UiMemory

    memory = UiMemory()
    put_task(memory, 0, 0x081B1371, [])
    memory.put(PARTY_MENU + 9, struct.pack("<bbB", 7, -1, 0))
    screen = Screen("party", 0, PARTY_CALLBACK)
    on = read_active_ui(memory.read, screen, truth=True)
    assert on is not None and on.selected == "CANCEL"
    off = read_active_ui(memory.read, screen)
    assert off is not None and off.diagnostic == "invalid party slot"


# --- story characters: a live object wins over its template's hide flag ------------------------


def test_live_object_wins_over_a_set_hide_flag() -> None:
    from pokebench_env.character_presence import TEMPLATES, read_story_characters
    from pokebench_env.world_context import LiveObject

    m = Memory()
    entry = bytearray(24)
    entry[0], entry[1] = 1, 105
    struct.pack_into("<H", entry, 0x14, 0x30)
    m.put(SB1 + TEMPLATES, bytes(entry))
    m.put(SB1 + 0x1270 + 0x30 // 8, bytes([1 << (0x30 % 8)]))
    live = (LiveObject(1, (1, 3), 105, "RIVAL_MAY_NORMAL", 1, 3),)
    where = "LITTLEROOT TOWN MAYS HOUSE 1F"
    off = read_story_characters(m.read, SB1, (1, 3), live, location=where)
    on = read_story_characters(m.read, SB1, (1, 3), live, location=where, live_wins=True)
    hidden = read_story_characters(m.read, SB1, (1, 3), (), location=where, live_wins=True)
    assert off is not None and "MAY" in off.absent
    assert on is not None and on.here == ("MAY at 1,3",)
    assert hidden is not None and "MAY" in hidden.absent


def test_drawn_menu_window_with_an_invalid_cursor_keeps_the_old_menu_line() -> None:
    from tests.env.test_ui_state import menu as put_menu
    from tests.env.test_ui_state import window

    m = game(OVERWORLD)
    m.put(0x03000F2C, b"\x01")  # field controls locked
    put_menu(m, 9, 3, 2)  # cursor past the last option: read_menu gives None
    window(m, 2, 0, 5, 8, True)
    current = read_game_state(m.read, MAPS, readout_truth_enabled=True)
    assert current.menu is None and current.menu_window_drawn is True
    assert "Menu: unavailable (active owner not verified)" in format_readout(current).split("\n")
    window(m, 2, 0, 5, 8, False)
    undrawn = read_game_state(m.read, MAPS, readout_truth_enabled=True)
    assert undrawn.menu_window_drawn is False
    assert MENU_NONE in format_readout(undrawn).split("\n")
    m.put(0x0203CD90 + 5, b"\xff")  # no window at all
    assert read_game_state(m.read, MAPS, readout_truth_enabled=True).menu_window_drawn is False
    assert read_game_state(m.read, MAPS).menu_window_drawn is None


@pytest.mark.parametrize(
    "short",
    [FIELD_MESSAGE_MODE, FIELD_PRINTER + 0x1B, 0x03005E00, GLOBAL_SCRIPT_STATUS, GLOBAL_SCRIPT],
)
def test_a_short_read_is_a_failure_not_an_absence(short: int) -> None:
    m = quiet()

    def read(address: int, length: int) -> bytes:
        return b"" if address == short else m.read(address, length)

    assert read_no_message(read) is None


def test_a_short_window_read_is_unknown_never_undrawn() -> None:
    from pokebench_env.ui_state import menu_window_drawn, window_drawn_strict

    m = quiet()
    m.put(0x02020004, struct.pack("<BBBBBBHI", 0, 0, 0, 1, 1, 0, 0, 0x02010000))
    m.put(0x02010000, bytes(range(32)))
    assert window_drawn_strict(m.read, 0) is True

    def short_at(address: int):  # type: ignore[no-untyped-def]
        return lambda a, n: b"" if a == address else m.read(a, n)

    for address in (0x02010000, 0x02020004):
        assert window_drawn_strict(short_at(address), 0) is None
        assert read_no_message(short_at(address)) is None
    # sMenu's window id (MENU + 5 = 0x0203CD95), its header and its pixels.
    m.put(0x0203CD95, b"\x00")
    assert menu_window_drawn(m.read) is True
    for address in (0x0203CD95, 0x02020004, 0x02010000):
        assert menu_window_drawn(short_at(address)) is None
    unknown = field(active_ui_read=True, field_controls_locked=True, menu_window_drawn=None)
    assert menu_line(unknown) is None


MESSAGE_CLAIMS = (NONE_TEXT, IDLE_PHASE, SCRIPT_PHASE, LOCK_SCRIPT, LOCK_TASK)
MENU_CLAIMS = (MENU_NONE, LOCK_SCRIPT, LOCK_TASK)


def _header(window: int) -> int:
    return 0x02020004 + 12 * window


def _pixels(seq: int, window: int) -> int:
    ram = cells(seq)
    return int.from_bytes(bytes(ram.get(_header(window) + 8 + i, 0) for i in range(4)), "little")


@pytest.mark.parametrize("seq", [2984, 1492, 941])
def test_a_short_read_through_read_state_never_becomes_a_none_claim(seq: int) -> None:
    # Every read the new "none" and lock lines rest on, one byte short, through the production
    # rerender seam. With the switch on the readout either fails exactly as the switch-off
    # readout does on that read (an incumbent reader's own loud failure), or it drops every
    # claim that rests on that read and adds none.
    full = reader(seq)
    locked = state(seq).field_controls_locked
    message = [FIELD_MESSAGE_MODE, FIELD_PRINTER + 0x1B, 0x03005E00, GLOBAL_SCRIPT_STATUS]
    message += [GLOBAL_SCRIPT, _header(0), _pixels(seq, 0)]
    menu_window = cells(seq).get(0x0203CD95, 0xFF)
    menu = [0x0203CD95] + (
        [_header(menu_window), _pixels(seq, menu_window)] if menu_window < 32 else []
    )

    def claims(text: str, wanted: tuple[str, ...]) -> list[str]:
        return [line for line in text.split("\n") if line in wanted]

    whole = render(seq, TRUTH)
    # A removed window has no pixel buffer (pointer 0), so nothing reads it.
    for short in [address for address in message + menu if address]:

        def read(address: int, length: int, short: int = short) -> bytes:
            data = full(address, length)
            return data[: length - 1] if address == short else data

        def text(on: frozenset[str]) -> str | BaseException:
            off = recorded_off(seq) - on
            try:
                got = rerender.read_state(
                    read, map_names(), active_ui=bool(frame(seq)["active_ui"]), off=off
                )
                return rerender.render(got, off)
            except Exception as error:  # noqa: BLE001
                return error

        old, new = text(frozenset()), text(TRUTH)
        if isinstance(old, BaseException):
            assert type(new) is type(old), (hex(short), old, new)
            continue
        assert isinstance(new, str), (hex(short), new)
        every = MESSAGE_CLAIMS + MENU_CLAIMS
        assert set(claims(new, every)) <= set(claims(whole, every)), hex(short)
        gone: tuple[str, ...] = ()
        if short in message:
            gone += MESSAGE_CLAIMS
        if short in menu and locked:
            gone += MENU_CLAIMS
        assert claims(new, gone) == [], (hex(short), claims(new, gone))
