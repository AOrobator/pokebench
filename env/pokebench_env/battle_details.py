"""battle-details-v2: what each battle action allows, from game RAM and ROM tables only.

Source: pret/pokeemerald 731ad5bfd6e6f265508d0efcca0ba42f9dcf5881; US ROM f3ae0881.
Refusal rules, message text, addresses and the deferred checks are in
docs/findings/2026-10-15_battle-details-v2.md. Nothing here guesses a value the
game keeps at an unverified address; such checks are named as not read.
"""

import struct
from dataclasses import dataclass

from pokebench_env.battle_choices import exact
from pokebench_env.battle_state import BattleBattler, BattleInput, BattleState
from pokebench_env.game_screen import ReadMemory
from pokebench_env.pokemon import (
    BATTLE_MOVES,
    ITEMS,
    SUBSTRUCT_ORDERS,
    PartyMon,
    read_item_name,
)
from pokebench_env.resources import Resources

PARTY = 0x020244EC
SPECIES_INFO = 0x083203CC
ENIGMA_BERRY = 175
HOLD_EFFECT_CAN_ALWAYS_RUN = 37
BOX_SLOTS = 14 * 30

# include/constants/pokemon.h TYPE_* order (fixed source constants).
TYPE_NAMES = (
    "NORMAL", "FIGHTING", "FLYING", "POISON", "GROUND", "ROCK", "BUG", "GHOST", "STEEL",
    "???", "FIRE", "WATER", "GRASS", "ELECTRIC", "PSYCHIC", "ICE", "DRAGON", "DARK",
)  # fmt: skip
# src/data/text/abilities.h gAbilityNames, pokeemerald 731ad5bf (ABILITY_NONE shown as none).
ABILITY_NAMES = (
    "none", "STENCH", "DRIZZLE", "SPEED BOOST", "BATTLE ARMOR", "STURDY",
    "DAMP", "LIMBER", "SAND VEIL", "STATIC", "VOLT ABSORB", "WATER ABSORB",
    "OBLIVIOUS", "CLOUD NINE", "COMPOUNDEYES", "INSOMNIA", "COLOR CHANGE", "IMMUNITY",
    "FLASH FIRE", "SHIELD DUST", "OWN TEMPO", "SUCTION CUPS", "INTIMIDATE", "SHADOW TAG",
    "ROUGH SKIN", "WONDER GUARD", "LEVITATE", "EFFECT SPORE", "SYNCHRONIZE", "CLEAR BODY",
    "NATURAL CURE", "LIGHTNINGROD", "SERENE GRACE", "SWIFT SWIM", "CHLOROPHYLL", "ILLUMINATE",
    "TRACE", "HUGE POWER", "POISON POINT", "INNER FOCUS", "MAGMA ARMOR", "WATER VEIL",
    "MAGNET PULL", "SOUNDPROOF", "RAIN DISH", "SAND STREAM", "PRESSURE", "THICK FAT",
    "EARLY BIRD", "FLAME BODY", "RUN AWAY", "KEEN EYE", "HYPER CUTTER", "PICKUP",
    "TRUANT", "HUSTLE", "CUTE CHARM", "PLUS", "MINUS", "FORECAST",
    "STICKY HOLD", "SHED SKIN", "GUTS", "MARVEL SCALE", "LIQUID OOZE", "OVERGROW",
    "BLAZE", "TORRENT", "SWARM", "ROCK HEAD", "DROUGHT", "ARENA TRAP",
    "VITAL SPIRIT", "WHITE SMOKE", "PURE POWER", "SHELL ARMOR", "CACOPHONY", "AIR LOCK",
)  # fmt: skip
SHADOW_TAG, LEVITATE, MAGNET_PULL, RUN_AWAY, ARENA_TRAP = 23, 26, 42, 50, 71
FLYING, STEEL = 2, 8

