"""PC and field-menu owners, pinned source and exact US Emerald ROM addresses.

script_menu.c, player_pc.c and pokemon_storage_system.c at731ad5bf. Exact
ROM callback/tasks and pointer literals were checked against matching historical
pret assembly. A menu cursor without its active input owner never qualifies.
"""

import struct
from typing import TYPE_CHECKING

from pokebench_env.game_screen import ReadMemory
from pokebench_env.menus import (
    PALETTE_FADE,
    _list_selection,
    _text_pointer,
    owner_details,
    task_snapshot,
)
from pokebench_env.pokemon import read_item_name

if TYPE_CHECKING:
    from pokebench_env.ui_state import ActiveUi

FIELD_CALLBACK = 0x08085E5D
STORAGE_CALLBACK = 0x080C7D55
MAIL_CALLBACK = 0x08121C65
MAIL_INITIALIZE_CALLBACK = 0x081215ED
MULTICHOICE_TASK = 0x080E2059
YESNO_TASK = 0x080E215D
GRID_TASK = 0x080E2309
CALLBACK_YESNO_TASK = 0x08121FDD
MULTICHOICE_TABLE = 0x0858B760
PC_TOP_TASK = 0x0816AF99
PC_ITEM_ACTION_TASK = 0x0816B249
PC_MAIL_LIST_TASK = 0x0816B675
PC_MAIL_ACTION_TASK = 0x0816B82D
PC_ITEM_LIST_TASK = 0x0816C30D
PC_ITEM_QUANTITY_TASK = 0x0816C819
PC_ITEM_SWAP_TASK = 0x0816C4FD
PC_ITEM_MESSAGE_TASKS = frozenset({0x0816CB05, 0x0816CB75})
PC_PAGE = 0x0203BCB8
PC_STORAGE_HEAP = 0x02039D08
PC_CURSOR = 0x02039D78


def _exact(read: ReadMemory, address: int, size: int) -> bytes:
    body = read(address, size)
    if len(body) != size:
        raise ValueError("short PC menu read")
    return body


def _options(read: ReadMemory, pointer: int, count: int) -> list[str]:
    if not 1 <= count <= 32 or not (
        0x02000000 <= pointer <= 0x02040000 - count * 8
        or 0x08000000 <= pointer <= 0x0A000000 - count * 8
    ):
        raise ValueError("invalid menu option table")
    body = _exact(read, pointer, count * 8)
    return [
        _text_pointer(read, struct.unpack_from("<I", body, index * 8)[0]) for index in range(count)
    ]


def _pc_choices(read: ReadMemory, count: int) -> list[str]:
    save1 = struct.unpack("<I", _exact(read, 0x03005D8C, 4))[0]
    if not 0x02000000 <= save1 <= 0x02040000 - 0x139C or save1 % 4:
        raise ValueError("invalid PC choice save pointer")
    flags = _exact(read, save1 + 0x1270, 0x12C)
    lanette, champion = 0x8AB, 0x864
    known_pc = bool(flags[lanette >> 3] & (1 << (lanette & 7)))
    cleared = bool(flags[champion >> 3] & (1 << (champion & 7)))
    choices = ["LANETTE'S PC" if known_pc else "SOMEONE'S PC", "PLAYER'S PC"]
    if cleared:
        choices.append("HALL OF FAME")
    choices.append("LOG OFF")
    if len(choices) != count:
        raise ValueError("PC options disagree with native flags")
    return choices


def _pc_item_message(read: ReadMemory) -> str | None:
    from pokebench_env.ui_state import STRING_VAR4, STRING_VAR4_SIZE, _window_drawn, decode_message

    pointer = struct.unpack("<I", _exact(read, 0x0203BCC4, 4))[0]
    if not 0x02000000 <= pointer <= 0x02040000 - 0x66D or pointer % 4:
        return None
    # ItemStorageMenu:51 eight-byte list entries +51 twenty-four-byte names;
    # windowIds at0x660. ItemStorage_PrintMessage uses message index1, expands
    # into gStringVar4 and draws exactly this window, not generic window0.
    window = _exact(read, pointer + 0x661, 1)[0]
    if not _window_drawn(read, window):
        return None
    return decode_message(_exact(read, STRING_VAR4, STRING_VAR4_SIZE)) or None


