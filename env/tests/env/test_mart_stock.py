"""mart-stock-readout-v1: the clerk's buy list with prices and the game's item descriptions.

The fixtures are raw-RAM archives copied byte for byte from run
2026-10-21T06-28-18_qwen36-gpu0_1331 (mart-stock-raw.provenance.json names each source archive
and its sha256): the RUSTBORO CITY MART buy list with row 0 and row 2 highlighted, the quantity
box, the message after buying a SUPER POTION, and the BUY/SELL/QUIT menu (turns 679-686).
Game: pret/pokeemerald 731ad5bf src/shop.c (sMartInfo, BuyMenuSetListEntry,
BuyMenuPrintPriceInList, BuyMenuPrintItemDescriptionAndShowItemIcon), src/strings.c
gText_Cancel2 "CANCEL", gText_QuitShopping "Quit shopping.", gText_PokedollarVar1, src/tv.c
IsPokeNewsActive / ShouldApplyPokeNewsEffect.
"""

from __future__ import annotations

import json
import os
import struct
from dataclasses import replace
from functools import cache
from pathlib import Path

import pytest

from pokebench_env.game_screen import TASKS, ReadMemory
from pokebench_env.game_state import SAVE_BLOCK_PTRS, GameState, MapNames
from pokebench_env.mart_stock import (
    LAST_TALKED,
    MART_INFO,
    SWITCH,
    MartItem,
    MartStock,
    read_mart_stock,
    stock_lines,
)
from pokebench_env.menus import task_snapshot
from pokebench_env.raw_ram import load_raw_ram
from pokebench_env.readout import SERVER_FEATURES, features_off_from_env, state_json
from pokebench_env.rerender import PORYMAP_MAPS, read_state, render
from pokebench_env.rom import resolve_rom

FIXTURES = Path(__file__).parent / "fixtures"
PROVENANCE = json.loads((FIXTURES / "mart-stock-raw.provenance.json").read_text())
OFF = frozenset({SWITCH})

RUSTBORO = (
    ("POKé BALL", 200, "A tool used for catching wild POKéMON."),
    ("POTION", 300, "Restores the HP of a POKéMON by 20 points."),
    ("SUPER POTION", 700, "Restores the HP of a POKéMON by 50 points."),
    ("ANTIDOTE", 100, "Heals a poisoned POKéMON."),
    ("PARLYZ HEAL", 200, "Heals a paralyzed POKéMON."),
    ("ESCAPE ROPE", 550, "Use to escape instantly from a cave or a dungeon."),
    ("REPEL", 350, "Repels weak wild POKéMON for 100 steps."),
    ("X SPEED", 350, "Raises the stat SPEED during one battle."),
    ("X ATTACK", 500, "Raises the stat ATTACK during one battle."),
    ("X DEFEND", 550, "Raises the stat DEFENSE during one battle."),
)
RUSTBORO_IDS = (4, 13, 22, 14, 18, 85, 86, 77, 75, 76)
LIST_LINES = [
    "Buy list (the clerk's menu: each price as the list shows it and the game's own item "
    "description):",
    '  1 POKé BALL ¥200 — "A tool used for catching wild POKéMON."',
    '  2 POTION ¥300 — "Restores the HP of a POKéMON by 20 points."',
    '  3 SUPER POTION ¥700 — "Restores the HP of a POKéMON by 50 points."',
    '  4 ANTIDOTE ¥100 — "Heals a poisoned POKéMON."',
    '  5 PARLYZ HEAL ¥200 — "Heals a paralyzed POKéMON."',
    '  6 ESCAPE ROPE ¥550 — "Use to escape instantly from a cave or a dungeon."',
    '  7 REPEL ¥350 — "Repels weak wild POKéMON for 100 steps."',
    '  8 X SPEED ¥350 — "Raises the stat SPEED during one battle."',
    '  9 X ATTACK ¥500 — "Raises the stat ATTACK during one battle."',
    '  10 X DEFEND ¥550 — "Raises the stat DEFENSE during one battle."',
    '  11 CANCEL — "Quit shopping."',
]


@cache
def _rom() -> bytes:
    return resolve_rom({"POKEBENCH_ROM": os.environ.get("POKEBENCH_ROM", "")}).read_bytes()


@cache
def archived(name: str) -> ReadMemory:
    archive = PROVENANCE["archives"][name]
    return load_raw_ram(FIXTURES / f"mart-stock-{name}.json.gz", archive["sha256"], rom=_rom())


@cache
def maps() -> MapNames:
    return MapNames.load(PORYMAP_MAPS)


def state(name: str | ReadMemory, off: frozenset[str] = frozenset()) -> GameState:
    read = archived(name) if isinstance(name, str) else name
    return read_state(read, maps(), active_ui=True, off=off)


def patched(name: str, patches: dict[int, bytes]) -> ReadMemory:
    base = archived(name)

    def read(at: int, length: int) -> bytes:
        raw = bytearray(base(at, length))
        for address, data in patches.items():
            for i, byte in enumerate(data):
                if at <= address + i < at + length:
                    raw[address + i - at] = byte
        return bytes(raw)

    return read


