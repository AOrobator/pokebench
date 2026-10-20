"""levelup-box-v1: the level-up stats box is named while it waits for a button.

The golden fixture holds the RAM windows (never ROM bytes) that re-rendering recorded states of
bundle run 2026-10-16T04-51-03_qwen36-gpu0_54a7 reads, plus each readout the model received.
State 8609 (raw-ram 5086) is "TORCHIC grew to LV. 6!" waiting in the message window; state
8618 (raw-ram 5093, T357) the box's page 1 and state 8640 (raw-ram 5108, T359) its page 2,
both read by the model as "resolving (no input until the game asks)".
"""

import json
import os
import threading
import types
from contextlib import nullcontext
from dataclasses import replace
from functools import cache
from pathlib import Path

import pytest
from fastapi import FastAPI
from test_battle_text import Memory, encode, wait_in_thread
from test_view import get

from pokebench_env import battle_text as bt
from pokebench_env import rerender
from pokebench_env.battle_details import _input_text
from pokebench_env.battle_state import BattleState, read_battle_state
from pokebench_env.game_state import MapNames
from pokebench_env.levelup_box import SWITCH, levelup_clause
from pokebench_env.readout import SERVER_FEATURES, features_off_from_env
from pokebench_env.rom import EMERALD_SHA1, RomError, resolve_rom

FIXTURE = json.loads((Path(__file__).parent / "fixtures/levelup-box-54a7.json").read_text())
ROM_START = 0x08000000
# Switches registered after cook run #2 were off for it.
RECORDED_OFF = frozenset(FIXTURE["recorded_off"]) | {
    SWITCH,
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
}
ON = RECORDED_OFF - {SWITCH}
OFF_TEXT = "Battle details: WILD single · turn 6 · resolving (no input until the game asks)"
WAIT = "waiting for a button: press A or B to continue (the game takes any new button press)"
PAGE1 = (
    "level-up stats box open, page 1 of 2 (stat increases): MAX. HP +2, ATTACK +2, "
    f"DEFENSE +1, SP. ATK +1, SP. DEF +1, SPEED +1 — {WAIT}"
)
PAGE2 = (
    "level-up stats box open, page 2 of 2 (new totals): MAX. HP 21, ATTACK 11, DEFENSE 10, "
    f"SP. ATK 15, SP. DEF 11, SPEED 10 — {WAIT}"
)
CONTROL = RECORDED_OFF | {"battle-details-v2", "expanded-menu-battle-information-v1"}


@cache
def _rom() -> bytes | None:
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


def frame(seq: int) -> dict[str, object]:
    return next(f for f in FIXTURE["frames"] if f["state_seq"] == seq)


@cache
def _cells(seq: int) -> dict[int, int]:
    cells: dict[int, int] = {}
    for window in frame(seq)["windows"]:  # type: ignore[attr-defined]
        start = int(window["address"], 16)
        for offset, value in enumerate(bytes.fromhex(window["hex"])):
            cells[start + offset] = value
    return cells


def reader(seq: int):  # type: ignore[no-untyped-def]
    cells, rom = _cells(seq), operator_rom()

    def read(address: int, length: int) -> bytes:
        if address >= ROM_START:
            return rom[address - ROM_START : address - ROM_START + length]
        return bytes(cells[address + i] for i in range(length))

    return read


def render(seq: int, off: frozenset[str]) -> str:
    read = reader(seq)
    return rerender.render(rerender.read_state(read, maps(), active_ui=True, off=off), off)


def changed(before: str, after: str) -> tuple[list[str], list[str]]:
    old, new = before.split("\n"), after.split("\n")
    return [line for line in old if line not in new], [line for line in new if line not in old]


# --- real ROM, recorded RAM ---


@pytest.mark.parametrize("seq", [8618, 8640])
def test_off_reproduces_what_the_model_received_byte_for_byte(seq: int) -> None:
    assert render(seq, RECORDED_OFF) == frame(seq)["readout"]
    assert OFF_TEXT in str(frame(seq)["readout"]).split("\n")


@pytest.mark.parametrize(("seq", "page"), [(8618, PAGE1), (8640, PAGE2)])
def test_on_names_the_box_page_and_its_stats_whole(seq: int, page: str) -> None:
    assert changed(render(seq, RECORDED_OFF), render(seq, ON)) == (
        [OFF_TEXT],
        [f"Battle details: WILD single · turn 6 · {page}"],
    )


def test_the_box_wins_over_the_message_clause_when_both_switches_are_on() -> None:
    both = ON - {"battle-message-waiting-v1"}
    assert f"Battle details: WILD single · turn 6 · {PAGE1}" in render(8618, both).split("\n")


