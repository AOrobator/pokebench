"""Source-owned item-use messages and timer/close handoffs.

item_use.c, item_menu.c and menu_helpers.c distinguish a message continuation
which polls A/B from an automatic callback. Both can retain the same printer task.
"""

import struct
from typing import TYPE_CHECKING

from pokebench_env.game_screen import ReadMemory
from pokebench_env.menus import owner_details, task_snapshot

if TYPE_CHECKING:
    from pokebench_env.ui_state import ActiveUi

INPUT_TASKS = {
    0x080FDFBD: ("bag_tmhm_booted_message", "A OR B: CONTINUE"),
    0x080FE409: ("bag_stat_item_message", "A OR B: CONTINUE"),
    0x081AD351: ("bag_error_message", "A: CONTINUE"),
    0x081AD151: ("bag_toss_result", "A OR B: CONTINUE"),
    0x081AD9C1: ("bag_sell_result", "A OR B: CONTINUE"),
    0x081ADC0D: ("bag_deposit_result", "A OR B: CONTINUE"),
}
AUTOMATIC_TASKS = {
    0x080FDF91: "bag_tmhm_boot_sound",
    0x080FE025: "bag_tmhm_confirmation_transition",
    0x080FE125: "bag_repel_sound_delay",
    0x080FE165: "bag_repel_sound_wait",
    0x080FE1D1: "bag_flute_sound_delay",
    0x080FE441: "bag_stat_item_delay",
    0x080FD1F9: "field_item_unusable_close",
    0x080FD5CD: "field_itemfinder_close",
    0x081ABBBD: "bag_item_message_close",
}


def read_item_use_ui(read: ReadMemory, callback: int) -> "ActiveUi | None":
    from pokebench_env.ui_state import (
        STRING_VAR4,
        STRING_VAR4_SIZE,
        ActiveUi,
        _window_drawn,
        decode_message,
    )

    if callback not in (0x081AAD5D, 0x08085E5D, 0x08085FCD):
        return None
    tasks = task_snapshot(read)
    next_task = struct.unpack("<I", read(0x0300117C, 4))[0]
    owners = [
        t
        for t in tasks
        if t[1] in INPUT_TASKS
        or t[1] in AUTOMATIC_TASKS
        or (t[1] == 0x08121F3D and next_task in INPUT_TASKS)
    ]
    if not owners:
        return None
    details = owner_details(read, callback)
    phase = "item_use_transition"
    try:
        if len(owners) != 1:
            raise ValueError("multiple item-use message/control owners")
        _, function, data = owners[0]
        if function in AUTOMATIC_TASKS:
            return ActiveUi(
                AUTOMATIC_TASKS[function],
                None,
                False,
                "Automatic item-use handoff",
                details=details,
            )
        effective = next_task if function == 0x08121F3D else function
        phase, controls = INPUT_TASKS[effective]
        window = read(0x0203A140, 1)[0] if function == 0x08121F3D else data[10]
        if window not in range(32) or not _window_drawn(read, window):
            raise ValueError("item-use continuation message window is not drawn")
        active = read(0x020201B0 + window * 0x24 + 0x1B, 1)[0]
        if active not in (0, 1):
            raise ValueError("invalid native item-use printer active bit")
        message = decode_message(read(STRING_VAR4, STRING_VAR4_SIZE))
        if not message:
            raise ValueError("item-use message buffer is empty")
        item = struct.unpack("<H", read(0x0203CE7C, 2))[0]
        if not 1 <= item <= 376:
            raise ValueError("item-use selected native item ID invalid")
        details.update(item_id=item, message=message, message_window=window)
        ready = active == 0 and not read(0x02037FDB, 1)[0] & 0x80
        return ActiveUi(phase, controls if ready else None, ready, controls, details=details)
    except (ValueError, struct.error) as error:
        return ActiveUi(
            phase, None, False, "Item-use owner invalid", diagnostic=str(error), details=details
        )
