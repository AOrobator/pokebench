"""Explicit native evolution choice; no strategy, save edits or memory writes.

pret/pokeemerald 731ad5bf src/evolution_scene.c Task_EvolutionScene: held B
cancels only at state 8 with CAN_STOP and the graphics task active. A and the
D-pad are not a confirmation menu. The gate runs under the vendor frame lock.
"""

from contextlib import AbstractContextManager
from dataclasses import replace
from typing import Literal

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from pokebench_env.battle_text import (
    AUTO_SCROLL,
    PRINTERS,
    TEXT_FLAGS,
    WAIT_STATES,
    SteppedEmulator,
    read_battle_message,
)
from pokebench_env.game_screen import ReadMemory, read_screen
from pokebench_env.menu_pokemon_lifecycle import read_pokemon_lifecycle_menu
from pokebench_env.ui_state import ActiveUi

SWITCH = "evolution-decision-v1"


def result_message_waiting(read: ReadMemory) -> bool:
    # Task_EvolutionScene EVOSTATE_TRY_LEARN_MOVE waits on printer 0 after
    # BattlePutTextOnWindow(gStringVar4, B_WIN_MSG). TextPrinterWait/Scroll in
    # text.c consumes JOY_NEW(A_BUTTON | B_BUTTON). gStringVar4 is 0x3E8 bytes.
    printer = read(PRINTERS, 0x24)
    pointer = int.from_bytes(printer[:4], "little")
    return (
        0x02021FC4 <= pointer < 0x02021FC4 + 0x3E8
        and printer[4] == 0
        and printer[0x1B] == 1
        and printer[0x1C] in WAIT_STATES
        and not read(TEXT_FLAGS, 1)[0] & AUTO_SCROLL
    )


def decision_ui(ui: ActiveUi | None, read: ReadMemory | None = None) -> ActiveUi | None:
    if ui is None or not ui.phase.startswith("evolution") or ui.diagnostic:
        return ui
    if ui.phase == "evolution_move_confirmation":
        return replace(ui, controls="UP/DOWN selects YES or NO; A chooses; B answers NO")
    if ui.phase == "evolution_move_learning":
        message = None if read is None else read_battle_message(read)
        waiting = (
            message is not None
            and message.state == "waiting_for_input"
            and message.diagnostic is None
        )
        return replace(
            ui,
            ready=waiting,
            controls="A or B advances the waiting move-learning text; inspect the next choice"
            if waiting
            else "Move-learning text is printing or animating; no menu choice is open",
        )
    pending = ui.phase == "evolution_cancel_window"
    return replace(
        ui,
        phase="evolution_decision" if pending else ui.phase,
        selected=None,
        ready=True if pending else ui.ready,
        controls=(
            "Evolution is waiting for choose_evolution: evolve or cancel. "
            "Ordinary button input is blocked."
            if pending
            else "Evolution animation or result text; no selectable menu is open."
        ),
    )


class EvolutionGate:
    def __init__(self, read: ReadMemory) -> None:
        self.read = read
        self.serial = 0
        self.key: tuple[object, ...] | None = None
        self.token: int | None = None
        self.decision: Literal["evolve", "cancel"] | None = None
        self.sent = False
        self.ack_pressed = False

    def _ui(self) -> ActiveUi | None:
        screen = read_screen(self.read)
        if screen.kind != "evolution":
            self.key, self.token, self.decision, self.sent = None, None, None, False
            return None
        ui = read_pokemon_lifecycle_menu(self.read, screen.callback2, evolution_decision=True)
        if ui is None or ui.diagnostic:
            return ui
        details = ui.details or {}
        key = (
            details.get("owner_task"),
            details.get("pokemon_identity"),
            details.get("pokemon_party_index"),
            details.get("pre_species_id"),
            details.get("post_species_id"),
        )
        if key != self.key:
            self.key, self.token, self.decision, self.sent = key, None, None, False
        if ui.phase == "evolution_cancel_window" and self.token is None:
            self.serial += 1
            self.token = self.serial
        return ui

    def pending(self) -> dict[str, object] | None:
        ui = self._ui()
        if (
            ui is None
            or ui.diagnostic
            or ui.phase != "evolution_cancel_window"
            or self.decision is not None
        ):
            return None
        details = ui.details or {}
        return {
            "token": self.token,
            "identity": details.get("pokemon_identity"),
            "pokemon": details.get("pokemon_nickname"),
            "from_species": details.get("pre_species"),
            "to_species": details.get("post_species"),
        }

    def choose(self, token: int, decision: Literal["evolve", "cancel"]) -> None:
        pending = self.pending()
        if pending is None or pending["token"] != token:
            raise ValueError("No matching pending evolution decision; observe the current state.")
        self.decision = decision

    def before_frame(self, buttons: list[str]) -> list[str] | None:
        ui = self._ui()
        if ui is None:
            return buttons
        if ui.diagnostic:
            # An already chosen animation must keep advancing through transient
            # Pokémon encryption/owner diagnostics, with no queued input leaking.
            return [] if self.decision is not None else None
        details = ui.details or {}
        state = details.get("evolution_state")
        if details.get("trade_evolution") is True or not isinstance(state, int):
            return buttons
        if self.decision is not None and state < 22:
            if state == 15 and result_message_waiting(self.read):
                self.ack_pressed = not self.ack_pressed
                return ["A"] if self.ack_pressed else []
            self.ack_pressed = False
            if not self.sent and ui.phase == "evolution_cancel_window":
                self.sent = True
                return ["B"] if self.decision == "cancel" else []
            return []  # discard all stale queued inputs through the animation
        flags = details.get("task_flags")
        if isinstance(flags, int) and flags & 1 and state <= 8:
            if ui.phase == "evolution_cancel_window":
                return None  # do not advance a single frame until the explicit decision
            return []  # animation reaches the window without held/queued B
        return buttons


class EvolutionChoice(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    token: int = Field(ge=1)
    decision: Literal["evolve", "cancel"]


def install_evolution_decision(
    api: FastAPI,
    emulator: type[SteppedEmulator],
    read: ReadMemory,
    memory_lock: AbstractContextManager[object],
) -> None:
    gate = EvolutionGate(read)
    original = emulator.run_frame_with_buttons

    def step(self: SteppedEmulator, buttons: list[str]) -> None:
        actual = gate.before_frame(buttons)
        if actual is not None:
            original(self, actual)

    emulator.run_frame_with_buttons = step

    @api.get("/pokebench/evolution")
    def pending() -> dict[str, object]:
        with memory_lock:
            return {"pending": gate.pending()}

    @api.post("/pokebench/evolution")
    def choose(body: EvolutionChoice) -> dict[str, object]:
        with memory_lock:
            try:
                gate.choose(body.token, body.decision)
            except ValueError as error:
                raise HTTPException(409, str(error)) from error
            return {"status": "success", "decision": body.decision}
