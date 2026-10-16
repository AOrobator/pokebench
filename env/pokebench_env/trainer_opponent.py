"""The trainer the game last set up a battle against, read beside story state (trainer-opponent-v1).

pokeemerald 731ad5bf: src/battle_setup.c keeps gTrainerBattleOpponent_A (EWRAM) from the
trainerbattle command until trainer_see.c resets it, so it still names the opponent after the
battle and a whiteout. include/data.h struct Trainer (0x28 bytes): trainerClass at +1,
trainerName[TRAINER_NAME_LENGTH + 1] at +4. gTrainers is at 0x08310030 in the US Emerald ROM
(checked against opponents.h ids 1 SAWYER, 265 ROXANNE, 520 BRENDAN, 529 and 535 MAY).
A trainer's defeated flag is TRAINER_FLAGS_START + id.
The readout text and the loop guard do not read it.
"""

from dataclasses import asdict, dataclass

from pokebench_env.gba_text import decode_text
from pokebench_env.route103_rival import (
    BATTLE_TYPE_FLAGS,
    BATTLE_TYPE_TRAINER,
    OPPONENT_A,
    SAVE_FLAGS,
    TRAINER_FLAGS_START,
    ReadMemory,
)

GTRAINERS = 0x08310030
TRAINER_SIZE = 0x28
TRAINERS_COUNT = 855
NAME_OFFSET = 4
NAME_BYTES = 11


@dataclass(frozen=True)
class TrainerOpponent:
    trainer_id: int
    trainer_class: int
    name: str | None
    defeated: bool
    battle_active: bool

    def json(self) -> dict[str, object]:
        return asdict(self)


def _exact(read: ReadMemory, address: int, length: int) -> bytes:
    body = read(address, length)
    if len(body) != length:
        raise ValueError(f"short trainer opponent read at 0x{address:08X}")
    return body


def _name(raw: bytes) -> str | None:
    if 0xFF not in raw:
        return None
    try:
        return decode_text(raw[: raw.index(0xFF)])
    except ValueError:
        return None


def read_trainer_opponent(read: ReadMemory, save1: int, in_battle: bool) -> TrainerOpponent | None:
    trainer_id = int.from_bytes(_exact(read, OPPONENT_A, 2), "little")
    if trainer_id == 0 or trainer_id >= TRAINERS_COUNT:
        return None
    entry = _exact(read, GTRAINERS + trainer_id * TRAINER_SIZE, TRAINER_SIZE)
    flag = TRAINER_FLAGS_START + trainer_id
    bits = _exact(read, save1 + SAVE_FLAGS + (flag >> 3), 1)[0]
    types = int.from_bytes(_exact(read, BATTLE_TYPE_FLAGS, 4), "little")
    return TrainerOpponent(
        trainer_id=trainer_id,
        trainer_class=entry[1],
        name=_name(entry[NAME_OFFSET : NAME_OFFSET + NAME_BYTES]),
        defeated=bool(bits >> (flag & 7) & 1),
        battle_active=in_battle and bool(types & BATTLE_TYPE_TRAINER),
    )
