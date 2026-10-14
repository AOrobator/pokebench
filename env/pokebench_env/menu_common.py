"""Shared game-owned confirmation/message tasks used by several menu families."""

import struct
from typing import TYPE_CHECKING

from pokebench_env.game_screen import SCREENS, ReadMemory
from pokebench_env.menus import owner_details, task_snapshot

if TYPE_CHECKING:
    from pokebench_env.ui_state import ActiveUi

YESNO_CALLBACK_TASK = 0x08121FDD
MESSAGE_TASK = 0x08121F3D


def read_shared_menu(read: ReadMemory, callback: int) -> "ActiveUi | None":
    from pokebench_env.ui_state import (
        STRING_VAR4,
        STRING_VAR4_SIZE,
        ActiveUi,
        _window_drawn,
        decode_message,
        read_menu,
    )

    if callback not in SCREENS:
        return None
    owners = [
        task for task in task_snapshot(read) if task[1] in (YESNO_CALLBACK_TASK, MESSAGE_TASK)
    ]
    if not owners:
        return None
    details = owner_details(read, callback)
    phase = "menu_confirmation"
    try:
        if len(owners) != 1:
            raise ValueError("multiple shared menu input owners")
        task, function, data = owners[0]
        details.update({"owner_task": task, "menu_family": SCREENS.get(callback, "game_menu")})
        fading = bool(read(0x02037FD4 + 7, 1)[0] & 0x80)
        if function == MESSAGE_TASK:
            phase = "menu_message_printing"
            window = read(0x0203A140, 1)[0]
            next_task = struct.unpack("<I", read(0x0300117C, 4))[0]
            if not 0x08000001 <= next_task < 0x0A000000 or not next_task & 1:
                raise ValueError("invalid shared message continuation owner")
            if not _window_drawn(read, window):
                raise ValueError("shared menu message window is not drawn")
            message = decode_message(read(STRING_VAR4, STRING_VAR4_SIZE))
            if not message:
                raise ValueError("shared menu message buffer is empty")
            details.update({"message": message, "continuation_callback": f"0x{next_task:08X}"})
            return ActiveUi(
                phase, None, False, "A or B speeds text; selection input waits", details=details
            )
        yes, no = struct.unpack("<II", read(0x0203A138, 8))
        if any(not 0x08000001 <= fn < 0x0A000000 or not fn & 1 for fn in (yes, no)):
            raise ValueError("invalid shared YES/NO callback pair")
        menu = read_menu(read)
        if menu is None or menu.options != 2:
            raise ValueError("shared confirmation has invalid or undrawn YES/NO menu")
        details.update(
            {
                "options": ["YES", "NO"],
                "selected_index": menu.selected - 1,
                "yes_callback": f"0x{yes:08X}",
                "no_callback": f"0x{no:08X}",
            }
        )
        if (yes, no) == (0x080E0EDD, 0x080E10A1):
            phase = "shop_purchase_confirmation"
            details.update({"action": "buy_item", "item_id": data[5], "quantity": data[1]})
        elif (yes, no) == (0x080FE03D, 0x081ABBBD):
            phase = "bag_tmhm_use_confirmation"
            details.update(action="teach_tmhm", item_id=struct.unpack("<H", read(0x0203CE7C, 2))[0])
        elif (yes, no) == (0x081ACF89, 0x081AD011):
            phase = "bag_toss_confirmation"
            details.update(
                {
                    "action": "toss_item",
                    "item_id": struct.unpack("<H", read(0x0203CE7C, 2))[0],
                    "quantity": data[8],
                }
            )
        elif (yes, no) == (0x081AD84D, 0x081AD6FD):
            phase = "bag_sell_confirmation"
            details.update(
                {
                    "action": "sell_item",
                    "item_id": struct.unpack("<H", read(0x0203CE7C, 2))[0],
                    "quantity": data[8],
                }
            )
        elif (yes, no) == (0x08136B79, 0x08136C55):
            phase = "pokeblock_toss_confirmation"
            details.update(
                {
                    "action": "toss_pokeblock",
                    "pokeblock_index": struct.unpack("<H", read(0x0203CE7C, 2))[0],
                }
            )
        elif (yes, no) == (0x081C654D, 0x081C63D1):
            phase = "pyramid_toss_confirmation"
            details.update(
                {
                    "action": "toss_item",
                    "item_id": struct.unpack("<H", read(0x0203CE7C, 2))[0],
                    "quantity": data[8],
                }
            )
        elif (yes, no) in {
            (0x081289F1, 0x08128FD9),
            (0x08128BA1, 0x08128FD9),
            (0x0812A1C1, 0x08129B35),
            (0x0812A211, 0x08129B35),
            (0x0812A479, 0x08127A31),
        }:
            from pokebench_env.menus_misc import decoration_details

            phase = {
                0x081289F1: "decoration_place_confirmation",
                0x08128BA1: "decoration_cancel_confirmation",
                0x0812A1C1: "decoration_put_away_confirmation",
                0x0812A211: "decoration_stop_put_away_confirmation",
                0x0812A479: "decoration_toss_confirmation",
            }[yes]
            details.update(decoration_details(read, data))
        elif (yes, no) == (0x080EA121, 0x080EA13D):
            phase = "secret_base_registry_delete_confirmation"
            if not 0 <= data[4] < 20:
                raise ValueError("invalid secret-base registry deletion selection")
            details["selected_base_id"] = data[4]
        return ActiveUi(
            phase,
            ("YES", "NO")[menu.selected - 1],
            not fading,
            "UP/DOWN selects; A accepts; B declines",
            details=details,
        )
    except (ValueError, struct.error, IndexError) as error:
        return ActiveUi(
            phase, None, None, "Shared menu observation unavailable", str(error), details=details
        )
