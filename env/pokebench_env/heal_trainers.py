"""heal-before-trainers-v1: the game facts behind the agent's heal-before-trainers warning.

pret/pokeemerald 731ad5bf. Nothing here reaches the readout text; the state JSON gains
`heal_before_trainers` only while the switch is on, on the free field.

- Trainers on this map: SaveBlock1.objectEventTemplates (+0xC70, 64 x 24 bytes; struct
  ObjectEventTemplate in include/global.fieldmap.h, script pointer at +0x10). A trainer's script
  starts with the trainerbattle command (SCR_OP_TRAINERBATTLE 0x5C, a battle-type byte, then the
  trainer id as a u16; asm/macros/event.inc). GetTrainerFlagFromScriptPointer (src/battle_setup.c)
  reads that id and checks TRAINER_FLAGS_START (0x500) + id, as trainer_see.c does for every object
  that can spot the player. Only objects the game has loaded and shows (gObjectEvents) are listed,
  at their tile now. The battle types kept are the field ones, TRAINER_BATTLE_SINGLE (0) through
  TRAINER_BATTLE_CONTINUE_SCRIPT_DOUBLE_NO_MUSIC (8); Pyramid, Hill and SET_TRAINER scripts are not.
- Move power: gBattleMoves (src/data/battle_moves.h), power at +1 of each 12-byte entry.
- lastHealLocation: SaveBlock1 +0x1C (struct WarpData, s8 mapGroup and mapNum), set by
  SetLastHealLocationWarp from setrespawn, which every POKéMON CENTER 1F map runs as it loads
  (for example OldaleTown_PokemonCenter_1F_OnTransition: setrespawn HEAL_LOCATION_OLDALE_TOWN).
- Home: MOM is on the player's house 1F (PlayersHouse_1F_EventScript_Mom): playerGender
  (SaveBlock2 +0x08) MALE -> MAP_LITTLEROOT_TOWN_BRENDANS_HOUSE_1F (1/0), FEMALE ->
  MAP_LITTLEROOT_TOWN_MAYS_HOUSE_1F (1/2).
- mom_heals: talking to MOM now reaches PlayersHouse_1F_EventScript_MomHealsParty
  (data/scripts/players_house.inc). The script checks, in order: VAR_LITTLEROOT_HOUSES_STATE_MAY
  or _BRENDAN equal to 4 (no heal); FLAG_HAS_MATCH_CALL, after which FLAG_ENABLE_MOM_MATCH_CALL
  must be set (else she registers in the POKéNAV) and, with FLAG_BADGE05_GET, so must
  FLAG_RECEIVED_AMULET_COIN (else she gives it); otherwise FLAG_RESCUED_BIRCH.
"""

import struct
from dataclasses import dataclass

from pokebench_env.character_presence import TEMPLATE_COUNT, TEMPLATES, _flag, _graphics
from pokebench_env.game_screen import ReadMemory
from pokebench_env.offscreen_objects import _loaded
from pokebench_env.pokemon import BATTLE_MOVES, PartyMon
from pokebench_env.world_context import GRAPHICS, SAVE_VARIABLES

SWITCH = "heal-before-trainers-v1"
TRAINERBATTLE = 0x5C
FIELD_BATTLE_TYPES = range(0, 9)
TRAINER_FLAGS_START = 0x500
TRAINERS_COUNT = 855
MOVES_COUNT = 355
LAST_HEAL = 0x1C
PLAYER_GENDER = 0x08
HOMES = {0: (1, 0), 1: (1, 2)}
FLAG_RESCUED_BIRCH = 0x52
FLAG_RECEIVED_AMULET_COIN = 0x85
FLAG_ENABLE_MOM_MATCH_CALL = 0xD8
FLAG_HAS_MATCH_CALL = 0x12F
FLAG_BADGE05_GET = 0x860 + 0xB
VAR_LITTLEROOT_HOUSES_STATE_MAY = 0x4082
VAR_LITTLEROOT_HOUSES_STATE_BRENDAN = 0x408C
ROM = range(0x08000000, 0x0A000000)

MapId = tuple[int, int]


@dataclass(frozen=True)
class MapTrainer:
    local_id: int
    x: int
    y: int
    graphics_id: int
    sprite_kind: str | None
    trainer_id: int
    defeated: bool


