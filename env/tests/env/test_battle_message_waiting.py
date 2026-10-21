"""battle-message-waiting-v1: the battle input text says when a battle message waits for A or B.

The golden fixture holds the RAM windows (never ROM bytes) that re-rendering three recorded
readouts of cook run #2 (2026-10-16T02-23-17_qwen36-gpu1_sh02) reads, plus each readout the
model received. T446 (raw-ram 4696) is the HP drain after TORCH used SCRATCH! (printer idle);
T450 (4700) and T600 (4850) are two of the 270 observes the model spent on
"Wild WINGULL fainted!" waiting for A or B while the readout said "no input until the game asks".
"""

import json
import os
from dataclasses import replace
from functools import cache
from pathlib import Path

import pytest
from test_battle_text import FIXTURE as SHOW_FIXTURE
from test_battle_text import Archived, Memory, encode

from pokebench_env import battle_text as bt
from pokebench_env import rerender
from pokebench_env.battle_message_waiting import SWITCH, input_clause, message_clause
from pokebench_env.battle_state import BattleState
from pokebench_env.game_state import MapNames
from pokebench_env.readout import SERVER_FEATURES, features_off_from_env, format_readout
from pokebench_env.rom import EMERALD_SHA1, RomError, resolve_rom

FIXTURE = json.loads(
    (Path(__file__).parent / "fixtures/battle-message-waiting-sh02.json").read_text()
)
ROM_START = 0x08000000
# Switches registered after cook run #2 were off for it.
RECORDED_OFF = frozenset(FIXTURE["recorded_off"]) | {
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
    "caught-nickname-prompt-v1",
}
OFF_TEXT = "Battle details: WILD single · turn 3 · resolving (no input until the game asks)"
WAITING = 'battle message waiting: "Wild WINGULL fainted!" — press A or B to continue'
RESOLVING = (
    "resolving (the game is playing animations or a message that closes on its own; "
    "no input until the game asks)"
)
# The control arm of bundle-v-control: no expanded battle information, no battle-details-v2.
CONTROL_OFF = RECORDED_OFF | {"battle-details-v2", "expanded-menu-battle-information-v1"}


@cache
def _rom() -> bytes | None:
    # One ROM resolution (hash + read) per session; the resolver has its own tests.
    try:
        return resolve_rom(os.environ, EMERALD_SHA1).read_bytes()
    except RomError:
        return None


def operator_rom() -> bytes:
    rom = _rom()
    if rom is None:
        pytest.skip("POKEBENCH_ROM is not set to the Emerald ROM")
    return rom


@cache
def maps() -> MapNames:
    return MapNames.load(rerender.PORYMAP_MAPS)


def frame(raw: str) -> dict[str, object]:
    return next(f for f in FIXTURE["frames"] if f["raw_ram"] == f"raw-ram/{raw}.json.gz")


@cache
def _cells(raw: str) -> dict[int, int]:
    # Expanded once per recorded frame; readers only look cells up.
    cells: dict[int, int] = {}
    for window in frame(raw)["windows"]:  # type: ignore[attr-defined]
        start = int(window["address"], 16)
        for offset, value in enumerate(bytes.fromhex(window["hex"])):
            cells[start + offset] = value
    return cells


def reader(raw: str, rom: bytes):  # type: ignore[no-untyped-def]
    cells = _cells(raw)

    def read(address: int, length: int) -> bytes:
        if address >= ROM_START:
            return rom[address - ROM_START : address - ROM_START + length]
        return bytes(cells[address + i] for i in range(length))

    return read


def render(raw: str, off: frozenset[str]) -> str:
    read = reader(raw, operator_rom())
    return rerender.render(rerender.read_state(read, maps(), active_ui=True, off=off), off)


def changed(before: str, after: str) -> tuple[list[str], list[str]]:
    old, new = before.split("\n"), after.split("\n")
    return [line for line in old if line not in new], [line for line in new if line not in old]


@pytest.mark.parametrize("raw", ["00004696", "00004700", "00004850"])
def test_off_reproduces_the_recorded_readout_byte_for_byte(raw: str) -> None:
    assert render(raw, RECORDED_OFF | {SWITCH}) == frame(raw)["readout"]
    assert OFF_TEXT in str(frame(raw)["readout"]).split("\n")