def test_control_arm_gets_its_own_battle_input_line() -> None:
    off_text = render(8618, CONTROL)
    on_text = render(8618, CONTROL - {SWITCH})
    lines = on_text.split("\n")
    assert changed(off_text, on_text) == ([], [f"Battle input: {PAGE1}"])
    assert lines[lines.index("Battle details: unprovided") + 1] == f"Battle input: {PAGE1}"
    both = CONTROL - {SWITCH, "battle-message-waiting-v1"}
    assert changed(render(8640, CONTROL - {"battle-message-waiting-v1"}), render(8640, both)) == (
        [],
        [f"Battle input: {PAGE2}"],
    )


def test_expanded_without_battle_details_adds_the_line_after_the_battle_state() -> None:
    off = CONTROL - {"expanded-menu-battle-information-v1"}
    lines = render(8640, off - {SWITCH}).split("\n")
    at = next(i for i, line in enumerate(lines) if line.startswith("Battle state: resolving"))
    assert lines[at + 1] == f"Battle input: {PAGE2}"
    assert changed(render(8640, off), "\n".join(lines)) == ([], [f"Battle input: {PAGE2}"])


def test_a_message_waiting_before_the_box_is_unchanged_by_the_switch() -> None:
    assert bt.read_levelup_box(reader(8609)) is None
    assert render(8609, ON) == render(8609, RECORDED_OFF)
    assert render(8609, CONTROL - {SWITCH}) == render(8609, CONTROL)


def test_real_ram_box_reads_the_rows_from_ram_and_the_names_from_rom() -> None:
    page1 = bt.read_levelup_box(reader(8618))
    assert page1 == bt.LevelUpBox(
        6,
        1,
        True,
        party_slot=0,
        labels=("MAX. HP", "ATTACK", "DEFENSE", "SP. ATK", "SP. DEF", "SPEED"),
        before=(19, 9, 9, 14, 10, 9),
        after=(21, 11, 10, 15, 11, 10),
        text="MAX. HP +2, ATTACK +2, DEFENSE +1, SP. ATK +1, SP. DEF +1, SPEED +1",
    )
    page2 = bt.read_levelup_box(reader(8640))
    assert page2 is not None and (page2.state, page2.page, page2.waiting) == (8, 2, True)
    assert page2.text == "MAX. HP 21, ATTACK 11, DEFENSE 10, SP. ATK 15, SP. DEF 11, SPEED 10"


def test_real_ram_wait_phase_ends_on_the_box_only_with_the_switch() -> None:
    assert bt.wait_phase(reader(8618)) == "busy"
    assert bt.wait_phase(reader(8618), levelup_box=True) == "levelup_box"
    assert bt.wait_phase(reader(8640), levelup_box=True) == "levelup_box"
    assert bt.wait_phase(reader(8609), levelup_box=True) == "message_waiting"


def test_the_state_json_is_the_same_on_and_off_and_records_the_box() -> None:
    from pokebench_env.readout import state_json

    read = reader(8618)
    on = state_json(rerender.read_state(read, maps(), active_ui=True, off=ON))
    off = state_json(rerender.read_state(read, maps(), active_ui=True, off=RECORDED_OFF))
    assert on == off
    box = on["battle"]["levelup_box"]  # type: ignore[index]
    assert (box["state"], box["page"], box["waiting"]) == (6, 1, True)  # type: ignore[index]


def test_production_observation_route_honours_the_switch(monkeypatch: pytest.MonkeyPatch) -> None:
    from test_feature_switches import _Shot

    from pokebench_env.observation import install_observation

    read = reader(8618)
    payloads = {}
    for off in (ON, RECORDED_OFF):
        monkeypatch.setenv("POKEBENCH_FEATURES_OFF", ",".join(sorted(off)))
        monkeypatch.setenv("POKEBENCH_ACTIVE_UI", "1")
        app = FastAPI()
        install_observation(app, lambda: _Shot(), read, maps())
        status, _, body = get(app, "/pokebench/observation")
        assert status == 200, body
        payloads[SWITCH in off] = json.loads(body)
    assert f"Battle details: WILD single · turn 6 · {PAGE1}" in payloads[False]["state_text"]
    assert payloads[True]["state_text"] == frame(8618)["readout"]


def test_switch_is_a_default_off_server_feature() -> None:
    assert SERVER_FEATURES[-18] == SWITCH
    assert SWITCH in features_off_from_env({})


# --- synthetic layout (pret battle.h, battle_script_commands.c, menu_specialized.c) ---

NAMES = ("MAX. HP", "ATTACK", "DEFENSE", "SP. ATK", "SP. DEF", "SPEED")