def save1(name: str) -> int:
    return int(struct.unpack("<I", archived(name)(SAVE_BLOCK_PTRS, 4))[0])


def list_task(name: str) -> int:
    (owner,) = [
        data[7] for _, function, data in task_snapshot(archived(name)) if function == 0x080E0AC9
    ]
    return TASKS + 40 * owner


def block(text: str) -> list[str]:
    lines = text.split("\n")
    start = lines.index(LIST_LINES[0])
    end = start + 1
    while end < len(lines) and (
        lines[end].startswith("  ") or lines[end].startswith(("Highlighted:", "Your money:"))
    ):
        end += 1
    return lines[start:end]


# --- the recorded states ------------------------------------------------------------------


def test_fixtures_are_the_recorded_mart_states() -> None:
    expected = {
        "buy-list-row0": ("shop_menu", "POKé BALL", None),
        "buy-list-row2": ("shop_menu", None, "invalid shop item list/index"),
        "quantity-box": ("shop_quantity", "ITEM 22", None),
        "after-purchase": ("shop_menu", None, "Shop has no unique verified input owner"),
        "action-menu": ("shop_action_menu", "BUY", None),
    }
    for name, (phase, selected, diagnostic) in expected.items():
        ui = state(name, OFF | {"shop-interface-v1"}).active_ui
        assert ui is not None
        assert (ui.phase, ui.selected, ui.diagnostic) == (phase, selected, diagnostic), name


# --- the reader ---------------------------------------------------------------------------


def _items() -> tuple[MartItem, ...]:
    return tuple(
        MartItem(item_id, name, price, description)
        for item_id, (name, price, description) in zip(RUSTBORO_IDS, RUSTBORO, strict=True)
    )


@pytest.mark.parametrize(
    ("name", "highlighted"),
    [("buy-list-row0", 0), ("buy-list-row2", 2), ("quantity-box", None), ("after-purchase", None)],
)
def test_reads_the_rustboro_buy_list(name: str, highlighted: int | None) -> None:
    assert read_mart_stock(archived(name), save1(name)) == MartStock(_items(), highlighted)


def test_no_list_outside_the_buy_screen() -> None:
    assert read_mart_stock(archived("action-menu"), save1("action-menu")) is None
    recorded = state("action-menu")
    assert recorded.mart_stock is None and recorded.mart_stock_diagnostic is None
    assert "Buy list" not in render(recorded, frozenset())


def test_no_list_in_a_decoration_shop() -> None:
    read = patched("buy-list-row0", {MART_INFO + 15: bytes([1])})
    assert read_mart_stock(read, save1("buy-list-row0")) is None


def test_cancel_row_highlighted() -> None:
    # 11 rows, 8 shown: scroll 3, cursor row 7 is the CANCEL row (index 10).
    read = patched("buy-list-row0", {list_task("buy-list-row0") + 32: struct.pack("<HH", 3, 7)})
    stock = read_mart_stock(read, save1("buy-list-row0"))
    assert stock is not None and stock.highlighted == 10
    assert stock_lines(stock, 3412)[-2:] == ["Highlighted: 11 CANCEL", "Your money: ¥3412"]


def test_a_list_row_that_disagrees_with_the_stock_is_an_error() -> None:
    base = archived("buy-list-row2")
    (items,) = struct.unpack_from("<I", base(list_task("buy-list-row2") + 8, 4))
    read = patched("buy-list-row2", {items + 2 * 8 + 4: struct.pack("<i", 13)})
    with pytest.raises(ValueError, match="highlighted row"):
        read_mart_stock(read, save1("buy-list-row2"))


def _slateport(name: str, last_talked: int, news_state: int) -> ReadMemory:
    base = save1(name)
    return patched(
        name,
        {
            base + 4: bytes([0, 1]),
            base + 0x2B50: bytes([1, news_state, 0, 0]),
            LAST_TALKED: struct.pack("<H", last_talked),
        },
    )


