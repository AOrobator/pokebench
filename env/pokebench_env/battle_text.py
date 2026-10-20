"""The battle message window, its frame-owned page journal and the battle wait.

Source: pret/pokeemerald 731ad5bf, US ROM f3ae0881. Findings and address
receipts: docs/findings/2026-10-16_battle-text.md.

Battle messages go to window B_WIN_MSG (0) through BattlePutTextOnWindow
(src/battle_message.c), whose AddTextPrinter copies the printer into
sTextPrinters[windowId]: printer 0 at 0x020201B0 (stride 0x24; currentChar +0,
windowId +4, active +0x1B, state +0x1C). Its currentChar walks
gDisplayedStringBattle (0x02022E2C, 300 bytes). That buffer is also reused by
the healthbox name, move-name, PP and type windows, which print at speed 0 into
other windows and leave no printer active, so buffer text counts as a shown
page only while printer 0 is active on it inside BattleMainCB2.

The printer waits for A or B (src/text.c TextPrinterWait and
TextPrinterWaitWithDownArrow: JOY_NEW(A_BUTTON | B_BUTTON)) in
RENDER_STATE_WAIT, _CLEAR and _SCROLL_START, unless gTextFlags.autoScroll
(link and recorded battles). Other messages finish printing and the battle
script's waitmessage advances them without input.

Battle-script YES/NO boxes (Cmd_yesnoboxlearnmove, Cmd_yesnoboxstoplearningmove,
Cmd_yesnobox, Cmd_trygivecaughtmonnick) wait for input in their state 1, with
the cursor at gBattleCommunication[CURSOR_POSITION]; B answers NO.

The level-up stats box (Cmd_drawlvlupbox, opcode 0x6C) is its own window, B_WIN_LEVEL_UP_BOX,
not printer 0. gBattleScripting.drawlvlupboxState 6 shows page 1 (the stat increases,
DrawLevelUpWindowPg1) and 8 page 2 (the new totals, DrawLevelUpWindowPg2); both wait for
gMain.newKeys != 0, any new button. Findings: docs/worklogs/2026-10-16_levelup-box.md.
"""

import threading
import time
from collections import deque
from collections.abc import Callable
from contextlib import AbstractContextManager
from dataclasses import dataclass, replace
from hashlib import sha256
from typing import Literal, Protocol, TypeVar, cast

from fastapi import FastAPI, HTTPException, Query

from pokebench_env.caught_nickname import ACTION_FUNC, EXEC_SCRIPT, FINISH_BATTLE
from pokebench_env.game_screen import GMAIN, ReadMemory
from pokebench_env.native_text import CONTROL_ARGS, decode_native_text, native_text_payload

IN_BATTLE = 0x030026F9
BATTLE_MAIN_CB2 = 0x08038421
PRINTERS = 0x020201B0
TEXT_FLAGS = 0x03003014
AUTO_SCROLL = 0x04
BATTLE_TEXT = 0x02022E2C
BATTLE_TEXT_SIZE = 300
PALETTE_FADE = 0x02037FD4
MAIN_FUNC = 0x03005D04
SCRIPT_PC = 0x02024214
COMMUNICATION = 0x02024332
LEARN_MOVE_STATE = 0x02024474 + 0x1F  # gBattleScripting.learnMoveState
COUNT = 0x0202406C
POSITIONS = 0x02024076
EXEC_FLAGS = 0x02024068
CONTROLLERS = 0x03005D60
TURN = 0x03005D10 + 0x13
SCRIPT_OWNERS = frozenset({0x0803E019, 0x0803E08D})
INPUT_OWNERS = frozenset({0x08057589, 0x08057BFD, 0x08057825, 0x08058139, 0x081593D9, 0x080599D5})
RENDER_STATES = {
    0: "printing",
    1: "button_wait",
    2: "page_wait",
    3: "scroll_wait",
    4: "scrolling",
    5: "audio_wait",
    6: "printing_pause",
}
WAIT_STATES = frozenset({1, 2, 3})
LINE_BREAKS = {0xFA: "\n", 0xFB: "\n", 0xFE: "\n"}
# Opcode -> (kind, whether its state is gBattleScripting.learnMoveState).
PROMPTS: dict[int, tuple[str, bool]] = {
    0x5A: ("learn_move", True),
    0x5B: ("stop_learning_move", True),
    0x67: ("yes_no", False),
    0xF3: ("nickname_caught", False),
}
# Callback-owned handoffs inside a battle: battle_main.c CB2_HandleStartBattle
# and reshow_battle_screen.c CB2_ReshowBattleScreenAfterMenu.
BATTLE_HANDOFFS = frozenset({0x08036FAD, 0x080A933D})
# overworld.c CB2_Overworld: the field is back. Battle entry (the transition,
# CB2_InitBattle) and exit (CB2_ReturnToField*, CB2_WhiteOut) run other callbacks.
CB2_OVERWORLD = 0x08085E5D