# include/constants/battle.h
DOUBLE, LINK, TRAINER, FIRST_BATTLE = 1 << 0, 1 << 1, 1 << 3, 1 << 4
MULTI, SAFARI, WALLY_TUTORIAL, EREADER = 1 << 6, 1 << 7, 1 << 9, 1 << 11
ARENA, INGAME_PARTNER, RECORDED, RECORDED_LINK = 1 << 18, 1 << 22, 1 << 24, 1 << 25
TRAINER_HILL, SECRET_BASE, TWO_OPPONENTS = 1 << 26, 1 << 27, 1 << 15
FRONTIER = sum(1 << bit for bit in (8, 16, 17, 18, 19, 20, 21))
PYRAMID = 1 << 21
FRONTIER_NO_PYRAMID = FRONTIER & ~PYRAMID
STATUS2_MULTIPLETURNS, STATUS2_WRAPPED, STATUS2_RECHARGE = 1 << 12, 7 << 13, 1 << 22
STATUS2_ESCAPE_PREVENTION, STATUS3_ROOTED = 1 << 26, 1 << 10
STATUS2_NAMES = (
    (7, "confused"), (1 << 3, "flinched"), (7 << 4, "uproar"), (3 << 8, "storing energy (BIDE)"),
    (3 << 10, "locked into a rampage (confuses after)"), (1 << 12, "locked into a multi-turn move"),
    (7 << 13, "wrapped (can't escape)"), (15 << 16, "infatuated"), (1 << 20, "focus energy"),
    (1 << 21, "transformed"), (1 << 22, "must recharge"), (1 << 23, "rage"),
    (1 << 24, "behind a substitute"), (1 << 25, "destiny bond"),
    (1 << 26, "can't escape (MEAN LOOK/BLOCK)"), (1 << 27, "nightmare"), (1 << 28, "cursed"),
    (1 << 29, "identified (FORESIGHT)"), (1 << 30, "defense curl"), (1 << 31, "tormented"),
)  # fmt: skip
STATUS3_NAMES = (
    (1 << 2, "seeded (LEECH SEED)"), (3 << 3, "locked on (next move always hits)"),
    (1 << 5, "perish song"), (1 << 6, "in the air (FLY/BOUNCE)"), (1 << 7, "underground (DIG)"),
    (1 << 8, "minimized"), (1 << 9, "charged"), (1 << 10, "rooted (INGRAIN)"),
    (3 << 11, "drowsy (YAWN)"), (1 << 13, "imprisoning"), (1 << 14, "grudge"),
    (1 << 16, "mud sport"), (1 << 17, "water sport"), (1 << 18, "underwater (DIVE)"),
)  # fmt: skip
STAGE_NAMES = ("HP", "Atk", "Def", "Spe", "SpA", "SpD", "Acc", "Eva")
PHASES = {
    "action": "action select",
    "move": "move select",
    "target": "target select",
    "move_reorder": "move reorder",
    "yes_no": "yes/no box",
    "safari_action": "Safari action select",
}
NO_PP = "There's no PP left for this move!"


@dataclass(frozen=True)
class MoveFacts:
    move_id: int
    name: str | None
    move_type: int
    power: int
    accuracy: int
    pp: int
    max_pp: int


@dataclass(frozen=True)
class MemberFacts:
    slot: int
    identity: str | None
    name: str
    level: int | None
    hp: int | None
    max_hp: int | None
    status: int | None
    is_egg: bool
    types: tuple[int, int] | None
    ability: int | None
    item: str | None
    moves: tuple[MoveFacts, ...]
    diagnostic: str | None = None


@dataclass(frozen=True)
class BagFacts:
    name: str
    quantity: int
    pocket: str | None
    battle_usage: int


@dataclass(frozen=True)
class HeldItem:
    battler: int
    name: str | None
    hold_effect: int | None