def _pc_item_description(read: ReadMemory, slot: int) -> str:
    from pokebench_env.ui_state import decode_message

    if slot == -2:
        pointer = struct.unpack("<I", _exact(read, 0x085DFEA4 + 12, 4))[0]
    else:
        save = struct.unpack("<I", _exact(read, 0x03005D8C, 4))[0]
        if not 0x02000000 <= save <= 0x02040000 - 0x560 or save % 4 or not 0 <= slot < 50:
            raise ValueError("invalid PC item description slot/save")
        item = struct.unpack("<H", _exact(read, save + 0x498 + 4 * slot, 2))[0]
        read_item_name(read, item)
        pointer = struct.unpack("<I", _exact(read, 0x085839A0 + 44 * item + 20, 4))[0]
    if not 0x08000000 <= pointer <= 0x0A000000 - 512:
        raise ValueError("invalid native item description pointer")
    body = _exact(read, pointer, 512)
    if 0xFF not in body:
        raise ValueError("unterminated native item description")
    return decode_message(body)


def _grid_id(read: ReadMemory) -> tuple[int, int]:
    # ScrCmd_multichoicegrid consumes exactly 5 arguments then stops this owner.
    # Preserve its pending bytecode provenance instead of guessing a table by count.
    context = _exact(read, 0x03000E40, 12)
    pc = struct.unpack_from("<I", context, 8)[0]
    status = _exact(read, 0x03000E38, 1)[0]
    if context[1] != 1 or status != 1 or not 0x08000006 <= pc < 0x0A000000:
        raise ValueError("grid has no stopped native script owner")
    instruction = _exact(read, pc - 6, 6)
    if instruction[0] != 0x71 or instruction[4] == 0:
        raise ValueError("grid pending bytecode is not multichoicegrid")
    return instruction[3], instruction[4]


def _tidal_choices(read: ReadMemory, count: int) -> list[str]:
    # The actual generated selection array, including ticket-filtered choices.
    selections = _exact(read, 0x03001124, 7)
    values = [value for value in selections if value != 0xFF]
    if len(values) != count or any(value > 6 for value in values):
        raise ValueError("invalid native SS Tidal selection list")
    names = (
        "SLATEPORT CITY",
        "BATTLE FRONTIER",
        "SOUTHERN ISLAND",
        "NAVEL ROCK",
        "BIRTH ISLAND",
        "FARAWAY ISLAND",
        "EXIT",
    )
    return [names[value] for value in values]


def read_mail_ui(read: ReadMemory, callback: int) -> "ActiveUi":
    from pokebench_env.ui_state import ActiveUi

    details = owner_details(read, callback)
    phase = "mail_initialization" if callback == MAIL_INITIALIZE_CALLBACK else "mail_reading"
    try:
        heap = struct.unpack("<I", _exact(read, 0x0203A134, 4))[0]
        if not 0x02000000 <= heap <= 0x02040000 - 0x222C or heap % 4:
            raise ValueError("invalid native mail read heap")
        details["mail_heap"] = f"0x{heap:08X}"
        if callback == MAIL_INITIALIZE_CALLBACK:
            return ActiveUi(phase, None, False, "Mail display is initializing", details=details)
        body = _exact(read, heap + 0x210, 0x1C)
        input_callback, mail = struct.unpack_from("<II", body)
        has_text, _, mail_type = body[8:11]
        details.update({"input_callback": f"0x{input_callback:08X}", "mail_type": mail_type})
        if (
            input_callback not in (0x08121C99, 0x08121CC1, 0x08121D01)
            or has_text > 1
            or mail_type >= 12
        ):
            raise ValueError("invalid mail callback or type")
        if not 0x02000000 <= mail <= 0x02040000 - 0x24:
            raise ValueError("invalid source mail pointer")
        native = _exact(read, mail, 0x24)
        details["word_ids"] = list(struct.unpack_from("<9H", native))
        details["item_id"] = struct.unpack_from("<H", native, 0x20)[0]
        if has_text:
            layout = struct.unpack_from("<I", body, 0x18)[0]
            if not 0x08000000 <= layout < 0x0A000000:
                raise ValueError("invalid native mail layout")
            lines = _exact(read, layout, 1)[0]
            if not 1 <= lines <= 8:
                raise ValueError("invalid mail line count")
            message = [_text_pointer(read, heap + index * 64) for index in range(lines)]
            details["message"] = " ".join(message)
            details["sender"] = _text_pointer(read, heap + 0x200)
        ready = input_callback == 0x08121CC1
        return ActiveUi(phase, None, ready, "A or B closes the mail", details=details)
    except (ValueError, OSError, struct.error) as error:
        return ActiveUi(
            phase, None, None, "Mail data unavailable", f"harness bug: {error}", details=details
        )


