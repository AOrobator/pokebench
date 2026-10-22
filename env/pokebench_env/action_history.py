"""Frame-owned native action history; selection is distinct from completion.

The journal snapshots only Pokémon/resources/menu owners, not expensive world
maps. Consumers acknowledge only after durable recording; overflow is fatal.
"""

import struct
import threading
import time
from collections import deque
from collections.abc import Callable
from dataclasses import dataclass
from typing import Protocol, TypedDict

from fastapi import FastAPI, HTTPException, Query

from pokebench_env.battle_state import BattleState, read_battle_state
from pokebench_env.game_screen import ReadMemory, read_screen
from pokebench_env.game_state import (
    OBJECT_EVENTS,
    PARTY,
    PARTY_COUNT,
    PLAYER_AVATAR,
    PRE_GAME,
    SAVE_BLOCK_PTRS,
)
from pokebench_env.menus import MenuValue
from pokebench_env.party_ownership import PartyOwnership, read_party_ownership
from pokebench_env.pokemon import PartyMon, decode_party_mon, pokemon_cpu_context
from pokebench_env.resources import Resources, read_resources
from pokebench_env.storage_cache import StorageDecodeCache
from pokebench_env.transition_coherence import BUSY_LIMIT, diagnostic_kind, main_loop_idle
from pokebench_env.ui_state import ActiveUi, read_active_ui

Scalar = str | int | float | bool | None
Details = dict[str, MenuValue]


class NativeEntry(TypedDict):
    id: int
    frame: int
    server_timestamp: float
    kind: str
    details: Details


@dataclass(frozen=True)
class ActionFrame:
    party: tuple[PartyMon, ...] | None
    resources: Resources | None
    captures: int | None
    ui: ActiveUi | None
    party_owner: str = "player"
    battle: BattleState | None = None
    ownership: PartyOwnership | None = None


def read_action_frame(
    read: ReadMemory,
    *,
    include_storage: bool = True,
    storage_cache: StorageDecodeCache | None = None,
    tutorial_owner_enabled: bool = False,
    evolution_decision: bool = False,
    battle_move_learn_input: bool = False,
) -> ActionFrame:
    battle = read_battle_state(read, tutorial_owner_enabled=tutorial_owner_enabled)
    screen = read_screen(read)
    ui = read_active_ui(
        read,
        screen,
        tutorial_owner_enabled=tutorial_owner_enabled,
        evolution_decision=evolution_decision,
        battle_move_learn_input=battle_move_learn_input,
    )
    if evolution_decision:
        from pokebench_env.evolution_decision import decision_ui

        ui = decision_ui(ui, read)
    if screen.kind in PRE_GAME and screen.kind != "naming":
        return ActionFrame(None, None, None, ui, battle=battle)
    index = read(PLAYER_AVATAR + 5, 1)[0]
    flags = read(OBJECT_EVENTS + 0x24 * index, 3) if index < 16 else bytes(3)
    if not (flags[0] & 1 and flags[2] & 1):
        return ActionFrame(None, None, None, ui, battle=battle)
    if screen.kind == "naming" and (
        ui is None or not ui.details or ui.details.get("naming_owner") == "player"
    ):
        return ActionFrame(None, None, None, ui, battle=battle)
    save1, save2 = struct.unpack("<II", read(SAVE_BLOCK_PTRS, 8))
    if not (
        0x02000000 <= save1 <= 0x02040000 - 0x1A9C
        and save1 % 4 == 0
        and 0x02000000 <= save2 <= 0x02040000 - 0xB0
        and save2 % 4 == 0
    ):
        return ActionFrame(None, None, None, ui, battle=battle)
    count = read(PARTY_COUNT, 1)[0]
    if count > 6:
        raise ValueError("harness bug: invalid party count")
    raw = read(PARTY, count * 100)
    cpu = pokemon_cpu_context(read)
    party = tuple(
        decode_party_mon(
            raw[i * 100 : (i + 1) * 100],
            read,
            address=PARTY + i * 100,
            cpu=cpu,
            empty_move_pp=tutorial_owner_enabled,
        )
        for i in range(count)
    )
    resources = read_resources(
        read, save1, save2, include_storage=include_storage, storage_cache=storage_cache
    )
    key = int.from_bytes(read(save2 + 0xAC, 4), "little")
    captures = int.from_bytes(read(save1 + 0x159C + 11 * 4, 4), "little") ^ key
    battle_flags = (
        int.from_bytes(read(0x02022FEC, 4), "little") if read(0x030026F9, 1)[0] & 2 else 0
    )
    ownership = read_party_ownership(read, party)
    owner = "tutorial" if battle_flags & (1 << 9) else ownership.owner or "unknown"
    return ActionFrame(
        party, resources, captures if captures <= 0xFFFFFF else None, ui, owner, battle, ownership
    )


