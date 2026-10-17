"""heal-before-trainers-v1: the trainers on this map, move power and the healing places, from RAM.

pret/pokeemerald 731ad5bf. Run 2026-10-17T13-15-36_qwen36-gpu1_e046 lost to the LASS at
ROUTE104 (31,24), object 3 (Route104_EventScript_Haley: trainerbattle_single TRAINER_HALEY_1,
id 604), with TORCHIC at 14/38 HP. The synthetic memory below lays that out: the template's
script pointer leads to `5C 00 5C 02` (trainerbattle, TRAINER_BATTLE_SINGLE, 604), the trainer
flag is 0x500 + 604, gBattleMoves gives SCRATCH (10) power 40, GROWL (45) 0 and EMBER (52) 40,
and lastHealLocation is OLDALE TOWN (0/10), where the run had entered the POKéMON CENTER.
"""

import functools
import json
import os
import struct
from pathlib import Path

import pytest

from pokebench_env.game_state import read_game_state
from pokebench_env.heal_trainers import (
    FLAG_BADGE05_GET,
    FLAG_ENABLE_MOM_MATCH_CALL,
    FLAG_HAS_MATCH_CALL,
    FLAG_RECEIVED_AMULET_COIN,
    FLAG_RESCUED_BIRCH,
    SWITCH,
    VAR_LITTLEROOT_HOUSES_STATE_BRENDAN,
    VAR_LITTLEROOT_HOUSES_STATE_MAY,
    MapTrainer,
    mom_heals,
    read_heal_facts,
    read_map_trainers,
)
from pokebench_env.pokemon import BATTLE_MOVES, PartyMon, PokemonMove
from pokebench_env.readout import SERVER_FEATURES, features_off_from_env, format_readout, state_json
from pokebench_env.rerender import read_state
from pokebench_env.rom import EMERALD_SHA1, RomError, resolve_rom
from tests.env.test_game_state import MAPS, OVERWORLD, SB1, SB2, Memory, game

ROUTE104 = (0, 19)
SCRIPT = 0x082C0000
OTHER_SCRIPT = 0x082C0100
OBJECTS = 0x02037350


def flag(m: Memory, number: int, on: bool = True) -> None:
    address = SB1 + 0x1270 + number // 8
    value = m.read(address, 1)[0]
    bit = 1 << (number % 8)
    m.put(address, bytes([value | bit if on else value & ~bit]))


def var(m: Memory, number: int, value: int) -> None:
    m.put(SB1 + 0x139C + 2 * (number - 0x4000), struct.pack("<H", value))


def template(m: Memory, slot: int, local_id: int, graphics: int, script: int) -> None:
    entry = bytearray(24)
    entry[0], entry[1] = local_id, graphics
    struct.pack_into("<hh", entry, 4, 31, 24)
    struct.pack_into("<I", entry, 0x10, script)
    m.put(SB1 + 0xC70 + 24 * slot, bytes(entry))


def loaded(m: Memory, slot: int, local_id: int, x: int, y: int, *, visible: bool = True) -> None:
    body = bytearray(0x24)
    body[0] = 1
    body[1] = 0 if visible else 0x20
    body[8], body[9], body[10] = local_id, ROUTE104[1], ROUTE104[0]
    struct.pack_into("<hh", body, 0x10, x + 7, y + 7)
    m.put(OBJECTS + 0x24 * slot, bytes(body))


def route104() -> Memory:
    m = game(OVERWORLD)
    m.put(SB1, struct.pack("<hhbb", 31, 25, 0, 19))
    m.put(SB1 + 0x1C, struct.pack("<bbb", 0, 10, -1))
    m.put(SB2 + 0x08, bytes([0]))
    # The player stays object slot 0; the LASS is slot 1, object 3 on the map.
    m.put(OBJECTS, bytes([1, 0, 1]) + bytes(5) + bytes([0xFF, 19, 0]))
    m.put(OBJECTS + 0x10, struct.pack("<hh", 31 + 7, 25 + 7))
    template(m, 2, 3, 47, SCRIPT)
    loaded(m, 1, 3, 31, 24)
    m.put(SCRIPT, bytes([0x5C, 0x00, 0x5C, 0x02]))
    for move, power in ((10, 40), (45, 0), (52, 40)):
        m.put(BATTLE_MOVES + 12 * move + 1, bytes([power]))
    flag(m, FLAG_RESCUED_BIRCH)
    return m


TORCHIC = PartyMon(
    "TORCHIC",
    13,
    14,
    38,
    moves=(
        PokemonMove(10, 4, 0, "SCRATCH", 35),
        PokemonMove(45, 39, 0, "GROWL", 40),
        PokemonMove(116, 30, 0, "FOCUS ENERGY", 30),
        PokemonMove(52, 13, 0, "EMBER", 25),
    ),
)
LASS = MapTrainer(3, 31, 24, 47, "LASS", 604, False)


