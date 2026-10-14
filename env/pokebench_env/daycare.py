"""Save-owned daycare Pokémon and source-computed level after stored steps."""

import struct
from dataclasses import dataclass

from pokebench_env.game_screen import ReadMemory
from pokebench_env.pokemon import PartyMon, decode_box_mon, pokemon_cpu_context

DAYCARE_OFFSET = 0x3030
DAYCARE_MON_SIZE = 140
SPECIES_INFO = 0x083203CC
EXPERIENCE_TABLES = 0x0831F72C


@dataclass(frozen=True)
class DaycarePokemon:
    slot: int
    pokemon: PartyMon
    steps: int
    displayed_level: int | None


def read_daycare(read: ReadMemory, save1: int) -> tuple[DaycarePokemon, ...]:
    if not 0x02000000 <= save1 <= 0x02040000 - DAYCARE_OFFSET - 280:
        raise ValueError("invalid daycare save owner")
    raw = read(save1 + DAYCARE_OFFSET, 280)
    if len(raw) != 280:
        raise ValueError("short daycare Pokémon snapshot")
    result = []
    cpu = pokemon_cpu_context(read)
    for slot in range(2):
        body = raw[slot * 140 : (slot + 1) * 140]
        if not any(body[:80]):  # ClearDaycareMon calls ZeroBoxMon.
            continue
        address = save1 + DAYCARE_OFFSET + 140 * slot
        mon = decode_box_mon(body[:80], read, address=address, cpu=cpu)
        steps = int.from_bytes(body[136:140], "little")
        level = None
        if mon.diagnostic is None:
            assert mon.species_id is not None and mon.experience is not None
            species = read(SPECIES_INFO + 28 * mon.species_id, 28)
            if len(species) != 28 or species[19] > 5:
                raise ValueError("invalid daycare growth-rate table row")
            table = struct.unpack("<101I", read(EXPERIENCE_TABLES + 404 * species[19], 404))
            experience = (mon.experience + steps) & 0xFFFFFFFF
            level = next((lvl - 1 for lvl in range(1, 101) if table[lvl] > experience), 100)
        result.append(DaycarePokemon(slot, mon, steps, level))
    return tuple(result)


def daycare_display_name(read: ReadMemory, mon: PartyMon) -> str:
    if mon.diagnostic or mon.nickname_diagnostic or mon.nickname is None:
        raise ValueError("daycare Pokémon/name decoding unavailable")
    assert mon.species_id is not None and mon.personality is not None
    ratio = read(SPECIES_INFO + 28 * mon.species_id + 16, 1)[0]
    gender = (
        ""
        if ratio == 255
        else "♀"
        if ratio == 254 or (ratio != 0 and ratio > (mon.personality & 255))
        else "♂"
    )
    if gender and gender in mon.nickname and ("♂" if gender == "♀" else "♀") not in mon.nickname:
        gender = ""
    return mon.nickname + gender
