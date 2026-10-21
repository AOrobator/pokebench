"""pokedex-own-v1: the POKéDEX list's SEEN and OWN counts, and whether a wild foe is owned.

pret/pokeemerald 731ad5bf.
- include/global.h: SaveBlock2 +0x18 is struct Pokedex, owned[52] at +0x10 and seen[52] at +0x44;
  SaveBlock1 keeps two more seen copies, seen1 at +0x988 and seen2 at +0x3B24.
- src/pokedex.c GetSetPokedexFlag: national number n is bit (n - 1) % 8 of byte (n - 1) / 8. SEEN
  counts only when SaveBlock2's seen bit equals both SaveBlock1 copies; OWN counts only when the
  owned bit also equals all three seen copies (the game clears a mismatch).
- src/pokedex.c GetHoennPokedexCount: the list screen's counts run over the HOENN_DEX_COUNT (202)
  entries of sHoennToNationalOrder. The SEEN and OWN labels are drawn tiles on that screen.
- src/pokemon.c SpeciesToNationalPokedexNum: sSpeciesToNationalPokedexNum[species - 1].
ROM (US f3ae0881): sSpeciesToNationalPokedexNum at 0x0831DC82, sHoennToNationalOrder at
0x0831DFB8 (the next table, 411 u16 later, in src/pokemon.c order).
"""

import struct
from dataclasses import dataclass
from typing import TYPE_CHECKING

from pokebench_env.game_screen import ReadMemory

if TYPE_CHECKING:
    from pokebench_env.game_state import GameState

SWITCH = "pokedex-own-v1"
SAVE_BLOCK_PTRS = 0x03005D8C
SPECIES_TO_NATIONAL = 0x0831DC82
HOENN_TO_NATIONAL = 0x0831DFB8
HOENN_DEX_COUNT = 202
NUM_SPECIES = 412
DEX_FLAG_BYTES = 52
SAVE2_POKEDEX = 0x18
OWNED = 0x10
SEEN = 0x44
SAVE1_SEEN1 = 0x988
SAVE1_SEEN2 = 0x3B24
PARTY_SIZE = 6


@dataclass(frozen=True)
class Pokedex:
    seen: int
    own: int
    # National numbers the game counts as owned, every region.
    owned: frozenset[int]
    # In a wild battle, each foe on the field: species name and whether it is owned.
    wild_foes: tuple[tuple[str, bool], ...] = ()


def _bit(flags: bytes, national: int) -> bool:
    index = national - 1
    return bool(flags[index // 8] & (1 << (index % 8)))


def _pointer_ok(pointer: int, size: int) -> bool:
    return 0x02000000 <= pointer <= 0x02040000 - size and pointer % 4 == 0


def read_pokedex(read: ReadMemory) -> Pokedex | None:
    """The game's own POKéDEX counts, or None when the save blocks are not readable."""
    save1, save2 = struct.unpack("<II", read(SAVE_BLOCK_PTRS, 8))
    if not _pointer_ok(save1, SAVE1_SEEN2 + DEX_FLAG_BYTES) or not _pointer_ok(save2, 0x90):
        return None
    dex = save2 + SAVE2_POKEDEX
    owned = read(dex + OWNED, DEX_FLAG_BYTES)
    seen = read(dex + SEEN, DEX_FLAG_BYTES)
    seen1 = read(save1 + SAVE1_SEEN1, DEX_FLAG_BYTES)
    seen2 = read(save1 + SAVE1_SEEN2, DEX_FLAG_BYTES)

    def is_seen(national: int) -> bool:
        return _bit(seen, national) and _bit(seen1, national) and _bit(seen2, national)

    def is_owned(national: int) -> bool:
        return _bit(owned, national) and is_seen(national)

    hoenn = struct.unpack(f"<{HOENN_DEX_COUNT}H", read(HOENN_TO_NATIONAL, 2 * HOENN_DEX_COUNT))
    return Pokedex(
        seen=sum(is_seen(n) for n in hoenn),
        own=sum(is_owned(n) for n in hoenn),
        owned=frozenset(n for n in range(1, DEX_FLAG_BYTES * 8 + 1) if is_owned(n)),
    )


def national_number(read: ReadMemory, species: int) -> int | None:
    if not 0 < species < NUM_SPECIES:
        return None
    (number,) = struct.unpack("<H", read(SPECIES_TO_NATIONAL + 2 * (species - 1), 2))
    return int(number) or None


def wild_foes(
    read: ReadMemory, owned: frozenset[int], state: "GameState"
) -> tuple[tuple[str, bool], ...]:
    """Foes on the field in a wild battle (no trainer battle is active), with ownership."""
    battle = state.battle
    opponent = state.trainer_opponent
    if not state.in_battle or battle is None or (opponent is not None and opponent.battle_active):
        return ()
    foes = []
    for foe in battle.battlers or ():
        if foe.position % 2 != 1 or foe.absent:
            continue
        national = national_number(read, foe.species_id)
        if national is not None:
            foes.append((foe.species, national in owned))
    return tuple(foes)


def dex_lines(state: "GameState", dex: Pokedex) -> list[str]:
    """The field line, and in a wild battle one line per foe on the field."""
    party = [m for m in state.party or () if m.species is not None]
    lines = [
        f"POKéDEX: SEEN {dex.seen} · OWN {dex.own} (the POKéDEX list's HOENN counts) · "
        f"party {len(party)} of {PARTY_SIZE}"
    ]
    for species, owned in dex.wild_foes:
        lines.append(f"Wild {species}: {'in' if owned else 'not in'} your POKéDEX OWN list")
    return lines
