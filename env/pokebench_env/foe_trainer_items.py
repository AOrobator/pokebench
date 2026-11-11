"""The foe trainer's battle items, read from game memory (foe-item-recap-v1, foe-trainer-items-v1).

pokeemerald 731ad5bf:
- src/battle_ai_script_commands.c BattleAI_HandleItemUseBeforeAISetup zeroes the battle history at
  battle start and, in a trainer battle without the link, Safari, Frontier, e-Reader, secret base,
  in-game partner or recorded-link flags, copies each non-empty gTrainers[gTrainerBattleOpponent_A]
  .items[i] into trainerItems[itemsNo++].
- src/battle_ai_switch_items.c ShouldUseItem sets trainerItems[i] = ITEM_NONE when the AI uses
  item i, and skips item i > 0 while the foe has more than itemsNo - i + 1 POKéMON able to fight.
- include/battle.h: struct BattleResources holds battleHistory at +0x18; struct BattleHistory has
  usedMoves[4] (16 bytes each: moves[4] and unknown[4]), abilities[4], itemEffects[4], then
  trainerItems[4] (u16) at +0x48 and itemsNo at +0x50. include/data.h struct Trainer (0x28
  bytes) holds items[4] at +0x10.
"""

from collections import Counter
from collections.abc import Callable
from dataclasses import asdict, dataclass

from pokebench_env.pokemon import read_item_name
from pokebench_env.route103_rival import BATTLE_TYPE_FLAGS, BATTLE_TYPE_TRAINER, OPPONENT_A
from pokebench_env.trainer_opponent import GTRAINERS, TRAINER_SIZE, TRAINERS_COUNT

ReadMemory = Callable[[int, int], bytes]

RECAP_SWITCH = "foe-item-recap-v1"
LEFT_SWITCH = "foe-trainer-items-v1"

BATTLE_RESOURCES = 0x020244A8
HISTORY = 0x18
TRAINER_ITEMS = 0x48
ITEMS_NO = 0x50
TRAINER_ITEMS_FIELD = 0x10
MAX_TRAINER_ITEMS = 4
# BATTLE_TYPE_LINK, SAFARI, EREADER_TRAINER, SECRET_BASE, INGAME_PARTNER, RECORDED_LINK and the
# Frontier flags (BATTLE_TOWER, DOME, PALACE, ARENA, FACTORY, PIKE, PYRAMID): no trainer items.
NO_ITEMS = (
    1 << 1
    | 1 << 7
    | 1 << 11
    | 1 << 27
    | 1 << 22
    | 1 << 25
    | 1 << 8
    | 1 << 16
    | 1 << 17
    | 1 << 18
    | 1 << 19
    | 1 << 20
    | 1 << 21
)

# The turn's chosen actions (src/battle_main.c EWRAM order, anchored on gCurrentTurnActionNumber at
# 0x02024082 and gBattlescriptCurrInstr at 0x02024214) and gBattleMainFunc (IWRAM).
BATTLERS_COUNT = 0x0202406C
BATTLER_POSITIONS = 0x02024076
BATTLER_BY_TURN_ORDER = 0x0202407E
CURRENT_TURN_ACTION = 0x02024082
CHOSEN_ACTIONS = 0x0202421C
MAIN_FUNC = 0x03005D04
# This ROM's HandleTurnActionSelectionState, SetActionsAndBattlersTurnOrder (its pool holds the
# next one) and CheckFocusPunch_ClearVarsBeforeTurnStarts (its pool holds gCurrentTurnActionNumber,
# gActionsByTurnOrder and RunTurnActionsFunctions 0x0803D819). Until CheckFocusPunch sets the action
# number to 0, it still holds last turn's gBattlersCount.
PRE_TURN = (0x0803BE75, 0x0803D2E9, 0x0803D6F1)
# BattleResources.battleCallbackStack: function[8] then size. BattleScriptExecute pushes the
# running main function there before a script runner takes over: the FOCUS PUNCH setup under
# CheckFocusPunch, "There's no running from a trainer battle!" under HandleTurnActionSelectionState.
CALLBACK_STACK = 0x0C
CALLBACK_SIZE = 0x20
B_ACTION_USE_ITEM = 1
# gBattleStruct (pointer) and BattleStruct.chosenItem[4] (include/battle.h; 0xC0 holds 19, FULL
# RESTORE, on 67d7 raw RAM 105176 while GLACIA's choice was pending).
BATTLE_STRUCT = 0x0202449C
CHOSEN_ITEM = 0xC0

