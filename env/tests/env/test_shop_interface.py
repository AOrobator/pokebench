"""shop-interface-v1: the buy screen's Interface line names what the game shows.

Fixtures are the mart-stock raw-RAM archives from run 2026-10-21T06-28-18_qwen36-gpu0_1331
(mart-stock-raw.provenance.json): the RUSTBORO CITY MART buy list with row 0 and row 2
highlighted, the quantity box, the message after buying a SUPER POTION, and the BUY/SELL/QUIT
menu. Game: pret/pokeemerald 731ad5bf src/shop.c (Task_BuyMenu, BuyMenuSetListEntry,
Task_BuyHowManyDialogueHandleInput, BuyMenuSubtractMoney,
Task_ReturnToItemListAfterItemPurchase), src/strings.c gText_HereYouGoThankYou.
"""

from __future__ import annotations

from test_mart_stock import archived, maps

from pokebench_env.game_state import GameState
from pokebench_env.readout import SERVER_FEATURES, features_off_from_env
from pokebench_env.rerender import read_state
from pokebench_env.shop_interface import SWITCH

MART = frozenset({"mart-stock-readout-v1"})


def state(name: str, off: frozenset[str] = frozenset()) -> GameState:
    return read_state(archived(name), maps(), active_ui=True, off=off)


def test_switch_is_registered_server_side_last_and_default_off() -> None:
    assert SERVER_FEATURES[68] == SWITCH == "shop-interface-v1"
    assert SWITCH in features_off_from_env({})