@pytest.mark.parametrize("raw", ["00004700", "00004850"])
def test_on_the_wingull_page_waiting_for_a_or_b_is_named_whole(raw: str) -> None:
    on = render(raw, RECORDED_OFF - {SWITCH})
    assert changed(str(frame(raw)["readout"]), on) == (
        [OFF_TEXT],
        [f"Battle details: WILD single · turn 3 · {WAITING}"],
    )


def test_on_the_hp_drain_before_the_faint_says_why_no_input_is_needed() -> None:
    on = render("00004696", RECORDED_OFF - {SWITCH})
    assert changed(str(frame("00004696")["readout"]), on) == (
        [OFF_TEXT],
        [f"Battle details: WILD single · turn 3 · {RESOLVING}"],
    )


def test_control_arm_without_battle_details_gets_its_own_line() -> None:
    off_text = render("00004700", CONTROL_OFF | {SWITCH})
    on_text = render("00004700", CONTROL_OFF - {SWITCH})
    lines = on_text.split("\n")
    assert changed(off_text, on_text) == ([], [f"Battle input: {WAITING}"])
    assert lines[lines.index("Battle details: unprovided") + 1] == f"Battle input: {WAITING}"
    # Idle printer: the control arm says nothing new.
    assert render("00004696", CONTROL_OFF | {SWITCH}) == render("00004696", CONTROL_OFF - {SWITCH})


def test_expanded_without_battle_details_adds_the_line_after_the_battle_state() -> None:
    off = CONTROL_OFF - {"expanded-menu-battle-information-v1"}
    lines = render("00004850", off - {SWITCH}).split("\n")
    at = next(i for i, line in enumerate(lines) if line.startswith("Battle state: resolving"))
    assert lines[at + 1] == f"Battle input: {WAITING}"
    assert changed(render("00004850", off | {SWITCH}), "\n".join(lines)) == (
        [],
        [f"Battle input: {WAITING}"],
    )


def test_the_state_json_is_the_same_on_and_off() -> None:
    from pokebench_env.readout import state_json

    read = reader("00004700", operator_rom())
    on = rerender.read_state(read, maps(), active_ui=True, off=RECORDED_OFF - {SWITCH})
    off = rerender.read_state(read, maps(), active_ui=True, off=RECORDED_OFF | {SWITCH})
    assert state_json(on) == state_json(off)
    message = state_json(on)["battle"]["message"]  # type: ignore[index]
    assert message["page"] == "Wild WINGULL fainted!"  # type: ignore[index]
    assert message["state"] == "waiting_for_input"  # type: ignore[index]


# --- the page shown in the window (pokeemerald src/text.c RenderText) ---


def test_real_ram_pages_from_the_showcase_battle() -> None:
    def page(name: str) -> str | None:
        memory = next(f["memory"] for f in SHOW_FIXTURE["frames"] if f["raw_ram"] == name)
        return bt.read_battle_message(Archived(memory).read).page

    assert page("00007772.json.gz") == "Wild WURMPLE appeared!"
    assert page("00007790.json.gz") == ",VQ  SOC  used SCRATCH!"  # printing; the run's nickname
    assert page("00007822.json.gz") == "Wild WURMPLE fainted!"
    assert page("00007828.json.gz") == ",VQ  SOC  gained 15 EXP. Points!"
    assert page("00007765.json.gz") is None  # healthbox name in the buffer, printer idle


def raw_page(raw: bytes, cursor: int, *, waiting: bool = False) -> str:
    return bt.page_text(raw + b"\xff", cursor, waiting=waiting)


