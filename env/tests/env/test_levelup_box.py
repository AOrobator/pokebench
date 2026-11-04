"""levelup-box-v1: the level-up stats box is named while it waits for a button.

The golden fixture holds the RAM windows (never ROM bytes) that re-rendering recorded states of
bundle run 2026-10-16T04-51-03_qwen36-gpu0_54a7 reads, plus each readout the model received.
State 8609 (raw-ram 5086) is "TORCHIC grew to LV. 6!" waiting in the message window; state
8618 (raw-ram 5093, T357) the box's page 1 and state 8640 (raw-ram 5108, T359) its page 2,
both read by the model as "resolving (no input until the game asks)".
"""

import json
import os
from contextlib import nullcontext
from dataclasses import replace
from functools import cache
from pathlib import Path

import pytest
from test_battle_text import Memory, encode, wait_in_thread

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
WAIT = "waiting for a button: press A or B to continue (the game takes any new button press)"


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


# --- real ROM, recorded RAM ---


def test_switch_is_a_default_off_server_feature() -> None:
    assert SERVER_FEATURES[34] == SWITCH
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