@dataclass(frozen=True)
class BattleDetails:
    party: tuple[MemberFacts, ...] | None
    bag: tuple[BagFacts, ...] | None
    held: tuple[HeldItem, ...]
    storage_full: bool | None
    diagnostic: str | None = None

    def lines(self, battle: BattleState) -> list[str]:
        return battle_details_lines(battle, self)


def _move_facts(
    read: ReadMemory, move_id: int, name: str | None, pp: int, max_pp: int
) -> MoveFacts:
    row = exact(read, BATTLE_MOVES + 12 * move_id, 12)
    if row[2] >= len(TYPE_NAMES):
        raise ValueError(f"invalid move type for move {move_id}")
    return MoveFacts(move_id, name, row[2], row[1], row[3], pp, max_pp)


def _ability_num(read: ReadMemory, slot: int, mon: PartyMon) -> int:
    body = exact(read, PARTY + 100 * slot, 100)
    personality, ot_id = struct.unpack_from("<II", body)
    if (personality, ot_id) != (mon.personality, mon.ot_id):
        raise ValueError(f"party slot {slot + 1} changed while reading its ability")
    secure = body[0x20:0x50]
    if mon.decode_mode == "encrypted":
        key = personality ^ ot_id
        secure = struct.pack("<12I", *(word ^ key for word in struct.unpack("<12I", secure)))
    misc = 12 * SUBSTRUCT_ORDERS[personality % 24].index("M")
    return int(struct.unpack_from("<I", secure, misc + 4)[0] >> 31)


def _member(read: ReadMemory, slot: int, mon: PartyMon) -> MemberFacts:
    name = mon.nickname or mon.species or "UNKNOWN"
    if mon.diagnostic is not None or mon.species_id is None:
        return MemberFacts(
            slot, mon.identity, name, None, None, None, None, False, None, None, None, (),
            mon.diagnostic or "species unavailable",
        )  # fmt: skip
    info = exact(read, SPECIES_INFO + 28 * mon.species_id, 28)
    if info[6] >= len(TYPE_NAMES) or info[7] >= len(TYPE_NAMES):
        raise ValueError(f"invalid species types for species {mon.species_id}")
    ability = info[0x17] if _ability_num(read, slot, mon) else info[0x16]
    if ability >= len(ABILITY_NAMES):
        raise ValueError(f"invalid species ability for species {mon.species_id}")
    moves = tuple(
        _move_facts(read, move.move_id, move.name, move.pp, move.max_pp or 0)
        for move in mon.moves or ()
        if move.move_id
    )
    return MemberFacts(
        slot, mon.identity, name, mon.level, mon.hp, mon.max_hp, mon.status,
        bool(mon.is_egg), (info[6], info[7]), ability, mon.held_item_name, moves,
    )  # fmt: skip


def _held(read: ReadMemory, battler: BattleBattler) -> HeldItem:
    if not battler.held_item:
        return HeldItem(battler.battler, None, 0)
    name = read_item_name(read, battler.held_item)
    if battler.held_item == ENIGMA_BERRY:
        return HeldItem(battler.battler, name, None)
    return HeldItem(battler.battler, name, exact(read, ITEMS + 44 * battler.held_item + 18, 1)[0])


def read_battle_details(
    read: ReadMemory,
    battle: BattleState | None,
    party: tuple[PartyMon, ...] | None,
    resources: Resources | None,
) -> BattleDetails | None:
    if battle is None or battle.battlers is None:
        return None
    try:
        members = (
            None if party is None else tuple(_member(read, i, mon) for i, mon in enumerate(party))
        )
        bag = None
        if resources is not None and resources.bag is not None:
            bag = tuple(
                BagFacts(
                    item.name or f"item #{item.item_id}",
                    item.quantity,
                    item.pocket,
                    exact(read, ITEMS + 44 * item.item_id + 0x20, 1)[0],
                )
                for item in resources.bag
            )
        full = None
        if party is not None and len(party) < 6:
            full = False
        elif party is not None and resources is not None and resources.storage is not None:
            full = len(resources.storage.occupied) >= BOX_SLOTS
        held = tuple(_held(read, battler) for battler in battle.battlers)
        return BattleDetails(members, bag, held, full)
    except (ValueError, OSError, struct.error) as error:
        return BattleDetails(None, None, (), None, f"harness bug: {error}")