def box_memory(state: int, *, before=(19, 9, 9, 9, 14, 10), after=(21, 11, 10, 10, 15, 11)):  # type: ignore[no-untyped-def]
    """STAT order (HP, ATK, DEF, SPEED, SPATK, SPDEF) for both stat arrays."""
    memory = Memory()
    memory.set(0x03005D04, 0x0803E019)  # gBattleMainFunc = RunBattleScriptCommands
    memory.set(0x02024214, 0x08F00000)  # gBattlescriptCurrInstr
    memory.set(0x08F00000, 0x6C, 1)  # drawlvlupbox
    memory.set(0x02024492, state, 1)
    memory.set(0x0202449C, 0x02000010)  # gBattleStruct
    memory.set(0x02000020, 1, 1)  # expGetterMonId
    memory.set(0x020244A8, 0x020002C4)  # gBattleResources
    memory.set(0x020002D4, 0x0200042C)  # ->beforeLvlUp
    for i, value in enumerate(before):
        memory.set(0x0200042C + 2 * i, value, 2)
    for i, value in enumerate(after):
        memory.set(0x020244EC + 100 + 0x58 + 2 * i, value, 2)
    for row, name in enumerate(NAMES):
        memory.set(0x08625B54 + 4 * row, 0x08F01000 + 16 * row)
        memory.put(0x08F01000 + 16 * row, encode(name) + b"\xff")
    return memory


def test_box_states_pages_and_waits() -> None:
    assert [
        (b.page, b.waiting) if (b := bt.read_levelup_box(box_memory(s).read)) else None
        for s in range(11)
    ] == [
        (None, False),
        (None, False),
        (None, False),
        (None, False),
        (1, False),
        (1, False),
        (1, True),
        (2, False),
        (2, True),
        (None, False),
        (None, False),
    ]
    banner = bt.read_levelup_box(box_memory(2).read)
    assert banner == bt.LevelUpBox(2, None, False)


def test_box_page_1_signs_each_difference_like_the_game() -> None:
    box = bt.read_levelup_box(box_memory(6, before=(30, 9, 12, 9, 14, 10)).read)
    assert box is not None and box.party_slot == 1
    assert box.text == "MAX. HP -9, ATTACK +2, DEFENSE -2, SP. ATK +1, SP. DEF +1, SPEED +1"


def test_no_box_unless_the_battle_script_runs_drawlvlupbox() -> None:
    memory = box_memory(6)
    memory.set(0x03005D04, 0x08000001)
    assert bt.read_levelup_box(memory.read) is None
    memory = box_memory(6)
    memory.set(0x08F00000, 0x6B, 1)
    assert bt.read_levelup_box(memory.read) is None
    memory = box_memory(6)
    memory.set(0x02024214, 0x02000000)
    assert bt.read_levelup_box(memory.read) is None


@pytest.mark.parametrize(
    ("address", "value", "size", "problem"),
    [
        (0x02000020, 6, 1, "exp getter party slot 6 is out of range"),
        (0x0202449C, 0x03000000, 4, "gBattleStruct pointer 0x3000000 is outside EWRAM"),
        (0x020244A8, 0, 4, "gBattleResources pointer 0x0 is outside EWRAM"),
        (0x020002D4, 0x02040000, 4, "beforeLvlUp pointer 0x2040000 is outside EWRAM"),
        (0x08625B54, 0x02000000, 4, "stat name pointer 0x2000000 is outside the ROM"),
    ],
)
def test_a_bad_stats_read_is_a_diagnostic_not_a_guess(
    address: int, value: int, size: int, problem: str
) -> None:
    memory = box_memory(8)
    memory.set(address, value, size)
    box = bt.read_levelup_box(memory.read)
    assert box == bt.LevelUpBox(8, 2, True, diagnostic=f"harness bug: level-up box: {problem}")
    battle = BattleState(True, phase="resolving", text_phase="busy", levelup_box=box)
    assert levelup_clause(battle) == (
        "level-up stats box open, page 2 of 2 (new totals); the stats it shows could not be "
        f"read (harness bug: level-up box: {problem}) — {WAIT}"
    )


def test_a_failing_stats_read_is_a_diagnostic_and_keeps_the_message_fields() -> None:
    memory = box_memory(6)

    def failing(address: int, length: int) -> bytes:
        if address == 0x020244EC + 100 + 0x58:
            raise OSError("memory read failed")
        return memory.read(address, length)

    box = bt.read_levelup_box(failing)
    assert box == bt.LevelUpBox(
        6, 1, True, diagnostic="harness bug: level-up box: memory read failed"
    )
    state = read_battle_state(failing)
    assert state.levelup_box == box and state.message == bt.BattleMessage("idle")


