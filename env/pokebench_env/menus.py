"""Menu input owners verified against the unmodified US Emerald ROM.

Only exact callback/task pairs establish a live selection. Active task snapshots
are bounded diagnostics, never guessed selections for an unimplemented owner.
"""

import struct
from typing import TYPE_CHECKING, TypeAlias

from pokebench_env.game_screen import TASKS, ReadMemory

if TYPE_CHECKING:
    from pokebench_env.ui_state import ActiveUi

MenuValue: TypeAlias = (
    str
    | int
    | float
    | bool
    | None
    | list[str]
    | list[int]
    | list[float]
    | list[bool]
    | list[None]
    | list[str | int | float | bool | None]
)

STARTER_CALLBACK = 0x081341E1
STARTER_PHASES = {
    0x081341FD: "starter_label_transition",
    0x0813425D: "starter_selection",
    0x08134341: "starter_sprite_transition",
    0x08134391: "starter_confirmation_transition",
    0x08134401: "starter_confirmation",
    0x081344AD: "starter_decline_transition",
    0x08134641: "starter_cursor_transition",
    0x08134669: "starter_label_transition",
}


def task_snapshot(read: ReadMemory) -> list[tuple[int, int, tuple[int, ...]]]:
    raw = read(TASKS, 16 * 0x28)
    if len(raw) != 16 * 0x28:
        raise ValueError("short menu owner task read")
    return [
        (
            i,
            struct.unpack_from("<I", raw, i * 0x28)[0],
            struct.unpack_from("<16h", raw, i * 0x28 + 8),
        )
        for i in range(16)
        if raw[i * 0x28 + 4] == 1
    ]


def owner_details(read: ReadMemory, callback: int) -> dict[str, MenuValue]:
    tasks = task_snapshot(read)
    return {
        "callback2": f"0x{callback:08X}",
        "task_ids": [task[0] for task in tasks],
        "task_functions": [f"0x{task[1]:08X}" for task in tasks],
        # Fixed sixteen-task maximum, sixteen signed halfwords per task. Preserve
        # initialization and unexpected phases for later owner repair.
        "task_data": [word for task in tasks for word in task[2]],
    }


def read_starter_ui(read: ReadMemory) -> "ActiveUi":
    from pokebench_env.ui_state import ActiveUi, read_menu

    owners = [task for task in task_snapshot(read) if task[1] in STARTER_PHASES]
    details = owner_details(read, STARTER_CALLBACK)
    if len(owners) != 1:
        return ActiveUi(
            "starter_unsupported",
            None,
            None,
            "Starter owner unavailable",
            "starter callback has no unique verified input owner",
            details=details,
        )
    task_id, function, data = owners[0]
    selection = data[0]
    phase = STARTER_PHASES[function]
    details.update({"owner_task": task_id, "selected_index": selection})
    if selection not in range(3):
        return ActiveUi(
            phase,
            None,
            None,
            "Starter selection unavailable",
            "starter owner has invalid selection",
            details=details,
        )
    starter = ("TREECKO", "TORCHIC", "MUDKIP")[selection]
    details["starter"] = starter
    if phase == "starter_confirmation":
        menu = read_menu(read)
        if menu is None or menu.options != 2:
            return ActiveUi(
                phase,
                None,
                None,
                "Starter confirmation unavailable",
                "starter confirmation has invalid or undrawn menu",
                value=starter,
                details=details,
            )
        choice = ("YES", "NO")[menu.selected - 1]
        details["confirmation_index"] = menu.selected - 1
        return ActiveUi(
            phase,
            choice,
            True,
            "UP/DOWN selects; A confirms; B declines",
            value=starter,
            details=details,
        )
    ready = phase == "starter_selection"
    return ActiveUi(
        phase,
        starter,
        ready,
        "LEFT/RIGHT selects; A opens confirmation"
        if ready
        else "Starter transition; selection input is not active",
        details=details,
    )


# Literal-pool addresses checked in the SHA1-pinned US ROM against historical
# pret assembly and current source layouts. These buffers are read only when
# their exact live input task/callback owns the interface.
MENU_CALLBACK = 0x03005DF4
START_CURSOR = 0x0203760E
START_ACTIONS = 0x02037610
PARTY_MENU = 0x0203CEC8
PARTY_INTERNAL = 0x0203CEC4
BAG_POSITION = 0x0203CE58
PALETTE_FADE = 0x02037FD4
LIST_TASK = 0x081AE459
PARTY_CALLBACK = 0x081B01B1
BAG_CALLBACK = 0x081AAD5D
SHOP_CALLBACK = 0x080DFD65
SUMMARY_CALLBACK = 0x081BFAB5
OPTIONS_CALLBACK = 0x080BA4B1


