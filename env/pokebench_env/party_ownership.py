"""Native rental/tutorial ownership and saved original-party identity receipts."""

import struct
from dataclasses import asdict, dataclass

from pokebench_env.battle_choices import IN_BATTLE, TYPE_FLAGS, exact, number
from pokebench_env.game_screen import GMAIN, ReadMemory
from pokebench_env.pokemon import PartyMon

FACTORY_CALLBACKS = frozenset((0x0819A4C9, 0x0819C7E1))
FACTORY_MAPS = frozenset(((26, 31), (26, 32), (26, 33), (9, 2), (9, 3), (9, 4)))
FACILITY_MONS_POINTER = 0x0203BC8C
FACILITY_TABLES = {0x085D97BC: 882, 0x085DE02C: 70}
# Unique exact-ROM special SavePlayerParty/LoadWallyZigzagoon pair, through
# special LoadPlayerParty. Stack return PCs retain ownership during msgbox calls.
WALLY_SCRIPT_START = 0x081DC335
WALLY_SCRIPT_END = 0x081DC380
SCRIPT_CONTEXT = 0x03000E40


def _wally_script_owned(read: ReadMemory) -> bool:
    context = exact(read, SCRIPT_CONTEXT, 0x5C)
    depth, mode = context[:2]
    pc = struct.unpack_from("<I", context, 8)[0]
    pcs = [pc]
    if depth <= 20:
        pcs.extend(struct.unpack_from(f"<{depth}I", context, 12) if depth else ())
    owns = any(WALLY_SCRIPT_START <= pointer < WALLY_SCRIPT_END for pointer in pcs)
    if owns and (depth > 20 or mode not in (1, 2)):
        raise ValueError("invalid source-owned Wally script context")
    return owns and mode in (1, 2)


@dataclass(frozen=True)
class PartyOwnership:
    owner: str | None
    source: str
    original_identities: tuple[str, ...] = ()
    rental_personalities: tuple[int, ...] = ()
    diagnostic: str | None = None
    raw_hex: str | None = None

    def json(self) -> dict[str, object]:
        return asdict(self)


