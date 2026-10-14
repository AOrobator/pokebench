"""Frame-owned turn commits, independent of controller/poll/screenshot cadence.

Exact US ROM owners and semantics: docs/findings/battle-choices.md.
This records a committed choice, never a claim that the attack executed/hit.
"""

import threading
import time
from collections import deque
from collections.abc import Callable
from typing import Protocol, cast

from fastapi import FastAPI, HTTPException, Query

from pokebench_env.game_screen import ReadMemory
from pokebench_env.gba_text import decode_text

IN_BATTLE = 0x030026F9
MAIN_FUNC = 0x03005D04
SELECT_ACTION = 0x0803BE75
COMMIT_ACTION = 0x0803D2E9
COUNT = 0x0202406C
POSITIONS = 0x02024076
PARTY_INDEXES = 0x0202406E
MONS = 0x02024084
COMMUNICATION = 0x02024332
ACTIONS = 0x0202421C
CHOSEN_MOVES = 0x02024274
BATTLE_STRUCT = 0x0202449C
BUFFER_B = 0x02023864
RESULTS = 0x03005D10
TYPE_FLAGS = 0x02022FEC
MOVE_NAMES = 0x0831977C
SPECIES_NAMES = 0x083185C8


def exact(read: ReadMemory, address: int, length: int) -> bytes:
    value = read(address, length)
    if len(value) != length:
        raise ValueError("short battle choice read")
    return value


def number(read: ReadMemory, address: int, length: int = 4) -> int:
    return int.from_bytes(exact(read, address, length), "little")


def battler(read: ReadMemory, index: int, position: int) -> dict[str, object]:
    body = exact(read, MONS + index * 0x58, 0x58)
    species = int.from_bytes(body[:2], "little")
    hp = int.from_bytes(body[0x28:0x2A], "little")
    maximum = int.from_bytes(body[0x2C:0x2E], "little")
    level = body[0x2A]
    party_slot = number(read, PARTY_INDEXES + 2 * index, 2)
    if (
        not 1 <= species <= 411
        or not 1 <= level <= 100
        or not 0 <= hp <= maximum
        or maximum == 0
        or party_slot > 5
    ):
        raise ValueError("invalid battle battler")
    name = decode_text(exact(read, SPECIES_NAMES + species * 11, 11))
    return {
        "battler": index,
        "position": position,
        "party_slot": party_slot,
        "species_id": species,
        "species": name,
        "level": level,
        "hp": hp,
        "max_hp": maximum,
        "identity": (
            f"{int.from_bytes(body[0x48:0x4C], 'little'):08x}:"
            f"{int.from_bytes(body[0x54:0x58], 'little'):08x}"
        ),
    }


