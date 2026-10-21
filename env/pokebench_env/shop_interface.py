"""shop-interface-v1: the buy screen's Interface line names what the game shows.

pret/pokeemerald 731ad5bfd6e6f265508d0efcca0ba42f9dcf5881, src/shop.c:

- Task_BuyMenu: data[7] is the list menu task. BuyMenuSetListEntry gives each row the item id
  as its id, and the CANCEL row LIST_CANCEL; the native reader took that id as an index into
  the stock (a wrong item on row 0, "invalid shop item list/index" on later rows).
- Task_BuyHowManyDialogueHandleInput: tItemId is data[5], tItemCount data[1].
- BuyMenuSubtractMoney hands the task to Task_ReturnToItemListAfterItemPurchase, which waits for
  A or B under gText_HereYouGoThankYou; the native reader had no owner for it. That task is
  reached only from that page (src/shop.c), and PrintMoneyAmountInMoneyBox has already
  overwritten gStringVar4 with the money, so the page is named from the game's string.

A post-pass over the native result, like evolution-decision-v1's decision_ui: with no unique
known owner, or a failed read, the native result is returned unchanged.
"""

import struct

from pokebench_env.game_screen import ReadMemory
from pokebench_env.menus import SHOP_CALLBACK, _list_selection, task_snapshot
from pokebench_env.pokemon import read_item_name
from pokebench_env.ui_state import ActiveUi

SWITCH = "shop-interface-v1"

MAIN_CALLBACK2 = 0x030022C4  # gMain.callback2
PALETTE_FADE = 0x02037FD4
BUY_MENU_TASK = 0x080E0AC9  # Task_BuyMenu
QUANTITY_TASK = 0x080E0D89  # Task_BuyHowManyDialogueHandleInput
AFTER_PURCHASE_TASK = 0x080E100D  # Task_ReturnToItemListAfterItemPurchase
LIST_CANCEL = -2
CANCEL = "CANCEL"  # gText_Cancel2
HERE_YOU_GO = "Here you go! | Thank you very much."  # gText_HereYouGoThankYou
CONTROLS = "Directions select; A accepts; B cancels"  # the native shop reader's words
SHOP_PHASES = frozenset({"shop_menu", "shop_quantity"})
_NATIVE_LIST_KEYS = ("selected_index", "list_item_id", "item_id", "quantity")


def shop_ui(ui: ActiveUi | None, read: ReadMemory) -> ActiveUi | None:
    if ui is None or ui.phase not in SHOP_PHASES:
        return ui
    if struct.unpack("<I", read(MAIN_CALLBACK2, 4))[0] != SHOP_CALLBACK:
        return ui
    owners = [
        task
        for task in task_snapshot(read)
        if task[1] in (BUY_MENU_TASK, QUANTITY_TASK, AFTER_PURCHASE_TASK)
    ]
    if len(owners) != 1:
        return ui
    task, function, data = owners[0]
    ready = not bool(read(PALETTE_FADE + 7, 1)[0] & 0x80)
    details = {k: v for k, v in (ui.details or {}).items() if k not in _NATIVE_LIST_KEYS}
    details["owner_task"] = task
    try:
        if function == BUY_MENU_TASK:
            name, row_id, index = _list_selection(read, data[7])
            details["selected_index"] = index
            if row_id != LIST_CANCEL:
                read_item_name(read, row_id)
                details["item_id"] = row_id
            selected = CANCEL if row_id == LIST_CANCEL else name
            return ActiveUi("shop_menu", selected, ready, CONTROLS, details=details)
        if function == QUANTITY_TASK:
            details.update({"item_id": data[5], "quantity": data[1]})
            name = read_item_name(read, data[5])
            return ActiveUi("shop_quantity", name, ready, CONTROLS, details=details)
        details["message"] = HERE_YOU_GO
        return ActiveUi("shop_purchase_message", None, ready, "A or B continues", details=details)
    except (ValueError, IndexError, struct.error):
        return ui
