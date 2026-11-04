"""battle-details-v2 on recorded raw RAM (runs c406 and c497) plus pokeemerald ROM rows.

The RAM windows are copied byte for byte from the recorded raw-RAM archives named in each
fixture's `source`. The ROM never enters git, so the few ROM table rows the readout needs
are written from pokeemerald 731ad5bf source data (species_info.h, battle_moves.h, items.h).
"""

import json
import struct
from dataclasses import replace
from functools import cache
from pathlib import Path

from test_game_state import Memory, text
from test_readout import IN_GAME

from pokebench_env.battle_details import (
    ABILITY_NAMES,
    SPECIES_INFO,
    TYPE_NAMES,
    read_battle_details,
)
from pokebench_env.battle_state import read_battle_state
from pokebench_env.game_state import PARTY, PARTY_COUNT, GameState
from pokebench_env.pokemon import (
    BATTLE_MOVES,
    ITEMS,
    MOVE_NAMES,
    SPECIES_NAMES,
    decode_party_mon,
)
from pokebench_env.readout import SERVER_FEATURES, features_off_from_env
from pokebench_env.resources import ResourceItem, Resources

FIXTURES = Path(__file__).parent / "fixtures"
TYPE_FLAGS = 0x02022FEC
MONS = 0x02024084
OFF = frozenset({"battle-details-v2"})
# Switches registered after the c406 golden; OFF is their previous behavior.
# pokeemerald src/data/pokemon/species_info.h: (types, abilities)
SPECIES = {
    280: ("TORCHIC", (10, 10), (66, 0)),
    288: ("ZIGZAGOON", (0, 0), (53, 0)),
    263: ("POOCHYENA", (17, 17), (50, 0)),
    270: ("WURMPLE", (6, 6), (19, 0)),
}
# src/data/battle_moves.h: effect, power, type, accuracy, pp
MOVES = {
    10: ("SCRATCH", (0, 40, 0, 100, 35)),
    33: ("TACKLE", (0, 35, 0, 95, 35)),
    45: ("GROWL", (18, 0, 0, 100, 40)),
    52: ("EMBER", (4, 40, 10, 100, 25)),
    69: ("SEISMIC TOSS", (87, 1, 1, 100, 20)),
    129: ("SWIFT", (17, 60, 0, 0, 20)),
}
# src/data/items.h: pocket, holdEffect, battleUsage
ITEM_ROWS = {
    4: ("POKé BALL", "poke_balls", 0, 2),
    13: ("POTION", "items", 0, 1),
    193: ("SMOKE BALL", "items", 37, 0),
    175: ("ENIGMA BERRY", "berries", 0, 0),
    259: ("MACH BIKE", "key_items", 0, 0),
}


def rom(m: Memory) -> Memory:
    for species, (name, types, abilities) in SPECIES.items():
        m.put(SPECIES_NAMES + species * 11, text(name) + b"\xff")
        row = bytearray(28)
        row[6:8] = bytes(types)
        row[0x16:0x18] = bytes(abilities)
        m.put(SPECIES_INFO + 28 * species, bytes(row))
    for move, (name, (effect, power, kind, accuracy, pp)) in MOVES.items():
        m.put(MOVE_NAMES + move * 13, text(name) + b"\xff")
        m.put(BATTLE_MOVES + move * 12, bytes([effect, power, kind, accuracy, pp]) + bytes(7))
    for item, (name, _, hold, usage) in ITEM_ROWS.items():
        row = bytearray(44)
        row[: len(text(name)) + 1] = text(name) + b"\xff"
        struct.pack_into("<H", row, 14, item)
        row[18], row[0x20] = hold, usage
        m.put(ITEMS + 44 * item, bytes(row))
    return m


@cache
def _recorded_cells(name: str) -> tuple[tuple[int, int], ...]:
    # Parsed once per fixture; every test gets its own mutable copy of the cells.
    data = json.loads((FIXTURES / name).read_text())
    m = Memory()
    for window in data["windows"]:
        m.put(int(window["address"], 16), bytes.fromhex(window["hex"]))
    return tuple(rom(m).cells.items())