# Cmd_drawlvlupbox (battle_script_commands.c:5924). Stats: Cmd_getexp stores the stats before the
# level-up in gBattleResources->beforeLvlUp (STAT_HP, ATK, DEF, SPEED, SPATK, SPDEF); the box reads
# gPlayerParty[gBattleStruct->expGetterMonId] for the new ones (GetMonLevelUpWindowStats).
LEVELUP_BOX_OP = 0x6C
LEVELUP_BOX_STATE = 0x02024474 + 0x1E  # gBattleScripting.drawlvlupboxState (sLVLBOX_STATE)
BATTLE_RESOURCES = 0x020244A8
BATTLE_STRUCT = 0x0202449C
EXP_GETTER = 0x10  # BattleStruct.expGetterMonId
BEFORE_LEVEL_UP = 0x10  # BattleResources.beforeLvlUp
PARTY = 0x020244EC
PARTY_SIZE = 6
PARTY_STATS = 0x58  # max HP, ATK, DEF, SPEED, SPATK, SPDEF: u16 each, the STAT_* order
LEVELUP_STAT_NAMES = 0x08625B54  # sLvlUpStatStrings (menu_specialized.c:1503), the rows' order
# Box rows (DrawLevelUpWindowPg1/2): MAX. HP, ATTACK, DEFENSE, SP. ATK, SP. DEF, SPEED.
ROW_STATS = (0, 1, 2, 4, 5, 3)
LEVELUP_PAGES: dict[int, Literal[1, 2]] = {4: 1, 5: 1, 6: 1, 7: 2, 8: 2}
LEVELUP_WAITS = frozenset({6, 8})

TextPhase = Literal["message_waiting", "input", "prompt", "busy", "screen"]
WaitPhase = Literal["message_waiting", "input", "prompt", "busy", "screen", "field", "levelup_box"]


@dataclass(frozen=True)
class BattleMessage:
    """The battle message window: printing, waiting for A/B, or idle (no text).

    `text` is the whole message; `page` is what the window holds for the printer's
    current page (see page_text), line breaks as spaces.
    """

    state: Literal["printing", "waiting_for_input", "idle"]
    render_state: str | None = None
    text: str | None = None
    cursor: int | None = None
    identity: str | None = None
    diagnostic: str | None = None
    page: str | None = None


@dataclass(frozen=True)
class BattlePrompt:
    kind: str
    ready: bool
    selected: Literal["YES", "NO"] | None


@dataclass(frozen=True)
class LevelUpBox:
    """The level-up stats box while the battle script runs Cmd_drawlvlupbox.

    `page` is the page drawn or shown (1 stat increases, 2 new totals; None while the banner
    slides or the box closes); `waiting` while it waits for a button (states 6 and 8).
    `before`/`after` are in the box's row order, `labels` its row names from the ROM, and
    `text` the shown page's rows, whole.
    """

    state: int
    page: Literal[1, 2] | None
    waiting: bool
    party_slot: int | None = None
    labels: tuple[str, ...] = ()
    before: tuple[int, ...] = ()
    after: tuple[int, ...] = ()
    text: str | None = None
    diagnostic: str | None = None


def _u32(raw: bytes) -> int:
    return int.from_bytes(raw[:4], "little")


def _exact(read: ReadMemory, address: int, length: int) -> bytes:
    value = read(address, length)
    if len(value) != length:
        raise ValueError("short battle text read")
    return value


def decode_battle_text(payload: bytes) -> str:
    return decode_native_text(payload + b"\xff", require_terminator=True, line_breaks=LINE_BREAKS)


# src/text.c RenderText: CHAR_PROMPT_CLEAR (\p) waits then clears the window,
# CHAR_PROMPT_SCROLL (\l) waits then scrolls a line, EXT_CTRL_CODE_PAUSE_UNTIL_PRESS
# (FC 09) waits and printing goes on in place.
PROMPT_CLEAR = 0xFB
PROMPT_SCROLL = 0xFA
PAUSE_UNTIL_PRESS = 0x09