def _types(types: tuple[int, int]) -> str:
    first, second = (TYPE_NAMES[t] for t in types)
    return first if first == second else f"{first}/{second}"


def status1_text(status: int | None) -> str:
    if status is None:
        return "status unknown"
    if not status:
        return "status OK"
    parts = []
    if status & 7:
        parts.append(f"asleep (sleep counter {status & 7})")
    if status & (1 << 7):
        parts.append("badly poisoned")
    elif status & (1 << 3):
        parts.append("poisoned")
    for bit, label in ((1 << 4, "burned"), (1 << 5, "frozen"), (1 << 6, "paralyzed")):
        if status & bit:
            parts.append(label)
    return "status " + ", ".join(parts)


def _conditions(actor: BattleBattler) -> str:
    names = [label for mask, label in STATUS2_NAMES if actor.status2 & mask]
    names += [label for mask, label in STATUS3_NAMES if actor.status3 & mask]
    return " · conditions " + ", ".join(names) if names else ""


def _stages(stages: tuple[int, ...]) -> str:
    changed = [f"{STAGE_NAMES[i]} {v - 6:+d}" for i, v in enumerate(stages) if v != 6]
    return "stages " + (", ".join(changed) if changed else "neutral")


def _stats(stats: tuple[int, ...]) -> str:
    attack, defense, speed, sp_attack, sp_defense = stats
    return f"stats Atk {attack} Def {defense} Spe {speed} SpA {sp_attack} SpD {sp_defense}"


def move_text(move: MoveFacts) -> str:
    kind = (
        "status"
        if move.power == 0
        else "physical"
        if move.move_type < 9
        else "special"
        if move.move_type > 9
        else "typeless"
    )
    power = "" if move.power == 0 else " pow varies" if move.power == 1 else f" pow {move.power}"
    accuracy = "never misses" if move.accuracy == 0 else f"acc {move.accuracy}"
    name = move.name or f"move #{move.move_id}"
    return (
        f"{name} {TYPE_NAMES[move.move_type]} {kind}{power} {accuracy} PP {move.pp}/{move.max_pp}"
    )


def _battle_move(actor: BattleBattler, slot: int) -> MoveFacts | None:
    move = actor.moves[slot]
    if not move.move_id or move.move_type is None or move.power is None or move.accuracy is None:
        return None
    return MoveFacts(
        move.move_id, move.name, move.move_type, move.power, move.accuracy, move.pp, move.max_pp
    )


def _kind(flags: int) -> str:
    tags = [
        ("TRAINER " if flags & TRAINER else "WILD ") + ("double" if flags & DOUBLE else "single")
    ]
    for bit, label in (
        (FIRST_BATTLE, "first battle (PROF. BIRCH rescue)"),
        (WALLY_TUTORIAL, "WALLY tutorial (the game plays it)"),
        (SAFARI, "Safari Zone"),
        (LINK, "link battle"),
        (RECORDED, "recorded battle playback"),
        (FRONTIER, "Battle Frontier"),
        (TRAINER_HILL, "Trainer Hill"),
        (SECRET_BASE, "Secret Base"),
        (MULTI, "multi battle"),
        (INGAME_PARTNER, "with a partner trainer"),
        (TWO_OPPONENTS, "two opposing trainers"),
    ):
        if flags & bit:
            tags.append(label)
    return " · ".join(tags)


def _input_text(battle: BattleState) -> str:
    ready = [i for i in battle.player_inputs or () if i.ready]
    if ready:
        return "input ready (" + ", ".join(PHASES[i.phase] for i in ready) + ")"
    if battle.phase == "finishing":
        return f"finishing (outcome {battle.outcome})"
    if battle.phase == "replay":
        return "recorded playback"
    return "resolving (no input until the game asks)"