def read_party_ownership(read: ReadMemory, party: tuple[PartyMon, ...] | None) -> PartyOwnership:
    """A map/flag alone never establishes rental Pokémon ownership.

    Existing player identities in SaveBlock1 are a baseline, not newly acquired
    mons when a selected challenge party is restored. Root journal can add these
    IDs to a separate known-owned set; do not invent Pokémon records from IDs.
    """
    raw = b""
    try:
        save1, save2 = struct.unpack("<II", exact(read, 0x03005D8C, 8))
        if not (
            save1 % 4 == save2 % 4 == 0
            and 0x02000000 <= save1 <= 0x02040000 - 0x1540
            and 0x02000000 <= save2 <= 0x02040000 - 0xF2C
        ):
            raise ValueError("invalid native party-ownership save pointers")
        location = tuple(exact(read, save1 + 4, 2))
        callback = number(read, GMAIN + 4)
        active_battle = bool(number(read, IN_BATTLE, 1) & 2)
        battle_flags = number(read, TYPE_FLAGS)
        rented_battle = active_battle and bool(battle_flags & (1 << 19))
        tutorial_battle = active_battle and bool(battle_flags & (1 << 9))
        tutorial_script = _wally_script_owned(read)
        scoped = (
            location in FACTORY_MAPS
            or callback in FACTORY_CALLBACKS
            or rented_battle
            or tutorial_battle
            or tutorial_script
        )
        if not scoped:
            return PartyOwnership("player", "ordinary_player_party")
        count = number(read, save1 + 0x234, 1)
        if count > 6:
            raise ValueError("invalid saved original-party count")
        raw = exact(read, save1 + 0x238, count * 100)
        originals = []
        for index in range(count):
            body = raw[index * 100 : (index + 1) * 100]
            if not body[0x13] & 2:
                raise ValueError(
                    "saved original-party species header unavailable; copy ownership is unqualified"
                )
            personality, ot = struct.unpack_from("<II", body)
            originals.append(f"{personality:08x}:{ot:08x}")
        baseline = tuple(originals)
        if tutorial_battle:
            return PartyOwnership("tutorial", "native_wally_tutorial_battle_flag", baseline)
        if rented_battle:
            return PartyOwnership("rental", "native_rental_battle_flag", baseline)
        if party is None or any(
            mon.diagnostic
            or mon.identity is None
            or mon.personality is None
            or mon.species_id is None
            or mon.ot_id is None
            for mon in party
        ):
            return PartyOwnership(None, "party_decode_unavailable", baseline)
        if tutorial_script:
            if all(mon.identity in baseline for mon in party):
                return PartyOwnership("player", "saved_original_party", baseline)
            # LoadWallyZigzagoon creates a level-7 Zigzagoon in slot zero and
            # preserves any other original party members until LoadPlayerParty.
            if party and party[0].species_id == 288 and party[0].level == 7:
                return PartyOwnership("tutorial", "native_wally_tutorial_script", baseline)
            return PartyOwnership(None, "native_tutorial_party_transition", baseline)
        # A receptionist can be entered with real Pokémon, before any rentals
        # were generated. Stale facility/rental fields must not hide those mons.
        facility = number(read, save1 + 0x139C + 2 * (0x40CF - 0x4000), 2)
        if facility != 4:
            return PartyOwnership("player", "original_frontier_party", baseline)
        table = number(read, FACILITY_MONS_POINTER)
        rental_raw = exact(read, save2 + 0xE70, 36)
        raw += rental_raw
        refs = []
        for index in range(3):
            mon_id = struct.unpack_from("<H", rental_raw, index * 12)[0]
            personality = struct.unpack_from("<I", rental_raw, index * 12 + 4)[0]
            if mon_id == 0xFFFF:
                continue
            if table not in FACILITY_TABLES or mon_id >= FACILITY_TABLES[table]:
                raise ValueError("invalid native rental Pokémon table/index")
            species = number(read, table + mon_id * 16, 2)
            if not 1 <= species <= 411:
                raise ValueError("invalid native rental Pokémon species")
            refs.append((personality, species))
        current_refs = [(mon.personality, mon.species_id) for mon in party]
        player_ot = number(read, save2 + 0xA)
        rental_ot_valid = all(mon.ot_id in (0, player_ot) for mon in party)
        matches_rental = (
            rental_ot_valid
            and len(party) == 3
            and len(refs) == 3
            and sorted(current_refs) == sorted(refs)
        )
        matches_original = all(mon.identity in baseline for mon in party)
        if matches_rental and matches_original:
            return PartyOwnership(
                None,
                "ambiguous_native_party_identity",
                baseline,
                tuple(personality for personality, _ in refs),
                "harness bug: rental and original identities overlap",
                raw.hex()[:4096],
            )
        if matches_rental:
            return PartyOwnership(
                "rental",
                "native_factory_rental_references",
                baseline,
                tuple(personality for personality, _ in refs),
            )
        if matches_original:
            return PartyOwnership("player", "saved_original_party", baseline)
        if (
            callback in FACTORY_CALLBACKS
            or rented_battle
            or (rental_ot_valid and any(ref in refs for ref in current_refs))
        ):
            return PartyOwnership(
                None,
                "native_rental_party_transition",
                baseline,
                tuple(personality for personality, _ in refs),
            )
        # A real player acquire/evolution remains player-owned unless the full
        # native rental identity/species reference proof establishes otherwise.
        return PartyOwnership("player", "no_native_rental_match", baseline)
    except (ValueError, OSError, IndexError, struct.error) as error:
        return PartyOwnership(
            None, "unavailable", diagnostic=f"harness bug: {error}", raw_hex=raw.hex()[:4096]
        )