def page_text(raw: bytes, cursor: int, *, waiting: bool = False) -> str:
    """The page the printer is on: the text written since the window was last cleared,
    up to the next wait not yet answered (or the message's end), whole.

    The printer's cursor sits just past a wait byte both while it waits (`waiting`, render
    state 1-3) and for the per-character delay after A/B answered it (state 0, the window
    already cleared for a page break): only the first is the current page's end.

    `raw` is the expanded message with its EOS; control arguments are skipped so an
    argument byte is never taken for a page break.
    """
    start = index = 0
    while True:
        if index >= len(raw):
            raise ValueError("battle message has no terminator")
        byte = raw[index]
        if byte == 0xFF:
            break
        size, wait = 1, byte in (PROMPT_CLEAR, PROMPT_SCROLL)
        if byte == 0xFC:
            if index + 1 >= len(raw) or raw[index + 1] not in CONTROL_ARGS:
                raise ValueError(f"unknown text control at byte {index}")
            size = 2 + CONTROL_ARGS[raw[index + 1]]
            wait = raw[index + 1] == PAUSE_UNTIL_PRESS
        elif byte == 0xF9:
            size = 2
        if wait and (index + size > cursor or (index + size == cursor and waiting)):
            break
        index += size
        if wait and byte == PROMPT_CLEAR:
            start = index
    return decode_battle_text(raw[start:index]).replace("\n", " ").strip()


def _printer_cursor(printer: bytes) -> int | None:
    """Bytes of gDisplayedStringBattle consumed, when printer 0 is active on it."""
    cursor = _u32(printer) - BATTLE_TEXT
    if printer[0x1B] != 1 or printer[4] != 0 or not 0 <= cursor <= BATTLE_TEXT_SIZE:
        return None
    return cursor


def _waits(read: ReadMemory, printer: bytes) -> bool:
    return printer[0x1C] in WAIT_STATES and not _exact(read, TEXT_FLAGS, 1)[0] & AUTO_SCROLL


def read_battle_message(read: ReadMemory) -> BattleMessage:
    printer = _exact(read, PRINTERS, 0x24)
    cursor = _printer_cursor(printer)
    if cursor is None:
        return BattleMessage("idle")
    render = RENDER_STATES.get(printer[0x1C])
    state: Literal["printing", "waiting_for_input"] = (
        "waiting_for_input" if _waits(read, printer) else "printing"
    )
    try:
        if render is None:
            raise ValueError(f"unknown text printer state {printer[0x1C]}")
        payload = native_text_payload(_exact(read, BATTLE_TEXT, BATTLE_TEXT_SIZE))
        if cursor > len(payload) + 1:
            raise ValueError("printer cursor is past the message's end")
        return BattleMessage(
            state,
            render,
            decode_battle_text(payload),
            cursor,
            sha256(payload).hexdigest(),
            # An answered final page leaves nothing on the window: no page.
            page=page_text(payload + b"\xff", cursor, waiting=printer[0x1C] in WAIT_STATES) or None,
        )
    except (ValueError, IndexError, KeyError) as error:
        return BattleMessage(
            state, render, None, cursor, None, f"harness bug: battle text: {error}"
        )


def _script_running(read: ReadMemory, finish_battle: bool) -> bool:
    """The battle script runs this frame: under a script runner or, with caught-nickname-prompt-v1
    (`finish_battle`), under HandleEndTurn_FinishBattle running a script action."""
    main = _u32(_exact(read, MAIN_FUNC, 4))
    if main in SCRIPT_OWNERS:
        return True
    return (
        finish_battle and main == FINISH_BATTLE and _exact(read, ACTION_FUNC, 1)[0] == EXEC_SCRIPT
    )


def read_battle_prompt(read: ReadMemory, *, finish_battle: bool = False) -> BattlePrompt | None:
    if not _script_running(read, finish_battle):
        return None
    script = _u32(_exact(read, SCRIPT_PC, 4))
    if not 0x08000000 <= script < 0x0A000000:
        return None
    prompt = PROMPTS.get(_exact(read, script, 1)[0])
    if prompt is None:
        return None
    kind, learning = prompt
    communication = _exact(read, COMMUNICATION, 2)
    state = _exact(read, LEARN_MOVE_STATE, 1)[0] if learning else communication[0]
    ready = state == 1 and communication[1] in (0, 1)
    selected: Literal["YES", "NO"] | None = ("YES", "NO")[communication[1]] if ready else None
    return BattlePrompt(kind, ready, selected)


