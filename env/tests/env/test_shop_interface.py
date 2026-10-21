"""shop-interface-v1: the buy screen's Interface line names what the game shows.

Fixtures are the mart-stock raw-RAM archives from run 2026-10-21T06-28-18_qwen36-gpu0_1331
(mart-stock-raw.provenance.json): the RUSTBORO CITY MART buy list with row 0 and row 2
highlighted, the quantity box, the message after buying a SUPER POTION, and the BUY/SELL/QUIT
menu. Game: pret/pokeemerald 731ad5bf src/shop.c (Task_BuyMenu, BuyMenuSetListEntry,
Task_BuyHowManyDialogueHandleInput, BuyMenuSubtractMoney,
Task_ReturnToItemListAfterItemPurchase), src/strings.c gText_HereYouGoThankYou.
"""

from __future__ import annotations

import struct
from dataclasses import replace

import pytest
from test_mart_stock import PROVENANCE, archived, list_task, maps, patched

from pokebench_env.game_screen import TASKS
from pokebench_env.game_state import GameState
from pokebench_env.menus import task_snapshot
from pokebench_env.readout import SERVER_FEATURES, features_off_from_env, state_json
from pokebench_env.rerender import read_state, render
from pokebench_env.shop_interface import AFTER_PURCHASE_TASK, SWITCH, shop_ui

OFF = frozenset({SWITCH})
MART = frozenset({"mart-stock-readout-v1"})


def state(name: str, off: frozenset[str] = frozenset()) -> GameState:
    return read_state(archived(name), maps(), active_ui=True, off=off)


def interface(text: str) -> list[str]:
    lines = text.split("\n")
    start = next(i for i, line in enumerate(lines) if line.startswith("Menu"))
    end = next(i for i, line in enumerate(lines) if line.startswith(("Bag:", "Story:")))
    return lines[start:end]


def test_row0_names_the_real_item_id() -> None:
    assert interface(render(state("buy-list-row0", MART), MART)) == [
        "Menu: shop_menu; selected POKé BALL",
        "Interface: shop_menu; input ready; selected POKé BALL; Directions select; A accepts; "
        "B cancels",
        "Menu state: selected index (zero based): 0; item id: 4",
    ]


def test_row2_is_no_longer_a_coverage_error() -> None:
    assert interface(render(state("buy-list-row2", MART), MART)) == [
        "Menu: shop_menu; selected SUPER POTION",
        "Interface: shop_menu; input ready; selected SUPER POTION; Directions select; "
        "A accepts; B cancels",
        "Menu state: selected index (zero based): 2; item id: 22",
    ]


def test_quantity_box_names_the_item() -> None:
    assert interface(render(state("quantity-box", MART), MART)) == [
        "Menu: shop_quantity; selected SUPER POTION",
        "Interface: shop_quantity; input ready; selected SUPER POTION; Directions select; "
        "A accepts; B cancels",
        "Menu state: item id: 22; quantity: 1",
    ]


def test_after_purchase_message_is_a_ready_owner() -> None:
    assert interface(render(state("after-purchase", MART), MART)) == [
        "Menu: no menu choice open (the Interface line says what owns input)",
        "Interface: shop_purchase_message; input ready; A or B continues",
        "Menu state: message: Here you go! | Thank you very much.",
    ]
    ui = state("after-purchase").active_ui
    assert ui is not None
    assert (ui.phase, ui.selected, ui.ready, ui.diagnostic) == (
        "shop_purchase_message",
        None,
        True,
        None,
    )


def test_cancel_row_is_named_cancel_without_an_item() -> None:
    read = patched("buy-list-row0", {list_task("buy-list-row0") + 32: struct.pack("<HH", 3, 7)})
    ui = shop_ui(read_state(read, maps(), active_ui=True, off=OFF).active_ui, read)
    assert ui is not None
    assert (ui.phase, ui.selected, ui.ready) == ("shop_menu", "CANCEL", True)
    assert ui.details is not None and "item_id" not in ui.details
    assert "list_item_id" not in ui.details
    assert ui.details["selected_index"] == 10


def test_action_menu_and_other_screens_are_untouched() -> None:
    native = state("action-menu", OFF).active_ui
    assert shop_ui(native, archived("action-menu")) is native
    assert shop_ui(None, archived("action-menu")) is None


