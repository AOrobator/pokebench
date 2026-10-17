"""transition-coherence-v1 and the native journal fixes: battle starts, torn saves, handoffs.

Real-RAM fixtures (RAM windows only, never ROM bytes) come from the cook harness audit runs
(runs/reports/2026-10-16-cook-harness-audit). Battle starts: show T744 (raw-ram 7894,
BeginBattleIntroDummy with positions 0xFF), sh02 T922 (6167) and e588 T1500 (7362)
(BeginBattleIntro with the previous battle's outcome and battlers). Torn saves: e588 405,
687e 202 (memcpy inside MoveSaveBlocks_ResetHeap), 2a25 394 (IRQ during the re-key).
Handoffs: show 7834 (CB2_ReturnToField), sh02 3454 (CB2_ChooseStarter).
"""

import gzip
import json
import os
import struct
from dataclasses import replace
from functools import cache
from pathlib import Path

import pytest
from test_battle_state import fixture as battle_fixture

from pokebench_env import rerender
from pokebench_env.action_history import ActionFrame, NativeActionJournal, read_action_frame
from pokebench_env.battle_choices import COUNT, IN_BATTLE, MAIN_FUNC, MONS, POSITIONS
from pokebench_env.battle_state import OUTCOME, BattleState, read_battle_state
from pokebench_env.game_screen import GMAIN, Screen
from pokebench_env.game_state import MapNames
from pokebench_env.pokemon import PokemonCpu
from pokebench_env.readout import SERVER_FEATURES, features_off_from_env
from pokebench_env.resources import ResourceDiagnostic, Resources
from pokebench_env.rom import EMERALD_SHA1, RomError, resolve_rom
from pokebench_env.transition_coherence import (
    BATTLE_INTRO_MAIN_FUNCS,
    BUSY_LIMIT,
    CB2_HANDLE_START_BATTLE,
    HANDOFF_CALLBACKS,
    SWITCH,
    diagnostic_kind,
    main_loop_idle,
)
from pokebench_env.ui_state import read_active_ui

FIXTURES = Path(__file__).parent / "fixtures"
ROM_START = 0x08000000


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


@cache
def _frames(name: str) -> dict[tuple[str, int], dict[str, object]]:
    body = json.loads(gzip.decompress((FIXTURES / name).read_bytes()))
    return {(str(f["run"])[-4:], int(str(f["raw_ram"])[8:16])): f for f in body["frames"]}


class FixtureMemory:
    """Recorded RAM windows plus the archived CPU registers; ROM reads use the operator ROM."""

    def __init__(self, frame: dict[str, object], rom: bytes) -> None:
        windows = frame["windows"]
        assert isinstance(windows, list)
        self.windows = [(int(w["address"], 16), bytes.fromhex(w["hex"])) for w in windows]
        self.gprs = tuple(int(x) for x in frame["gprs"])  # type: ignore[attr-defined]
        self.cpsr = int(frame["cpsr"])  # type: ignore[arg-type]
        self.rom = rom

    def __call__(self, address: int, length: int) -> bytes:
        if address >= ROM_START:
            return self.rom[address - ROM_START : address - ROM_START + length]
        for base, data in self.windows:
            if base <= address and address + length <= base + len(data):
                return data[address - base : address - base + length]
        raise KeyError(f"outside fixture: {address:#x}+{length}")

    def pokemon_cpu_context(self) -> PokemonCpu | None:
        sp = self.gprs[13]
        if not (0x02000000 <= sp <= 0x02040000 - 128 or 0x03000000 <= sp <= 0x03008000 - 128):
            return None
        return PokemonCpu(self.gprs, self.cpsr, sp, self(sp, 128))


def memory(name: str, run: str, raw: int) -> FixtureMemory:
    return FixtureMemory(_frames(name)[(run, raw)], operator_rom())


BATTLE = "transition-coherence-battle-start.json.gz"
TORN = "transition-coherence-torn-saves.json.gz"
HANDOFF = "transition-coherence-handoffs.json.gz"