def facts(m: Memory):  # type: ignore[no-untyped-def]
    return read_heal_facts(m.read, SB1, SB2, ROUTE104, (TORCHIC,))


def test_run_e046_lass_is_an_unbeaten_trainer_with_its_tile_and_trainer_id() -> None:
    m = route104()
    m.put(BATTLE_MOVES + 12 * 116 + 1, bytes([0]))
    got = facts(m)
    assert got is not None
    assert got.json() == {
        "trainers": [
            {
                "local_id": 3,
                "x": 31,
                "y": 24,
                "graphics_id": 47,
                "sprite_kind": "LASS",
                "trainer_id": 604,
                "defeated": False,
            }
        ],
        "move_power": [
            {"move_id": 10, "power": 40},
            {"move_id": 45, "power": 0},
            {"move_id": 52, "power": 40},
            {"move_id": 116, "power": 0},
        ],
        "last_heal": [0, 10],
        "home": [1, 0],
        "mom_heals": True,
    }


def test_the_trainer_flag_marks_a_beaten_trainer() -> None:
    m = route104()
    flag(m, 0x500 + 604)
    assert read_map_trainers(m.read, SB1, ROUTE104) == (
        MapTrainer(3, 31, 24, 47, "LASS", 604, True),
    )


@pytest.mark.parametrize(
    "head",
    [
        bytes([0x5A, 0x00, 0x5C, 0x02]),  # not trainerbattle (faceplayer)
        bytes([0x5C, 0x09, 0x5C, 0x02]),  # TRAINER_BATTLE_PYRAMID
        bytes([0x5C, 0x00, 0x00, 0x00]),  # trainer id 0
        bytes([0x5C, 0x00, 0x57, 0x03]),  # id 855, past the trainer table
    ],
)
def test_only_field_trainerbattle_scripts_are_trainers(head: bytes) -> None:
    m = route104()
    m.put(SCRIPT, head)
    assert read_map_trainers(m.read, SB1, ROUTE104) == ()


def test_a_script_pointer_outside_the_rom_is_not_a_trainer() -> None:
    m = route104()
    template(m, 2, 3, 47, 0x02000000)
    assert read_map_trainers(m.read, SB1, ROUTE104) == ()


def test_only_loaded_visible_objects_of_this_map_count() -> None:
    m = route104()
    loaded(m, 1, 3, 31, 24, visible=False)
    assert read_map_trainers(m.read, SB1, ROUTE104) == ()
    m = route104()
    m.put(OBJECTS + 0x24, bytes(0x24))
    assert read_map_trainers(m.read, SB1, ROUTE104) == ()


def test_several_trainers_keep_template_order_and_skip_empty_slots() -> None:
    m = route104()
    template(m, 5, 7, 36, OTHER_SCRIPT)
    loaded(m, 2, 7, 20, 30)
    m.put(OTHER_SCRIPT, bytes([0x5C, 0x04, 0x88, 0x00]))
    flag(m, 0x500 + 0x88)
    assert [
        (t.local_id, t.trainer_id, t.defeated) for t in read_map_trainers(m.read, SB1, ROUTE104)
    ] == [
        (3, 604, False),
        (7, 0x88, True),
    ]


def test_mom_heals_only_where_her_script_reaches_the_heal() -> None:
    m = route104()
    assert mom_heals(m.read, SB1) is True
    flag(m, FLAG_RESCUED_BIRCH, False)
    assert mom_heals(m.read, SB1) is False
    m = route104()
    var(m, VAR_LITTLEROOT_HOUSES_STATE_MAY, 4)
    assert mom_heals(m.read, SB1) is False
    m = route104()
    var(m, VAR_LITTLEROOT_HOUSES_STATE_BRENDAN, 4)
    assert mom_heals(m.read, SB1) is False
    m = route104()
    flag(m, FLAG_HAS_MATCH_CALL)
    assert mom_heals(m.read, SB1) is False
    flag(m, FLAG_ENABLE_MOM_MATCH_CALL)
    assert mom_heals(m.read, SB1) is True
    flag(m, FLAG_BADGE05_GET)
    assert mom_heals(m.read, SB1) is False
    flag(m, FLAG_RECEIVED_AMULET_COIN)
    assert mom_heals(m.read, SB1) is True


