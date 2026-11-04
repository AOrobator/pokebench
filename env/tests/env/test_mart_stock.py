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
from functools import cache
from pathlib import Path

from pokebench_env.game_screen import TASKS, ReadMemory
from pokebench_env.game_state import GameState, MapNames
from pokebench_env.mart_stock import (
    SWITCH,
)
from pokebench_env.menus import task_snapshot
from pokebench_env.raw_ram import load_raw_ram
from pokebench_env.readout import SERVER_FEATURES, features_off_from_env
from pokebench_env.rerender import PORYMAP_MAPS, read_state
from pokebench_env.rom import resolve_rom

FIXTURES = Path(__file__).parent / "fixtures"
PROVENANCE = json.loads((FIXTURES / "mart-stock-raw.provenance.json").read_text())

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


# --- the reader ---------------------------------------------------------------------------


# --- the readout --------------------------------------------------------------------------


def test_switch_is_registered_server_side_last_and_default_off() -> None:
    assert SERVER_FEATURES[64] == SWITCH == "mart-stock-readout-v1"
    assert SWITCH in features_off_from_env({})
    assert features_off_from_env({"POKEBENCH_FEATURES_OFF": ""}) == frozenset()
