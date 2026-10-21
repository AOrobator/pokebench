"""exp-next-level-v1: the two numbers the POKéMON summary screen shows under the stats.

pret/pokeemerald 731ad5bf. src/strings.c gText_ExpPoints "EXP. POINTS" and gText_NextLv
"NEXT LV."; src/pokemon_summary_screen.c (PrintExpPointsNextLevel) computes
expToNextLevel = gExperienceTables[gSpeciesInfo[species].growthRate][level + 1] - exp, and 0 at
MAX_LEVEL. ROM (US f3ae0881): gExperienceTables at 0x0831F72C (6 growth rates x 101 u32),
gSpeciesInfo at 0x083203CC (28 bytes per species, growthRate at +19).
"""

import struct

from pokebench_env.game_screen import ReadMemory

SWITCH = "exp-next-level-v1"
EXPERIENCE_TABLES = 0x0831F72C
SPECIES_INFO = 0x083203CC
SPECIES_INFO_SIZE = 28
GROWTH_RATE = 19
GROWTH_RATES = 6
NUM_SPECIES = 412
MAX_LEVEL = 100


def next_level_exp(read: ReadMemory, species: int, level: int, exp: int) -> int | None:
    """The summary screen's NEXT LV. number, or None for a species or level it cannot show."""
    if not 0 < species < NUM_SPECIES or not 0 < level <= MAX_LEVEL:
        return None
    if level == MAX_LEVEL:
        return 0
    growth = read(SPECIES_INFO + SPECIES_INFO_SIZE * species + GROWTH_RATE, 1)[0]
    if growth >= GROWTH_RATES:
        return None
    (needed,) = struct.unpack("<I", read(EXPERIENCE_TABLES + 404 * growth + 4 * (level + 1), 4))
    return int(needed) - exp


def exp_clause(exp: int | None, next_level: int | None) -> str:
    if exp is None or next_level is None:
        return ""
    return f"EXP. POINTS {exp} · NEXT LV. {next_level}"
