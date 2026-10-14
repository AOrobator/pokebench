"""Cable Club link-up controls from cable_club.c and exact historical ASM.

The transport's connection flag and message owner determine cancellation and
confirmation availability; merely seeing a link task does not imply A is ready.
"""

import struct
from typing import TYPE_CHECKING

from pokebench_env.game_screen import ReadMemory
from pokebench_env.menus import owner_details, task_snapshot

if TYPE_CHECKING:
    from pokebench_env.ui_state import ActiveUi

CABLE_TASKS = {
    0x080B2635: "link_setup",
    0x080B2689: "link_await_connection",
    0x080B270D: "link_readiness_message",
    0x080B275D: "link_player_readiness",
    0x080B2805: "link_start_confirmation",
    0x080B28A9: "link_confirmation_exchange",
    0x080B2919: "link_leader_exchange",
    0x080B2A09: "link_status_check",
    0x080B2C31: "link_trainer_card_exchange",
    0x080B2CB1: "link_closing",
    0x080B2CED: "link_cancelled",
    0x080B2D2D: "link_connection_error",
}


def read_cable_ui(read: ReadMemory, callback: int) -> "ActiveUi | None":
    from pokebench_env.ui_state import STRING_VAR4, STRING_VAR4_SIZE, ActiveUi, decode_message

    if callback not in (0x08085E5D, 0x08085FCD, 0x08085FFD):
        return None
    owners = [t for t in task_snapshot(read) if t[1] in CABLE_TASKS]
    if not owners:
        return None
    details = owner_details(read, callback)
    phase = "link_transition"
    try:
        if len(owners) != 1:
            raise ValueError("multiple Cable Club link-up owners")
        _, function, data = owners[0]
        phase = CABLE_TASKS[function]
        status = struct.unpack("<I", read(0x030030E0, 4))[0]
        count = (status >> 2) & 7
        connected = bool(status & 0x40)
        message_mode = read(0x020375BC, 1)[0]
        if count > 4 or not 0 <= message_mode <= 2:
            raise ValueError("link player count or field message mode outside native bounds")
        details.update(
            player_count=count,
            connection_established=connected,
            minimum_players=data[1],
            maximum_players=data[2],
        )
        controls = []
        if function in (0x080B2689,):
            controls.append("B: CANCEL")
        elif function in (0x080B270D, 0x080B275D, 0x080B2805, 0x080B2919) and not connected:
            controls.append("B: CANCEL")
        if function == 0x080B275D:
            if not 2 <= data[1] <= data[2] <= 4:
                raise ValueError("link-up configured player range is invalid")
            if count >= data[1]:
                controls.append("A: CONFIRM PLAYERS")
        elif function == 0x080B2805 and message_mode == 0:
            # Task_LinkupTryConfirmation compares the saved and current counts.
            saved_count = read(0x03003100, 1)[0]
            details["confirmed_player_count"] = saved_count
            if saved_count == count:
                controls.extend(["A: START", "B: RECONSIDER"])
        if message_mode:
            details["message"] = decode_message(read(STRING_VAR4, STRING_VAR4_SIZE))
        details["available_controls"] = controls
        return ActiveUi(
            phase,
            "; ".join(controls) or None,
            bool(controls),
            "Cable Club link-up",
            details=details,
        )
    except ValueError as error:
        return ActiveUi(
            phase, None, False, "Cable Club state invalid", diagnostic=str(error), details=details
        )