def _ewram(pointer: int, size: int) -> bool:
    return 0x02000000 <= pointer <= 0x02040000 - size


def _text_pointer(read: ReadMemory, pointer: int) -> str:
    from pokebench_env.native_text import decode_native_text

    if not (_ewram(pointer, 64) or 0x08000000 <= pointer <= 0x0A000000 - 64):
        raise ValueError("invalid menu text pointer")
    raw = read(pointer, 64)
    if b"\xff" not in raw:
        raise ValueError("unterminated bounded menu text")
    return decode_native_text(
        raw, require_terminator=True, line_breaks={0xFE: " ", 0xFB: " | ", 0xFA: " "}
    ).strip(" |")


def _list_selection(read: ReadMemory, task_id: int) -> tuple[str, int, int]:
    from pokebench_env.ui_state import _window_drawn

    if task_id not in range(16):
        raise ValueError("invalid list task id")
    raw = read(TASKS + task_id * 40, 40)
    if len(raw) != 40 or raw[4] != 1 or struct.unpack_from("<I", raw)[0] != LIST_TASK:
        raise ValueError("list task is not active verified ListMenuDummyTask")
    (items,) = struct.unpack_from("<I", raw, 8)
    total, shown = struct.unpack_from("<HH", raw, 20)
    scroll, row = struct.unpack_from("<HH", raw, 32)
    if not 0 < shown <= total <= 100 or row >= shown or scroll + row >= total:
        raise ValueError("invalid list length or cursor")
    if not (
        _ewram(items, total * 8) or 0x08000000 <= items <= 0x0A000000 - total * 8
    ) or not _window_drawn(read, raw[24]):
        raise ValueError("invalid or undrawn list window/items")
    name_pointer, item_id = struct.unpack("<Ii", read(items + (scroll + row) * 8, 8))
    return _text_pointer(read, name_pointer), item_id, scroll + row


# field_screen_effect.c Task_WaitForFadeShowStartMenu: ReturnToFieldOpenStartMenu draws the
# START menu, waits for the weather fade, then creates Task_ShowStartMenu (0x0809FA35).
# ROM 0x080AF660: bl WaitForWeatherFadeIn; cmp r0,#1; bl DestroyTask; ldr r0,=0x0809FA35;
# movs r1,#0x50; bl CreateTask.
START_MENU_REOPEN_TASK = 0x080AF661
START_LABELS = (
    "POKEDEX",
    "POKEMON",
    "BAG",
    "POKENAV",
    "PLAYER",
    "SAVE",
    "OPTIONS",
    "EXIT",
    "RETIRE SAFARI",
    "PLAYER LINK",
    "REST FRONTIER",
    "RETIRE FRONTIER",
    "PYRAMID BAG",
)
# party_menu.c: PARTY_SIZE is the Confirm button, PARTY_SIZE + 1 the Cancel button.
PARTY_CONFIRM, PARTY_CANCEL = 6, 7