def _is_type(actor: BattleBattler, type_id: int) -> bool:
    return type_id in actor.types


def _prefix(actor: BattleBattler, flags: int) -> str:
    return ("Foe " if flags & TRAINER else "Wild ") + actor.species


def _trap(actor: BattleBattler, battlers: tuple[BattleBattler, ...]) -> BattleBattler | None:
    """The opposing ability that blocks both running and switching (battle_main.c:4021-4062)."""
    side = actor.position & 1
    for other in battlers:
        if other.position & 1 == side:
            continue
        if other.ability == SHADOW_TAG:
            return other
        if (
            other.ability == ARENA_TRAP
            and actor.ability != LEVITATE
            and not _is_type(actor, FLYING)
        ):
            return other
    pull = [o for o in battlers if o.battler != actor.battler and o.ability == MAGNET_PULL]
    return pull[-1] if pull and _is_type(actor, STEEL) else None


def _bound(actor: BattleBattler) -> bool:
    return bool(
        actor.status2 & (STATUS2_ESCAPE_PREVENTION | STATUS2_WRAPPED)
        or actor.status3 & STATUS3_ROOTED
    )


@dataclass(frozen=True)
class RunVerdict:
    """Whether the game lets this battler RUN now: True allowed, False refused, None not read."""

    allowed: bool | None
    text: str


def run_verdict(battle: BattleState, actor: BattleBattler, held: HeldItem | None) -> RunVerdict:
    """The one RUN rule; battle-details-v2 prints it and battle-triage-guidance-v1 acts on it."""
    flags = battle.battle_type or 0
    battlers = battle.battlers or ()
    if flags & TRAINER and flags & (FRONTIER | TRAINER_HILL):
        return RunVerdict(False, "RUN asks whether to forfeit the match")
    if flags & TRAINER and not flags & (LINK | RECORDED_LINK):
        return RunVerdict(False, 'RUN REFUSED — "No! There\'s no running from a TRAINER battle!"')
    if held is not None and held.hold_effect is None:
        return RunVerdict(
            None,
            f"RUN unknown — holds {held.name}, whose battle effect is not read; "
            "the game checks it before any other escape rule",
        )
    if held is not None and held.hold_effect == HOLD_EFFECT_CAN_ALWAYS_RUN:
        return RunVerdict(True, f"RUN allowed — always escapes (holds {held.name})")
    if flags & LINK:
        return RunVerdict(True, "RUN allowed — link battle (running forfeits)")
    if actor.ability == RUN_AWAY:
        return RunVerdict(True, "RUN allowed — always escapes (RUN AWAY)")
    trap = _trap(actor, battlers)
    if trap is not None:
        name = _prefix(trap, flags) if trap.position & 1 else trap.species
        return RunVerdict(
            False, f'RUN REFUSED — "{name} prevents escape with {ABILITY_NAMES[trap.ability]}!"'
        )
    if _bound(actor):
        return RunVerdict(False, 'RUN REFUSED — "Can\'t escape!"')
    if flags & FIRST_BATTLE:
        return RunVerdict(
            False, 'RUN REFUSED — "PROF. BIRCH: Don\'t leave me like this!" (first battle)'
        )
    foe = next((b for b in battlers if b.battler == actor.battler ^ 1), None)
    if flags & DOUBLE or foe is None:
        return RunVerdict(True, "RUN allowed — escape chance not worked out for double battles")
    mine, theirs = actor.stats[2], foe.stats[2]
    if mine >= theirs:
        return RunVerdict(
            True, f"RUN allowed — escape guaranteed (your Spe {mine} ≥ foe Spe {theirs})"
        )
    # TryRunFromBattle (battle_util.c:412-466) keeps the odds in a u8 that wraps, and runTries
    # is not read, so only the speed comparison is stated.
    return RunVerdict(
        True,
        f"RUN allowed — escape not guaranteed: your Spe {mine} < foe Spe {theirs}; "
        "a failed try uses your turn",
    )