def test_a_page_is_the_text_since_the_window_was_last_cleared_up_to_its_wait() -> None:
    two = encode("One") + b"\xfb" + encode("Two") + b"\xfb"
    assert raw_page(two, 4, waiting=True) == "One"  # waiting on the first \p
    assert raw_page(two, 6) == "Two"  # printing the second page: the whole page
    assert raw_page(two, 8, waiting=True) == "Two"  # waiting on the second \p
    scroll = encode("A") + b"\xfe" + encode("B") + b"\xfa" + encode("C") + b"\xfb"
    assert raw_page(scroll, 4, waiting=True) == "A B"  # \l scrolls; the window is not cleared
    assert raw_page(scroll, 6, waiting=True) == "A B C"
    assert raw_page(scroll, 6) == ""  # the last page answered: nothing left on the window
    press = encode("X") + b"\xfc\x09" + encode("Y")
    assert raw_page(press, 3, waiting=True) == "X"  # FC 09 waits for a press
    assert raw_page(press, 4) == "XY"  # the text goes on after the press on the same line
    # A colour control whose argument byte is FB is not a page break.
    assert raw_page(b"\xfc\x01\xfb" + encode("Hi") + b"\xfb", 6, waiting=True) == "Hi"
    # A message that closes on its own: the page runs to the end.
    assert raw_page(encode("TORCH used") + b"\xfe" + encode("SCRATCH!"), 3) == "TORCH used SCRATCH!"


def test_a_malformed_page_is_a_diagnostic_not_text() -> None:
    m = Memory()
    m.message(b"\xfc\xee", 1, state=2)
    message = bt.read_battle_message(m.read)
    assert message.page is None and message.text is None
    assert message.diagnostic is not None and "battle text" in message.diagnostic


# --- the clause ---


BASE = BattleState(True, True, "resolving", False, text_phase="busy")


def test_clause_for_every_message_state() -> None:
    waiting = bt.BattleMessage("waiting_for_input", "page_wait", "x", 3, "i", None, "Go! TORCHIC!")
    assert input_clause(replace(BASE, message=waiting, text_phase="message_waiting")) == (
        'battle message waiting: "Go! TORCHIC!" — press A or B to continue'
    )
    printing = bt.BattleMessage("printing", "printing", "x", 3, "i", None, "Go! TORCHIC!")
    assert input_clause(replace(BASE, message=printing)) == (
        'battle message printing: "Go! TORCHIC!" — still being written; no input needed yet'
    )
    broken = bt.BattleMessage("printing", "printing", None, 3, None, "harness bug: battle text: x")
    assert input_clause(replace(BASE, message=broken)) == (
        "battle message state unknown (harness bug: battle text: x); check the screen"
    )
    idle = replace(BASE, message=bt.BattleMessage("idle"))
    assert input_clause(idle) == RESOLVING
    assert input_clause(replace(idle, text_phase="screen")) is None
    assert input_clause(replace(idle, text_phase=None)) is None
    assert input_clause(replace(BASE, message=None, text_phase=None)) is None


def test_clause_for_a_battle_script_yes_no_box() -> None:
    for kind, words in (
        ("learn_move", "learn the new move"),
        ("stop_learning_move", "stop learning the new move"),
        ("yes_no", "the battle's question"),
        ("nickname_caught", "nickname the caught Pokémon"),
    ):
        prompt = bt.BattlePrompt(kind, True, "NO")
        battle = replace(BASE, message=bt.BattleMessage("idle"), prompt=prompt, text_phase="prompt")
        assert input_clause(battle) == (
            f"battle YES/NO box open ({words}), cursor on NO — UP or DOWN moves the cursor, "
            "A answers the highlighted choice, B answers NO"
        )
    # A box still being drawn (state 0) is the game's own work.
    unready = replace(BASE, prompt=bt.BattlePrompt("yes_no", False, None))
    assert input_clause(unready) == RESOLVING


def test_details_line_keeps_ready_finishing_and_replay_text() -> None:
    from test_battle_details_v2 import state, trainer

    from pokebench_env.battle_details import BattleDetails

    base = state(trainer())
    details = base.battle_details
    assert isinstance(details, BattleDetails) and base.battle is not None
    ready_off = details.lines(base.battle)[0]
    assert "input ready (action select)" in ready_off
    waiting = bt.BattleMessage("waiting_for_input", "page_wait", "x", 3, "i", None, "Hi!")
    ready = replace(base.battle, message=waiting, text_phase="input")
    assert details.lines(ready, message_waiting=True)[0] == ready_off
    finishing = replace(
        base.battle,
        player_inputs=(),
        phase="finishing",
        outcome="won",
        message=waiting,
        text_phase="message_waiting",
    )
    assert details.lines(finishing)[0].endswith("· finishing (outcome won)")
    assert details.lines(finishing, message_waiting=True)[0].endswith(
        '· finishing (outcome won) · battle message waiting: "Hi!" — press A or B to continue'
    )
    idle_finish = replace(finishing, message=bt.BattleMessage("idle"), text_phase="busy")
    assert details.lines(idle_finish, message_waiting=True)[0].endswith("finishing (outcome won)")
    replay = replace(finishing, phase="replay")
    assert details.lines(replay, message_waiting=True)[0].endswith("recorded playback")


