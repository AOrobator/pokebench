"""type-gap-team-v1: each party POKéMON's species types and its moves' types and power, and the
game's own type chart, so the agent can set gym types against what the party has.

pret/pokeemerald 731ad5bf.
- src/battle_main.c gTypeEffectiveness[336]: rows of (attacking type, defending type, multiplier),
  multiplier TYPE_MUL_NO_EFFECT 0, NOT_EFFECTIVE 5, SUPER_EFFECTIVE 20 (include/battle_main.h);
  the row TYPE_FORESIGHT (0xFE) separates the rows Foresight lifts, TYPE_ENDTABLE (0xFF) ends it.
  ROM (US f3ae0881): 0x0831ACE8, the 336 bytes right before gTypeNames (0x0831AE38).
- src/data/pokemon/species_info.h gSpeciesInfo at 0x083203CC: types are bytes 6 and 7 of each
  28-byte entry (battle_details._member reads the same bytes).
- src/data/battle_moves.h gBattleMoves at 0x0831C898: power is byte 1, type byte 2 of each 12-byte
  entry (battle_details._move_facts).
Present in the state only with the switch; nothing here reaches the readout text.
"""

from dataclasses import dataclass

from pokebench_env.battle_choices import exact
from pokebench_env.battle_details import SPECIES_INFO, TYPE_NAMES
from pokebench_env.game_screen import ReadMemory
from pokebench_env.pokemon import BATTLE_MOVES, PartyMon

SWITCH = "type-gap-team-v1"
TYPE_EFFECTIVENESS = 0x0831ACE8
TYPE_EFFECTIVENESS_SIZE = 336
FORESIGHT = 0xFE
END = 0xFF
MULTIPLIERS = frozenset({0, 5, 10, 20})

_chart: tuple[tuple[int, int, int], ...] | None = None


def read_type_chart(read: ReadMemory) -> tuple[tuple[int, int, int], ...]:
    """The chart's rows up to TYPE_ENDTABLE, the Foresight separator row included; read once."""
    global _chart
    if _chart is not None:
        return _chart
    body = exact(read, TYPE_EFFECTIVENESS, TYPE_EFFECTIVENESS_SIZE)
    rows: list[tuple[int, int, int]] = []
    for i in range(0, len(body), 3):
        attack, defend, multiplier = body[i], body[i + 1], body[i + 2]
        if attack == END:
            _chart = tuple(rows)
            return _chart
        if (attack, defend) != (FORESIGHT, FORESIGHT) and (
            attack >= len(TYPE_NAMES) or defend >= len(TYPE_NAMES) or multiplier not in MULTIPLIERS
        ):
            raise ValueError(
                f"type chart row {i // 3} is not a type chart row: {body[i : i + 3]!r}"
            )
        rows.append((attack, defend, multiplier))
    raise ValueError("type chart has no end row")


@dataclass(frozen=True)
class PartyMove:
    move_id: int
    name: str | None
    move_type: int
    power: int


@dataclass(frozen=True)
class PartyTypes:
    slot: int
    species_types: tuple[int, int] | None
    moves: tuple[PartyMove, ...]


@dataclass(frozen=True)
class TypeGap:
    party: tuple[PartyTypes, ...]
    chart: tuple[tuple[int, int, int], ...]
    diagnostic: str | None = None

    def json(self) -> dict[str, object]:
        return {
            "party": [
                {
                    "slot": p.slot,
                    "species_types": None if p.species_types is None else list(p.species_types),
                    "moves": [
                        {
                            "move_id": m.move_id,
                            "name": m.name,
                            "move_type": m.move_type,
                            "power": m.power,
                        }
                        for m in p.moves
                    ],
                }
                for p in self.party
            ],
            "type_chart": [list(row) for row in self.chart],
            "diagnostic": self.diagnostic,
        }


def _member(read: ReadMemory, slot: int, mon: PartyMon) -> PartyTypes:
    if mon.is_egg or mon.species_id is None or mon.diagnostic is not None:
        return PartyTypes(slot, None, ())
    info = exact(read, SPECIES_INFO + 28 * mon.species_id + 6, 2)
    if info[0] >= len(TYPE_NAMES) or info[1] >= len(TYPE_NAMES):
        raise ValueError(f"invalid species types for species {mon.species_id}")
    moves = []
    for move in mon.moves or ():
        if not move.move_id:
            continue
        row = exact(read, BATTLE_MOVES + 12 * move.move_id, 3)
        if row[2] >= len(TYPE_NAMES):
            raise ValueError(f"invalid move type for move {move.move_id}")
        moves.append(PartyMove(move.move_id, move.name, row[2], row[1]))
    return PartyTypes(slot, (info[0], info[1]), tuple(moves))


def read_type_gap(read: ReadMemory, party: tuple[PartyMon, ...] | None) -> TypeGap:
    try:
        chart = read_type_chart(read)
        members = tuple(_member(read, i, mon) for i, mon in enumerate(party or ()))
    except (ValueError, OSError) as error:
        return TypeGap((), (), f"harness bug: type gap: {error}")
    return TypeGap(members, chart)
