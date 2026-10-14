"""Move Relearner state machine and selected move, from its game-owned heap."""

import struct
from typing import TYPE_CHECKING

from pokebench_env.game_screen import TASKS, ReadMemory
from pokebench_env.menus import _ewram, _list_selection, _text_pointer, owner_details
from pokebench_env.pokemon import MOVE_NAMES

if TYPE_CHECKING:
    from pokebench_env.ui_state import ActiveUi

LEARNING_CALLBACK = 0x0816082D
LEARNING_POINTER = 0x0203BC34
VALID_STATES = frozenset(
    {
        0,
        1,
        3,
        4,
        5,
        6,
        8,
        9,
        12,
        13,
        14,
        15,
        16,
        17,
        18,
        19,
        20,
        24,
        25,
        26,
        27,
        28,
        29,
        30,
        31,
        32,
        33,
    }
)


def read_learning_ui(read: ReadMemory, callback: int) -> "ActiveUi | None":
    from pokebench_env.ui_state import ActiveUi, read_menu

    if callback != LEARNING_CALLBACK:
        return None
    details = owner_details(read, callback)
    phase = "move_relearner_transition"
    try:
        pointer = struct.unpack("<I", read(LEARNING_POINTER, 4))[0]
        if not _ewram(pointer, 0x118):
            raise ValueError("invalid Move Relearner heap pointer")
        raw = read(pointer, 0x118)
        state = raw[0]
        party_slot, move_slot = raw[0x44:0x46]
        count = raw[0x110]
        if state not in VALID_STATES or party_slot > 5 or move_slot > 4 or not 1 <= count <= 25:
            raise ValueError("invalid Move Relearner state/slot/list length")
        moves = list(struct.unpack_from(f"<{count - 1}H", raw, 0x12))
        if any(move not in range(1, 355) for move in moves):
            raise ValueError("invalid Move Relearner available move id")
        names = [_text_pointer(read, MOVE_NAMES + move * 13) for move in moves]
        details.update(
            {
                "party_slot": party_slot,
                "move_slot": move_slot,
                "learning_state": state,
                "available_move_ids": moves,
                "options": names + ["CANCEL"],
            }
        )
        ready = not bool(read(0x02037FD4 + 7, 1)[0] & 0x80)
        selected = None
        if state in (4, 6):
            phase = "move_relearner_list"
            label, move_id, index = _list_selection(read, raw[0x112])
            total = struct.unpack("<H", read(TASKS + raw[0x112] * 40 + 20, 2))[0]
            expected_move = moves[index] if index < len(moves) else -2
            if total != count or index >= count or move_id != expected_move:
                raise ValueError("Move Relearner list item does not match owned move vector")
            details.update(
                {
                    "selected_index": index,
                    "move_id": None if move_id == -2 else move_id,
                    "display_mode": "BATTLE" if state == 4 else "CONTEST",
                }
            )
            selected = label
        elif state in (9, 13, 18, 26):
            phase = {
                9: "move_relearner_teach_confirmation",
                13: "move_relearner_exit_confirmation",
                18: "move_relearner_forget_confirmation",
                26: "move_relearner_stop_confirmation",
            }[state]
            menu = read_menu(read)
            if menu is None or menu.options != 2:
                raise ValueError("invalid or undrawn Move Relearner confirmation")
            selected = ("YES", "NO")[menu.selected - 1]
            details["confirmation_index"] = menu.selected - 1
        elif state == 33:
            phase = "move_relearner_learned_message"
        else:
            ready = False
        return ActiveUi(
            phase, selected, ready, "Directions select; A accepts; B returns", details=details
        )
    except (ValueError, struct.error, IndexError) as error:
        return ActiveUi(
            phase, None, None, "Move Relearner observation unavailable", str(error), details=details
        )