# HP each potion restores (src/data/pokemon/item_effects.h; MAX POTION's full heal is 255 there).
POTIONS = {"POTION": 20, "SUPER POTION": 50, "HYPER POTION": 200, "MAX POTION": 255}
CURES = {"FULL HEAL", "ANTIDOTE", "BURN HEAL", "ICE HEAL", "AWAKENING", "PARLYZ HEAL"}
FIRST_TURN = {
    "X ATTACK",
    "X DEFEND",
    "X SPEED",
    "X SPECIAL",
    "X ACCURACY",
    "DIRE HIT",
}


@dataclass(frozen=True)
class FoeItem:
    slot: int
    name: str


@dataclass(frozen=True)
class FoeTrainerItems:
    trainer_id: int
    items_no: int
    left: tuple[FoeItem, ...]
    used: tuple[FoeItem, ...]
    # foe-trainer-items-v1 off: the recorded state keeps only what the game has shown.
    knowledge: bool = True

    def json(self) -> dict[str, object]:
        shown: dict[str, object] = {
            "trainer_id": self.trainer_id,
            "used": [asdict(item) for item in self.used],
        }
        if not self.knowledge:
            return shown
        return {
            **shown,
            "items_no": self.items_no,
            "left": [asdict(item) for item in self.left],
        }


def _u16(raw: bytes, offset: int) -> int:
    return int.from_bytes(raw[offset : offset + 2], "little")


def _exact(read: ReadMemory, address: int, length: int) -> bytes:
    body = read(address, length)
    if len(body) != length:
        raise ValueError(f"short foe trainer items read at 0x{address:08X}")
    return body


def _ewram(read: ReadMemory, address: int) -> int | None:
    pointer = int.from_bytes(_exact(read, address, 4), "little")
    return pointer if 0x02000000 <= pointer < 0x02040000 else None


def _pre_turn_script(read: ReadMemory) -> bool:
    resources = _ewram(read, BATTLE_RESOURCES)
    stack = None if resources is None else _ewram(read, resources + CALLBACK_STACK)
    if stack is None:
        return False
    size = _exact(read, stack + CALLBACK_SIZE, 1)[0]
    if not 0 < size <= 8:
        return False
    top = int.from_bytes(_exact(read, stack + 4 * (size - 1), 4), "little")
    return top in PRE_TURN


