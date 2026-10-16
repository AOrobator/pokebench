"""Route 103 rival progress, read beside story state so loop guards and the readout ignore it.

pokeemerald 731ad5bf: Route103_EventScript_Rival starts trainerbattle_no_intro against one of
TRAINER_{BRENDAN,MAY}_ROUTE_103_{MUDKIP,TREECKO,TORCHIC}; winning sets that trainer's flag
(TRAINER_FLAGS_START + id). OldaleTown_EventScript_RivalFinish sets VAR_OLDALE_RIVAL_STATE 2.
"""

from collections.abc import Callable
from dataclasses import asdict, dataclass

ReadMemory = Callable[[int, int], bytes]

RIVAL_TRAINERS = (520, 523, 526, 529, 532, 535)
TRAINER_FLAGS_START = 0x500
OPPONENT_A = 0x02038BCA
BATTLE_TYPE_FLAGS = 0x02022FEC
BATTLE_TYPE_TRAINER = 1 << 3
SAVE_FLAGS = 0x1270
SAVE_VARS = 0x139C
OLDALE_RIVAL_STATE = 0x40C7


@dataclass(frozen=True)
class Route103Rival:
    battle_active: bool
    defeated: bool
    oldale_stage: int | None

    def json(self) -> dict[str, object]:
        return asdict(self)


def _exact(read: ReadMemory, address: int, length: int) -> bytes:
    body = read(address, length)
    if len(body) != length:
        raise ValueError(f"short route 103 rival read at 0x{address:08X}")
    return body


def read_route103_rival(read: ReadMemory, save1: int, in_battle: bool) -> Route103Rival:
    opponent = int.from_bytes(_exact(read, OPPONENT_A, 2), "little")
    types = int.from_bytes(_exact(read, BATTLE_TYPE_FLAGS, 4), "little")
    first = TRAINER_FLAGS_START + RIVAL_TRAINERS[0]
    last = TRAINER_FLAGS_START + RIVAL_TRAINERS[-1]
    flags = _exact(read, save1 + SAVE_FLAGS + (first >> 3), (last >> 3) - (first >> 3) + 1)
    bits = int.from_bytes(flags, "little") >> (first & 7)
    defeated = any(bits >> (t - RIVAL_TRAINERS[0]) & 1 for t in RIVAL_TRAINERS)
    stage = int.from_bytes(
        _exact(read, save1 + SAVE_VARS + 2 * (OLDALE_RIVAL_STATE - 0x4000), 2), "little"
    )
    return Route103Rival(
        battle_active=in_battle
        and bool(types & BATTLE_TYPE_TRAINER)
        and opponent in RIVAL_TRAINERS,
        defeated=defeated,
        oldale_stage=stage if stage <= 2 else None,
    )