def test_control_arm_line_is_absent_when_input_is_ready_or_in_replay() -> None:
    from test_battle_details_v2 import state, trainer

    base = state(trainer())
    assert base.battle is not None
    waiting = bt.BattleMessage("waiting_for_input", "page_wait", "x", 3, "i", None, "Hi!")
    off = CONTROL_OFF - {SWITCH}
    ready = replace(
        base,
        battle_details=None,
        battle=replace(base.battle, message=waiting, text_phase="message_waiting"),
    )
    assert "Battle input:" not in format_readout(ready, off)
    resolving = replace(ready.battle, player_inputs=(), phase="resolving")  # type: ignore[arg-type]
    shown = format_readout(replace(ready, battle=resolving), off)
    assert 'Battle input: battle message waiting: "Hi!" — press A or B to continue' in shown
    replay = replace(resolving, phase="replay")
    assert "Battle input:" not in format_readout(replace(ready, battle=replay), off)


def test_format_readout_off_is_unchanged_without_a_battle() -> None:
    from test_readout import IN_GAME

    assert format_readout(IN_GAME, frozenset({SWITCH})) == format_readout(IN_GAME)


# --- registry and production path ---


def test_switch_is_registered_server_side_last_and_default_off() -> None:
    assert SERVER_FEATURES[-30] == SWITCH
    assert SWITCH in features_off_from_env({})
    assert features_off_from_env({"POKEBENCH_FEATURES_OFF": SWITCH}) == frozenset({SWITCH})


def test_production_observation_route_honours_the_switch(monkeypatch: pytest.MonkeyPatch) -> None:
    from fastapi import FastAPI
    from test_feature_switches import _Shot
    from test_view import get

    from pokebench_env.observation import install_observation

    read = reader("00004700", operator_rom())
    payloads = {}
    for off in (RECORDED_OFF - {SWITCH}, RECORDED_OFF | {SWITCH}):
        monkeypatch.setenv("POKEBENCH_FEATURES_OFF", ",".join(sorted(off)))
        monkeypatch.setenv("POKEBENCH_ACTIVE_UI", "1")
        app = FastAPI()
        install_observation(app, lambda: _Shot(), read, maps())
        status, _, body = get(app, "/pokebench/observation")
        assert status == 200, body
        payloads[SWITCH in off] = json.loads(body)
    assert f"Battle details: WILD single · turn 3 · {WAITING}" in payloads[False]["state_text"]
    assert payloads[True]["state_text"] == frame("00004700")["readout"]
    assert payloads[False]["state"] == payloads[True]["state"]


def test_page_text_needs_the_terminated_payload() -> None:
    with pytest.raises(ValueError):
        bt.page_text(encode("Hi"), 1)
    with pytest.raises(ValueError, match="unknown text control"):
        bt.page_text(encode("Hi") + b"\xfc", 1)
    # F9 glyphs are two bytes.
    assert bt.page_text(
        encode("A") + b"\xf9\x00" + b"\xfb\xff", 4, waiting=True
    ) == "A" + bt.decode_battle_text(b"\xf9\x00")
    assert bt.page_text(encode("Hi") + b"\xff", 0) == "Hi"
    assert Memory  # the synthetic layout is shared with test_battle_text


# --- review round 1 ---


