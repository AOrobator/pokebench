"""Save/rest confirmations and completion dialogs from the native save callback."""

import struct
from typing import TYPE_CHECKING

from pokebench_env.game_screen import ReadMemory
from pokebench_env.menu_prelude import _saved_header
from pokebench_env.menus import owner_details, task_snapshot

if TYPE_CHECKING:
    from pokebench_env.ui_state import ActiveUi
SAVE_CALLBACK = 0x0203761C
SAVE_PHASES = {
    0x080A00A1: "save_info_transition",
    0x080A00ED: "save_confirm_transition",
    0x080A0109: "save_confirmation",
    0x080A017D: "save_overwrite_message_transition",
    0x080A01B5: "save_overwrite_no_transition",
    0x080A01D1: "save_overwrite_yes_transition",
    0x080A01ED: "save_overwrite_confirmation",
    0x080A0235: "save_saving_message_transition",
    0x080A024D: "save_writing",
    0x080A02B1: "save_success_message",
    0x080A02D9: "save_success_continue",
    0x080A02FD: "save_error_message",
    0x080A0325: "save_error_continue",
    0x080A035D: "pyramid_retire_message_transition",
    0x080A0389: "pyramid_retire_prompt_transition",
    0x080A03A5: "pyramid_retire_confirmation",
}


def read_save_ui(read: ReadMemory, callback: int) -> "ActiveUi | None":
    from pokebench_env.ui_state import (
        STRING_VAR4,
        STRING_VAR4_SIZE,
        ActiveUi,
        _window_drawn,
        decode_message,
        read_menu,
    )

    # Field Start menu Save and standalone script SaveGameTask are exact parents.
    tasks = task_snapshot(read) if callback in (0x08085E5D, 0x08085FCD) else []
    menu_callback = struct.unpack("<I", read(0x03005DF4, 4))[0] if tasks else 0
    parents = [
        t
        for t in tasks
        if t[1] == 0x0809FFD1
        or (
            t[1] == 0x0809FA35
            and t[2][0] == 1
            and menu_callback in (0x0809FE29, 0x0809FE45, 0x0809FE9D, 0x0809FED5)
        )
    ]
    if not parents:
        return None
    details = owner_details(read, callback)
    phase = "save_transition"
    try:
        if len(parents) != 1:
            raise ValueError("multiple save input parents")
        save_callback = struct.unpack("<I", read(SAVE_CALLBACK, 4))[0]
        if menu_callback in (0x0809FE29, 0x0809FE9D):
            return ActiveUi(phase, None, False, "Save state initializing", details=details)
        if save_callback not in SAVE_PHASES:
            raise ValueError("unmapped save-dialog callback")
        phase = SAVE_PHASES[save_callback]
        active = read(0x020201B0 + 0x1B, 1)[0]
        if active not in (0, 1):
            raise ValueError("invalid save message printer flag")
        details.update(
            {
                "save_callback": f"0x{save_callback:08X}",
                "owner_task": parents[0][0],
                "save_timer": read(0x02037620, 1)[0],
            }
        )
        if save_callback not in (0x080A00A1, 0x080A035D, 0x080A0389, 0x080A03A5):
            details.update(_saved_header(read))
        selected = None
        ready = False
        controls = "Save message, write or handoff in progress"
        if save_callback not in (0x080A00A1, 0x080A017D, 0x080A0235, 0x080A035D):
            if not _window_drawn(read, 0):
                raise ValueError("save message window is not drawn")
            message = decode_message(read(STRING_VAR4, STRING_VAR4_SIZE))
            if not message:
                raise ValueError("save message buffer is empty")
            details["message"] = message
        if save_callback in (0x080A0109, 0x080A01ED, 0x080A03A5):
            menu = read_menu(read)
            if menu is None or menu.options != 2:
                raise ValueError("invalid save confirmation YES/NO menu")
            selected = ("YES", "NO")[menu.selected - 1]
            ready = not active
            details.update({"options": ["YES", "NO"], "selected_index": menu.selected - 1})
            controls = "UP/DOWN selects; A confirms; B cancels"
        elif save_callback == 0x080A02D9:
            first, second = (
                struct.unpack("<I", read(0x030075F4, 4))[0],
                struct.unpack("<I", read(0x03007634, 4))[0],
            )
            sound_playing = not (
                (first & 0x80000000 and second & 0x80000000) or not ((first | second) & 0xFFFF)
            )
            details["sound_playing"] = sound_playing
            ready = not sound_playing and not active
            selected = "CONTINUE" if ready else None
            controls = "A can finish after save sound; otherwise timer returns automatically"
        elif save_callback == 0x080A0325:
            ready = not details["save_timer"] and not active
            selected = "CONTINUE" if ready else None
            controls = "A acknowledges save error after timer"
        if read(0x02037FDB, 1)[0] & 128:
            ready = False
        return ActiveUi(phase, selected, ready, controls, details=details)
    except (ValueError, IndexError, struct.error) as error:
        return ActiveUi(
            phase, None, None, "Save menu observation unavailable", str(error), details=details
        )