@dataclass(frozen=True)
class HealFacts:
    trainers: tuple[MapTrainer, ...]
    move_power: tuple[tuple[int, int], ...]
    last_heal: MapId | None
    home: MapId | None
    mom_heals: bool

    def json(self) -> dict[str, object]:
        return {
            "trainers": [
                {
                    "local_id": t.local_id,
                    "x": t.x,
                    "y": t.y,
                    "graphics_id": t.graphics_id,
                    "sprite_kind": t.sprite_kind,
                    "trainer_id": t.trainer_id,
                    "defeated": t.defeated,
                }
                for t in self.trainers
            ],
            "move_power": [{"move_id": m, "power": p} for m, p in self.move_power],
            "last_heal": None if self.last_heal is None else list(self.last_heal),
            "home": None if self.home is None else list(self.home),
            "mom_heals": self.mom_heals,
        }


def _var(read: ReadMemory, save1: int, var: int) -> int:
    return int(struct.unpack("<H", read(save1 + SAVE_VARIABLES + 2 * (var - 0x4000), 2))[0])


def mom_heals(read: ReadMemory, save1: int) -> bool:
    if 4 in (
        _var(read, save1, VAR_LITTLEROOT_HOUSES_STATE_MAY),
        _var(read, save1, VAR_LITTLEROOT_HOUSES_STATE_BRENDAN),
    ):
        return False
    if _flag(read, save1, FLAG_HAS_MATCH_CALL):
        return _flag(read, save1, FLAG_ENABLE_MOM_MATCH_CALL) and (
            not _flag(read, save1, FLAG_BADGE05_GET)
            or _flag(read, save1, FLAG_RECEIVED_AMULET_COIN)
        )
    return _flag(read, save1, FLAG_RESCUED_BIRCH)


def _trainer_id(read: ReadMemory, script: int) -> int | None:
    if script not in ROM:
        return None
    head = read(script, 4)
    if len(head) != 4 or head[0] != TRAINERBATTLE or head[1] not in FIELD_BATTLE_TYPES:
        return None
    trainer = int.from_bytes(head[2:4], "little")
    return trainer if 0 < trainer < TRAINERS_COUNT else None


def read_map_trainers(read: ReadMemory, save1: int, map_id: MapId) -> tuple[MapTrainer, ...]:
    raw = read(save1 + TEMPLATES, TEMPLATE_COUNT * 24)
    if len(raw) != TEMPLATE_COUNT * 24:
        raise ValueError("short object template read")
    loaded = _loaded(read, map_id)
    found = []
    for slot in range(TEMPLATE_COUNT):
        entry = raw[slot * 24 : slot * 24 + 24]
        local_id, graphics = entry[0], entry[1]
        tile = loaded.get(local_id)
        if (local_id == 0 and graphics == 0) or tile is None:
            continue
        trainer = _trainer_id(read, struct.unpack_from("<I", entry, 0x10)[0])
        if trainer is None:
            continue
        resolved = _graphics(read, save1, graphics)
        found.append(
            MapTrainer(
                local_id,
                tile[0],
                tile[1],
                resolved,
                GRAPHICS.get(resolved),
                trainer,
                _flag(read, save1, TRAINER_FLAGS_START + trainer),
            )
        )
    return tuple(found)


def read_move_power(read: ReadMemory, party: tuple[PartyMon, ...]) -> tuple[tuple[int, int], ...]:
    ids = sorted(
        {
            move.move_id
            for mon in party
            for move in mon.moves or ()
            if 0 < move.move_id < MOVES_COUNT
        }
    )
    return tuple((move, read(BATTLE_MOVES + 12 * move + 1, 1)[0]) for move in ids)


def read_heal_facts(
    read: ReadMemory, save1: int, save2: int, map_id: MapId, party: tuple[PartyMon, ...]
) -> HealFacts | None:
    """The facts for the current map, or None when any of them cannot be read."""
    try:
        group, number = struct.unpack("<bb", read(save1 + LAST_HEAL, 2))
        return HealFacts(
            trainers=read_map_trainers(read, save1, map_id),
            move_power=read_move_power(read, party),
            last_heal=None if group < 0 or number < 0 else (group, number),
            home=HOMES.get(read(save2 + PLAYER_GENDER, 1)[0]),
            mom_heals=mom_heals(read, save1),
        )
    except (ValueError, OSError, struct.error, IndexError):
        return None