def read_menu_family(
    read: ReadMemory,
    callback: int,
    *,
    truth: bool = False,
    party_item_confirmation: bool = False,
    party_menu_message: bool = False,
    bag_pocket_truth: bool = False,
) -> "ActiveUi | None":
    from pokebench_env.ui_state import ActiveUi, _window_drawn, read_menu

    if callback not in (
        0x08085E5D,
        PARTY_CALLBACK,
        BAG_CALLBACK,
        SHOP_CALLBACK,
        SUMMARY_CALLBACK,
        OPTIONS_CALLBACK,
    ):
        return None
    tasks = task_snapshot(read)
    details = owner_details(read, callback)
    fading = bool(read(PALETTE_FADE + 7, 1)[0] & 0x80)
    phase = ""
    selected: str | None
    labels: tuple[str, ...]
    try:
        if callback == 0x08085E5D and any(t[1] == 0x080DFB89 for t in tasks):
            phase = "shop_action_menu"
            menu = read_menu(read)
            mart_type = read(0x02039F60 + 15, 1)[0]
            options = ["BUY", "SELL", "QUIT"] if mart_type == 0 else ["BUY", "QUIT"]
            if menu is None or menu.options != len(options):
                raise ValueError("invalid or undrawn Shop action menu")
            details.update(
                {"options": options, "selected_index": menu.selected - 1, "mart_type": mart_type}
            )
            return ActiveUi(
                phase,
                options[menu.selected - 1],
                not fading,
                "UP/DOWN selects; A accepts; B quits",
                details=details,
            )
        if (
            callback == 0x08085E5D
            and any(t[1] == 0x0809FA35 and t[2][0] == 1 for t in tasks)
            and struct.unpack("<I", read(MENU_CALLBACK, 4))[0] == 0x0809FAC5
        ):
            phase = "start_menu"
            cursor, count = read(START_CURSOR, 2)
            actions = list(read(START_ACTIONS, 9))[:count]
            labels = START_LABELS
            if (
                count not in range(1, 10)
                or cursor >= count
                or any(a >= len(labels) for a in actions)
            ):
                raise ValueError("invalid Start menu actions/cursor")
            menu = read_menu(read)
            if menu is None or menu.selected != cursor + 1 or menu.options != count:
                raise ValueError("Start menu cursor is stale or window undrawn")
            details.update({"selected_index": cursor, "options": [labels[a] for a in actions]})
            return ActiveUi(
                phase,
                labels[actions[cursor]],
                not fading,
                "UP/DOWN selects; A accepts; B or START closes",
                details=details,
            )
        if (
            truth
            and callback == 0x08085E5D
            and sum(t[1] == START_MENU_REOPEN_TASK for t in tasks) == 1
            and not any(t[1] == 0x0809FA35 for t in tasks)
        ):
            # readout-truth-v1: the START menu redrawn when a screen opened from it closes.
            phase = "start_menu"
            cursor, count = read(START_CURSOR, 2)
            actions = list(read(START_ACTIONS, 9))[:count]
            if count not in range(1, 10) or cursor >= count or any(a >= 13 for a in actions):
                raise ValueError("invalid reopened Start menu actions/cursor")
            menu = read_menu(read)
            if menu is None or menu.selected != cursor + 1 or menu.options != count:
                raise ValueError("reopened Start menu cursor is stale or window undrawn")
            options = [START_LABELS[a] for a in actions]
            details.update({"selected_index": cursor, "options": options})
            return ActiveUi(
                phase,
                options[cursor],
                False,
                "START menu redrawn after another screen closed; input is not active "
                "until the screen finishes fading in",
                details=details,
            )
        if callback == PARTY_CALLBACK:
            phase = "party_menu"
            state = read(PARTY_MENU, 20)
            slot, second, action = struct.unpack_from("<bbB", state, 9)
            confirmation_phases = {
                0x081B1709: "party_cancel_choice_confirmation",
                0x081B227D: "party_cancel_participation_confirmation",
                0x081B43DD: "party_switch_held_item_confirmation",
                0x081B48DD: "party_toss_held_item_confirmation",
                0x081B4BA1: "party_send_mail_to_pc_confirmation",
                0x081B4C95: "party_lose_mail_confirmation",
                0x081B5431: "party_spin_trade_confirmation",
                0x081B56D9: "party_field_move_exit_confirmation",
                0x081B7029: "party_replace_move_confirmation",
                0x081B72C9: "party_stop_learning_confirmation",
                0x081B82D5: "party_switch_item_from_bag_confirmation",
            }
            # readout-truth-v1: slot 7 is the Cancel button (B or Cancel sets it before closing).
            party_slots = range(8) if truth or party_menu_message else range(7)
            confirmations = [task for task in tasks if task[1] in confirmation_phases]
            if confirmations:
                if len(confirmations) != 1 or slot not in party_slots:
                    raise ValueError("invalid Party confirmation owner")
                menu = read_menu(read)
                if menu is None or menu.options != 2:
                    raise ValueError("Party confirmation YES/NO window is invalid")
                details.update(
                    {
                        "party_slot": slot,
                        "party_action": action,
                        "owner_task": confirmations[0][0],
                        "options": ["YES", "NO"],
                        "selected_index": menu.selected - 1,
                    }
                )
                return ActiveUi(
                    confirmation_phases[confirmations[0][1]],
                    ("YES", "NO")[menu.selected - 1],
                    not fading and not any(task[1] == 0x081B1B8D for task in tasks),
                    "UP/DOWN selects; A confirms; B declines",
                    details=details,
                )
            passive_phases = {
                0x081B1E61: "party_hp_animation",
                0x081B672D: "party_healed_message_transition",
                0x081B6795: "party_item_message",
                0x081B12F9: "party_close_transition",
                0x081B1BE9: "party_link_wait_transition",
                0x081B1C1D: "party_return_after_message",
                0x081B42D1: "party_give_item_transition",
                0x081B4351: "party_switch_item_message_transition",
                0x081B43A9: "party_switch_item_confirmation_transition",
                0x081B469D: "party_held_item_update_transition",
            }
            passive = [task for task in tasks if task[1] in passive_phases]
            if passive:
                if len(passive) != 1 or slot not in party_slots:
                    raise ValueError("invalid Party item/close transition owner")
                owner_task, function, _data = passive[0]
                details.update(
                    {"party_slot": slot, "party_action": action, "owner_task": owner_task}
                )
                phase = passive_phases[function]
                if (
                    function == 0x081B6795 or (party_menu_message and function == 0x081B1C1D)
                ) and any(task[1] == 0x081B1B8D for task in tasks):
                    from pokebench_env.ui_state import STRING_VAR4, STRING_VAR4_SIZE, decode_message

                    if not _window_drawn(read, 6):
                        raise ValueError("Party item message window is not drawn")
                    message_bytes = read(STRING_VAR4, STRING_VAR4_SIZE)
                    message = decode_message(message_bytes)
                    if not message:
                        raise ValueError("Party item message buffer is empty")
                    return_message = party_menu_message and function == 0x081B1C1D
                    if not return_message:
                        details["message"] = message
                    if party_item_confirmation or return_message:
                        from pokebench_env.battle_text import AUTO_SCROLL, PRINTERS, TEXT_FLAGS

                        printers = [t for t in tasks if t[1] == 0x081B1B8D]
                        if len(printers) != 1:
                            raise ValueError("Party message has no unique text task")
                        printer = read(PRINTERS + 6 * 0x24, 0x24)
                        if len(printer) != 0x24:
                            raise ValueError("short Party text printer read")
                        if printer[0x1B] == 1:
                            cursor = struct.unpack_from("<I", printer)[0] - STRING_VAR4
                            if printer[4] != 6 or not 0 <= cursor <= message_bytes.find(b"\xff"):
                                raise ValueError("Party printer has invalid window/message cursor")
                            if printer[0x1C] not in range(7):
                                raise ValueError("Party printer has unknown render state")
                            if return_message:
                                details["message"] = message
                            # text.c EXT_CTRL_CODE_PAUSE_UNTIL_PRESS consumes FC 09,
                            # then RENDER_STATE_WAIT polls A/B unless autoScroll is set.
                            payload = message_bytes[:cursor]
                            if printer[0x1C] == 1 and payload.endswith(b"\xfc\x09"):
                                if not fading and not read(TEXT_FLAGS, 1)[0] & AUTO_SCROLL:
                                    return ActiveUi(
                                        phase,
                                        "A/B: CONTINUE",
                                        True,
                                        "A or B continues the message",
                                        details=details,
                                    )
                return ActiveUi(
                    phase,
                    None,
                    False,
                    "Game-owned item animation/message or menu handoff in progress",
                    details=details,
                )
            function_owners = [t for t in tasks if t[1] in (0x081B1371, 0x081B3731)]
            if len(function_owners) != 1:
                raise ValueError("party menu has no unique verified input owner")
            details.update(
                {
                    "party_slot": slot,
                    "switch_target_slot": second,
                    "party_action": action,
                    "party_menu_type": state[8] & 15,
                    "owner_task": function_owners[0][0],
                }
            )
            if slot not in party_slots or second not in range(-1, party_slots.stop):
                raise ValueError("invalid party slot")
            if function_owners[0][1] == 0x081B3731:
                phase = "party_action_menu"
                pointer = struct.unpack("<I", read(PARTY_INTERNAL, 4))[0]
                if not _ewram(pointer, 24):
                    raise ValueError("invalid PartyMenuInternal pointer")
                internal = read(pointer, 24)
                count = internal[23]
                actions = list(internal[15:23])[:count]
                labels = (
                    "SUMMARY",
                    "SWITCH",
                    "CANCEL",
                    "ITEM",
                    "GIVE",
                    "TAKE ITEM",
                    "MAIL",
                    "TAKE MAIL",
                    "READ",
                    "CANCEL",
                    "SHIFT",
                    "SEND OUT",
                    "ENTER",
                    "NO ENTRY",
                    "STORE",
                    "REGISTER",
                    "TRADE",
                    "TRADE",
                    "TOSS",
                    "CUT",
                    "FLASH",
                    "ROCK SMASH",
                    "STRENGTH",
                    "SURF",
                    "FLY",
                    "DIVE",
                    "WATERFALL",
                    "TELEPORT",
                    "DIG",
                    "SECRET POWER",
                    "MILK DRINK",
                    "SOFT-BOILED",
                    "SWEET SCENT",
                )
                menu = read_menu(read, allow_single=count == 1)
                if menu is None or not 1 <= count <= 8 or menu.options != count:
                    raise ValueError("invalid or undrawn party action menu")
                if any(a >= len(labels) for a in actions):
                    raise ValueError("unmapped party field move action")
                options = [labels[a] for a in actions]
                details.update({"options": options, "selected_index": menu.selected - 1})
                selected = options[menu.selected - 1]
            else:
                # PARTY_ACTION_SWITCH=8, SOFTBOILED=10 own the second cursor.
                selected_slot = second if action in (8, 10) else slot
                if party_menu_message and selected_slot not in range(8):
                    raise ValueError("Party cursor has no selected slot")
                details["selected_index"] = selected_slot
                selected = (
                    {PARTY_CONFIRM: "CONFIRM", PARTY_CANCEL: "CANCEL"}.get(
                        selected_slot, f"PARTY SLOT {selected_slot + 1}"
                    )
                    if truth or party_menu_message
                    else "CANCEL"
                    if selected_slot == 6
                    else f"PARTY SLOT {selected_slot + 1}"
                )
            if party_menu_message and phase == "party_menu" and selected_slot in range(6):
                selected = f"PARTY SLOT {selected_slot + 1} (index {selected_slot})"
            return ActiveUi(
                phase,
                selected,
                not fading,
                "Directions select; A accepts; B cancels",
                details=details,
            )
        if callback == BAG_CALLBACK:
            phase = "bag_menu"
            closing = [task for task in tasks if task[1] in (0x081AB8F9, 0x081AB931)]
            if closing:
                if len(closing) != 1:
                    raise ValueError("ambiguous Bag close transition owner")
                details["owner_task"] = closing[0][0]
                return ActiveUi(
                    "bag_close_transition",
                    None,
                    False,
                    "Bag closing or handing off to next menu",
                    details=details,
                )
            owners = [
                t
                for t in tasks
                if t[1]
                in (
                    0x081ABD29,
                    0x081ACC05,
                    0x081ACC79,
                    0x081AD045,
                    0x081AD795,
                    0x081ADA7D,
                    0x081AC3C1,
                    0x081AC10D,
                    0x081AD9C1,
                    0x081ADC0D,
                )
            ]
            if len(owners) != 1:
                raise ValueError("Bag has no unique verified input owner")
            task, fn, data = owners[0]
            position = read(BAG_POSITION, 28)
            pocket = position[5]
            if pocket not in range(5):
                raise ValueError("invalid Bag pocket")
            details.update(
                {
                    "pocket": (
                        ("ITEMS", "POKE BALLS", "TMS HMS", "BERRIES", "KEY ITEMS")
                        if bag_pocket_truth
                        else ("ITEMS", "KEY ITEMS", "POKE BALLS", "TMS HMS", "BERRIES")
                    )[pocket],
                    "bag_location": position[4],
                    "owner_task": task,
                }
            )
            if fn == 0x081AC10D:
                details.update({"pocket_direction": data[11], "pocket_switch_state": data[13]})
                return ActiveUi(
                    "bag_pocket_transition",
                    None,
                    False,
                    "Pocket animation in progress",
                    details=details,
                )
            if fn in (0x081AD9C1, 0x081ADC0D):
                return ActiveUi(
                    "bag_transaction_message",
                    "CONTINUE",
                    not fading,
                    "A or B returns to list",
                    details=details,
                )
            if fn in (0x081ABD29, 0x081AC3C1):
                selected, list_id, index = _list_selection(read, data[0])
                details.update({"selected_index": index, "list_item_id": list_id})
                if fn == 0x081AC3C1:
                    phase = "bag_swap_target"
                    pointer = struct.unpack("<I", read(0x0203CE54, 4))[0]
                    if not _ewram(pointer, 0x831):
                        raise ValueError("invalid Bag swap owner heap")
                    details["swap_source_index"] = read(pointer + 0x830, 1)[0]
                if list_id >= 0:
                    pocket_record = read(0x02039DD8 + pocket * 8, 8)
                    slots, capacity = struct.unpack_from("<IB", pocket_record)
                    if list_id >= capacity or not _ewram(slots, capacity * 4):
                        raise ValueError("invalid Bag pocket slots/index")
                    details["item_id"] = struct.unpack("<H", read(slots + list_id * 4, 2))[0]
            else:
                phase = {
                    0x081AD045: "bag_quantity",
                    0x081AD795: "bag_sell_quantity",
                    0x081ADA7D: "bag_deposit_quantity",
                }.get(fn, "bag_context_menu")
                details.update(
                    {
                        "selected_index": data[1],
                        "quantity_available": data[2],
                        "item_id": struct.unpack("<H", read(0x0203CE7C, 2))[0],
                    }
                )
                menu = read_menu(read)
                selected = None
                if phase == "bag_context_menu":
                    pointer = struct.unpack("<I", read(0x0203CE54, 4))[0]
                    if not _ewram(pointer, 0x829):
                        raise ValueError("invalid BagMenu pointer")
                    count = read(pointer + 0x828, 1)[0]
                    action_pointer = struct.unpack("<I", read(pointer + 0x820, 4))[0]
                    if not 1 <= count <= 6 or not (
                        _ewram(action_pointer, count)
                        or 0x08000000 <= action_pointer <= 0x0A000000 - count
                    ):
                        raise ValueError("invalid Bag context action array")
                    actions = list(read(action_pointer, count))
                    labels = (
                        "USE",
                        "TOSS",
                        "REGISTER",
                        "GIVE",
                        "CANCEL",
                        "USE",
                        "CHECK",
                        "WALK",
                        "DESELECT",
                        "CHECK TAG",
                        "CONFIRM",
                        "SHOW",
                        "GIVE",
                        "CONFIRM",
                        "EMPTY",
                    )
                    menu = read_menu(read, allow_single=count == 1)
                    if menu is None or any(a >= len(labels) for a in actions):
                        raise ValueError("invalid or undrawn Bag context menu")
                    if menu.selected > count:
                        raise ValueError("Bag context cursor exceeds action count")
                    options = [labels[a] for a in actions]
                    details.update({"options": options, "selected_index": menu.selected - 1})
                    selected = options[menu.selected - 1]
                else:
                    pointer = struct.unpack("<I", read(0x0203CE54, 4))[0]
                    if not _ewram(pointer, 0x829) or not 1 <= data[8] <= data[2]:
                        raise ValueError("invalid Bag quantity owner/value")
                    quantity_window = read(pointer + (0x818 if fn == 0x081AD795 else 0x817), 1)[0]
                    if not _window_drawn(read, quantity_window):
                        raise ValueError("Bag quantity window is not drawn")
                    details["quantity"] = data[8]
                    selected = str(data[8])
            return ActiveUi(
                phase,
                selected,
                not fading,
                "Directions select; A accepts; B cancels",
                details=details,
            )
        if callback == SUMMARY_CALLBACK:
            phase = "pokemon_summary"
            pointer = struct.unpack("<I", read(0x0203CF1C, 4))[0]
            if not _ewram(pointer, 0x40F8):
                raise ValueError("invalid PokemonSummaryScreenData pointer")
            state = read(pointer + 0x40BC, 14)
            mode, _boxed, index, maximum, page = state[:5]
            first, second = state[10:12]
            moves = list(struct.unpack("<4H", read(pointer + 0x84, 8)))
            pp = list(read(pointer + 0x8C, 4))
            new_move = struct.unpack("<H", state[8:10])[0]
            if mode not in range(4) or index > maximum or page not in range(4):
                raise ValueError("invalid summary mode/party index/page")
            if any(move > 354 for move in moves) or new_move > 354:
                raise ValueError("invalid summary move id")
            from pokebench_env.pokemon import MOVE_NAMES

            move_names = [
                _text_pointer(read, MOVE_NAMES + move * 13) if move else "NONE" for move in moves
            ]
            phases = {
                0x081C0511: "pokemon_summary",
                0x081C0F45: "summary_move_selection",
                0x081C12E5: "summary_move_reorder",
                0x081C174D: "summary_move_forget",
                0x081C1941: "summary_hm_rejection",
            }
            owners = [t for t in tasks if t[1] in phases]
            if len(owners) != 1:
                raise ValueError("summary has no unique verified input owner")
            phase = phases[owners[0][1]]
            summary_ready = not fading and not any(t[1] == 0x081C1E21 for t in tasks)
            if phase == "summary_hm_rejection":
                details["message"] = "HM moves cannot be forgotten."
            details.update(
                {
                    "owner_task": owners[0][0],
                    "party_slot": index,
                    "summary_mode": mode,
                    "page": ("INFO", "SKILLS", "BATTLE MOVES", "CONTEST MOVES")[page],
                    "move_ids": moves,
                    "move_names": move_names,
                    "move_pp": pp,
                    "new_move_id": new_move,
                    "new_move_name": _text_pointer(read, MOVE_NAMES + new_move * 13)
                    if new_move
                    else "NONE",
                    "first_move_index": first,
                    "second_move_index": second,
                }
            )
            selected = ("INFO", "SKILLS", "BATTLE MOVES", "CONTEST MOVES")[page]
            if phase != "pokemon_summary":
                selected_index = second if phase == "summary_move_reorder" else first
                if selected_index not in range(5):
                    raise ValueError("invalid summary move cursor")
                details["selected_index"] = selected_index
                move = moves[selected_index] if selected_index < 4 else new_move
                selected = _text_pointer(read, MOVE_NAMES + move * 13) if move else "CANCEL"
            return ActiveUi(
                phase,
                selected,
                summary_ready,
                "Directions select; A accepts; B cancels",
                details=details,
            )
        if callback == OPTIONS_CALLBACK:
            phase = "options_menu"
            owners = [t for t in tasks if t[1] == 0x080BA86D]
            if len(owners) != 1:
                raise ValueError("Options has no unique verified input owner")
            task, _, data = owners[0]
            limits = (7, 3, 2, 2, 2, 3, 20)
            if any(value not in range(limit) for value, limit in zip(data, limits, strict=False)):
                raise ValueError("invalid Options cursor/value")
            names = (
                "TEXT SPEED",
                "BATTLE SCENE",
                "BATTLE STYLE",
                "SOUND",
                "BUTTON MODE",
                "FRAME",
                "CANCEL",
            )
            details.update(
                {
                    "owner_task": task,
                    "selected_index": data[0],
                    "text_speed": data[1],
                    "battle_scene_off": data[2],
                    "battle_style": data[3],
                    "sound": data[4],
                    "button_mode": data[5],
                    "window_frame": data[6],
                }
            )
            return ActiveUi(
                phase,
                names[data[0]],
                not fading,
                "UP/DOWN selects setting; LEFT/RIGHT changes; B exits",
                details=details,
            )
        if callback == SHOP_CALLBACK:
            phase = "shop_menu"
            owners = [t for t in tasks if t[1] in (0x080E0AC9, 0x080E0D89)]
            if len(owners) != 1:
                raise ValueError("Shop has no unique verified input owner")
            task, fn, data = owners[0]
            details["owner_task"] = task
            if fn == 0x080E0AC9:
                selected, list_id, index = _list_selection(read, data[7])
                details.update({"selected_index": index, "list_item_id": list_id})
                if list_id >= 0:
                    mart = read(0x02039F60, 16)
                    item_list = struct.unpack_from("<I", mart, 8)[0]
                    count = struct.unpack_from("<H", mart, 12)[0]
                    if list_id >= count or not (0x08000000 <= item_list <= 0x0A000000 - count * 2):
                        raise ValueError("invalid shop item list/index")
                    details["item_id"] = struct.unpack("<H", read(item_list + list_id * 2, 2))[0]
            else:
                phase = "shop_quantity"
                details.update({"item_id": data[5], "quantity": data[1]})
                selected = f"ITEM {data[5]}"
            return ActiveUi(
                phase,
                selected,
                not fading,
                "Directions select; A accepts; B cancels",
                details=details,
            )
    except (ValueError, struct.error, IndexError) as error:
        return ActiveUi(
            phase or "menu_unsupported",
            None,
            None,
            "Menu observation unavailable",
            str(error),
            details=details,
        )
    return None
