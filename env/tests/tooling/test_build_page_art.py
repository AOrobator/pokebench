"""The trainer page art script's parsers, on inline source text."""

from __future__ import annotations

import importlib.util
from pathlib import Path
from types import ModuleType

import pytest

SCRIPTS = Path(__file__).resolve().parents[3] / "scripts"


def load() -> ModuleType:
    spec = importlib.util.spec_from_file_location(
        "build_page_art", SCRIPTS / "trainer-card" / "build_page_art.py"
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


page = load()
SOURCE = """static const struct TrainerMonItemCustomMoves sParty_Roxanne1[] = {
    {
    .iv = 100,
    .lvl = 12,
    .species = SPECIES_GEODUDE,
    },
    {
    .lvl = 15,
    .species = SPECIES_NOSEPASS,
    }
};
"""


def test_parse_party_reads_levels_and_species_in_order() -> None:
    assert page.parse_party(SOURCE, "Roxanne1") == [
        ("SPECIES_GEODUDE", 12),
        ("SPECIES_NOSEPASS", 15),
    ]


def test_parse_party_refuses_a_missing_trainer() -> None:
    with pytest.raises(page.art.VerifyError, match="Juan1"):
        page.parse_party(SOURCE, "Juan1")


def test_parse_tm_names_the_move() -> None:
    assert page.parse_tm("\tgiveitem ITEM_TM_ROCK_TOMB\n", "gym") == "Rock Tomb"


def test_parse_tm_refuses_a_script_without_one() -> None:
    with pytest.raises(page.art.VerifyError, match="no TM"):
        page.parse_tm("end", "gym")
