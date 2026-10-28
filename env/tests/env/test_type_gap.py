"""type-gap-team-v1 on the real ROM and the 1331 raw-RAM archives (training-raw.provenance.json).

Game sources: pret/pokeemerald 731ad5bf src/battle_main.c gTypeEffectiveness and the gym guides'
advice texts in data/maps/*Gym*/scripts.inc (<map>_Text_GymGuideAdvice).
"""

from __future__ import annotations

import re
from dataclasses import replace

import pytest
from test_training_readout import _rom, archived, rom_read, state, text

from pokebench_env import type_gap
from pokebench_env.battle_damage import TYPE_CHART
from pokebench_env.native_text import ENGLISH_GLYPHS
from pokebench_env.pokemon import PokemonMove
from pokebench_env.readout import SERVER_FEATURES, features_off_from_env, state_json
from pokebench_env.type_gap import (
    FORESIGHT,
    SWITCH,
    TYPE_EFFECTIVENESS,
    TypeGap,
    read_type_chart,
    read_type_gap,
)

ON: frozenset[str] = frozenset()
OFF = frozenset({SWITCH, "move-learn-type-matchup-v1"})
GYM = "training-1331-gym-field"


@pytest.fixture(autouse=True)
def _fresh_chart(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(type_gap, "_chart", None)


def test_rom_chart_is_prets_table_in_order() -> None:
    rows = read_type_chart(rom_read)
    foresight = rows.index((FORESIGHT, FORESIGHT, 0))
    assert [r for r in rows if r[0] != FORESIGHT] == [(a, d, m) for (a, d), m in TYPE_CHART.items()]
    assert rows[foresight + 1 :] == ((0, 7, 0), (1, 7, 0))
    # TYPE_ENDTABLE follows the last row; the 336 bytes end right before gTypeNames ("NORMAL").
    assert rom_read(TYPE_EFFECTIVENESS + 3 * len(rows), 1) == b"\xff"
    names = rom_read(TYPE_EFFECTIVENESS + 336, 6)
    assert "".join(ENGLISH_GLYPHS[b] for b in names) == "NORMAL"


def test_chart_is_read_once() -> None:
    reads: list[int] = []

    def counting(address: int, length: int) -> bytes:
        reads.append(address)
        return rom_read(address, length)

    assert read_type_chart(counting) == read_type_chart(counting)
    assert reads == [TYPE_EFFECTIVENESS]


def _encode(text: str) -> bytes:
    codes = {glyph: code for code, glyph in reversed(ENGLISH_GLYPHS.items()) if len(glyph) == 1}
    return bytes(codes[c] for c in text)


# The type-naming sentence of each guide's advice, as one page joined into one line by the agent.
GUIDES = {
    "RUSTBORO": ("ROXANNE, the GYM LEADER, is a user", "of ROCK-type POKéMON."),
    "DEWFORD": ("DEWFORD's GYM LEADER BRAWLY commands", "FIGHTING-type POKéMON."),
    "MAUVILLE": ("WATTSON, the LEADER of MAUVILLE", "GYM, uses ELECTRIC-type POKéMON."),
    "LAVARIDGE": ("LAVARIDGE's GYM LEADER FLANNERY", "uses FIRE-type POKéMON."),
    "FORTREE": ("FORTREE GYM LEADER WINONA is", "a master of FLYING-type POKéMON."),
    "MOSSDEEP": ("The GYM LEADERS here use", "PSYCHIC-type POKéMON."),
    "SOOTOPOLIS": ("SOOTOPOLIS's GYM LEADER JUAN is", "a master of WATER-type POKéMON."),
}
# packages/agent/src/type-gap-team.ts GUIDE_TYPE.
GUIDE_TYPE = re.compile(
    r"\b(?:is a user of|commands|uses|use|is a master of) ([A-Z]+)-type POKéMON\.$"
)


def test_every_gym_guide_sentence_is_in_the_rom_and_matches() -> None:
    encoded = {
        gym: _encode(first) + b"\xfe" + _encode(second) for gym, (first, second) in GUIDES.items()
    }
    # One pass over the ROM finds every guide sentence.
    found = set(re.findall(b"|".join(re.escape(e) for e in encoded.values()), _rom()))
    assert {gym for gym, e in encoded.items() if e in found} == set(GUIDES)
    for first, second in GUIDES.values():
        assert GUIDE_TYPE.search(f"{first} {second}") is not None


def test_party_types_and_moves_from_ram() -> None:
    gap = state(GYM).type_gap
    assert gap is not None and gap.diagnostic is None
    torchic = gap.party[0]
    assert torchic.species_types == (10, 10)
    assert [(m.name, m.move_type, m.power) for m in torchic.moves][:2] == [
        ("SCRATCH", 0, 40),
        ("GROWL", 0, 0),
    ]
    assert gap.chart == read_type_chart(rom_read)


def test_state_json_carries_type_gap_only_when_on() -> None:
    on, off = state_json(state(GYM, ON)), state_json(state(GYM, OFF))
    assert "type_gap" in on and "type_gap" not in off
    assert {k: v for k, v in on.items() if k != "type_gap"} == off
    assert text(GYM, ON) == text(GYM, OFF)


def test_switch_is_registered_and_off_by_default() -> None:
    assert SWITCH in SERVER_FEATURES
    assert SWITCH in features_off_from_env({})


def test_eggs_and_unreadable_members_have_no_types() -> None:
    gym = state(GYM)
    assert gym.party is not None
    mon = gym.party[0]
    party = (
        replace(mon, is_egg=True),
        replace(mon, species_id=None),
        replace(mon, moves=(PokemonMove(0, 0, 0),)),
    )
    gap = read_type_gap(archived(GYM), party)
    assert [(p.species_types, p.moves) for p in gap.party] == [
        (None, ()),
        (None, ()),
        ((10, 10), ()),
    ]
    assert read_type_gap(archived(GYM), None).party == ()


def _patched(address: int, value: bytes):  # type: ignore[no-untyped-def]
    def read(at: int, length: int) -> bytes:
        body = bytearray(rom_read(at, length))
        if at <= address < at + length:
            body[address - at : address - at + len(value)] = value
        return bytes(body)

    return read


def test_bad_rom_tables_are_harness_bugs(monkeypatch: pytest.MonkeyPatch) -> None:
    gym = state(GYM)
    assert gym.party is not None
    species = gym.party[0].species_id
    assert species is not None
    bad_species = read_type_gap(
        _patched(type_gap.SPECIES_INFO + 28 * species + 6, b"\x40"), gym.party
    )
    assert bad_species == TypeGap(
        (), (), f"harness bug: type gap: invalid species types for species {species}"
    )
    move = (gym.party[0].moves or ())[0].move_id
    bad_move = read_type_gap(_patched(type_gap.BATTLE_MOVES + 12 * move + 2, b"\x40"), gym.party)
    assert bad_move.diagnostic == f"harness bug: type gap: invalid move type for move {move}"
    monkeypatch.setattr(type_gap, "_chart", None)
    bad_row = read_type_gap(_patched(TYPE_EFFECTIVENESS + 2, b"\x07"), gym.party)
    assert bad_row.diagnostic is not None and "row 0 is not a type chart row" in bad_row.diagnostic
    monkeypatch.setattr(type_gap, "_chart", None)
    foresight = read_type_chart(rom_read).index((FORESIGHT, FORESIGHT, 0))
    monkeypatch.setattr(type_gap, "_chart", None)
    bad_separator = read_type_gap(
        _patched(TYPE_EFFECTIVENESS + 3 * foresight + 2, b"\x07"), gym.party
    )
    assert (
        bad_separator.diagnostic is not None
        and "is not a type chart row" in bad_separator.diagnostic
    )
    monkeypatch.setattr(type_gap, "_chart", None)
    no_end = read_type_gap(_patched(TYPE_EFFECTIVENESS + 3 * 111, b"\x00\x00\x00"), gym.party)
    assert no_end.diagnostic == "harness bug: type gap: type chart has no end row"


def test_json_shape() -> None:
    gap = state(GYM).type_gap
    assert gap is not None
    body = gap.json()
    assert body["diagnostic"] is None
    assert body["type_chart"] == [list(r) for r in gap.chart]
    party = body["party"]
    assert isinstance(party, list)
    assert party[0]["species_types"] == [10, 10]
    assert party[0]["moves"][0] == {"move_id": 10, "name": "SCRATCH", "move_type": 0, "power": 40}
    unread = TypeGap((type_gap.PartyTypes(0, None, ()),), ()).json()
    assert unread["party"] == [{"slot": 0, "species_types": None, "moves": []}]


def test_move_matchup_alone_reads_rom_types_without_gym_guidance() -> None:
    off = frozenset(SERVER_FEATURES) - {"move-learn-type-matchup-v1"}
    snapshot = state(GYM, off)
    assert snapshot.type_gap is not None
    assert snapshot.type_gap.diagnostic is None
    assert snapshot.type_gap.party[0].species_types == (10, 10)
    assert state(GYM, frozenset(SERVER_FEATURES)).type_gap is None


def test_move_matchup_reads_only_rom_chart_at_real_midframe_battle() -> None:
    import json
    from pathlib import Path

    from test_training_readout import maps

    from pokebench_env.raw_ram import load_raw_ram
    from pokebench_env.rerender import read_state

    directory = Path(__file__).parent / "fixtures"
    provenance = json.loads((directory / "move-matchup-battle-9c88.provenance.json").read_text())
    read = load_raw_ram(
        directory / "move-matchup-battle-9c88.json.gz", provenance["raw_ram"]["sha256"], rom=_rom()
    )
    off = frozenset(SERVER_FEATURES) - set(provenance["harness_features"])
    before = read_state(read, maps(), active_ui=True, off=off | {"move-learn-type-matchup-v1"})
    after = read_state(read, maps(), active_ui=True, off=off - {"move-learn-type-matchup-v1"})
    assert before.party is None and after.party is None
    assert before.type_gap is None
    assert after.type_gap is not None and after.type_gap.diagnostic is None
    assert after.type_gap.party == ()
    assert after.type_gap.chart == read_type_chart(rom_read)
    assert after.battle_details is None  # no damage guess from incoherent save-backed facts