def _ewram_pointer(read: ReadMemory, address: int, what: str) -> int:
    pointer = _u32(_exact(read, address, 4))
    if not 0x02000000 <= pointer < 0x02040000:
        raise ValueError(f"{what} pointer {pointer:#x} is outside EWRAM")
    return pointer


def _u16s(read: ReadMemory, address: int) -> tuple[int, ...]:
    raw = _exact(read, address, 12)
    return tuple(int.from_bytes(raw[i : i + 2], "little") for i in range(0, 12, 2))


def _levelup_stats(
    read: ReadMemory, page: Literal[1, 2]
) -> tuple[int, tuple[str, ...], tuple[int, ...], tuple[int, ...], str]:
    slot = _exact(read, _ewram_pointer(read, BATTLE_STRUCT, "gBattleStruct") + EXP_GETTER, 1)[0]
    if slot >= PARTY_SIZE:
        raise ValueError(f"exp getter party slot {slot} is out of range")
    stored = _ewram_pointer(read, BATTLE_RESOURCES, "gBattleResources") + BEFORE_LEVEL_UP
    before_all = _u16s(read, _ewram_pointer(read, stored, "beforeLvlUp"))
    after_all = _u16s(read, PARTY + 100 * slot + PARTY_STATS)
    labels = []
    for row in range(len(ROW_STATS)):
        name = _u32(_exact(read, LEVELUP_STAT_NAMES + 4 * row, 4))
        if not 0x08000000 <= name < 0x0A000000:
            raise ValueError(f"stat name pointer {name:#x} is outside the ROM")
        labels.append(decode_native_text(_exact(read, name, 12), require_terminator=True))
    before = tuple(before_all[i] for i in ROW_STATS)
    after = tuple(after_all[i] for i in ROW_STATS)
    if page == 1:
        # DrawLevelUpWindowPg1: "+" for a difference >= 0, else "-", then its absolute value.
        rows = [
            f"{label} {'+' if a - b >= 0 else '-'}{abs(a - b)}"
            for label, b, a in zip(labels, before, after, strict=True)
        ]
    else:
        rows = [f"{label} {a}" for label, a in zip(labels, after, strict=True)]
    return slot, tuple(labels), before, after, ", ".join(rows)


def read_levelup_box(read: ReadMemory) -> LevelUpBox | None:
    if _u32(_exact(read, MAIN_FUNC, 4)) not in SCRIPT_OWNERS:
        return None
    script = _u32(_exact(read, SCRIPT_PC, 4))
    if not 0x08000000 <= script < 0x0A000000 or _exact(read, script, 1)[0] != LEVELUP_BOX_OP:
        return None
    state = _exact(read, LEVELUP_BOX_STATE, 1)[0]
    page = LEVELUP_PAGES.get(state)
    box = LevelUpBox(state, page, state in LEVELUP_WAITS)
    if page is None:
        return box
    try:
        slot, labels, before, after, text = _levelup_stats(read, page)
    except (ValueError, IndexError, KeyError, OSError) as error:
        return replace(box, diagnostic=f"harness bug: level-up box: {error}")
    return replace(box, party_slot=slot, labels=labels, before=before, after=after, text=text)


def battle_input_ready(read: ReadMemory) -> bool:
    count = _exact(read, COUNT, 1)[0]
    if count not in (2, 4):
        return False
    positions = _exact(read, POSITIONS, count)
    flags = _u32(_exact(read, EXEC_FLAGS, 4))
    controllers = _exact(read, CONTROLLERS, 16)
    return any(
        not position & 1 and flags & (1 << index) and _u32(controllers[index * 4 :]) in INPUT_OWNERS
        for index, position in enumerate(positions)
    )


def battle_text_phase(read: ReadMemory, *, finish_battle: bool = False) -> TextPhase:
    """Inside a battle: what the battle text advance does next."""
    callback = _u32(_exact(read, GMAIN + 4, 4))
    if callback in BATTLE_HANDOFFS:
        return "busy"
    if callback != BATTLE_MAIN_CB2:
        return "screen"
    prompt = read_battle_prompt(read, finish_battle=finish_battle)
    if prompt is not None and prompt.ready:
        return "prompt"
    if battle_input_ready(read):
        return "input"
    printer = _exact(read, PRINTERS, 0x24)
    if _printer_cursor(printer) is not None and _waits(read, printer):
        return "message_waiting"
    return "busy"