def _ui_key(ui: ActiveUi | None) -> tuple[object, ...] | None:
    if ui is None:
        return None
    details = {
        key: value
        for key, value in (ui.details or {}).items()
        if key not in {"task_ids", "task_functions", "task_data", "callback2", "owner_task"}
    }
    return (ui.phase, ui.selected, ui.ready, ui.value, repr(details), ui.diagnostic)


def _pokemon(frame: ActionFrame) -> dict[str, tuple[PartyMon, str, int, int | None]]:
    entries: list[tuple[PartyMon, str, int, int | None]] = [
        (mon, "party", slot, None)
        for slot, mon in enumerate((frame.party or ()) if frame.party_owner == "player" else ())
    ]
    if frame.resources and frame.resources.storage is not None:
        entries.extend(
            (entry.pokemon, "box", entry.slot, entry.box)
            for entry in frame.resources.storage.occupied
        )
    if frame.resources and frame.resources.daycare is not None:
        entries.extend(
            (entry.pokemon, "daycare", entry.slot, None) for entry in frame.resources.daycare
        )
    result: dict[str, tuple[PartyMon, str, int, int | None]] = {}
    duplicate: set[str] = set()
    for entry in entries:
        mon = entry[0]
        if mon.identity is None or mon.diagnostic is not None:
            continue
        if mon.identity in result:
            duplicate.add(mon.identity)
        result[mon.identity] = entry
    return {key: value for key, value in result.items() if key not in duplicate}


def _bag(resources: Resources) -> dict[int, int] | None:
    if resources.bag is None:
        return None
    result: dict[int, int] = {}
    for item in resources.bag:
        result[item.item_id] = result.get(item.item_id, 0) + item.quantity
    return result


