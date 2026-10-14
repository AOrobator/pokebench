"""E-Reader task 081D5085, source ereader_screen.c / rom_81BAD84.s.

The task shares Mystery Gift's callback but owns independent controls and receive
states. Text is the already-expanded native message window, not guessed templates.
"""

from typing import TYPE_CHECKING

from pokebench_env.game_screen import ReadMemory
from pokebench_env.menus import owner_details, task_snapshot

if TYPE_CHECKING:
    from pokebench_env.ui_state import ActiveUi

PHASES = [
    "welcome",
    "link_init",
    "link_init_wait",
    "link_check",
    "connect_instructions",
    "connect_wait",
    "try_link",
    "incorrect_link",
    "connecting",
    "transfer",
    "transfer_end",
    "transfer_success_wait",
    "load_card_start",
    "receive_card",
    "wait_card",
    "validate_card",
    "wait_disconnect",
    "save_card",
    "success_message",
    "success_end",
    "link_error",
    "retry_error",
    "save_failed",
    "cancelled",
    "unused_1",
    "unused_2",
    "end",
]
MESSAGE_STATES = {0, 4, 7, 20, 21, 22, 23}


def read_ereader_ui(read: ReadMemory, callback: int) -> "ActiveUi | None":
    from pokebench_env.ui_state import (
        STRING_VAR4,
        STRING_VAR4_SIZE,
        ActiveUi,
        _window_drawn,
        decode_message,
    )

    if callback != 0x08018439:
        return None
    tasks = task_snapshot(read)
    owners = [t for t in tasks if t[1] == 0x081D5085]
    if not owners:
        return None
    details = owner_details(read, callback)
    phase = "ereader_transition"
    try:
        if len(owners) != 1:
            raise ValueError("multiple E-Reader owners")
        data = owners[0][2]
        state, text_state = data[4] & 255, (data[4] >> 8) & 255
        if state not in range(len(PHASES)) or state in (24, 25):
            raise ValueError("invalid or unused E-Reader task phase")
        phase = "ereader_" + PHASES[state]
        details.update(
            ereader_state=state, text_state=text_state, timer=data[0], transfer_status=data[7] & 255
        )
        controls = []
        if state in MESSAGE_STATES:
            if text_state not in (0, 1, 2, 255):
                raise ValueError("invalid E-Reader message state")
            if text_state == 1:
                controls.append("A OR B: CONTINUE")
        elif state in (5, 6):
            controls.append("B: CANCEL")
        elif state == 13:
            if not 0 <= text_state <= 5:
                raise ValueError("invalid E-Reader card-receive state")
            # TryReceiveCard INIT / START allow cancel; exchange/disconnect do not.
            if text_state in (0, 2):
                controls.append("B: CANCEL")
        elif state == 19 and not any(t[1] == 0x080A3141 for t in tasks):
            controls.append("A OR B: CONTINUE")
        if _window_drawn(read, 1):
            details["message"] = decode_message(read(STRING_VAR4, STRING_VAR4_SIZE))
        elif controls and controls != ["B: CANCEL"]:
            raise ValueError("E-Reader continuation has no drawn message")
        details["available_controls"] = controls
        return ActiveUi(
            phase, "; ".join(controls) or None, bool(controls), "E-Reader", details=details
        )
    except ValueError as error:
        return ActiveUi(
            phase, None, False, "E-Reader state invalid", diagnostic=str(error), details=details
        )
