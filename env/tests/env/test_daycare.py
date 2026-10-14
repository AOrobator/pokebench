import struct

import pytest

from pokebench_env.daycare import daycare_display_name, read_daycare
from pokebench_env.menu_field_people import DAYCARE
from tests.env.test_menu_field_people import list_task, npc

SAVE = 0x02015000


def sample():
    m = npc(DAYCARE, [1, 0])
    list_task(m, 1, 0, [("", 0), ("", 1), ("EXIT", 2)], 0)
    return m


def test_daycare_is_observable_without_any_menu_and_empty_slots_are_removed():
    m = sample()
    mons = read_daycare(m.read, SAVE)
    assert [(mon.slot, mon.pokemon.nickname, mon.displayed_level) for mon in mons] == [
        (0, "MARILL", 5),
        (1, "SHROOMISH", 5),
    ]
    m.put(SAVE + 0x3030, b"\x00" * 80)
    assert [mon.slot for mon in read_daycare(m.read, SAVE)] == [1]
    m.put(SAVE + 0x3030 + 140, b"\x00" * 80)
    assert read_daycare(m.read, SAVE) == ()


def test_daycare_level_uses_stored_steps_u32_and_source_max_level():
    m = sample()
    for steps, level in [(159, 6), (1000000, 100), (0xFFFFFFFF, 4)]:
        m.put(SAVE + 0x3030 + 136, struct.pack("<I", steps))
        entry = read_daycare(m.read, SAVE)[0]
        assert (entry.steps, entry.displayed_level) == (steps, level)
        assert entry.pokemon.level is None  # no cached party level in BoxMon
        assert entry.pokemon.hp is None


def test_invalid_mon_keeps_occupied_slot_and_raw_diagnostic():
    m = sample()
    m.put(SAVE + 0x3030 + 28, b"\x00\x00")
    entry = read_daycare(m.read, SAVE)[0]
    assert entry.slot == 0 and entry.displayed_level is None
    assert entry.pokemon.diagnostic.startswith("harness bug:")
    assert len(entry.pokemon.raw_hex) == 160
    with pytest.raises(ValueError, match="decoding unavailable"):
        daycare_display_name(m.read, entry.pokemon)


def test_nickname_error_preserves_species_experience_and_displayed_level():
    m = sample()
    m.put(SAVE + 0x3030 + 8, b"\xfd")
    entry = read_daycare(m.read, SAVE)[0]
    assert entry.pokemon.species_id == 280 and entry.displayed_level == 5
    assert entry.pokemon.nickname_diagnostic.startswith("harness bug:")


@pytest.mark.parametrize("kind", ["pointer", "short", "growth", "species_short"])
def test_bad_native_owners_or_rom_tables_are_explicit(kind):
    m = sample()
    read, save = m.read, SAVE
    if kind == "pointer":
        save = 0
    elif kind == "growth":
        m.put(0x083203CC + 28 * 280 + 19, b"\x06")
    else:
        address = SAVE + 0x3030 if kind == "short" else 0x083203CC + 28 * 280

        def read(a, n):
            return m.read(a, n - 1 if a == address else n)

    with pytest.raises(ValueError):
        read_daycare(read, save)