class NativeActionJournal:
    def __init__(
        self,
        capacity: int = 16384,
        clock: Callable[[], float] = time.time,
        *,
        tutorial_owner_enabled: bool = False,
        evolution_decision: bool = False,
        battle_move_learn_input: bool = False,
    ) -> None:
        self.battle_move_learn_input = battle_move_learn_input
        self.evolution_decision = evolution_decision
        self.tutorial_owner_enabled = tutorial_owner_enabled
        self.lock = threading.RLock()
        self.capacity = capacity
        self.clock = clock
        self.frame = 0
        self.last_id = 0
        self.acked = 0
        self.entries: deque[NativeEntry] = deque()
        self.previous: ActionFrame | None = None
        self.error: str | None = None
        self.pending_captures = 0
        self.last_captures: int | None = None
        self.valid_mons: dict[str, tuple[PartyMon, str, int, int | None]] = {}
        self.known_owned: set[str] = set()
        self.storage_cache = StorageDecodeCache()
        self.diagnostics: set[str] = set()
        self.last_buttons: tuple[str, ...] | None = None
        self.battle_signals: set[tuple[object, ...]] = set()
        # A battle that became active but has not yet decoded as itself (battle_started waits).
        self.battle_pending: Details | None = None
        self.busy_frames = 0

    def _emit(self, kind: str, details: Details) -> None:
        if len(self.entries) >= self.capacity:
            raise ValueError("native action journal overflow; recording cannot continue")
        self.last_id += 1
        self.entries.append(
            {
                "id": self.last_id,
                "frame": self.frame,
                "server_timestamp": self.clock(),
                "kind": kind,
                "details": details,
            }
        )

    def observe(self, current: ActionFrame) -> None:
        previous = self.previous
        if current.ownership:
            self.known_owned.update(current.ownership.original_identities)
            if current.ownership.diagnostic:
                self._diagnostic(
                    "party_ownership", current.ownership.diagnostic, current.ownership.raw_hex
                )
        self._battle(None if previous is None else previous.battle, current.battle)
        for mon in current.party or ():
            if mon.diagnostic:
                self._diagnostic("pokemon", mon.diagnostic, mon.raw_hex)
            if mon.nickname_diagnostic:
                self._diagnostic("pokemon_nickname", mon.nickname_diagnostic, mon.raw_hex)
        if current.resources:
            for issue in current.resources.diagnostics:
                self._diagnostic(issue.owner, issue.message, issue.raw_hex)
        if current.ui and current.ui.diagnostic:
            self._diagnostic("menu", current.ui.diagnostic, None)
        if previous is not None and _ui_key(previous.ui) != _ui_key(current.ui):
            ui = current.ui
            self._emit(
                "menu_changed",
                {
                    "phase": None if ui is None else ui.phase,
                    "selected": None if ui is None else ui.selected,
                    "ready": None if ui is None else ui.ready,
                    **({} if ui is None else ui.details or {}),
                },
            )
        if current.captures is not None:
            if self.last_captures is not None:
                if current.captures < self.last_captures:
                    self.pending_captures = 0
                else:
                    self.pending_captures += current.captures - self.last_captures
            self.last_captures = current.captures
        now = _pokemon(current)
        for identity, (mon, destination, slot, box) in now.items():
            old = self.valid_mons.get(identity)
            common: Details = {
                "identity": identity,
                "species": mon.species,
                "species_id": mon.species_id,
                "destination": destination,
                "slot": slot,
                "box": box,
            }
            if old is None:
                if (
                    identity not in self.known_owned
                    and previous is not None
                    and previous.party is not None
                ):
                    captured = self.pending_captures > 0
                    self._emit("pokemon_captured" if captured else "pokemon_acquired", common)
                    if captured:
                        self.pending_captures -= 1
            else:
                before, old_destination, old_slot, old_box = old
                for attribute, kind in (
                    ("species_id", "pokemon_evolved"),
                    ("is_egg", "pokemon_egg_changed"),
                    ("level", "pokemon_level_changed"),
                    ("hp", "pokemon_hp_changed"),
                    ("max_hp", "pokemon_max_hp_changed"),
                    ("experience", "pokemon_experience_changed"),
                ):
                    old_value = getattr(before, attribute)
                    new_value = getattr(mon, attribute)
                    if old_value is not None and new_value is not None and old_value != new_value:
                        self._emit(kind, {**common, "before": old_value, "after": new_value})
                if (destination, slot, box) != (old_destination, old_slot, old_box):
                    self._emit(
                        "pokemon_moved",
                        {
                            **common,
                            "from_destination": old_destination,
                            "from_slot": old_slot,
                            "from_box": old_box,
                        },
                    )
                if before.moves is not None and mon.moves is not None:
                    old_moves = {move.move_id: move for move in before.moves if move.move_id}
                    new_moves = {move.move_id: move for move in mon.moves if move.move_id}
                    for move_id in old_moves.keys() & new_moves.keys():
                        old_move, new_move = old_moves[move_id], new_moves[move_id]
                        if old_move.pp != new_move.pp:
                            self._emit(
                                "pokemon_pp_changed",
                                {
                                    **common,
                                    "move_id": move_id,
                                    "move_name": new_move.name,
                                    "before": old_move.pp,
                                    "after": new_move.pp,
                                },
                            )
                    for move_id in new_moves.keys() - old_moves.keys():
                        self._emit(
                            "move_learned",
                            {
                                **common,
                                "move_id": move_id,
                                "move_name": new_moves[move_id].name,
                                "before_moves": list(old_moves),
                                "after_moves": list(new_moves),
                            },
                        )
                    for move_id in old_moves.keys() - new_moves.keys():
                        self._emit(
                            "move_forgotten",
                            {**common, "move_id": move_id, "move_name": old_moves[move_id].name},
                        )
                if mon.held_item != before.held_item:
                    self._emit(
                        "held_item_changed",
                        {
                            **common,
                            "before": before.held_item,
                            "after": mon.held_item,
                            "item_name": mon.held_item_name,
                        },
                    )
                if (
                    mon.status != before.status
                    and mon.status is not None
                    and before.status is not None
                ):
                    self._emit(
                        "status_changed", {**common, "before": before.status, "after": mon.status}
                    )
            self.valid_mons[identity] = (mon, destination, slot, box)
            self.known_owned.add(identity)
        if previous is not None and previous.resources and current.resources:
            self._resources(previous.resources, current.resources)
        self.previous = current

    def _battle(self, before: BattleState | None, after: BattleState | None) -> None:
        if after is None:
            return
        if after.diagnostic:
            self._diagnostic("battle", after.diagnostic, after.raw_hex)
        if after.active and (before is None or not before.active):
            self.battle_pending = {
                "present_at_start": before is None,
                "activated_frame": self.frame,
            }
        if after.active and after.initialized and self.battle_pending is not None:
            # battle_type from the first frame decoded as this battle, not the activation frame.
            self._emit("battle_started", {**self.battle_pending, "battle_type": after.battle_type})
            self.battle_pending = None
        elif before is not None and before.active and not after.active:
            if self.battle_pending is not None:
                self._emit("battle_started", {**self.battle_pending, "battle_type": None})
                self.battle_pending = None
            self._emit(
                "battle_ended", {"outcome": before.outcome, "outcome_code": before.outcome_code}
            )
        if (
            after.active
            and after.initialized
            and after.outcome_code not in (None, 0)
            and (before is None or before.outcome_code != after.outcome_code)
        ):
            self._emit(
                "battle_outcome",
                {"outcome": after.outcome, "outcome_code": after.outcome_code, "turn": after.turn},
            )
        keys: set[tuple[object, ...]] = set()
        for signal in after.signals:
            key = (
                signal.kind,
                signal.battler,
                signal.command,
                signal.request,
                signal.party_mask,
                signal.string_id,
                signal.move_id,
                signal.originally_used_move,
                signal.hp,
                signal.status,
                signal.raw_hex,
            )
            keys.add(key)
            if key not in self.battle_signals:
                self._emit(
                    "battle_signal",
                    {
                        "signal": signal.kind,
                        "battler": signal.battler,
                        "command": signal.command,
                        "request": signal.request,
                        "party_mask": signal.party_mask,
                        "string_id": signal.string_id,
                        "move_id": signal.move_id,
                        "originally_used_move": signal.originally_used_move,
                        "hp": signal.hp,
                        "status": signal.status,
                        "raw_hex": signal.raw_hex,
                        "turn": after.turn,
                        "script_pc": after.script_pc,
                        "main_func": after.main_func,
                    },
                )
        self.battle_signals = keys
        # Diff battlers only between two frames of the same, initialized battle.
        old = (
            {mon.identity: mon for mon in before.battlers or ()}
            if before is not None and before.active and before.initialized and after.initialized
            else {}
        )
        for mon in after.battlers or ():
            prior = old.get(mon.identity)
            if prior is None:
                continue
            for before_move, after_move in zip(prior.moves, mon.moves, strict=True):
                if before_move.move_id == after_move.move_id and before_move.pp != after_move.pp:
                    self._emit(
                        "battle_pp_changed",
                        {
                            "identity": mon.identity,
                            "battler": mon.battler,
                            "move_id": after_move.move_id,
                            "move_name": after_move.name,
                            "slot": after_move.slot,
                            "before": before_move.pp,
                            "after": after_move.pp,
                            "turn": after.turn,
                        },
                    )
            if mon.hp != prior.hp:
                self._emit(
                    "battle_hp_changed",
                    {
                        "identity": mon.identity,
                        "battler": mon.battler,
                        "species": mon.species,
                        "before": prior.hp,
                        "after": mon.hp,
                        "max_hp": mon.max_hp,
                        "turn": after.turn,
                    },
                )
            if (mon.status1, mon.status2, mon.status3, mon.stat_stages) != (
                prior.status1,
                prior.status2,
                prior.status3,
                prior.stat_stages,
            ):
                self._emit(
                    "battle_status_changed",
                    {
                        "identity": mon.identity,
                        "battler": mon.battler,
                        "before_status": [prior.status1, prior.status2, prior.status3],
                        "after_status": [mon.status1, mon.status2, mon.status3],
                        "before_stages": list(prior.stat_stages),
                        "after_stages": list(mon.stat_stages),
                        "turn": after.turn,
                    },
                )

    def _diagnostic(self, owner: str, message: str, raw_hex: str | None) -> None:
        # One row per owner and kind: slot numbers and raw values do not make a new bug.
        kind = diagnostic_kind(message)
        key = owner + ":" + kind
        if key not in self.diagnostics:
            self._emit(
                "harness_bug",
                {"owner": owner, "kind": kind, "message": message, "raw_hex": raw_hex},
            )
            self.diagnostics.add(key)

    def _resources(self, before: Resources, after: Resources) -> None:
        if before.daycare is not None and after.daycare is not None:
            previous = {
                entry.pokemon.identity: entry
                for entry in before.daycare
                if entry.pokemon.identity and entry.pokemon.diagnostic is None
            }
            for entry in after.daycare:
                daycare_before = (
                    previous.get(entry.pokemon.identity) if entry.pokemon.identity else None
                )
                if (
                    daycare_before
                    and entry.pokemon.diagnostic is None
                    and (daycare_before.steps, daycare_before.displayed_level)
                    != (entry.steps, entry.displayed_level)
                ):
                    self._emit(
                        "daycare_training",
                        {
                            "identity": entry.pokemon.identity,
                            "slot": entry.slot,
                            "before_steps": daycare_before.steps,
                            "after_steps": entry.steps,
                            "before_level": daycare_before.displayed_level,
                            "after_level": entry.displayed_level,
                        },
                    )
        old_bag, new_bag = _bag(before), _bag(after)
        if (
            old_bag is not None
            and new_bag is not None
            and before.bag is not None
            and after.bag is not None
        ):
            for item_id in old_bag.keys() | new_bag.keys():
                old, new = old_bag.get(item_id, 0), new_bag.get(item_id, 0)
                if old != new:
                    name = next(
                        (
                            item.name
                            for item in (*before.bag, *after.bag)
                            if item.item_id == item_id
                        ),
                        None,
                    )
                    self._emit(
                        "item_quantity_changed",
                        {
                            "item_id": item_id,
                            "item_name": name,
                            "before": old,
                            "after": new,
                            "delta": new - old,
                        },
                    )
        if before.berry_trees is None or after.berry_trees is None:
            return
        old_trees = {tree.tree_id: tree for tree in before.berry_trees}
        for tree in after.berry_trees:
            old_tree = old_trees.get(tree.tree_id)
            if old_tree is None:
                continue
            owner = after.berry_script_owner
            selected = after.selected_tree_id == tree.tree_id
            details: Details = {
                "tree_id": tree.tree_id,
                "berry": tree.berry or old_tree.berry,
                "item_id": tree.item_id or old_tree.item_id,
                "before_stage": old_tree.stage,
                "after_stage": tree.stage,
                "script_pc": after.script_pc,
            }
            if old_tree != tree:
                self._emit("berry_tree_changed", details)
            if owner == "harvest" and selected and old_tree.stage == 5 and tree.stage == 0:
                # PickBerryTree adds to the Bag before the separate RemoveBerryTree
                # special. The qualified success-path script owner and tree clear
                # prove completion; adjacent-frame inventory deltas would miss it.
                self._emit("berry_harvested", {**details, "quantity": old_tree.yield_count})
            if (
                owner == "plant"
                and selected
                and old_tree.stage == 0
                and tree.stage == 1
                and before.planted_berries is not None
                and after.planted_berries is not None
                and after.planted_berries > before.planted_berries
            ):
                self._emit("berry_planted", details)
            if (
                owner == "water"
                and selected
                and tree.stage in range(1, 5)
                and (
                    before.berry_script_owner != "water" or before.selected_tree_id != tree.tree_id
                )
            ):
                self._emit("berry_watered", details)

    def advance(self, read: ReadMemory) -> None:
        with self.lock:
            self.frame += 1
            if self.error is not None:
                return
            try:
                # Decode only frames that end with the main loop idle: mid-callback frames can
                # hold half-moved save blocks or a Pokémon being re-encrypted. `previous` stays,
                # so the next coherent frame is compared with the last coherent one.
                if main_loop_idle(read) is False:
                    self.busy_frames += 1
                    if self.busy_frames == BUSY_LIMIT:
                        # One row per blind episode: an idle frame re-arms it, so it is not
                        # folded into the run-wide dedupe of decoder diagnostics.
                        message = (
                            f"harness bug: no coherent frame for {BUSY_LIMIT} emulated frames "
                            "(the main loop never reached its VBlank wait)"
                        )
                        self._emit(
                            "harness_bug",
                            {
                                "owner": "native_action",
                                "kind": diagnostic_kind(message),
                                "message": message,
                                "raw_hex": None,
                            },
                        )
                    return
                self.busy_frames = 0
                screen = read_screen(read)
                ui = read_active_ui(
                    read,
                    screen,
                    tutorial_owner_enabled=self.tutorial_owner_enabled,
                    battle_move_learn_input=self.battle_move_learn_input,
                )
                phase = "" if ui is None else ui.phase
                storage = (
                    self.previous is None
                    or self.pending_captures > 0
                    or any(key in phase for key in ("storage", "pc", "summary", "trade", "gift"))
                )
                # Capture counters commit before nickname/storage insertion.
                raw = read(SAVE_BLOCK_PTRS, 8)
                save1, save2 = struct.unpack("<II", raw)
                if (
                    0x02000000 <= save1 <= 0x02040000 - 0x169C
                    and 0x02000000 <= save2 <= 0x02040000 - 0xB0
                ):
                    total = int.from_bytes(read(save1 + 0x159C + 44, 4), "little") ^ int.from_bytes(
                        read(save2 + 0xAC, 4), "little"
                    )
                    storage = storage or (
                        self.last_captures is not None and total > self.last_captures
                    )
                self.observe(
                    read_action_frame(
                        read,
                        include_storage=storage,
                        storage_cache=self.storage_cache,
                        tutorial_owner_enabled=self.tutorial_owner_enabled,
                        evolution_decision=self.evolution_decision,
                        battle_move_learn_input=self.battle_move_learn_input,
                    )
                )
            except (ValueError, OSError, IndexError, struct.error) as error:
                self.error = f"harness bug: native action observer failed: {error}"

    def snapshot(self, after: int) -> dict[str, object]:
        with self.lock:
            if self.error is not None:
                raise ValueError(self.error)
            if after < self.acked or after > self.last_id:
                raise ValueError("native action journal cursor out of range")
            while self.entries and self.entries[0]["id"] <= after:
                self.entries.popleft()
            self.acked = after
            return {"frame": self.frame, "last_id": self.last_id, "entries": list(self.entries)}