def test_energy_guru_sale_halves_prices_as_the_list_does() -> None:
    read = _slateport("buy-list-row0", 25, 2)
    stock = read_mart_stock(read, save1("buy-list-row0"))
    assert stock is not None
    assert [item.price for item in stock.items] == [p // 2 for _, p, _ in RUSTBORO]


@pytest.mark.parametrize(("talked", "news"), [(1, 2), (25, 1), (25, 0)])
def test_no_sale_without_the_guru_or_active_news(talked: int, news: int) -> None:
    stock = read_mart_stock(_slateport("buy-list-row0", talked, news), save1("buy-list-row0"))
    assert stock is not None
    assert [item.price for item in stock.items] == [p for _, p, _ in RUSTBORO]


def test_no_list_when_the_save_block_was_not_read() -> None:
    assert read_mart_stock(archived("buy-list-row0"), None) is None


@pytest.mark.parametrize(
    ("patch", "message"),
    [
        ({MART_INFO + 8: struct.pack("<I", 0x02000000)}, "item list"),
        ({MART_INFO + 12: struct.pack("<H", 0)}, "item count"),
        ({MART_INFO + 12: struct.pack("<H", 200)}, "item count"),
    ],
)
def test_bad_mart_info_is_an_error(patch: dict[int, bytes], message: str) -> None:
    with pytest.raises(ValueError, match=message):
        read_mart_stock(patched("buy-list-row0", patch), save1("buy-list-row0"))


def test_bad_item_row_is_an_error() -> None:
    base = archived("buy-list-row0")
    (pointer,) = struct.unpack_from("<I", base(MART_INFO + 8, 4))
    with pytest.raises(ValueError):
        read_mart_stock(
            patched("buy-list-row0", {pointer: struct.pack("<H", 0)}), save1("buy-list-row0")
        )


def test_bad_description_pointer_is_an_error() -> None:
    description = 0x085839A0 + 44 * 4 + 20
    with pytest.raises(ValueError, match="description"):
        read_mart_stock(
            patched("buy-list-row0", {description: b"\x00\x00\x00\x00"}), save1("buy-list-row0")
        )


# --- the readout --------------------------------------------------------------------------


def test_row0_block_follows_the_interface_lines() -> None:
    text = render(state("buy-list-row0"), frozenset())
    lines = text.split("\n")
    interface = next(i for i, line in enumerate(lines) if line.startswith("Interface:"))
    assert lines[interface + 1].startswith("Menu state:")
    assert lines[interface + 2] == LIST_LINES[0]
    assert block(text) == [*LIST_LINES, "Highlighted: 1 POKé BALL", "Your money: ¥3412"]


def test_row2_block_names_super_potion() -> None:
    text = render(state("buy-list-row2"), frozenset())
    assert block(text) == [*LIST_LINES, "Highlighted: 3 SUPER POTION", "Your money: ¥3412"]


@pytest.mark.parametrize("name", ["quantity-box", "after-purchase"])
def test_no_highlight_while_the_list_does_not_own_input(name: str) -> None:
    text = render(state(name), frozenset())
    money = state(name).money
    assert block(text) == [*LIST_LINES, f"Your money: ¥{money}"]


def test_unknown_money_has_no_money_line() -> None:
    stock = state("buy-list-row0").mart_stock
    assert stock is not None
    assert stock_lines(stock, None) == [*LIST_LINES, "Highlighted: 1 POKé BALL"]


@pytest.mark.parametrize("name", list(PROVENANCE["archives"]))
def test_off_is_byte_for_byte_the_readout_without_the_reader(name: str) -> None:
    without = state(name, OFF)
    assert without.mart_stock is None and without.mart_stock_diagnostic is None
    on = state(name)
    assert render(on, OFF) == render(without, OFF)
    assert render(replace(on, mart_stock=None, mart_stock_diagnostic=None), frozenset()) == render(
        without, OFF
    )


@pytest.mark.parametrize("name", list(PROVENANCE["archives"]))
def test_state_json_is_unchanged_by_the_reader(name: str) -> None:
    assert state_json(state(name)) == state_json(state(name, OFF))


def test_a_failed_read_is_a_visible_harness_bug_not_a_guess() -> None:
    read = patched("buy-list-row0", {MART_INFO + 8: struct.pack("<I", 0x02000000)})
    recorded = state(read)
    assert recorded.mart_stock is None
    assert recorded.mart_stock_diagnostic is not None
    text = render(recorded, frozenset())
    assert "HARNESS BUG (mart stock): harness bug: mart stock: invalid item list" in text
    assert "HARNESS BUG (mart stock)" not in render(recorded, OFF)


def test_switch_is_registered_server_side_last_and_default_off() -> None:
    assert SERVER_FEATURES[-9] == SWITCH == "mart-stock-readout-v1"
    assert SWITCH in features_off_from_env({})
    assert features_off_from_env({"POKEBENCH_FEATURES_OFF": ""}) == frozenset()


def test_no_sale_on_slateport_without_its_news() -> None:
    base = save1("buy-list-row0")
    read = patched(
        "buy-list-row0",
        {
            base + 4: bytes([0, 1]),
            base + 0x2B50: bytes(64),
            LAST_TALKED: struct.pack("<H", 25),
        },
    )
    stock = read_mart_stock(read, base)
    assert stock is not None
    assert [item.price for item in stock.items] == [p for _, p, _ in RUSTBORO]


def test_unterminated_description_is_an_error() -> None:
    base = archived("buy-list-row0")
    (pointer,) = struct.unpack_from("<I", base(0x085839A0 + 44 * 4 + 20, 4))
    with pytest.raises(ValueError, match="no terminator"):
        read_mart_stock(patched("buy-list-row0", {pointer: bytes(128)}), save1("buy-list-row0"))
