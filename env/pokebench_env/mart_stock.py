"""mart-stock-readout-v1: the clerk's buy list with each price and the game's item description.

pret/pokeemerald 731ad5bfd6e6f265508d0efcca0ba42f9dcf5881, src/shop.c:

- sMartInfo (EWRAM 0x02039F60) holds the shop's itemList (+8), itemCount (+12) and martType
  (+15); only MART_TYPE_NORMAL (0) sells items, the decoration shops list gDecorations.
- BuyMenuSetListEntry gives each list row the item id as its id; the row after the stock is
  gText_Cancel2 "CANCEL" with id LIST_CANCEL.
- BuyMenuPrintPriceInList prints GetItemPrice(item) >> IsPokeNewsActive(POKENEWS_SLATEPORT) as
  gText_PokedollarVar1 "¥{STR_VAR_1}". src/tv.c ShouldApplyPokeNewsEffect makes the Slateport
  sale apply only on SLATEPORT CITY while the player talks to the Energy Guru.
- BuyMenuPrintItemDescriptionAndShowItemIcon shows GetItemDescription(item) for the highlighted
  row, or gText_QuitShopping "Quit shopping." for CANCEL.

Run 2026-10-21T06-28-18_qwen36-gpu0_1331 opened the RUSTBORO CITY MART list at turns 680-690.
"""

import struct
from dataclasses import dataclass

from pokebench_env.battle_choices import exact
from pokebench_env.game_screen import ReadMemory
from pokebench_env.menus import SHOP_CALLBACK, _list_selection, task_snapshot
from pokebench_env.native_text import decode_native_text
from pokebench_env.pokemon import ITEMS, read_item_name

SWITCH = "mart-stock-readout-v1"

MAIN_CALLBACK2 = 0x030022C4  # gMain.callback2
MART_INFO = 0x02039F60  # sMartInfo
BUY_MENU_TASK = 0x080E0AC9  # Task_BuyMenu; data[7] is the list menu task
LIST_CANCEL = -2
MART_TYPE_NORMAL = 0
MAX_STOCK = 100
# SaveBlock1: location.mapGroup/mapNum at +4/+5, pokeNews[16] {kind, state, dayCountdown} at
# +0x2B50 (include/global.h).
LOCATION = 4
POKE_NEWS = 0x2B50
POKE_NEWS_COUNT = 16
POKENEWS_SLATEPORT = 1
POKENEWS_STATE_ACTIVE = 2
SLATEPORT_CITY = (0, 1)
ENERGY_GURU = 25  # LOCALID_SLATEPORT_ENERGY_GURU, data/maps/SlateportCity/map.json
LAST_TALKED = 0x020375F2  # gSpecialVar_LastTalked, after gSpecialVar_Result (0x020375F0)

CANCEL = "CANCEL"  # gText_Cancel2
QUIT_SHOPPING = "Quit shopping."  # gText_QuitShopping


@dataclass(frozen=True)
class MartItem:
    item_id: int
    name: str
    price: int
    description: str


@dataclass(frozen=True)
class MartStock:
    """A normal shop's buy list; highlighted is the row index (len(items) is CANCEL)."""

    items: tuple[MartItem, ...]
    highlighted: int | None


def _u16(read: ReadMemory, address: int) -> int:
    return int(struct.unpack("<H", exact(read, address, 2))[0])


def _sale(read: ReadMemory, save1: int) -> bool:
    """IsPokeNewsActive(POKENEWS_SLATEPORT) as the buy list applies it."""
    if tuple(exact(read, save1 + LOCATION, 2)) != SLATEPORT_CITY:
        return False
    news = exact(read, save1 + POKE_NEWS, 4 * POKE_NEWS_COUNT)
    for slot in range(POKE_NEWS_COUNT):
        if news[4 * slot] == POKENEWS_SLATEPORT:
            return (
                news[4 * slot + 1] == POKENEWS_STATE_ACTIVE
                and _u16(read, LAST_TALKED) == ENERGY_GURU
            )
    return False


def _item(read: ReadMemory, item_id: int, halve: bool) -> MartItem:
    name = read_item_name(read, item_id)
    row = exact(read, ITEMS + 44 * item_id, 44)
    price = struct.unpack_from("<H", row, 16)[0]
    pointer = struct.unpack_from("<I", row, 20)[0]
    if not 0x08000000 <= pointer < 0x0A000000 - 128:
        raise ValueError(f"item {item_id} description pointer {pointer:#x} is outside the ROM")
    raw = exact(read, pointer, 128)
    if 0xFF not in raw:
        raise ValueError(f"item {item_id} description has no terminator")
    text = decode_native_text(raw[: raw.index(0xFF) + 1], require_terminator=True)
    return MartItem(item_id, name, price >> int(halve), text.replace(" | ", " "))


def _highlighted(read: ReadMemory, ids: tuple[int, ...]) -> int | None:
    owners = [data for _, function, data in task_snapshot(read) if function == BUY_MENU_TASK]
    if len(owners) != 1:
        return None
    _, row_id, index = _list_selection(read, owners[0][7])
    expected = ids[index] if index < len(ids) else LIST_CANCEL
    if index > len(ids) or row_id != expected:
        raise ValueError(f"highlighted row {index} has id {row_id}, the stock says {expected}")
    return index


def read_mart_stock(read: ReadMemory, save1: int | None) -> MartStock | None:
    """The buy list while CB2_BuyMenu runs a normal shop; None anywhere else.

    None too when the save block was not read in this snapshot: the price depends on where the
    player is (the Slateport sale), and money is unread then as well.
    """
    if save1 is None:
        return None
    if int(struct.unpack("<I", exact(read, MAIN_CALLBACK2, 4))[0]) != SHOP_CALLBACK:
        return None
    info = exact(read, MART_INFO, 16)
    item_list, count = struct.unpack_from("<IH", info, 8)
    if info[15] != MART_TYPE_NORMAL:
        return None
    if not 1 <= count <= MAX_STOCK:
        raise ValueError(f"invalid item count {count}")
    if not 0x08000000 <= item_list <= 0x0A000000 - 2 * count:
        raise ValueError(f"invalid item list {item_list:#x}")
    ids = struct.unpack(f"<{count}H", exact(read, item_list, 2 * count))
    halve = _sale(read, save1)
    items = tuple(_item(read, item_id, halve) for item_id in ids)
    return MartStock(items, _highlighted(read, ids))


def stock_lines(stock: MartStock, money: int | None) -> list[str]:
    lines = [
        "Buy list (the clerk's menu: each price as the list shows it and the game's own item "
        "description):"
    ]
    lines.extend(
        f'  {row} {item.name} ¥{item.price} — "{item.description}"'
        for row, item in enumerate(stock.items, 1)
    )
    cancel_row = len(stock.items) + 1
    lines.append(f'  {cancel_row} {CANCEL} — "{QUIT_SHOPPING}"')
    if stock.highlighted is not None:
        name = (
            CANCEL if stock.highlighted == len(stock.items) else stock.items[stock.highlighted].name
        )
        lines.append(f"Highlighted: {stock.highlighted + 1} {name}")
    if money is not None:
        lines.append(f"Your money: ¥{money}")
    return lines