class FrameEmulator(Protocol):
    run_frame_with_buttons: Callable[..., None]


def install_action_history(
    api: FastAPI,
    emulator: type[FrameEmulator],
    read: ReadMemory,
    *,
    tutorial_owner_enabled: bool = False,
    evolution_decision: bool = False,
    battle_move_learn_input: bool = False,
) -> NativeActionJournal:
    journal = NativeActionJournal(
        tutorial_owner_enabled=tutorial_owner_enabled,
        evolution_decision=evolution_decision,
        battle_move_learn_input=battle_move_learn_input,
    )
    step = emulator.run_frame_with_buttons

    def step_recording(self: FrameEmulator, buttons: list[str]) -> None:
        step(self, buttons)
        journal.advance(read)
        with journal.lock:
            if journal.error is None and tuple(buttons) != journal.last_buttons:
                try:
                    journal._emit("native_input", {"buttons": list(buttons)})
                    journal.last_buttons = tuple(buttons)
                except ValueError as error:
                    journal.error = str(error)

    emulator.run_frame_with_buttons = step_recording

    @api.get("/pokebench/actions")
    def actions(after: int = Query(default=0, ge=0)) -> dict[str, object]:
        try:
            return journal.snapshot(after)
        except ValueError as error:
            raise HTTPException(503, str(error)) from error

    return journal