def _bag(battle: BattleState, details: BattleDetails) -> str:
    flags = battle.battle_type or 0
    if flags & (LINK | FRONTIER_NO_PYRAMID | EREADER | RECORDED_LINK):
        return 'BAG REFUSED — "Items can\'t be used now."'
    if flags & PYRAMID:
        # In the Battle Pyramid CB2_BagMenuFromBattle (item_menu.c) opens the Pyramid bag.
        return "BAG allowed — Battle Pyramid bag not read"
    if details.bag is None:
        return "BAG allowed — bag contents unreadable"
    if not details.bag:
        return "BAG allowed — bag empty"
    usable = [i for i in details.bag if i.battle_usage]
    unusable = [i for i in details.bag if not i.battle_usage]
    balls = [i for i in usable if i.pocket == "poke_balls"]
    others = [i for i in usable if i.pocket != "poke_balls"]
    parts = []
    if others:
        # A nonzero battleUsage only says the item has a battle use; whether it would have any
        # effect on the current target (e.g. a POTION at full HP) is not checked.
        parts.append(
            "has a battle use (whether it does anything now is not checked): "
            + ", ".join(f"{i.name} ×{i.quantity}" for i in others)
        )
    if balls:
        names = ", ".join(f"{i.name} ×{i.quantity}" for i in balls)
        if flags & TRAINER:
            parts.append(
                f'balls {names}: the TRAINER blocks the BALL ("Don\'t be a thief!") '
                "and the ball is used up"
            )
        elif details.storage_full:
            parts.append(f"balls {names}: REFUSED — the BOX is full")
        elif details.storage_full is None:
            parts.append(f"balls {names}: usable unless party and every BOX are full (not read)")
        else:
            parts.append(f"balls {names}: usable (a ball is used up on every throw)")
    if unusable:
        parts.append(
            "not usable in battle: " + ", ".join(f"{i.name} ×{i.quantity}" for i in unusable)
        )
    return "BAG allowed — " + "; ".join(parts)


def _switch(
    battle: BattleState, actor: BattleBattler, details: BattleDetails, active: set[str]
) -> str:
    flags = battle.battle_type or 0
    me = next((m for m in details.party or () if m.identity == actor.identity), None)
    name = actor.species if me is None else me.name
    if _bound(actor) or flags & ARENA:
        return f'POKéMON switching REFUSED — "{name} can\'t be switched out!"'
    trap = _trap(actor, battle.battlers or ())
    if trap is not None:
        return (
            f"POKéMON switching REFUSED — \"{trap.species}'s "
            f'{ABILITY_NAMES[trap.ability]} prevents switching!"'
        )
    if details.party is None:
        return "POKéMON switching allowed — party unreadable"
    if flags & MULTI:
        return "POKéMON switching allowed — multi-battle party slots are not worked out"
    ready = [
        m.name
        for m in details.party
        if m.identity not in active and not m.is_egg and m.diagnostic is None and m.hp
    ]
    if not ready:
        return "POKéMON switching allowed — no other Pokémon can battle"
    return "POKéMON switching allowed — can switch to " + ", ".join(ready)


def _fight(actor: BattleBattler) -> str:
    if actor.status2 & (STATUS2_MULTIPLETURNS | STATUS2_RECHARGE):
        return "FIGHT (this turn is forced: the game skips the action menu)"
    if all(m.pp == 0 for m in actor.moves if m.move_id):
        return "FIGHT (every move has 0 PP: the game uses STRUGGLE)"
    return "FIGHT"


