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
from functools import cache
from pathlib import Path

from pokebench_env.game_screen import ReadMemory
from pokebench_env.game_state import GameState, MapNames
from pokebench_env.pokedex_own import (
    SWITCH as DEX_SWITCH,
)
from pokebench_env.pokedex_own import (
    read_pokedex,
)
from pokebench_env.raw_ram import load_raw_ram
from pokebench_env.readout import SERVER_FEATURES, features_off_from_env
from pokebench_env.rerender import PORYMAP_MAPS, read_state, render
from pokebench_env.rom import resolve_rom
from pokebench_env.training_readout import (
    SWITCH as EXP_SWITCH,
)
from pokebench_env.training_readout import (
    exp_clause,
    next_level_exp,
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


def test_max_level_shows_zero() -> None:
    assert next_level_exp(rom_read, 280, 100, 1_059_860) == 0


def test_an_unknown_species_has_no_number() -> None:
    assert next_level_exp(rom_read, 0, 5, 135) is None
    assert next_level_exp(rom_read, 412, 5, 135) is None


def test_exp_clause_wording() -> None:
    assert exp_clause(1619, 416) == "EXP. POINTS 1619 · NEXT LV. 416"
    assert exp_clause(None, 416) == ""
    assert exp_clause(1619, None) == ""


# --- pokedex-own-v1 -----------------------------------------------------------------------


def test_unreadable_save_has_no_pokedex() -> None:
    assert read_pokedex(lambda address, length: bytes(length)) is None


# --- switches -----------------------------------------------------------------------------


def test_registered_server_switches_default_off() -> None:
    assert {EXP_SWITCH, DEX_SWITCH} <= set(SERVER_FEATURES)
    assert BOTH <= features_off_from_env({})