class BattleJournal:
    def __init__(self, capacity: int = 4096, clock: Callable[[], float] = time.time) -> None:
        self.lock = threading.RLock()
        self.capacity = capacity
        self.clock = clock
        self.frame = 0
        self.battle = 0
        self.active = False
        self.committed = False
        self.phases: list[int] = []
        self.pending: dict[int, dict[str, object]] = {}
        self.entries: deque[dict[str, object]] = deque()
        self.last_id = 0
        self.acked = 0
        self.error: str | None = None

    def advance(self, read: ReadMemory) -> None:
        with self.lock:
            self.frame += 1
            if self.error is not None:
                return
            try:
                self._observe(read)
            except (ValueError, IndexError) as error:
                self.error = str(error)

    def _observe(self, read: ReadMemory) -> None:
        active = bool(number(read, IN_BATTLE, 1) & 2)
        if not active:
            self.active = False
            self.committed = False
            self.pending.clear()
            self.phases = []
            return
        if not self.active:
            self.battle += 1
            self.active = True
        owner = number(read, MAIN_FUNC)
        if owner not in (SELECT_ACTION, COMMIT_ACTION):
            self.committed = False
            self.pending.clear()
            self.phases = []
            return
        count = number(read, COUNT, 1)
        if count not in (2, 4):
            raise ValueError("invalid battle count")
        positions = list(exact(read, POSITIONS, count))
        if len(set(positions)) != count or any(pos > 3 for pos in positions):
            raise ValueError("invalid battler positions")
        struct = number(read, BATTLE_STRUCT)
        if struct % 4 or not 0x02000000 <= struct <= 0x02040000 - 0x94:
            raise ValueError("invalid battle struct pointer")
        phases = list(exact(read, COMMUNICATION, count))
        flags = number(read, TYPE_FLAGS)
        if owner == SELECT_ACTION:
            self.committed = False
            for index, pos in enumerate(positions):
                if pos & 1:
                    continue
                phase = phases[index]
                if phase in (0, 1, 2, 6, 7, 8):
                    self.pending.pop(index, None)
                elif phase == 4 and len(self.phases) == count and self.phases[index] == 3:
                    self.pending[index] = self._choice(
                        read, struct, positions, index, flags, selected=True
                    )
            self.phases = phases
            return
        if self.committed:
            return
        if any(phase != 5 for phase in phases):
            raise ValueError("turn commit without all confirmed actions")
        choices = []
        for index, pos in enumerate(positions):
            if not pos & 1:
                choice = self.pending.get(index)
                if choice is None:
                    choice = self._choice(read, struct, positions, index, flags, selected=False)
                choices.append(choice)
        if len(self.entries) + len(choices) > self.capacity:
            raise ValueError("battle journal full; choices cannot be recorded")
        turn = number(read, RESULTS + 0x13, 1) + 1
        stamp = round(self.clock() * 1000)
        for choice in choices:
            self.last_id += 1
            self.entries.append(
                {
                    "id": self.last_id,
                    "frame": self.frame,
                    "recorded_ms": stamp,
                    "battle": self.battle,
                    "battle_turn": turn,
                    **choice,
                    "source": {"main_func": owner, "communication": phases, "battle_type": flags},
                }
            )
        self.committed = True
        self.pending.clear()

    def _choice(
        self,
        read: ReadMemory,
        struct: int,
        positions: list[int],
        index: int,
        flags: int,
        *,
        selected: bool,
    ) -> dict[str, object]:
        action = number(read, ACTIONS + index, 1)
        kinds = {0: "move", 1: "item", 2: "switch", 3: "run"}
        safari = bool(flags & 0x80)
        if safari:
            kinds.update(
                {
                    4: "safari_watch_carefully",
                    5: "safari_ball",
                    6: "safari_pokeblock",
                    7: "safari_go_near",
                    8: "safari_run",
                }
            )
            if (
                len(positions) != 2
                or positions[index] & 1
                or any(exact(read, MONS + index * 0x58, 0x58))
            ):
                raise ValueError("invalid Safari trainer bank")
            if action not in (4, 5, 6, 7, 8):
                raise ValueError("invalid Safari trainer action")
        move: dict[str, object] | None = None
        target: dict[str, object] | None = None
        item: int | None = None
        switch: int | None = None
        if action == 0 and selected:
            slot = number(read, struct + 0x80 + index, 1)
            move_id = number(read, CHOSEN_MOVES + 2 * index, 2)
            target_index = number(read, struct + 0xC + index, 1)
            if slot > 3 or not 1 <= move_id <= 354 or target_index >= len(positions):
                raise ValueError("invalid committed move")
            body = exact(read, MONS + index * 0x58, 0x58)
            if int.from_bytes(body[0xC + 2 * slot : 0xE + 2 * slot], "little") != move_id:
                raise ValueError("chosen move does not match battler moves")
            move = {
                "id": move_id,
                "name": decode_text(exact(read, MOVE_NAMES + move_id * 13, 13)),
                "slot": slot,
                "pp": body[0x24 + slot],
            }
            target = battler(read, target_index, positions[target_index])
        elif action == 1 and selected:
            item = number(read, BUFFER_B + index * 0x200 + 1, 2)
            if item == 0 or item > 376:
                raise ValueError("invalid selected item")
        elif action == 2:
            switch = number(read, struct + 0x5C + index, 1)
            if switch > 5:
                raise ValueError("invalid switch party slot")
        origin = "selected" if selected else "automatic"
        if flags & ((1 << 9) | (1 << 24)) or (positions[index] == 2 and flags & (1 << 22)):
            origin = "scripted"
        elif selected and flags & 2:
            controller = number(read, 0x03005D60 + index * 4)
            if not 0x08000001 <= controller < 0x0A000000 or not controller & 1:
                raise ValueError("invalid selected link battle controller")
            if controller != 0x08057505:
                origin = "remote"
        safari_block = None
        if safari and action == 6 and selected:
            preference, color = exact(read, BUFFER_B + index * 0x200 + 1, 2)
            if preference not in (1, 2, 3) or color > 14:
                raise ValueError("invalid selected Safari Pokeblock receipt")
            safari_block = {"preference_code": preference, "color": color}
        return {
            **({"safari_pokeblock": safari_block} if safari and action == 6 else {}),
            "action": kinds.get(action, "other"),
            "action_id": action,
            "origin": origin,
            "actor": {"kind": "trainer", "battler": index, "position": positions[index]}
            if safari
            else battler(read, index, positions[index]),
            "move": move,
            "target": target,
            "item_id": item,
            "switch_party_slot": switch,
        }

    def snapshot(self, after: int) -> dict[str, object]:
        with self.lock:
            if self.error is not None:
                raise ValueError(self.error)
            if after < self.acked or after > self.last_id:
                raise ValueError("battle journal cursor out of range")
            while self.entries and cast(int, self.entries[0]["id"]) <= after:
                self.entries.popleft()
            self.acked = after
            return {"frame": self.frame, "last_id": self.last_id, "entries": list(self.entries)}


class FrameEmulator(Protocol):
    run_frame_with_buttons: Callable[..., None]


def install_battle_journal(
    api: FastAPI, emulator: type[FrameEmulator], read: ReadMemory
) -> BattleJournal:
    journal = BattleJournal()
    step = emulator.run_frame_with_buttons

    def step_recording(self: FrameEmulator, buttons: list[str]) -> None:
        # Vendor step_environment already owns memory_lock around this method.
        step(self, buttons)
        journal.advance(read)

    emulator.run_frame_with_buttons = step_recording

    @api.get("/pokebench/battle/choices")
    def choices(after: int = Query(default=0, ge=0)) -> dict[str, object]:
        try:
            return journal.snapshot(after)
        except ValueError as error:
            raise HTTPException(503, str(error)) from error

    return journal