def recorded(name: str) -> Memory:
    m = Memory()
    m.cells = dict(_recorded_cells(name))
    return m


def bag(*items: int) -> Resources:
    return Resources(
        bag=tuple(
            ResourceItem(i, item, 5, ITEM_ROWS[item][1], ITEM_ROWS[item][0])
            for i, item in enumerate(items)
        )
    )


def state(m: Memory, resources: Resources | None = None) -> GameState:
    resources = Resources(bag=()) if resources is None else resources
    count = m.read(PARTY_COUNT, 1)[0]
    party = tuple(
        decode_party_mon(m.read(PARTY + 100 * i, 100), m.read, address=PARTY + 100 * i)
        for i in range(count)
    )
    battle = read_battle_state(m.read)
    return replace(
        IN_GAME,
        screen="battle",
        location="ROUTE 101",
        in_battle=True,
        party=party,
        battle=battle,
        resources=resources,
        battle_details=read_battle_details(m.read, battle, party, resources),
    )


BIRCH = [
    "Battle details: WILD single · first battle (PROF. BIRCH rescue) · turn 1 · "
    "input ready (action select)",
    "Foe ZIGZAGOON Lv2 · NORMAL · HP 13/13 · status OK · ability PICKUP · item none · "
    "stats Atk 6 Def 6 Spe 7 SpA 6 SpD 6 · stages neutral · moves: "
    "TACKLE NORMAL physical pow 35 acc 95 PP 35/35; GROWL NORMAL status acc 100 PP 40/40",
    "Actions (2×2 FIGHT BAG / POKéMON RUN; menu open, highlighted ▶ FIGHT): FIGHT · "
    "BAG allowed — bag empty · POKéMON switching allowed — no other Pokémon can battle · "
    'RUN REFUSED — "PROF. BIRCH: Don\'t leave me like this!" (first battle)',
    "You TORCHIC Lv5 · FIRE · HP 20/20 · status OK · ability BLAZE · item none · "
    "stats Atk 11 Def 10 Spe 8 SpA 13 SpD 10 · stages neutral",
    "Your moves (2×2 1 2 / 3 4; menu not open):",
    "  1 SCRATCH NORMAL physical pow 40 acc 100 PP 35/35",
    "  2 GROWL NORMAL status acc 100 PP 40/40",
    "Party (game party slots):",
    "  1 TORCHIC Lv5 FIRE · HP 20/20 · status OK · ability BLAZE · item none · in battle · "
    "moves SCRATCH NORMAL physical pow 40 acc 100 PP 35/35; GROWL NORMAL status acc 100 PP 40/40",
]


def trainer() -> Memory:
    m = recorded("battle-c497-00001557.json")
    m.put(TYPE_FLAGS, struct.pack("<I", 0x0C))
    return m


def test_move_facts_render_every_category() -> None:
    from pokebench_env.battle_details import MoveFacts, move_text

    assert move_text(MoveFacts(52, "EMBER", 10, 40, 100, 25, 25)) == (
        "EMBER FIRE special pow 40 acc 100 PP 25/25"
    )
    assert move_text(MoveFacts(69, "SEISMIC TOSS", 1, 1, 100, 20, 20)) == (
        "SEISMIC TOSS FIGHTING physical pow varies acc 100 PP 20/20"
    )
    assert move_text(MoveFacts(129, "SWIFT", 0, 60, 0, 20, 20)) == (
        "SWIFT NORMAL physical pow 60 never misses PP 20/20"
    )
    assert move_text(MoveFacts(237, None, 9, 1, 100, 15, 15)) == (
        "move #237 ??? typeless pow varies acc 100 PP 15/15"
    )
    assert len(TYPE_NAMES) == 18 and len(ABILITY_NAMES) == 78


def test_switch_is_registered_server_side_and_default_off() -> None:
    assert "battle-details-v2" in SERVER_FEATURES
    assert "battle-details-v2" in features_off_from_env({})
    assert features_off_from_env({"POKEBENCH_FEATURES_OFF": "battle-details-v2"}) == OFF