def test_home_follows_the_player_gender_and_an_unset_heal_location_is_none() -> None:
    m = route104()
    m.put(SB2 + 0x08, bytes([1]))
    m.put(SB1 + 0x1C, struct.pack("<bb", -1, -1))
    got = facts(m)
    assert got is not None and got.home == (1, 2) and got.last_heal is None
    m.put(SB2 + 0x08, bytes([7]))
    got = facts(m)
    assert got is not None and got.home is None


def test_an_unreadable_read_gives_no_facts() -> None:
    m = route104()

    def short(address: int, length: int) -> bytes:
        return b"" if address == SB1 + 0xC70 else m.read(address, length)

    assert read_heal_facts(short, SB1, SB2, ROUTE104, (TORCHIC,)) is None


def test_switch_is_a_default_off_server_feature() -> None:
    assert SWITCH == "heal-before-trainers-v1"
    assert SWITCH in SERVER_FEATURES
    assert SWITCH in features_off_from_env({})


def test_state_json_gains_the_field_only_with_the_switch_and_the_readout_is_unchanged() -> None:
    m = route104()
    off = features_off_from_env({})
    without = read_state(m.read, MAPS, active_ui=True, off=off)
    with_switch = read_state(m.read, MAPS, active_ui=True, off=off - {SWITCH})
    assert "heal_before_trainers" not in state_json(without)
    assert state_json(with_switch)["heal_before_trainers"] == {
        "trainers": [
            {
                "local_id": 3,
                "x": 31,
                "y": 24,
                "graphics_id": 47,
                "sprite_kind": "LASS",
                "trainer_id": 604,
                "defeated": False,
            }
        ],
        "move_power": [],
        "last_heal": [0, 10],
        "home": [1, 0],
        "mom_heals": True,
    }
    rest = {k: v for k, v in state_json(with_switch).items() if k != "heal_before_trainers"}
    assert rest == state_json(without)
    assert format_readout(with_switch, off - {SWITCH}) == format_readout(without, off)


def test_no_field_facts_off_the_field() -> None:
    m = route104()
    m.put(0x030026F9, bytes([0x02]))
    state = read_game_state(m.read, MAPS, heal_trainers_enabled=True)
    assert state.heal_trainers is None


# --- real RAM: run e046, with the operator's ROM ---------------------------------------------
# The fixture holds RAM windows (never ROM bytes) from the raw-RAM archives of e046's states 16066
# (before the RICH_BOY) and 16287 (after him, before the LASS), and twin_facts: what pokeemerald's
# source (scripts.inc, opponents.h, battle_moves.h) says those objects and moves are. The ROM's own
# script heads and move table must give the same facts.

E046 = json.loads((Path(__file__).parent / "fixtures/heal-trainers-e046.json").read_text())
ROM_START = 0x08000000


@functools.cache
def operator_rom() -> bytes:
    try:
        return resolve_rom(os.environ, EMERALD_SHA1).read_bytes()
    except RomError:
        pytest.skip("POKEBENCH_ROM is not set to the Emerald ROM")


def e046(seq: int):  # type: ignore[no-untyped-def]
    frame = next(f for f in E046["frames"] if f["seq"] == seq)
    cells: dict[int, int] = {}
    for window in frame["windows"]:
        start = int(window["address"], 16)
        for offset, value in enumerate(bytes.fromhex(window["hex"])):
            cells[start + offset] = value
    rom = operator_rom()

    def read(address: int, length: int) -> bytes:
        if address >= ROM_START:
            return rom[address - ROM_START : address - ROM_START + length]
        return bytes(cells[address + i] for i in range(length))

    party = tuple(
        PartyMon(
            m["species"],
            m["level"],
            m["hp"],
            m["max_hp"],
            moves=tuple(PokemonMove(*v) for v in m["moves"]),
        )
        for m in frame["party"]
    )
    save1, save2 = struct.unpack("<II", read(0x03005D8C, 8))
    return read_heal_facts(read, save1, save2, tuple(frame["map_id"]), party), frame


@pytest.mark.parametrize("seq", [16066, 16287])
def test_e046_real_ram_and_rom_give_the_facts_the_game_source_names(seq: int) -> None:
    got, frame = e046(seq)
    assert got is not None
    assert got.json() == frame["twin_facts"]


def test_e046_after_the_rich_boy_the_lass_is_unbeaten_and_oldale_set_the_last_heal() -> None:
    got, _ = e046(16287)
    assert got is not None
    assert [(t.local_id, t.sprite_kind, t.trainer_id, t.defeated) for t in got.trainers] == [
        (3, "LASS", 604, False),
        (25, "RICH_BOY", 136, True),
    ]
    assert dict(got.move_power) == {10: 40, 45: 0, 52: 40, 116: 0}
    assert (got.last_heal, got.home, got.mom_heals) == ((0, 10), (1, 0), True)