def recorded(name: str, run: str, raw: int) -> tuple[dict[str, object], frozenset[str]]:
    frame = _frames(name)[(run, raw)]
    # Switches registered after these runs were recorded were off for them.
    later = {
        "readout-truth-v1",
        "birch-speech-pages-v1",
        "blackout-readout-v1",
        "surf-gated-exits-v1",
        "tutorial-party-owner-v1",
        "mid-frame-readout-v1",
        "unset-dynamic-warp-v1",
        "status-names-v1",
        "surf-gated-exits-v2",
    }
    return frame, frozenset(frame["recorded_off"]) | later  # type: ignore[arg-type]


def render(name: str, run: str, raw: int, *, on: bool) -> str:
    frame, off = recorded(name, run, raw)
    off = off - {SWITCH} if on else off | {SWITCH}
    read = memory(name, run, raw)
    state = rerender.read_state(read, maps(), active_ui=bool(frame["active_ui"]), off=off)
    return rerender.render(state, off)


def changed(before: str, after: str) -> tuple[list[str], list[str]]:
    old, new = before.split("\n"), after.split("\n")
    return [line for line in old if line not in new], [line for line in new if line not in old]


def world_block(text: str) -> list[str]:
    lines = text.split("\n")
    return lines[next(i for i, line in enumerate(lines) if line.startswith("Story:")) :]


# --- the switch ------------------------------------------------------------------------


def test_switch_is_a_default_off_server_observation_switch() -> None:
    assert SWITCH == "transition-coherence-v1"
    assert SERVER_FEATURES[-10] == SWITCH
    assert SWITCH in features_off_from_env({})
    assert SWITCH not in features_off_from_env({"POKEBENCH_FEATURES_OFF": ""})


