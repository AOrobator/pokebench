"""exp-next-level-v1 and pokedex-own-v1.

The fixtures are raw-RAM archives copied byte for byte from runs
2026-10-21T06-28-18_qwen36-gpu0_1331 and 2026-10-20T20-26-22_qwen36-gpu1_97a0
(training-raw.provenance.json names each source archive, its state seq, turn and sha256).
Game sources: pret/pokeemerald 731ad5bf src/strings.c gText_ExpPoints "EXP. POINTS" and
gText_NextLv "NEXT LV."; src/pokemon_summary_screen.c expToNextLevel =
gExperienceTables[growthRate][level + 1] - exp; src/pokedex.c GetSetPokedexFlag and
GetHoennPokedexCount; include/global.h struct Pokedex, SaveBlock1 seen1/seen2.
"""

from __future__ import annotations

import json
import os
import re
import struct
from dataclasses import replace
from functools import cache
from pathlib import Path

import pytest

from pokebench_env.game_screen import ReadMemory
from pokebench_env.game_state import GameState, MapNames, _with_training
from pokebench_env.pokedex_own import (
    SWITCH as DEX_SWITCH,
)
from pokebench_env.pokedex_own import (
    Pokedex,
    dex_lines,
    read_pokedex,
    wild_foes,
)
from pokebench_env.raw_ram import load_raw_ram
from pokebench_env.readout import SERVER_FEATURES, features_off_from_env, state_json
from pokebench_env.rerender import PORYMAP_MAPS, read_state, render
from pokebench_env.rom import resolve_rom
from pokebench_env.training_readout import (
    EXPERIENCE_TABLES,
    SPECIES_INFO,
    exp_clause,
    next_level_exp,
)
from pokebench_env.training_readout import (
    SWITCH as EXP_SWITCH,
)

FIXTURES = Path(__file__).parent / "fixtures"
PROVENANCE = json.loads((FIXTURES / "training-raw.provenance.json").read_text())
BOTH = frozenset({EXP_SWITCH, DEX_SWITCH})


@cache
def _rom() -> bytes:
    return resolve_rom({"POKEBENCH_ROM": os.environ.get("POKEBENCH_ROM", "")}).read_bytes()


@cache
def archived(name: str) -> ReadMemory:
    archive = PROVENANCE["archives"][name]
    return load_raw_ram(FIXTURES / f"{name}.json.gz", archive["sha256"], rom=_rom())


@cache
def maps() -> MapNames:
    return MapNames.load(PORYMAP_MAPS)


def state(name: str, off: frozenset[str] = frozenset()) -> GameState:
    return read_state(archived(name), maps(), active_ui=True, off=off)


def text(name: str, off: frozenset[str] = frozenset()) -> str:
    return render(state(name, off), off)


def line(text: str, prefix: str) -> str:
    return next(entry for entry in text.split("\n") if entry.startswith(prefix))


def rom_read(address: int, length: int) -> bytes:
    offset = address - 0x08000000
    return _rom()[offset : offset + length]


# --- exp-next-level-v1 --------------------------------------------------------------------


def table(growth: int) -> tuple[int, ...]:
    return struct.unpack("<101I", rom_read(EXPERIENCE_TABLES + 404 * growth, 404))


@pytest.mark.parametrize("growth", range(6))
@pytest.mark.parametrize("level", (1, 15, 99))
def test_next_level_is_the_summary_screens_number(growth: int, level: int) -> None:
    # A species with this growth rate, found in the game's own species table.
    species = next(s for s in range(1, 412) if rom_read(SPECIES_INFO + 28 * s + 19, 1)[0] == growth)
    levels = table(growth)
    exp = levels[level]
    assert next_level_exp(rom_read, species, level, exp) == levels[level + 1] - exp


def test_max_level_shows_zero() -> None:
    assert next_level_exp(rom_read, 280, 100, 1_059_860) == 0


def test_no_number_while_a_level_up_is_pending() -> None:
    # EXP. Points at or past the next level's total: the level has not risen yet.
    levels = table(3)
    assert next_level_exp(rom_read, 280, 15, levels[16]) is None
    assert next_level_exp(rom_read, 280, 15, levels[16] + 5) is None


def test_an_egg_has_no_exp_clause() -> None:
    gym = state("training-1331-gym-field")
    assert gym.party is not None
    egg = replace(gym, party=(replace(gym.party[0], is_egg=True), *gym.party[1:]))
    assert _with_training(
        archived("training-1331-gym-field"), egg, exp_next_enabled=True, pokedex_enabled=False
    ).party_next_level == (None, 25)


def test_an_unknown_species_has_no_number() -> None:
    assert next_level_exp(rom_read, 0, 5, 135) is None
    assert next_level_exp(rom_read, 412, 5, 135) is None


def test_exp_clause_wording() -> None:
    assert exp_clause(1619, 416) == "EXP. POINTS 1619 · NEXT LV. 416"
    assert exp_clause(None, 416) == ""
    assert exp_clause(1619, None) == ""


def test_party_line_carries_exp_and_next_level() -> None:
    party = line(text("training-1331-gym-field"), "Party (")
    assert party.startswith(
        "Party (player): TORCHIC Lv14 HP 37/37 · EXP. POINTS 1619 · NEXT LV. 416 · moves "
    )
    # WURMPLE is MEDIUM_FAST: Lv5 needs 125 EXP. Points.
    assert "; WURMPLE Lv4 HP 17/17 · EXP. POINTS 100 · NEXT LV. 25 · moves " in party


def test_97a0_challenged_roxanne_22_exp_points_short() -> None:
    assert "TORCHIC Lv15 HP 22/42 · EXP. POINTS 2513 · NEXT LV. 22" in line(
        text("training-97a0-rustboro-field"), "Party ("
    )