def wait_phase(
    read: ReadMemory, *, levelup_box: bool = False, finish_battle: bool = False
) -> WaitPhase:
    """Any screen: "busy" while a battle (or its entry or exit) runs on its own.

    levelup-box-v1 (`levelup_box`): a level-up stats box waiting for a button ends the wait.
    caught-nickname-prompt-v1 (`finish_battle`): see read_battle_prompt.
    """
    if _exact(read, IN_BATTLE, 1)[0] & 2:
        phase: WaitPhase = battle_text_phase(read, finish_battle=finish_battle)
        if phase == "busy" and levelup_box:
            box = read_levelup_box(read)
            if box is not None and box.waiting:
                return "levelup_box"
        return phase
    if _exact(read, PALETTE_FADE + 7, 1)[0] & 0x80:
        return "busy"
    return "field" if _u32(_exact(read, GMAIN + 4, 4)) == CB2_OVERWORLD else "busy"


@dataclass
class _Open:
    payload: bytes
    battle_turn: int
    cut: int = 0
    cursor: int = 0
    waiting: bool = False


class BattleTextJournal:
    """Every page printed in the battle message window, recorded per emulated frame.

    A page ends where the printer waits for A/B, or at the message's end when the
    printer finishes on its own. Entries are a bounded ring: readers pass the last
    id they saw and detect a gap from `first_id`.
    """

    def __init__(self, capacity: int = 512, clock: Callable[[], float] = time.time) -> None:
        self.lock = threading.RLock()
        self.capacity = capacity
        self.clock = clock
        self.frame = 0
        self.battle = 0
        self.in_battle = False
        self.open: _Open | None = None
        self.entries: deque[dict[str, object]] = deque()
        self.last_id = 0
        self.errors = 0
        self.last_error: str | None = None

    def advance(self, read: ReadMemory) -> None:
        with self.lock:
            self.frame += 1
            try:
                self._observe(read)
            except (ValueError, IndexError, KeyError) as error:
                self.open = None
                self.errors += 1
                self.last_error = f"harness bug: battle text journal: {error}"

    def _observe(self, read: ReadMemory) -> None:
        if not _exact(read, IN_BATTLE, 1)[0] & 2:
            self._close()
            self.in_battle = False
            return
        if not self.in_battle:
            self.battle += 1
            self.in_battle = True
        printer = _exact(read, PRINTERS, 0x24)
        cursor = _printer_cursor(printer)
        if cursor is None or _u32(_exact(read, GMAIN + 4, 4)) != BATTLE_MAIN_CB2:
            self._close()
            return
        # A new message: the printer restarted, or the buffer holds other text
        # (back-to-back messages can replace it without an idle frame between).
        if self.open is not None and (
            cursor < self.open.cursor
            or _exact(read, BATTLE_TEXT, len(self.open.payload) + 1) != self.open.payload + b"\xff"
        ):
            self._close()
        if self.open is None:
            payload = native_text_payload(_exact(read, BATTLE_TEXT, BATTLE_TEXT_SIZE))
            self.open = _Open(payload, _exact(read, TURN, 1)[0] + 1)
        message = self.open
        if cursor > len(message.payload) + 1:
            raise ValueError("printer cursor is past the message's end")
        message.cursor = cursor
        waits = _waits(read, printer)
        if waits and not message.waiting and cursor > message.cut:
            self._page(message, message.payload[message.cut : cursor], waited=True)
            message.cut = cursor
        message.waiting = waits

    def _close(self) -> None:
        message, self.open = self.open, None
        if message is not None and message.cut < len(message.payload):
            self._page(message, message.payload[message.cut :], waited=False)

    def _page(self, message: _Open, payload: bytes, *, waited: bool) -> None:
        text = decode_battle_text(payload).strip()
        if not text:
            return
        self.last_id += 1
        self.entries.append(
            {
                "id": self.last_id,
                "frame": self.frame,
                "recorded_ms": round(self.clock() * 1000),
                "battle": self.battle,
                "battle_turn": message.battle_turn,
                "text": text,
                "waited_for_input": waited,
            }
        )
        while len(self.entries) > self.capacity:
            self.entries.popleft()

    def snapshot(self, after: int) -> dict[str, object]:
        with self.lock:
            if not 0 <= after <= self.last_id:
                raise ValueError("battle text journal cursor out of range")
            first = cast(int, self.entries[0]["id"]) if self.entries else self.last_id + 1
            return {
                "frame": self.frame,
                "first_id": first,
                "last_id": self.last_id,
                "errors": self.errors,
                "last_error": self.last_error,
                "entries": [entry for entry in self.entries if cast(int, entry["id"]) > after],
            }