def _member_text(member: MemberFacts, active: set[str]) -> str:
    if member.diagnostic is not None:
        return f"  {member.slot + 1} {member.name} · HARNESS BUG: {member.diagnostic}"
    if member.is_egg:
        return f"  {member.slot + 1} EGG · can't battle"
    assert member.types is not None and member.ability is not None
    state = (
        "in battle"
        if member.identity in active
        else "fainted (can't switch in)"
        if not member.hp
        else "can switch in"
    )
    return (
        f"  {member.slot + 1} {member.name} Lv{member.level} {_types(member.types)} · "
        f"HP {member.hp}/{member.max_hp} · {status1_text(member.status)} · "
        f"ability {ABILITY_NAMES[member.ability]} · item {member.item or 'none'} · {state} · moves "
        + ("; ".join(move_text(m) for m in member.moves) or "none")
    )


def _actor_text(label: str, actor: BattleBattler, held: HeldItem | None) -> str:
    if actor.absent:
        return f"{label} {actor.species} · absent (fainted or switched out)"
    return (
        f"{label} {actor.species} Lv{actor.level} · {_types(actor.types)} · "
        f"HP {actor.hp}/{actor.max_hp} · {status1_text(actor.status1)} · "
        f"ability {ABILITY_NAMES[actor.ability]} · "
        f"item {'none' if held is None or held.name is None else held.name} · "
        f"{_stats(actor.stats)} · {_stages(actor.stat_stages)}{_conditions(actor)}"
    )


def battle_details_lines(battle: BattleState, details: BattleDetails) -> list[str]:
    flags = battle.battle_type or 0
    lines = [f"Battle details: {_kind(flags)} · turn {battle.turn} · {_input_text(battle)}"]
    if details.diagnostic is not None:
        lines.append(f"HARNESS BUG (battle details): {details.diagnostic}")
    battlers = battle.battlers or ()
    held = {h.battler: h for h in details.held}
    inputs: dict[int, BattleInput] = {i.battler: i for i in battle.player_inputs or ()}
    players = [b for b in battlers if not b.position & 1]
    active = {b.identity for b in players if not b.absent}
    for foe in (b for b in battlers if b.position & 1):
        moves = [m for m in (_battle_move(foe, s) for s in range(4)) if m is not None]
        line = _actor_text("Foe", foe, held.get(foe.battler))
        if not foe.absent:
            line += " · moves: " + ("; ".join(move_text(m) for m in moves) or "none")
        lines.append(line)
    for actor in players:
        control = inputs.get(actor.battler)
        if flags & WALLY_TUTORIAL:
            lines.append("Actions: none (the game plays the WALLY tutorial)")
        elif flags & SAFARI:
            lines.append("Actions: Safari Zone actions are not detailed")
        elif not actor.absent:
            menu = (
                f"menu open, highlighted ▶ {control.selected}"
                if control is not None and control.ready and control.phase == "action"
                else "menu not open"
            )
            lines.append(
                f"Actions (2×2 FIGHT BAG / POKéMON RUN; {menu}): "
                + " · ".join(
                    (
                        _fight(actor),
                        _bag(battle, details),
                        _switch(battle, actor, details, active),
                        run_verdict(battle, actor, held.get(actor.battler)).text,
                    )
                )
            )
        lines.append(_actor_text("You", actor, held.get(actor.battler)))
        if actor.absent:
            continue
        cursor = (
            control.move_cursor
            if control is not None and control.ready and control.phase in ("move", "move_reorder")
            else None
        )
        lines.append(
            "Your moves (2×2 1 2 / 3 4; "
            + ("menu not open)" if cursor is None else f"highlighted ▶ {cursor + 1})")
            + ":"
        )
        for slot in range(4):
            move = _battle_move(actor, slot)
            if move is None:
                continue
            mark = "▶" if cursor == slot else " "
            refused = f' — REFUSED: "{NO_PP}"' if move.pp == 0 else ""
            lines.append(f" {mark}{slot + 1} {move_text(move)}{refused}")
    if details.party is None:
        lines.append("Party: unreadable")
    else:
        lines.append("Party (game party slots):")
        lines.extend(_member_text(m, active) for m in details.party)
    return lines