def _chosen_not_shown(read: ReadMemory) -> list[int]:
    """Opponent item actions the AI has chosen this turn that have not run yet.

    ShouldUseItem zeroes the slot when the AI chooses the item, during action selection while the
    player's own menu is open; the game shows "<TRAINER> used <ITEM>!" only when that action runs
    (HandleAction_UseItem, in turn order). Until then the zeroed slot is still the trainer's.
    Returns each such action's item id as ShouldUseItem stored it in gBattleStruct->chosenItem
    [(battler / 2) * 2] (a u8; only the opponent's AI writes it).
    """
    count = min(_exact(read, BATTLERS_COUNT, 1)[0], 4)
    positions = _exact(read, BATTLER_POSITIONS, 4)
    chosen = _exact(read, CHOSEN_ACTIONS, 4)
    order = list(_exact(read, BATTLER_BY_TURN_ORDER, 4)[:count])
    current = _exact(read, CURRENT_TURN_ACTION, 1)[0]
    main = int.from_bytes(_exact(read, MAIN_FUNC, 4), "little")
    pre_turn = main in PRE_TURN or _pre_turn_script(read)
    pending: list[int] = []
    chosen_items: bytes | None = None
    for battler in range(count):
        if not positions[battler] & 1 or chosen[battler] != B_ACTION_USE_ITEM:
            continue
        # Before the turn starts the action number is last turn's; after, the action counts as
        # shown only once it has finished and the turn has moved past it (HandleAction_UseItem
        # installs a script whose message prints over later frames).
        if pre_turn or (battler in order and order.index(battler) >= current):
            if chosen_items is None:
                struct = _ewram(read, BATTLE_STRUCT)
                chosen_items = bytes(4) if struct is None else _exact(read, struct + CHOSEN_ITEM, 4)
            pending.append(chosen_items[(battler // 2) * 2])
    return pending


def read_foe_trainer_items(read: ReadMemory, in_battle: bool) -> FoeTrainerItems | None:
    """None outside a trainer battle that carries items, and while the battle history is not
    yet this battle's (the game fills it as the battle starts)."""
    if not in_battle:
        return None
    flags = int.from_bytes(_exact(read, BATTLE_TYPE_FLAGS, 4), "little")
    if not flags & BATTLE_TYPE_TRAINER or flags & NO_ITEMS:
        return None
    trainer_id = _u16(_exact(read, OPPONENT_A, 2), 0)
    if not 0 < trainer_id < TRAINERS_COUNT:
        return None
    entry = _exact(read, GTRAINERS + trainer_id * TRAINER_SIZE + TRAINER_ITEMS_FIELD, 8)
    carried = [i for i in (_u16(entry, 2 * s) for s in range(MAX_TRAINER_ITEMS)) if i != 0]
    resources = _ewram(read, BATTLE_RESOURCES)
    history = None if resources is None else _ewram(read, resources + HISTORY)
    if history is None:
        return None
    raw = _exact(read, history + TRAINER_ITEMS, ITEMS_NO - TRAINER_ITEMS + 1)
    items_no = raw[ITEMS_NO - TRAINER_ITEMS]
    slots = [_u16(raw, 2 * s) for s in range(MAX_TRAINER_ITEMS)]
    if items_no != len(carried) or any(
        slots[s] not in (0, carried[s]) if s < items_no else slots[s] != 0
        for s in range(MAX_TRAINER_ITEMS)
    ):
        return None
    names = [read_item_name(read, item) for item in carried]
    used = {s for s in range(items_no) if slots[s] == 0}
    for item in _chosen_not_shown(read) if used else []:
        # The emptied slot holding the chosen item; with several, the newest is the highest
        # (earlier ones were usable first). An unmatched id still hides the highest empty slot.
        matching = [s for s in used if carried[s] & 0xFF == item] or sorted(used)
        used.discard(max(matching))
    return FoeTrainerItems(
        trainer_id=trainer_id,
        items_no=items_no,
        left=tuple(FoeItem(s, names[s]) for s in range(items_no) if s not in used),
        used=tuple(FoeItem(s, names[s]) for s in range(items_no) if s in used),
    )


def _counted(items: tuple[FoeItem, ...]) -> str:
    if not items:
        return "none"
    counts = Counter(item.name for item in items)
    return ", ".join(f"{name} ×{count}" for name, count in counts.items())


def recap_line(items: FoeTrainerItems) -> str:
    """foe-item-recap-v1: only what the game has already shown ("<TRAINER> used <ITEM>!")."""
    return f"Foe trainer items used this battle: {_counted(items.used)}"


def _when(item: FoeItem, items_no: int) -> str:
    if item.slot == 0:
        return f"{item.name} (any turn)"
    return f"{item.name} (only once {items_no - item.slot + 1} or fewer of its POKéMON can fight)"


def left_line(items: FoeTrainerItems) -> str:
    """foe-trainer-items-v1: the items the trainer still carries and when its AI uses them."""
    head = "Foe trainer items left (from game memory): " + (
        "; ".join(_when(item, items.items_no) for item in items.left) or "none"
    )
    if not items.left:
        return head
    names = {item.name for item in items.left}
    rules: list[str] = []
    if "FULL RESTORE" in names:
        rules.append("FULL RESTORE when its POKéMON in battle is below 1/4 of its max HP")
    potions = [name for name in POTIONS if name in names]
    if potions:
        amounts = ", ".join(
            f"{name} 255, the game's full-heal value"
            if name == "MAX POTION"
            else f"{name} {POTIONS[name]}"
            for name in potions
        )
        rules.append(
            f"{' or '.join(potions)} when its POKéMON is below 1/4 of its max HP or is missing "
            f"more HP than the item restores ({amounts})"
        )
    cures = sorted(names & CURES)
    if cures:
        rules.append(f"{' or '.join(cures)} when its POKéMON has a condition the item cures")
    boosts = sorted(names & FIRST_TURN)
    if boosts:
        rules.append(f"{' or '.join(boosts)} on its POKéMON's first turn in battle")
    if "GUARD SPEC." in names:
        rules.append(
            "GUARD SPEC. on its POKéMON's first turn in battle when no MIST is up on its side"
        )
    if not rules:
        return head
    return (
        f"{head}. Unless it switches POKéMON, the game's trainer AI uses an item instead of a "
        f"move, and the item takes effect before any move that turn: {'; '.join(rules)}."
    )


def foe_item_lines(items: FoeTrainerItems | None, *, recap: bool, left: bool) -> list[str]:
    if items is None:
        return []
    return [*([recap_line(items)] if recap else []), *([left_line(items)] if left else [])]
