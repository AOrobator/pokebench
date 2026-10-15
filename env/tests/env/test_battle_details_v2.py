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

import pytest
from test_game_state import Memory, text
from test_readout import IN_GAME

from pokebench_env.battle_details import (
    ABILITY_NAMES,
    SPECIES_INFO,
    TYPE_NAMES,
    BattleDetails,
    read_battle_details,
    status1_text,
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
from pokebench_env.readout import SERVER_FEATURES, features_off_from_env, format_readout
from pokebench_env.resources import PokemonStorage, ResourceItem, Resources

FIXTURES = Path(__file__).parent / "fixtures"
TYPE_FLAGS = 0x02022FEC
MONS = 0x02024084
STATUSES3 = 0x020242AC
OFF = frozenset({"battle-details-v2"})
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


def battle_lines(text_: str) -> list[str]:
    lines = text_.split("\n")
    start = next(i for i, line in enumerate(lines) if line.startswith("Battle details:"))
    end = next(i for i, line in enumerate(lines) if line.startswith("Player:"))
    return lines[start:end]


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


def test_birch_rescue_action_select_from_recorded_raw_ram() -> None:
    observed = format_readout(state(recorded("battle-c406-00001266.json")))
    assert battle_lines(observed) == BIRCH
    assert "Bag: empty" in observed.split("\n")
    assert "Battle state:" not in observed and "Battler 0" not in observed


def test_off_is_byte_identical_to_the_recorded_golden_readout() -> None:
    current = state(recorded("battle-c406-00001266.json"))
    golden = (FIXTURES / "battle-details-v2-off-c406-00001266.txt").read_text()
    assert format_readout(current, OFF) == golden
    assert format_readout(replace(current, battle_details=None)) == golden
    hidden = frozenset({"battle-details-v2", "expanded-menu-battle-information-v1"})
    assert format_readout(current, hidden) == format_readout(
        replace(current, battle_details=None), frozenset({"expanded-menu-battle-information-v1"})
    )
    assert "Battle details: unprovided" in format_readout(current, hidden)


def test_move_select_marks_the_highlighted_move_and_zero_pp_refusal() -> None:
    m = recorded("battle-c406-00001269.json")
    observed = battle_lines(format_readout(state(m)))
    assert "Your moves (2×2 1 2 / 3 4; highlighted ▶ 1):" in observed
    assert " ▶1 SCRATCH NORMAL physical pow 40 acc 100 PP 35/35" in observed
    assert "menu not open" in observed[2] and "input ready (move select)" in observed[0]
    m.put(MONS + 0x24 + 1, b"\x00")
    observed = battle_lines(format_readout(state(m)))
    assert (
        "  2 GROWL NORMAL status acc 100 PP 0/40 — "
        'REFUSED: "There\'s no PP left for this move!"' in observed
    )
    m.put(MONS + 0x24, b"\x00")
    assert (
        "FIGHT (every move has 0 PP: the game uses STRUGGLE)"
        in battle_lines(format_readout(state(m)))[2]
    )


def trainer() -> Memory:
    m = recorded("battle-c497-00001557.json")
    m.put(TYPE_FLAGS, struct.pack("<I", 0x0C))
    return m


def test_trainer_battle_refuses_run_and_warns_balls_are_lost() -> None:
    observed = battle_lines(format_readout(state(trainer(), bag(13, 4, 259))))
    assert observed[0] == ("Battle details: TRAINER single · turn 2 · input ready (action select)")
    assert observed[1].startswith("Foe ZIGZAGOON Lv2 · NORMAL · HP 13/13")
    assert "stages Atk -1 · moves: TACKLE" in observed[1] and "PP 39/40" in observed[1]
    assert observed[2] == (
        "Actions (2×2 FIGHT BAG / POKéMON RUN; menu open, highlighted ▶ BAG): FIGHT · "
        "BAG allowed — has a battle use (whether it does anything now is not checked): POTION ×5; balls POKé BALL ×5: the TRAINER blocks the BALL "
        '("Don\'t be a thief!") and the ball is used up; not usable in battle: MACH BIKE ×5 · '
        "POKéMON switching allowed — no other Pokémon can battle · "
        'RUN REFUSED — "No! There\'s no running from a TRAINER battle!"'
    )


def test_wild_run_odds_balls_and_speed_from_game_stats() -> None:
    m = trainer()
    m.put(TYPE_FLAGS, struct.pack("<I", 0x04))
    actions = battle_lines(format_readout(state(m, bag(4))))[2]
    assert "balls POKé BALL ×5: usable (a ball is used up on every throw)" in actions
    assert "RUN allowed — escape guaranteed (your Spe 10 ≥ foe Spe 7)" in actions
    m.put(MONS + 0x58 + 6, struct.pack("<H", 12))
    actions = battle_lines(format_readout(state(m)))[2]
    assert (
        "RUN allowed — escape not guaranteed: your Spe 10 < foe Spe 12; a failed try uses your turn"
        in actions
    )
    assert "×128" not in actions
    full = Resources(bag=bag(4).bag, storage=PokemonStorage(0, ()))
    six = state(m, full)
    six = replace(six, party=six.party * 6)
    details = read_battle_details(m.read, six.battle, six.party[:1], full)
    assert details is not None and details.storage_full is False
    assert read_battle_details(m.read, six.battle, six.party, full) is not None


def test_storage_fullness_for_a_full_party() -> None:
    m = trainer()
    m.put(TYPE_FLAGS, struct.pack("<I", 0x04))
    base = state(m)
    party = base.party * 6
    m.put(PARTY_COUNT, b"\x06")
    for slot in range(6):
        m.put(PARTY + 100 * slot, m.read(PARTY, 100))
    occupied = tuple(object() for _ in range(420))
    full = Resources(bag=bag(4).bag, storage=PokemonStorage(0, occupied))  # type: ignore[arg-type]
    details = read_battle_details(m.read, base.battle, party, full)
    assert details is not None and details.storage_full is True
    text_ = "\n".join(details.lines(base.battle))
    assert "balls POKé BALL ×5: REFUSED — the BOX is full" in text_
    unknown = read_battle_details(m.read, base.battle, party, bag(4))
    assert unknown is not None and unknown.storage_full is None
    assert "usable unless party and every BOX are full (not read)" in "\n".join(
        unknown.lines(base.battle)
    )


@pytest.mark.parametrize(
    "flags,expected",
    [
        (0x06, 'BAG REFUSED — "Items can\'t be used now."'),
        (0x0C | (1 << 8), "RUN asks whether to forfeit the match"),
        (0x06, "RUN allowed — link battle (running forfeits)"),
        (0x05, "RUN allowed — escape chance not worked out for double battles"),
        (0x04 | (1 << 18), 'POKéMON switching REFUSED — "TORCHIC can\'t be switched out!"'),
    ],
)
def test_game_type_rules(flags: int, expected: str) -> None:
    m = trainer()
    m.put(TYPE_FLAGS, struct.pack("<I", flags))
    assert expected in "\n".join(battle_lines(format_readout(state(m))))


def test_traps_and_bindings_refuse_with_game_messages() -> None:
    m = trainer()
    m.put(TYPE_FLAGS, struct.pack("<I", 0x04))
    m.put(MONS + 0x58 + 0x20, bytes([23]))
    text_ = "\n".join(battle_lines(format_readout(state(m))))
    assert 'RUN REFUSED — "Wild ZIGZAGOON prevents escape with SHADOW TAG!"' in text_
    assert 'POKéMON switching REFUSED — "ZIGZAGOON\'s SHADOW TAG prevents switching!"' in text_
    m.put(MONS + 0x58 + 0x20, bytes([71]))
    assert "prevents escape with ARENA TRAP" in format_readout(state(m))
    m.put(MONS + 0x21, bytes([2, 2]))
    assert "prevents escape with ARENA TRAP" not in format_readout(state(m))
    m.put(MONS + 0x58 + 0x20, bytes([42]))
    m.put(MONS + 0x21, bytes([8, 8]))
    assert "prevents escape with MAGNET PULL" in format_readout(state(m))
    m.put(MONS + 0x21, bytes([10, 10]))
    m.put(MONS + 0x50, struct.pack("<I", 1 << 13))
    text_ = format_readout(state(m))
    assert 'RUN REFUSED — "Can\'t escape!"' in text_ and "conditions wrapped" in text_
    m.put(MONS + 0x50, struct.pack("<I", 0))
    m.put(STATUSES3, struct.pack("<I", 1 << 10))
    assert 'RUN REFUSED — "Can\'t escape!"' in format_readout(state(m))
    assert "conditions rooted (INGRAIN)" in format_readout(state(m))


def test_escape_items_and_abilities() -> None:
    m = trainer()
    m.put(TYPE_FLAGS, struct.pack("<I", 0x04))
    m.put(MONS + 0x2E, struct.pack("<H", 193))
    text_ = format_readout(state(m))
    assert "RUN allowed — always escapes (holds SMOKE BALL)" in text_
    assert "item SMOKE BALL" in text_
    m.put(MONS + 0x2E, struct.pack("<H", 175))
    assert "RUN unknown — holds ENIGMA BERRY" in format_readout(state(m))
    m.put(MONS + 0x2E, struct.pack("<H", 0))
    m.put(MONS + 0x20, bytes([50]))
    assert "RUN allowed — always escapes (RUN AWAY)" in format_readout(state(m))


def test_forced_turns_status_and_conditions() -> None:
    m = trainer()
    m.put(MONS + 0x50, struct.pack("<I", (1 << 22) | 1))
    m.put(MONS + 0x4C, struct.pack("<I", 0x40))
    text_ = format_readout(state(m))
    assert "FIGHT (this turn is forced: the game skips the action menu)" in text_
    assert "status paralyzed" in text_ and "conditions confused, must recharge" in text_
    assert status1_text(None) == "status unknown"
    assert status1_text(3) == "status asleep (sleep counter 3)"
    assert status1_text(0x88) == "status badly poisoned"
    assert status1_text(0x38) == "status poisoned, burned, frozen"


def test_party_members_types_abilities_eggs_fainted_and_switch_targets() -> None:
    m = trainer()
    m.put(TYPE_FLAGS, struct.pack("<I", 0x04))
    base = state(m)
    torchic = base.party[0]
    other = replace(torchic, identity="other", nickname="SPARKY", hp=10)
    fainted = replace(torchic, identity="gone", nickname="ASH", hp=0)
    egg = replace(torchic, identity="egg", is_egg=True)
    broken = replace(torchic, identity="bad", diagnostic="harness bug: checksum")
    party = (torchic, other, fainted, egg, broken)
    details = read_battle_details(m.read, base.battle, party[:1], base.resources)
    assert details is not None
    member = details.party[0]
    details = replace(
        details,
        party=(
            member,
            replace(member, slot=1, identity="other", name="SPARKY", hp=10),
            replace(member, slot=2, identity="gone", name="ASH", hp=0),
            replace(member, slot=3, identity="egg", is_egg=True),
            replace(member, slot=4, identity="bad", diagnostic="harness bug: checksum"),
        ),
    )
    text_ = "\n".join(details.lines(base.battle))
    assert "POKéMON switching allowed — can switch to SPARKY" in text_
    assert "  2 SPARKY Lv5 FIRE · HP 10/20" in text_ and "can switch in" in text_
    assert "  3 ASH Lv5 FIRE · HP 0/20" in text_ and "fainted (can't switch in)" in text_
    assert "  4 EGG · can't battle" in text_
    assert "  5 TORCHIC · HARNESS BUG: harness bug: checksum" in text_
    multi = replace(base.battle, battle_type=0x44)
    assert "multi-battle party slots are not worked out" in "\n".join(details.lines(multi))


def test_unreadable_inputs_are_reported_not_guessed() -> None:
    m = trainer()
    base = state(m)
    assert read_battle_details(m.read, None, base.party, base.resources) is None
    assert read_battle_details(m.read, replace(base.battle, battlers=None), (), None) is None
    details = read_battle_details(m.read, base.battle, None, Resources())
    assert details is not None and details.party is None and details.bag is None
    text_ = "\n".join(details.lines(base.battle))
    assert "BAG allowed — bag contents unreadable" in text_
    assert "POKéMON switching allowed — party unreadable" in text_
    assert "Party: unreadable" in text_
    m.put(SPECIES_INFO + 28 * 280 + 6, bytes([18]))
    bad = read_battle_details(m.read, base.battle, base.party, base.resources)
    assert (
        bad is not None and bad.diagnostic == "harness bug: invalid species types for species 280"
    )
    assert "HARNESS BUG (battle details): harness bug: invalid species types" in "\n".join(
        bad.lines(base.battle)
    )
    m.put(SPECIES_INFO + 28 * 280 + 6, bytes([10]))
    m.put(SPECIES_INFO + 28 * 280 + 0x16, bytes([90]))
    assert "invalid species ability" in str(
        read_battle_details(m.read, base.battle, base.party, base.resources)
    )
    m.put(SPECIES_INFO + 28 * 280 + 0x16, bytes([66]))
    m.put(BATTLE_MOVES + 10 * 12 + 2, bytes([30]))
    assert "invalid move type for move 10" in str(
        read_battle_details(m.read, base.battle, base.party, base.resources)
    )
    m.put(BATTLE_MOVES + 10 * 12 + 2, bytes([0]))
    moved = replace(base.party[0], personality=1)
    assert "changed while reading its ability" in str(
        read_battle_details(m.read, base.battle, (moved,), base.resources)
    )


def test_resolving_finishing_absent_and_special_battles() -> None:
    m = trainer()
    base = state(m)
    battle = base.battle
    details = base.battle_details
    assert isinstance(details, BattleDetails)
    resolving = replace(battle, player_inputs=(), phase="resolving")
    assert "resolving (no input until the game asks)" in details.lines(resolving)[0]
    assert "menu not open" in details.lines(resolving)[2]
    finishing = replace(battle, player_inputs=(), phase="finishing", outcome="won")
    assert "finishing (outcome won)" in details.lines(finishing)[0]
    assert "recorded playback" in details.lines(replace(finishing, phase="replay"))[0]
    gone = replace(battle, battlers=tuple(replace(b, absent=True) for b in battle.battlers or ()))
    lines = details.lines(gone)
    assert "Foe ZIGZAGOON · absent (fainted or switched out)" in lines
    assert "You TORCHIC · absent (fainted or switched out)" in lines
    for flags, note in (
        (0x204, "Actions: none (the game plays the WALLY tutorial)"),
        (0x84, "Actions: Safari Zone actions are not detailed"),
    ):
        assert note in details.lines(replace(battle, battle_type=flags))
    tags = details.lines(
        replace(battle, battle_type=0x0C | (1 << 15) | (1 << 22) | (1 << 26) | (1 << 27))
    )[0]
    assert "two opposing trainers" in tags and "with a partner trainer" in tags
    assert "Trainer Hill" in tags and "Secret Base" in tags


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
    assert SERVER_FEATURES[-1] == "battle-details-v2"
    assert "battle-details-v2" in features_off_from_env({})
    assert features_off_from_env({"POKEBENCH_FEATURES_OFF": "battle-details-v2"}) == OFF


def test_production_observation_route_honours_the_switch(monkeypatch: pytest.MonkeyPatch) -> None:
    from fastapi import FastAPI
    from test_feature_switches import _Shot
    from test_game_state import MAPS, game
    from test_view import get

    from pokebench_env.observation import install_observation

    m = game((0x0, 0x0803CAFE))
    data = json.loads((FIXTURES / "battle-c406-00001266.json").read_text())
    for window in data["windows"]:
        m.put(int(window["address"], 16), bytes.fromhex(window["hex"]))
    rom(m)
    payloads = {}
    for off in ("", "battle-details-v2"):
        monkeypatch.setenv("POKEBENCH_FEATURES_OFF", off)
        app = FastAPI()
        install_observation(app, lambda: _Shot(), m.read, MAPS)
        status, _, body = get(app, "/pokebench/observation")
        assert status == 200, body
        payloads[off] = json.loads(body)
    on, hidden = payloads[""]["state_text"], payloads["battle-details-v2"]["state_text"]
    assert battle_lines(on)[: len(BIRCH)] == BIRCH and "Bag: empty" in on.split("\n")
    assert "Battle state: input; input True; turn 1" in hidden and "Battle details:" not in hidden
    assert "Bag: " in hidden.split("\n")
    assert payloads[""]["state"] == payloads["battle-details-v2"]["state"]


def test_party_ability_slot_plaintext_and_unreadable_members() -> None:
    from pokebench_env.pokemon import SUBSTRUCT_ORDERS

    m = trainer()
    base = state(m)
    torchic = base.party[0]
    assert torchic.decode_mode == "encrypted" and torchic.personality is not None
    body = bytearray(m.read(PARTY, 100))
    key = torchic.personality ^ (torchic.ot_id or 0)
    secure = bytearray(
        struct.pack("<12I", *(w ^ key for w in struct.unpack("<12I", bytes(body[0x20:0x50]))))
    )
    misc = 12 * SUBSTRUCT_ORDERS[torchic.personality % 24].index("M") + 4
    struct.pack_into("<I", secure, misc, struct.unpack_from("<I", secure, misc)[0] | 1 << 31)
    m.put(PARTY + 0x20, bytes(secure))
    m.put(SPECIES_INFO + 28 * 280 + 0x17, bytes([18]))
    plain = replace(torchic, decode_mode="plaintext")
    unreadable = replace(torchic, diagnostic="harness bug: checksum", species_id=None)
    details = read_battle_details(m.read, base.battle, (plain, unreadable), bag(259))
    assert details is not None and details.party is not None
    assert details.party[0].ability == 18
    assert details.party[1].diagnostic == "harness bug: checksum"
    text_ = "\n".join(details.lines(base.battle))
    assert "ability FLASH FIRE" in text_
    assert "BAG allowed — not usable in battle: MACH BIKE ×5" in text_


def test_a_full_hp_party_never_hears_a_potion_is_usable_here() -> None:
    # c406 seq 1266: one TORCHIC at 20/20; the game's item-effect check would reject a POTION.
    actions = battle_lines(format_readout(state(recorded("battle-c406-00001266.json"), bag(13))))[2]
    assert "usable here" not in actions
    assert "has a battle use (whether it does anything now is not checked): POTION ×5" in actions


def test_battle_pyramid_bag_is_reported_unread_not_the_ordinary_bag() -> None:
    m = trainer()
    m.put(TYPE_FLAGS, struct.pack("<I", 0x04 | (1 << 21)))
    actions = battle_lines(format_readout(state(m, bag(13, 4))))[2]
    assert "BAG allowed — Battle Pyramid bag not read" in actions
    assert "POTION" not in actions and "POKé BALL" not in actions


def test_an_emulator_read_error_is_reported_not_raised() -> None:
    m = trainer()

    def broken(address: int, length: int) -> bytes:
        if ITEMS <= address < ITEMS + 44 * 400:
            raise OSError("emulator gone")
        return m.read(address, length)

    current = state(m, bag(13))
    details = read_battle_details(broken, current.battle, current.party, bag(13))
    assert details is not None and details.diagnostic == "harness bug: emulator gone"


def test_the_recorded_fixture_is_parsed_once(monkeypatch: pytest.MonkeyPatch) -> None:
    _recorded_cells.cache_clear()
    loads: list[str] = []
    real = json.loads
    monkeypatch.setattr(json, "loads", lambda raw: loads.append("x") or real(raw))
    first, second = trainer(), trainer()
    assert len(loads) == 1
    first.put(TYPE_FLAGS, b"\xff")
    assert second.read(TYPE_FLAGS, 1) != b"\xff"