def test_battle_state_records_the_box_and_a_failed_text_read_records_none() -> None:
    memory = box_memory(6)
    memory.set(0x030022C4, 0x08036FAD)  # CB2_HandleStartBattle: initializing
    state = read_battle_state(memory.read)
    assert state.levelup_box is not None and state.levelup_box.page == 1

    def short(address: int, length: int) -> bytes:
        return b"" if address == 0x020201B0 else memory.read(address, length)

    assert read_battle_state(short).levelup_box is None


def test_clause_needs_a_waiting_page_and_the_busy_phase() -> None:
    shown = bt.read_levelup_box(box_memory(6).read)
    battle = BattleState(True, phase="resolving", text_phase="busy", levelup_box=shown)
    assert levelup_clause(battle) is not None
    assert levelup_clause(replace(battle, text_phase="screen")) is None
    assert levelup_clause(replace(battle, levelup_box=None)) is None
    drawing = bt.read_levelup_box(box_memory(7).read)
    assert levelup_clause(replace(battle, levelup_box=drawing)) is None
    assert levelup_clause(replace(battle, levelup_box=bt.LevelUpBox(6, None, True))) is None


def test_input_text_finishing_and_replay() -> None:
    shown = bt.read_levelup_box(box_memory(6).read)
    clause = levelup_clause(BattleState(True, text_phase="busy", levelup_box=shown))
    finishing = BattleState(
        True, phase="finishing", outcome="won", text_phase="busy", levelup_box=shown
    )
    assert _input_text(finishing, False, True) == f"finishing (outcome won) · {clause}"
    assert _input_text(finishing, True, False) == "finishing (outcome won)"
    replay = replace(finishing, phase="replay")
    assert _input_text(replay, True, True) == "recorded playback"
    resolving = replace(finishing, phase="resolving")
    assert _input_text(resolving, False, True) == clause
    assert _input_text(resolving, False, False) == "resolving (no input until the game asks)"


def test_wait_returns_on_the_first_frame_the_box_waits_only_with_the_switch() -> None:
    memory = box_memory(7)
    wait = bt.BattleWait(memory.read, levelup_box=True)
    thread, result = wait_in_thread(wait, lambda: "captured")
    thread.join(0.1)
    wait.on_frame()
    assert thread.is_alive()
    memory.set(0x02024492, 8, 1)
    wait.on_frame()
    thread.join(5)
    assert result["r"] == ("captured", "levelup_box", 2)
    assert wait.wait(lambda: "now", nullcontext()) == ("now", "levelup_box", 0)
    off = bt.BattleWait(memory.read)
    thread, result = wait_in_thread(off, lambda: "late", bound=2)
    thread.join(0.1)
    off.on_frame()
    off.on_frame()
    thread.join(5)
    assert result["r"] == ("late", "bound", 2)


def _production(monkeypatch: pytest.MonkeyPatch, off: str | None) -> FastAPI:
    from test_observation import Shot

    from pokebench_env.serve import run

    if off is None:
        monkeypatch.delenv("POKEBENCH_FEATURES_OFF", raising=False)
    else:
        monkeypatch.setenv("POKEBENCH_FEATURES_OFF", off)
    memory = box_memory(6)
    memory.set(0x030022C4, 0x08038421)
    app = FastAPI()

    class Emulator:
        def run_frame_with_buttons(self, buttons: list[str]) -> None:
            pass

    run(
        [],
        uvicorn=types.SimpleNamespace(run=lambda *a, **k: None),
        vendor_main=lambda: None,
        observation=(app, Shot, memory.read, MapNames({}), threading.Lock()),
        pause=(app, types.SimpleNamespace(step_environment=lambda actions: None)),
        frames=Emulator,
        battle_text=(app, Emulator, memory.read),
    )
    app.state.emulator = Emulator
    return app


def _wait_in_thread(app: FastAPI, query: bytes):  # type: ignore[no-untyped-def]
    result: dict[str, object] = {}
    thread = threading.Thread(
        target=lambda: result.update(r=get(app, "/pokebench/battle/wait", query)), daemon=True
    )
    thread.start()
    return thread, result


def test_production_battle_wait_honours_the_switch(monkeypatch: pytest.MonkeyPatch) -> None:
    app = _production(monkeypatch, "")
    thread, result = _wait_in_thread(app, b"max_frames=1")
    thread.join(5)
    assert not thread.is_alive()
    payload = json.loads(result["r"][2])  # type: ignore[index]
    assert (payload["reason"], payload["frames"]) == ("levelup_box", 0)
    app = _production(monkeypatch, None)
    thread, result = _wait_in_thread(app, b"max_frames=1")
    thread.join(0.2)
    assert thread.is_alive()
    app.state.emulator().run_frame_with_buttons([])
    thread.join(5)
    assert json.loads(result["r"][2])["reason"] == "bound"  # type: ignore[index]