def test_a_message_on_another_screen_over_the_battle_keeps_the_off_text() -> None:
    """Evolution, bag or party own the callback (text_phase screen): no message clause."""
    from test_battle_details_v2 import state, trainer

    waiting = bt.BattleMessage("waiting_for_input", "page_wait", "x", 3, "i", None, "Hi!")
    screen = replace(BASE, message=waiting, text_phase="screen")
    assert message_clause(screen) is None and input_clause(screen) is None
    printing = bt.BattleMessage("printing", "printing", "x", 3, "i", None, "Hi!")
    assert input_clause(replace(screen, message=printing)) is None
    base = state(trainer())
    assert base.battle is not None
    over = replace(
        base.battle, player_inputs=(), phase="resolving", message=waiting, text_phase="screen"
    )
    with_details = replace(base, battle=over)
    without = replace(with_details, battle_details=None)
    for current, arm in ((with_details, frozenset()), (without, CONTROL_OFF)):
        assert format_readout(current, arm - {SWITCH}) == format_readout(current, arm | {SWITCH})
    # The detector itself: an active printer-0 page under a non-battle callback is phase screen.
    m = Memory()
    m.message(encode("Hi!") + b"\xfb", 4, state=2)
    m.set(0x030022C4, 0x081AAD5D)
    assert bt.battle_text_phase(m.read) == "screen"
    assert bt.read_battle_message(m.read).state == "waiting_for_input"


def test_a_page_held_by_auto_scroll_is_not_called_printing() -> None:
    """Link and recorded battles: gTextFlags.autoScroll turns the A/B wait into a timer."""
    held = bt.BattleMessage("printing", "page_wait", "x", 3, "i", None, "Hi!")
    assert input_clause(replace(BASE, message=held)) == (
        'battle message shown: "Hi!" — it moves on by itself (auto-scroll); no input needed'
    )


def test_clauses_follow_the_detector_phase() -> None:
    waiting = bt.BattleMessage("waiting_for_input", "page_wait", "x", 3, "i", None, "Hi!")
    # A waiting page counts only when the detector's phase agrees (message_waiting).
    assert input_clause(replace(BASE, message=waiting, text_phase="message_waiting")) == (
        'battle message waiting: "Hi!" — press A or B to continue'
    )
    assert input_clause(replace(BASE, message=waiting, text_phase="screen")) is None


def test_a_reader_diagnostic_is_shown_unless_another_owner_holds_the_battle() -> None:
    """Review round 2: a diagnostic under phase screen or input keeps the OFF text; otherwise
    the message state is reported as unknown (INV-5), never as "no input" and never as a guess."""
    broken = bt.BattleMessage("idle", diagnostic="harness bug: battle text: x")
    for phase in ("screen", "input"):
        assert message_clause(replace(BASE, message=broken, text_phase=phase)) is None
        assert input_clause(replace(BASE, message=broken, text_phase=phase)) is None
    unread = "battle message state unknown (harness bug: battle text: x); check the screen"
    assert input_clause(replace(BASE, message=broken, text_phase=None)) == unread
    assert input_clause(replace(BASE, message=broken, text_phase="busy")) == unread
    # A printing page while the detector reads a wait (or a prompt still drawing) says nothing.
    printing = bt.BattleMessage("printing", "printing", "x", 3, "i", None, "Hi!")
    assert message_clause(replace(BASE, message=printing, text_phase="message_waiting")) is None


def test_a_wait_the_player_already_answered_is_not_the_page() -> None:
    """Review round 3: after A/B on a page, text.c clears the window (RENDER_STATE_CLEAR) and
    goes back to printing with the cursor still just past the wait byte for the per-character
    delay (1-8 frames). The page is then the next one, not the cleared one."""
    two = encode("One") + b"\xfb" + encode("Two") + b"\xfb"
    assert raw_page(two, 4) == "Two"  # state 0, cursor just past the answered \p
    assert raw_page(two, 4, waiting=True) == "One"  # state 2, still waiting on it
    scroll = encode("A") + b"\xfe" + encode("B") + b"\xfa" + encode("C") + b"\xfb"
    assert raw_page(scroll, 4) == "A B C"  # \l answered, scrolling (state 4)
    press = encode("X") + b"\xfc\x09" + encode("Y")
    assert raw_page(press, 3) == "XY"  # FC 09 answered
    m = Memory()
    m.message(two + b"\xff", 4, state=0)
    assert bt.read_battle_message(m.read).page == "Two"
    m.message(two + b"\xff", 4, state=2)
    assert bt.read_battle_message(m.read).page == "One"
    m.message(two + b"\xff", 8, state=0)  # the last page answered, printer not yet idle
    assert bt.read_battle_message(m.read).page is None