def read_pc_ui(read: ReadMemory, callback: int) -> "ActiveUi | None":
    from pokebench_env.ui_state import MENU, ActiveUi, read_menu

    if callback in (MAIL_CALLBACK, MAIL_INITIALIZE_CALLBACK):
        return read_mail_ui(read, callback)
    if callback not in (FIELD_CALLBACK, STORAGE_CALLBACK):
        return None
    tasks = task_snapshot(read)
    owners = [
        t
        for t in tasks
        if t[1]
        in (
            MULTICHOICE_TASK,
            GRID_TASK,
            YESNO_TASK,
            CALLBACK_YESNO_TASK,
            PC_TOP_TASK,
            PC_ITEM_ACTION_TASK,
            PC_MAIL_LIST_TASK,
            PC_MAIL_ACTION_TASK,
            PC_ITEM_LIST_TASK,
            PC_ITEM_QUANTITY_TASK,
            PC_ITEM_SWAP_TASK,
            *PC_ITEM_MESSAGE_TASKS,
        )
    ]
    if callback == FIELD_CALLBACK and not owners:
        return None
    details = owner_details(read, callback)
    phase = "pc_storage" if callback == STORAGE_CALLBACK else "field_menu"
    try:
        fading = bool(_exact(read, PALETTE_FADE + 7, 1)[0] & 0x80)
        if callback == STORAGE_CALLBACK:
            heap = struct.unpack("<I", _exact(read, PC_STORAGE_HEAP, 4))[0]
            if not 0x02000000 <= heap <= 0x02040000 - 0x21B8 or heap % 4:
                raise ValueError("invalid PC storage menu heap")
            state, operation = _exact(read, heap, 2)
            area, position = struct.unpack("<bb", _exact(read, PC_CURSOR, 2))
            if area not in range(4) or operation not in range(4):
                raise ValueError("invalid PC cursor area or operation")
            maxima = (30, 7, 1, 2)
            if not 0 <= position < maxima[area]:
                raise ValueError("invalid PC storage cursor slot")
            storage = struct.unpack("<I", _exact(read, 0x03005D94, 4))[0]
            if not 0x02000000 <= storage <= 0x02040000 - 0x83D0:
                raise ValueError("invalid PC Pokémon storage pointer")
            box = _exact(read, storage, 1)[0]
            if box >= 14:
                raise ValueError("invalid PC current box")
            areas = ("box", "party", "box_title", "buttons")
            operations = ("withdraw", "deposit", "move_pokemon", "move_items")
            from pokebench_env.ui_state import _window_drawn, decode_message

            if _window_drawn(read, 1):
                details["message"] = decode_message(_exact(read, heap + 0x2190, 40)) or None
            details.update(
                {
                    "operation": operations[operation],
                    "box": box,
                    "cursor_area": areas[area],
                    "slot": position,
                    "storage_state": state,
                    "storage_heap": f"0x{heap:08X}",
                }
            )
            selected = f"{areas[area]} slot {position}"
            if any(t[1] == 0x080C90A5 for t in tasks):
                from pokebench_env.menu_markings import read_markings_ui

                return read_markings_ui(read, callback, ready=state == 1 and not fading)
            menu = read_menu(read)
            box_owners = [t for t in tasks if t[1] in (0x080C8D79, 0x080C99D9)]
            if box_owners and state == 1:
                choose = struct.unpack("<I", _exact(read, 0x02039D04, 4))[0]
                if not 0x02000000 <= choose <= 0x02040000 - 0x248 or choose % 4:
                    raise ValueError("invalid choose-box menu pointer")
                target = _exact(read, choose + 0x244, 1)[0]
                if target >= 14:
                    raise ValueError("invalid target box")
                details["target_box"] = target
                return ActiveUi(
                    "pc_choose_box",
                    f"box {target}",
                    not fading,
                    "Left/Right choose box; A confirms; B cancels",
                    details=details,
                )
            confirmations = {
                0x080C8EB5: (1, "release_pokemon"),
                0x080C954D: (1, "put_held_item_in_bag"),
                0x080C9BE9: (2, "exit_storage"),
                0x080C9D1D: (2, "continue_storage"),
            }
            confirm = next((confirmations[t[1]] for t in tasks if t[1] in confirmations), None)
            if confirm is not None and state == confirm[0]:
                if menu is None or menu.options != 2:
                    raise ValueError("PC confirmation has no drawn YES/NO menu")
                details.update({"action": confirm[1], "selected_index": menu.selected - 1})
                return ActiveUi(
                    "pc_confirmation",
                    ("YES", "NO")[menu.selected - 1],
                    not fading,
                    "Up/Down choose; A confirms; B cancels",
                    details=details,
                )
            count = _exact(read, heap + 0xCAC, 1)[0]
            window = struct.unpack("<H", _exact(read, heap + 0xCB0, 2))[0]
            current_window = _exact(read, MENU + 5, 1)[0]
            if menu is not None and current_window == window and 1 <= count <= 7:
                phase = "pc_pokemon_action"
                choices = _options(read, heap + 0xC74, count)
                if menu.options != count:
                    raise ValueError("PC Pokémon action option count mismatch")
                selected = choices[menu.selected - 1]
                details["options"] = [choice for choice in choices]
                details["selected_index"] = menu.selected - 1
                ready = not fading
            else:
                ready = not fading and state == 0 and any(t[1] == 0x080C82AD for t in tasks)
            return ActiveUi(
                phase,
                selected,
                ready,
                "Directions move cursor; A chooses; B backs out",
                details=details,
            )
        if len(owners) != 1:
            raise ValueError("PC/field menu has no unique input owner")
        task_id, function, data = owners[0]
        details["owner_task"] = task_id
        menu = read_menu(read)
        if function in PC_ITEM_MESSAGE_TASKS:
            details["message"] = _pc_item_message(read)
            details["quantity"] = data[2]
            details["action"] = "toss" if data[3] else "withdraw"
            return ActiveUi(
                "pc_item_message",
                None,
                not fading,
                "A or B acknowledges the item message",
                details=details,
            )
        if function in (PC_MAIL_LIST_TASK, PC_ITEM_LIST_TASK, PC_ITEM_SWAP_TASK):
            selected, item_id, index = _list_selection(read, data[5])
            phase = (
                "pc_mail_list"
                if function == PC_MAIL_LIST_TASK
                else "pc_item_swap"
                if function == PC_ITEM_SWAP_TASK
                else "pc_item_list"
            )
            details.update({"selected_index": index, "list_id": item_id, "list_task": data[5]})
            if function == PC_ITEM_LIST_TASK:
                details["message"] = _pc_item_description(read, item_id)
            elif function == PC_ITEM_SWAP_TASK:
                details["message"] = _pc_item_message(read)
            return ActiveUi(
                phase,
                selected,
                not fading,
                "Directions select; A chooses; B returns",
                details=details,
            )
        if function == PC_ITEM_QUANTITY_TASK:
            row, scroll = struct.unpack("<HH", _exact(read, PC_PAGE, 4))
            slot = row + scroll
            if slot >= 50 or not 1 <= data[2] <= 999:
                raise ValueError("invalid PC item quantity or selected slot")
            save1 = struct.unpack("<I", _exact(read, 0x03005D8C, 4))[0]
            if not 0x02000000 <= save1 <= 0x02040000 - 0x560 or save1 % 4:
                raise ValueError("invalid PC item save pointer")
            item, maximum = struct.unpack("<HH", _exact(read, save1 + 0x498 + slot * 4, 4))
            if data[2] > maximum:
                raise ValueError("PC quantity exceeds owned item count")
            details["message"] = _pc_item_message(read)
            details.update(
                {
                    "item_id": item,
                    "slot": slot,
                    "quantity": data[2],
                    "maximum": maximum,
                    "action": "toss" if data[3] else "withdraw",
                }
            )
            return ActiveUi(
                "pc_item_quantity",
                read_item_name(read, item),
                not fading,
                "Directions change quantity; A confirms; B cancels",
                value=str(data[2]),
                details=details,
            )
        if menu is None:
            raise ValueError("active PC/field owner has no drawn menu")
        ready = not fading
        if function == YESNO_TASK:
            phase, choices = "field_yes_no", ["YES", "NO"]
            ready = data[2] >= 5
        elif function == CALLBACK_YESNO_TASK:
            yes, no = struct.unpack("<II", _exact(read, 0x0203A138, 8))
            if any(not 0x08000001 <= fn < 0x0A000000 or not fn & 1 for fn in (yes, no)):
                raise ValueError("invalid native YES/NO callback pair")
            phase, choices = "field_confirmation", ["YES", "NO"]
            details.update({"yes_callback": f"0x{yes:08X}", "no_callback": f"0x{no:08X}"})
            if (yes, no) == (0x0816CA95, 0x0816CAC9):
                phase = "pc_toss_confirmation"
                details["quantity"] = data[2]
                details["action"] = "toss_pc_item"
                details["message"] = _pc_item_message(read)
                row, scroll = struct.unpack("<HH", _exact(read, PC_PAGE, 4))
                details["slot"] = row + scroll
        elif function in (MULTICHOICE_TASK, GRID_TASK):
            columns = 1
            if function == GRID_TASK:
                menu_id, columns = _grid_id(read)
                native_columns, rows = _exact(read, MENU + 9, 2)
                if columns != native_columns or columns * rows != menu.options:
                    raise ValueError("grid native dimensions mismatch")
                details.update({"columns": columns, "rows": rows})
            else:
                menu_id = data[7]
            details["menu_id"] = menu_id
            phase = (
                "pc_access"
                if menu_id == 1
                else "field_multichoice_grid"
                if function == GRID_TASK
                else "field_multichoice"
            )
            if not 0 <= menu_id < 114:
                raise ValueError("invalid field multichoice ID")
            if menu_id == 1:
                choices = _pc_choices(read, menu.options)
            elif menu_id == 8:
                choices = _tidal_choices(read, menu.options)
            else:
                pointer, count = struct.unpack(
                    "<IB3x", _exact(read, MULTICHOICE_TABLE + menu_id * 8, 8)
                )
                choices = _options(read, pointer, count)
            ready = not fading and (function == GRID_TASK or _exact(read, 0x02039F90, 1)[0] == 0)
        elif function == PC_TOP_TASK:
            phase = "pc_player_menu"
            count = _exact(read, 0x0203BCB4, 1)[0]
            pointer = struct.unpack("<I", _exact(read, 0x0203BCB0, 4))[0]
            if count not in (3, 4) or not 0x08000000 <= pointer <= 0x0A000000 - count:
                raise ValueError("invalid player PC option order")
            order = _exact(read, pointer, count)
            if any(index > 3 for index in order):
                raise ValueError("invalid player PC option ID")
            choices = [
                ("ITEM STORAGE", "MAILBOX", "DECORATION", "TURN OFF")[index] for index in order
            ]
        elif function == PC_ITEM_ACTION_TASK:
            phase, choices = (
                "pc_item_storage_menu",
                ["WITHDRAW ITEM", "DEPOSIT ITEM", "TOSS ITEM", "CANCEL"],
            )
        else:
            phase, choices = "pc_mail_action", ["READ", "MOVE TO BAG", "GIVE", "CANCEL"]
        if menu.options != len(choices) or not 1 <= menu.selected <= len(choices):
            raise ValueError("native option count/cursor mismatch")
        if phase == "pc_item_storage_menu":
            pointer = struct.unpack("<I", _exact(read, 0x085DFEA4 + (menu.selected - 1) * 4, 4))[0]
            details["message"] = _text_pointer(read, pointer)
        details["options"] = [choice for choice in choices]
        details["selected_index"] = menu.selected - 1
        return ActiveUi(
            phase,
            choices[menu.selected - 1],
            ready,
            "Directions select; A chooses; B cancels",
            details=details,
        )
    except (ValueError, OSError, struct.error) as error:
        return ActiveUi(
            phase,
            None,
            None,
            "Menu selection unavailable",
            f"harness bug: {error}",
            details=details,
        )