def test_rerender_hands_the_switch_to_the_game_state_reader(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    seen: list[bool] = []

    def spy(read, maps, **flags):  # type: ignore[no-untyped-def]
        seen.append(flags["transition_coherence_enabled"])
        raise StopIteration

    monkeypatch.setattr(rerender, "read_game_state", spy)
    for off in (frozenset(), frozenset({SWITCH})):
        with pytest.raises(StopIteration):
            rerender.read_state(lambda a, n: bytes(n), maps(), active_ui=True, off=off)
    assert seen == [True, False]


# --- fix 1: the model's readout at a battle start (real RAM) ---------------------------


@pytest.mark.parametrize(("run", "raw"), [("show", 7894), ("sh02", 6167), ("e588", 7362)])
def test_off_reproduces_the_recorded_battle_start_readout_byte_for_byte(run: str, raw: int) -> None:
    frame, _ = recorded(BATTLE, run, raw)
    assert render(BATTLE, run, raw, on=False) == frame["readout"]


def test_on_show_t744_positions_cleared_is_initializing_not_a_coverage_error() -> None:
    frame, _ = recorded(BATTLE, "show", 7894)
    assert changed(str(frame["readout"]), render(BATTLE, "show", 7894, on=True)) == (
        [
            "Screen: unknown (callback2 0x08036FAD)",
            "STATE COVERAGE ERROR: harness bug: invalid battle positions",
            "HARNESS BUG (battle): harness bug: invalid battle positions",
        ],
        ["Screen: battle_transition"],
    )


@pytest.mark.parametrize(
    ("run", "raw", "stale"),
    [("sh02", 6167, "Foe ZIGZAGOON Lv3"), ("e588", 7362, "Foe POOCHYENA Lv3")],
)
def test_on_the_previous_battle_is_not_shown_while_the_new_one_initializes(
    run: str, raw: int, stale: str
) -> None:
    frame, _ = recorded(BATTLE, run, raw)
    off_text = str(frame["readout"])
    on = render(BATTLE, run, raw, on=True)
    assert "finishing (outcome won)" in off_text and stale in off_text
    lines = on.split("\n")
    assert lines[0] == "Screen: battle_transition"
    assert (
        "Interface: battle_initializing; input not ready; "
        "Use the game-owned battle input and selected control when ready"
    ) in on
    assert "Battle state: initializing; input False; turn None; outcome None" in lines
    assert not any("finishing" in line or "outcome won" in line for line in lines)
    assert not any(line.startswith(("Foe ", "You ", "Battle details:")) for line in lines)
    # The world block (player, location, party, money) is the same game state.
    assert world_block(on) == world_block(off_text)


@pytest.mark.parametrize(
    ("run", "raw"), [("sh02", 6168), ("e588", 7363), ("show", 6605), ("show", 7896)]
)
def test_on_once_the_battle_has_its_own_battlers_the_readout_is_unchanged(
    run: str, raw: int
) -> None:
    assert render(BATTLE, run, raw, on=True) == render(BATTLE, run, raw, on=False)


def test_on_a_poll_while_the_game_is_busy_reads_no_save_block() -> None:
    # show 7893: CB2_InitBattle, CPU inside a BIOS call (not at the main-loop VBlank wait).
    off = render(BATTLE, "show", 7893, on=False)
    on = render(BATTLE, "show", 7893, on=True)
    assert any(line.startswith("Money: ") for line in off.split("\n"))
    assert not any(line.startswith("Money: ") for line in on.split("\n"))
    assert on.endswith(
        "Save-backed world state unavailable: save data is not initialized or valid."
    )


def test_on_an_idle_overworld_poll_is_unchanged() -> None:
    assert render(BATTLE, "show", 6359, on=True) == render(BATTLE, "show", 6359, on=False)


# --- fix 1: battle_state current-battle guard (synthetic, pret battle_main.c) -----------


def test_intro_main_functions_are_the_rom_chain_before_new_battlers_exist() -> None:
    assert BATTLE_INTRO_MAIN_FUNCS == frozenset(
        {0x08039EC9, 0x08039ECD, 0x0803ABC1, 0x0803AC35, 0x0803AC85}
    )


@pytest.mark.parametrize("main", sorted(BATTLE_INTRO_MAIN_FUNCS))
def test_stale_outcome_turn_and_battlers_during_the_intro_are_initializing(main: int) -> None:
    m = battle_fixture()
    m.put(MAIN_FUNC, struct.pack("<I", main))
    m.put(OUTCOME, b"\x01")
    state = read_battle_state(m.read)
    assert (state.phase, state.initialized, state.ready, state.diagnostic) == (
        "initializing",
        False,
        False,
        None,
    )
    assert state.outcome_code is None and state.battlers is None and state.turn is None
    assert state.main_func == main
    # Without the guard the previous battle's battlers and outcome decode as a finishing battle.
    assert read_battle_state(m.read, current_battle_only=False).phase == "finishing"


def test_cleared_positions_with_a_stale_count_are_initializing() -> None:
    m = battle_fixture()
    m.put(POSITIONS, b"\xff\xff")
    assert read_battle_state(m.read).phase == "initializing"
    assert read_battle_state(m.read).diagnostic is None
    old = read_battle_state(m.read, current_battle_only=False)
    assert old.diagnostic == "harness bug: invalid battle positions"
    m.put(POSITIONS, b"\xff\x01")
    assert read_battle_state(m.read).diagnostic == "harness bug: invalid battle positions"


def test_after_the_intro_copies_battlers_the_battle_decodes() -> None:
    m = battle_fixture()
    m.put(MAIN_FUNC, struct.pack("<I", 0x0803AF81))
    state = read_battle_state(m.read)
    assert state.initialized and state.battlers is not None and state.phase == "input"


# --- fix 2: Activity History battle events (real RAM) ----------------------------------


def journal_over(name: str, run: str, raws: list[int]) -> NativeActionJournal:
    j = NativeActionJournal()
    for raw in raws:
        j.observe(read_action_frame(memory(name, run, raw), include_storage=False))
    return j


def battle_events(j: NativeActionJournal) -> list[tuple[str, dict[str, object]]]:
    return [(e["kind"], e["details"]) for e in j.entries if e["kind"].startswith("battle_")]


def test_no_phantom_hp_pp_or_status_change_against_the_previous_battle() -> None:
    # show 6362 is BattleIntroGetMonsData: gBattleMons still hold battle 1's TORCHIC 13/19.
    j = journal_over(BATTLE, "show", [6359, 6362, 6364])
    events = battle_events(j)
    assert [kind for kind, _ in events] == ["battle_started"]
    started = events[0][1]
    assert started["battle_type"] == 4 and started["present_at_start"] is False
    assert isinstance(started["activated_frame"], int)


def test_no_stale_won_outcome_right_after_battle_started() -> None:
    # show 6603 is BeginBattleIntro with gBattleOutcome still 1 from the last battle.
    j = journal_over(BATTLE, "show", [6600, 6603, 6605])
    assert [kind for kind, _ in battle_events(j)] == ["battle_started"]
    assert battle_events(j)[0][1]["battle_type"] == 4


def test_positions_cleared_frame_is_not_a_harness_bug_and_type_comes_from_a_valid_frame() -> None:
    j = journal_over(BATTLE, "show", [7893, 7894, 7895, 7896])
    kinds = [e["kind"] for e in j.entries if e["kind"] != "menu_changed"]
    assert kinds == ["battle_started"]
    assert battle_events(j)[0][1]["battle_type"] is not None
    phases = [e["details"]["phase"] for e in j.entries if e["kind"] == "menu_changed"]
    assert "battle_unavailable" not in phases and "battle_finishing" not in phases


def test_battle_started_waits_for_the_first_valid_frame_and_survives_a_battle_with_none() -> None:
    m = battle_fixture()
    initializing = BattleState(True, phase="initializing")
    first = read_battle_state(m.read)
    base = ActionFrame(None, None, None, None)
    j = NativeActionJournal()
    j.observe(replace(base, battle=BattleState(False)))
    j.observe(replace(base, battle=initializing))
    assert [e["kind"] for e in j.entries] == []
    j.observe(replace(base, battle=first))
    started = [e for e in j.entries if e["kind"] == "battle_started"]
    assert len(started) == 1 and started[0]["details"]["battle_type"] == first.battle_type
    assert started[0]["details"]["activated_frame"] == 0
    j.observe(replace(base, battle=BattleState(False)))
    # A battle that ends before any valid decode still pairs its start and end.
    j.observe(replace(base, battle=initializing))
    j.observe(replace(base, battle=BattleState(False)))
    tail = [(e["kind"], e["details"].get("battle_type")) for e in j.entries][-3:]
    assert tail == [("battle_ended", None), ("battle_started", None), ("battle_ended", None)]


def test_outcome_needs_the_current_battle_and_is_recorded_once() -> None:
    m = battle_fixture()
    first = read_battle_state(m.read)
    won = replace(first, outcome_code=1, outcome="won", phase="finishing")
    base = ActionFrame(None, None, None, None)
    j = NativeActionJournal()
    j.observe(replace(base, battle=BattleState(False)))
    j.observe(replace(base, battle=first))
    j.observe(replace(base, battle=won))
    j.observe(replace(base, battle=won))
    assert [e["kind"] for e in j.entries].count("battle_outcome") == 1


# --- fix 3: torn save reads (real RAM) ---------------------------------------------------


@pytest.mark.parametrize(
    ("run", "raw", "idle"),
    [("e588", 404, True), ("e588", 405, False), ("687e", 202, False), ("2a25", 394, False)],
)
def test_main_loop_idle_from_the_archived_cpu(run: str, raw: int, idle: bool) -> None:
    assert main_loop_idle(memory(TORN, run, raw)) is idle


def test_main_loop_idle_is_unknown_without_cpu_registers() -> None:
    assert main_loop_idle(lambda a, n: bytes(n)) is None


@pytest.mark.parametrize(
    ("run", "raws"),
    [("e588", [404, 405, 406]), ("687e", [201, 202]), ("2a25", [393, 394]), ("sh02", [4974, 4975])],
)
def test_the_journal_skips_frames_inside_a_save_block_move(run: str, raws: list[int]) -> None:
    j = NativeActionJournal()
    before = None
    for raw in raws:
        read = memory(TORN, run, raw)
        busy = main_loop_idle(read) is False
        j.advance(read)
        assert j.error is None
        if busy:
            assert j.previous is before
        before = j.previous
    assert [e for e in j.entries if e["kind"] == "harness_bug"] == []


def test_the_busy_archives_still_reproduce_the_torn_decode() -> None:
    # The decoder is unchanged: the same RAM decoded anyway gives the audit's false bugs.
    frame = read_action_frame(memory(TORN, "e588", 405))
    owners = {d.owner for d in frame.resources.diagnostics} if frame.resources else set()
    assert "berry_trees" in owners


def busy_reader(idle: bool):  # type: ignore[no-untyped-def]
    regs = [0] * 16
    regs[13] = 0x03007E00
    regs[15] = 0x080008C8 if idle else 0x082E93F6
    cpu = PokemonCpu(tuple(regs), 0x6000003F, 0x03007E00, bytes(128))

    class Reader:
        def __call__(self, address: int, length: int) -> bytes:
            return bytes(length)

        def pokemon_cpu_context(self) -> PokemonCpu:
            return cpu

    return Reader()


def test_the_journal_never_goes_silently_blind() -> None:
    j = NativeActionJournal()
    busy = busy_reader(False)
    for _ in range(BUSY_LIMIT - 1):
        j.advance(busy)
    assert list(j.entries) == []
    j.advance(busy)
    j.advance(busy)
    bugs = [e for e in j.entries if e["kind"] == "harness_bug"]
    assert len(bugs) == 1 and bugs[0]["details"]["owner"] == "native_action"
    assert f"{BUSY_LIMIT}" in str(bugs[0]["details"]["message"])
    assert j.frame == BUSY_LIMIT + 1 and j.error is None


def test_an_idle_frame_resets_the_busy_count() -> None:
    j = NativeActionJournal()
    for _ in range(BUSY_LIMIT - 1):
        j.advance(busy_reader(False))
    j.advance(busy_reader(True))
    assert j.error is None
    for _ in range(BUSY_LIMIT - 1):
        j.advance(busy_reader(False))
    assert blind(j) == []
    j.advance(busy_reader(False))
    assert len(blind(j)) == 1


def blind(j: NativeActionJournal) -> list[object]:
    # The all-zero idle frame itself is an unsupported menu owner; only the blind guard counts.
    return [
        e
        for e in j.entries
        if e["kind"] == "harness_bug" and e["details"]["owner"] == "native_action"
    ]


def test_each_blind_episode_after_a_recovery_is_reported() -> None:
    # Codex review round 2: a second 600-frame busy episode after an idle frame is loud too.
    j = NativeActionJournal()
    for episode in (1, 2):
        for _ in range(BUSY_LIMIT):
            j.advance(busy_reader(False))
        assert len(blind(j)) == episode
        j.advance(busy_reader(True))
    for _ in range(BUSY_LIMIT * 2):
        j.advance(busy_reader(False))
    assert len(blind(j)) == 3  # a long streak reports once, at its 600th frame


def test_harness_bug_dedupe_is_by_owner_and_kind_not_slot_numbers_or_hex() -> None:
    assert diagnostic_kind("harness bug: invalid berry tree 1: dc312c01dc312c01") == (
        "harness bug: invalid berry tree #: #"
    )
    assert diagnostic_kind("harness bug: invalid item/quantity in slot 3: 16696/56633") == (
        "harness bug: invalid item/quantity in slot #: #/#"
    )
    # Owner addresses stay: two unknown callbacks are two coverage gaps.
    assert diagnostic_kind("callback1 0x08085E05; callback2 0x080860C9; active tasks ") == (
        "callback1 0x08085E05; callback2 0x080860C9; active tasks "
    )
    j = NativeActionJournal()
    for slot, raw in ((1, "a1"), (7, "b2"), (126, "c3")):
        message = f"harness bug: invalid berry tree {slot}: {raw * 4}"
        diagnostic = ResourceDiagnostic("berry_trees", message, raw)
        j.observe(ActionFrame(None, Resources(diagnostics=(diagnostic,)), None, None))
    j.observe(
        ActionFrame(
            None,
            Resources(
                diagnostics=(
                    ResourceDiagnostic("bag", "harness bug: invalid berry tree 2: 9", None),
                )
            ),
            None,
            None,
        )
    )
    bugs = [e["details"] for e in j.entries if e["kind"] == "harness_bug"]
    assert [(b["owner"], b["kind"]) for b in bugs] == [
        ("berry_trees", "harness bug: invalid berry tree #: #"),
        ("bag", "harness bug: invalid berry tree #: #"),
    ]
    assert bugs[0]["message"] == "harness bug: invalid berry tree 1: a1a1a1a1"


# --- fix 4: handoff callbacks ----------------------------------------------------------


def test_handoff_callbacks_are_the_rom_verified_set() -> None:
    assert {k: v[0] for k, v in HANDOFF_CALLBACKS.items()} == {
        0x08085EF9: "field_transition",
        0x080860C9: "field_transition",
        0x08086119: "field_transition",
        0x08086195: "field_transition",
        0x080861B1: "field_transition",
        0x080861CD: "field_transition",
        0x080861E9: "field_transition",
        0x0809E8B5: "field_transition",
        0x081349F5: "clock_transition",
        0x08133F0D: "starter_choice_transition",
        0x080EFE99: "field_transition",
        CB2_HANDLE_START_BATTLE: "battle_transition",
    }


class Zeros:
    def __init__(self) -> None:
        self.cells: dict[int, int] = {}

    def put(self, address: int, data: bytes) -> None:
        for i, b in enumerate(data):
            self.cells[address + i] = b

    def read(self, address: int, length: int) -> bytes:
        return bytes(self.cells.get(address + i, 0) for i in range(length))


@pytest.mark.parametrize("callback", sorted(HANDOFF_CALLBACKS))
def test_a_handoff_callback_is_a_not_ready_transition_not_a_harness_bug(callback: int) -> None:
    screen = Screen("unknown", 0x08085E05, callback)
    ui = read_active_ui(Zeros().read, screen)
    assert ui is not None and ui.phase == HANDOFF_CALLBACKS[callback][0]
    assert ui.ready is False and ui.diagnostic is None and ui.selected is None
    old = read_active_ui(Zeros().read, screen, transition_coherence=False)
    assert old is not None and old.phase == "unsupported" and old.diagnostic is not None


def test_an_unlisted_unknown_callback_stays_unsupported() -> None:
    ui = read_active_ui(Zeros().read, Screen("unknown", 0, 0x081B7F35))
    assert ui is not None and ui.phase == "unsupported" and "0x081B7F35" in str(ui.diagnostic)


def test_handle_start_battle_in_battle_is_the_battle_phase_not_the_handoff() -> None:
    m = battle_fixture()
    m.put(MAIN_FUNC, struct.pack("<I", 0x08039ECD))
    ui = read_active_ui(m.read, Screen("unknown", 0, CB2_HANDLE_START_BATTLE))
    assert ui is not None and ui.phase == "battle_initializing"
    m.put(IN_BATTLE, b"\x00")
    ui = read_active_ui(m.read, Screen("unknown", 0, CB2_HANDLE_START_BATTLE))
    assert ui is not None and ui.phase == "battle_transition" and ui.diagnostic is None


@pytest.mark.parametrize(
    ("run", "raw", "phase"),
    [("show", 7834, "field_transition"), ("sh02", 3454, "starter_choice_transition")],
)
def test_real_handoff_frames_journal_and_readout(run: str, raw: int, phase: str) -> None:
    frame = read_action_frame(memory(HANDOFF, run, raw), include_storage=False)
    assert frame.ui is not None and frame.ui.phase == phase and frame.ui.diagnostic is None
    off = render(HANDOFF, run, raw, on=False)
    on = render(HANDOFF, run, raw, on=True)
    assert "STATE COVERAGE ERROR" in off and "STATE COVERAGE ERROR" not in on
    assert f"Interface: {phase}; input not ready" in on


def test_game_state_screen_label_for_handle_start_battle_only_under_the_switch() -> None:
    from pokebench_env.game_state import read_game_state

    m = battle_fixture()
    m.put(GMAIN + 4, struct.pack("<I", CB2_HANDLE_START_BATTLE))
    m.put(MAIN_FUNC, struct.pack("<I", 0x08039EC9))
    m.put(COUNT, b"\x02")
    m.put(MONS, bytes(0x58 * 2))
    on = read_game_state(m.read, maps(), transition_coherence_enabled=True)
    off = read_game_state(m.read, maps())
    assert on.screen == "battle_transition"
    assert off.screen == "unknown (callback2 0x08036FAD)"
    assert on.battle is not None and on.battle.phase == "initializing"