def test_party_line_in_battle_too() -> None:
    assert "TORCHIC Lv14 HP 37/37 · EXP. POINTS 1619 · NEXT LV. 416" in line(
        text("training-1331-roxanne-battle"), "Party (player)"
    )


# --- pokedex-own-v1 -----------------------------------------------------------------------


def test_counts_follow_the_catch() -> None:
    before = read_pokedex(archived("training-1331-wild-wurmple"))
    after = read_pokedex(archived("training-1331-after-catch"))
    assert before is not None and after is not None
    assert (before.own, after.own) == (1, 2)
    assert after.seen >= before.seen >= before.own
    # WURMPLE is national #265 and species 290.
    assert 265 not in before.owned and 265 in after.owned
    assert 255 in before.owned  # TORCHIC


def test_field_line_after_the_pokedex_is_received() -> None:
    dex = read_pokedex(archived("training-1331-gym-field"))
    assert dex is not None
    assert line(text("training-1331-gym-field"), "POKéDEX:") == (
        f"POKéDEX: SEEN {dex.seen} · OWN {dex.own} (the POKéDEX list's HOENN counts) · party 2 of 6"
    )


def test_no_line_before_the_pokedex_is_received() -> None:
    assert "POKéDEX:" not in text("training-1331-pre-dex")


def test_wild_foe_not_owned_is_marked() -> None:
    rendered = text("training-1331-wild-wurmple")
    assert "Wild WURMPLE: not in your POKéDEX OWN list" in rendered.split("\n")


def test_trainer_battle_has_no_ownership_line() -> None:
    assert "POKéDEX OWN list" not in text("training-1331-roxanne-battle")


def test_a_trainer_battle_the_opponent_reader_cannot_name_is_not_wild() -> None:
    # A Secret Base battle: opponent 1024, so no trainer_opponent, but BATTLE_TYPE_TRAINER is set.
    wild = state("training-1331-wild-wurmple")
    assert wild.battle is not None
    assert wild.trainer_opponent is None or not wild.trainer_opponent.battle_active
    secret = replace(wild, battle=replace(wild.battle, battle_type=0x08000008))
    assert wild_foes(archived("training-1331-wild-wurmple"), frozenset(), secret) == ()
    assert wild_foes(archived("training-1331-wild-wurmple"), frozenset(), wild) == (
        ("WURMPLE", False),
    )


def test_owned_wild_foe_says_so() -> None:
    dex = Pokedex(seen=3, own=2, owned=frozenset({255, 265}), wild_foes=(("WURMPLE", True),))
    current = state("training-1331-wild-wurmple")
    assert "Wild WURMPLE: in your POKéDEX OWN list" in dex_lines(current, dex)


def test_inconsistent_copies_are_not_counted() -> None:
    # GetSetPokedexFlag counts an owned bit only when SaveBlock2's seen and SaveBlock1's seen1 and
    # seen2 copies agree; a stray owned bit counts for nothing.
    base = archived("training-1331-gym-field")
    save2 = struct.unpack("<I", base(0x03005D90, 4))[0]
    owned = save2 + 0x18 + 0x10

    def stray(address: int, length: int) -> bytes:
        data = bytearray(base(address, length))
        bit = owned + (251 - 1) // 8  # national #251, never seen in this run
        if address <= bit < address + length:
            data[bit - address] |= 1 << ((251 - 1) % 8)
        return bytes(data)

    dex = read_pokedex(stray)
    clean = read_pokedex(base)
    assert dex is not None and clean is not None
    assert dex.own == clean.own and 251 not in dex.owned


def test_unreadable_save_has_no_pokedex() -> None:
    assert read_pokedex(lambda address, length: bytes(length)) is None


# --- switches -----------------------------------------------------------------------------


@pytest.mark.parametrize(
    "name",
    (
        "training-1331-pre-dex",
        "training-1331-wild-wurmple",
        "training-1331-after-catch",
        "training-1331-gym-field",
        "training-1331-roxanne-battle",
        "training-97a0-rustboro-field",
    ),
)
def test_off_is_todays_readout_and_state(name: str) -> None:
    off = text(name, BOTH)
    assert "EXP. POINTS" not in off and "POKéDEX:" not in off and "OWN list" not in off
    added = re.compile(r" · EXP\. POINTS \d+ · NEXT LV\. \d+")
    on = [
        added.sub("", entry)
        for entry in text(name).split("\n")
        if not entry.startswith("POKéDEX:") and not entry.endswith("POKéDEX OWN list")
    ]
    assert "\n".join(on) == off
    off_json, on_json = state_json(state(name, BOTH)), state_json(state(name))
    assert "party_next_level" not in off_json
    assert {k: v for k, v in on_json.items() if k != "party_next_level"} == off_json


def test_state_json_carries_next_level_only_when_on() -> None:
    assert state_json(state("training-1331-gym-field"))["party_next_level"] == [416, 25]
    assert "party_next_level" not in state_json(state("training-1331-gym-field", BOTH))


def test_each_switch_is_independent() -> None:
    only_exp = text("training-1331-gym-field", frozenset({DEX_SWITCH}))
    only_dex = text("training-1331-gym-field", frozenset({EXP_SWITCH}))
    assert "NEXT LV." in only_exp and "POKéDEX:" not in only_exp
    assert "POKéDEX:" in only_dex and "NEXT LV." not in only_dex


def test_registered_server_switches_default_off() -> None:
    assert {EXP_SWITCH, DEX_SWITCH} <= set(SERVER_FEATURES)
    assert BOTH <= features_off_from_env({})