T = TypeVar("T")
WaitReason = Literal[
    "message_waiting", "input", "prompt", "screen", "field", "levelup_box", "bound", "paused"
]
# About 10 s at 60 frames/s; the agent fetches with a longer timeout.
WAIT_BOUND_FRAMES = 600


class _Waiter:
    def __init__(self, capture: Callable[[], object], bound: int) -> None:
        self.capture = capture
        self.bound = bound
        self.frames = 0
        self.reason: WaitReason = "bound"
        self.done = threading.Event()
        self.released = False
        self.result: object = None
        self.error: Exception | None = None


class BattleWait:
    """Hold a state capture until the first emulated frame where the battle needs
    input (a waiting message, an input or YES/NO owner), leaves the battle screen,
    or returns to the field; or until a frame bound. With levelup-box-v1 a level-up stats box
    waiting for a button also ends it."""

    def __init__(
        self, read: ReadMemory, *, levelup_box: bool = False, finish_battle: bool = False
    ) -> None:
        self.read = read
        self.levelup_box = levelup_box
        self.finish_battle = finish_battle
        self._lock = threading.Lock()
        self._waiters: list[_Waiter] = []
        self._parked = False

    def on_frame(self) -> None:
        """After each emulated frame; the vendor holds its memory lock."""
        with self._lock:
            self._parked = False
            if not self._waiters:
                return
            try:
                phase: WaitPhase = wait_phase(
                    self.read, levelup_box=self.levelup_box, finish_battle=self.finish_battle
                )
            except (ValueError, IndexError) as error:
                for waiter in self._waiters:
                    waiter.error = error
                    waiter.done.set()
                self._waiters = []
                return
            waiting = []
            for waiter in self._waiters:
                waiter.frames += 1
                if phase == "busy" and waiter.frames < waiter.bound:
                    waiting.append(waiter)
                    continue
                waiter.reason = "bound" if phase == "busy" else phase
                try:
                    waiter.result = waiter.capture()
                except Exception as error:  # noqa: BLE001 - re-raised on the caller's thread
                    waiter.error = error
                waiter.done.set()
            self._waiters = waiting

    def park(self) -> None:
        with self._lock:
            self._parked = True
            for waiter in self._waiters:
                waiter.released = True
                waiter.done.set()
            self._waiters = []

    def resume(self) -> None:
        with self._lock:
            self._parked = False

    def wait(
        self,
        capture: Callable[[], T],
        memory_lock: AbstractContextManager[object],
        bound_frames: int = WAIT_BOUND_FRAMES,
    ) -> tuple[T, WaitReason, int]:
        with memory_lock:
            with self._lock:
                if self._parked:
                    return capture(), "paused", 0
                phase = wait_phase(
                    self.read, levelup_box=self.levelup_box, finish_battle=self.finish_battle
                )
                if phase != "busy":
                    return capture(), phase, 0
                waiter = _Waiter(capture, bound_frames)
                self._waiters.append(waiter)
        waiter.done.wait()
        if waiter.released:
            with memory_lock:
                return capture(), "paused", waiter.frames
        if waiter.error is not None:
            raise waiter.error
        return cast(T, waiter.result), waiter.reason, waiter.frames


class SteppedEmulator(Protocol):
    run_frame_with_buttons: Callable[..., None]


def install_battle_text(
    api: FastAPI, emulator: type[SteppedEmulator], read: ReadMemory
) -> BattleTextJournal:
    journal = BattleTextJournal()
    step = emulator.run_frame_with_buttons

    def step_recording(self: SteppedEmulator, buttons: list[str]) -> None:
        # Vendor step_environment already owns memory_lock around this method.
        step(self, buttons)
        journal.advance(read)

    emulator.run_frame_with_buttons = step_recording

    @api.get("/pokebench/battle/messages")
    def messages(after: int = Query(default=0, ge=0)) -> dict[str, object]:
        try:
            return journal.snapshot(after)
        except ValueError as error:
            raise HTTPException(409, str(error)) from error

    return journal


def install_battle_wait(emulator: type[SteppedEmulator], wait: BattleWait) -> None:
    step = emulator.run_frame_with_buttons

    def step_waiting(self: SteppedEmulator, buttons: list[str]) -> None:
        step(self, buttons)
        wait.on_frame()

    emulator.run_frame_with_buttons = step_waiting