def test_no_unique_known_owner_keeps_the_native_result() -> None:
    base = archived("after-purchase")
    (owner,) = [t for t, function, _ in task_snapshot(base) if function == AFTER_PURCHASE_TASK]
    read = patched("after-purchase", {TASKS + 40 * owner: struct.pack("<I", 0x080E1201)})
    native = read_state(read, maps(), active_ui=True, off=OFF).active_ui
    assert native is not None and native.diagnostic is not None
    assert shop_ui(native, read) is native


def test_a_failed_list_read_keeps_the_native_diagnostic() -> None:
    read = patched("buy-list-row2", {list_task("buy-list-row2") + 4: bytes([0])})
    native = read_state(read, maps(), active_ui=True, off=OFF).active_ui
    ui = shop_ui(native, read)
    assert ui is not None and ui.diagnostic is not None


OFF_GOLDEN = {
    "buy-list-row0": [
        "Menu: shop_menu; selected POKé BALL",
        "Interface: shop_menu; input ready; selected POKé BALL; Directions select; A accepts; "
        "B cancels",
        "Menu state: selected index (zero based): 0; item id: 18",
    ],
    "buy-list-row2": [
        "Unverified menu buffer: cursor 1 of 3; active menu owner unavailable",
        "Interface: shop_menu; input unavailable; Menu observation unavailable; "
        "STATE COVERAGE ERROR: invalid shop item list/index",
        "Menu state: selected index (zero based): 2",
    ],
    "quantity-box": [
        "Menu: shop_quantity; selected ITEM 22",
        "Interface: shop_quantity; input ready; selected ITEM 22; Directions select; A accepts; "
        "B cancels",
        "Menu state: item id: 22; quantity: 1",
    ],
    "after-purchase": [
        "Menu: unavailable (active owner not verified)",
        "Interface: shop_menu; input unavailable; Menu observation unavailable; "
        "STATE COVERAGE ERROR: Shop has no unique verified input owner",
    ],
}


@pytest.mark.parametrize("name", list(OFF_GOLDEN))
def test_off_is_the_previous_shop_readout(name: str) -> None:
    lines = render(state(name, OFF), OFF).split("\n")
    start = next(i for i, line in enumerate(lines) if line.startswith("Dialog:")) + 1
    assert lines[start : start + len(OFF_GOLDEN[name])] == OFF_GOLDEN[name]


@pytest.mark.parametrize("name", list(PROVENANCE["archives"]))
def test_only_the_interface_differs_on_and_off(name: str) -> None:
    on, off = state(name), state(name, OFF)
    assert replace(on, active_ui=off.active_ui, dialog=off.dialog) == off


@pytest.mark.parametrize("name", ["action-menu"])
def test_state_json_unchanged_off_the_buy_screen(name: str) -> None:
    assert state_json(state(name)) == state_json(state(name, OFF))


def test_switch_is_registered_server_side_last_and_default_off() -> None:
    assert SERVER_FEATURES[-2] == SWITCH == "shop-interface-v1"
    assert SWITCH in features_off_from_env({})


def test_a_shop_phase_off_the_buy_screen_callback_is_untouched() -> None:
    native = state("buy-list-row0", OFF).active_ui
    read = patched("buy-list-row0", {0x030022C4: struct.pack("<I", 0x08085E5D)})
    assert shop_ui(native, read) is native


def test_two_known_owners_keep_the_native_result() -> None:
    base = archived("after-purchase")
    others = [t for t, function, _ in task_snapshot(base) if function != AFTER_PURCHASE_TASK]
    read = patched("after-purchase", {TASKS + 40 * others[0]: struct.pack("<I", 0x080E0AC9)})
    native = read_state(read, maps(), active_ui=True, off=OFF).active_ui
    assert shop_ui(native, read) is native


def test_decoration_shop_keeps_the_native_result() -> None:
    # Review round 1: a decoration shop's row id is a decoration id, not an item id.
    read = patched("buy-list-row2", {0x02039F60 + 15: bytes([1])})
    native = read_state(read, maps(), active_ui=True, off=OFF).active_ui
    assert shop_ui(native, read) is native
