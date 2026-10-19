"""Source-faithful normal-hit damage facts for battle-effective-damage-v1.

Pinned to pret/pokeemerald 731ad5bf.  This intentionally refuses move-script cases
whose final power, type, hit count, or multiplier is not a pure function of the
currently decoded battlers and field state.
"""

from dataclasses import dataclass
from fractions import Fraction
from typing import Protocol

from pokebench_env.battle_state import BattleBattler, BattleMove, BattleState
from pokebench_env.game_screen import ReadMemory

SWITCH = "battle-effective-damage-v1"
SIDE_STATUSES = 0x0202428E
BATTLE_WEATHER = 0x020243CC

# include/constants/battle.h and battle_main.c:gTypeEffectiveness.
NORMAL, FIGHTING, FLYING, POISON, GROUND, ROCK, BUG, GHOST, STEEL = range(9)
MYSTERY, FIRE, WATER, GRASS, ELECTRIC, PSYCHIC, ICE, DRAGON, DARK = range(9, 18)
TYPE_CHART: dict[tuple[int, int], int] = {
    (NORMAL, ROCK): 5,
    (NORMAL, STEEL): 5,
    (FIRE, FIRE): 5,
    (FIRE, WATER): 5,
    (FIRE, GRASS): 20,
    (FIRE, ICE): 20,
    (FIRE, BUG): 20,
    (FIRE, ROCK): 5,
    (FIRE, DRAGON): 5,
    (FIRE, STEEL): 20,
    (WATER, FIRE): 20,
    (WATER, WATER): 5,
    (WATER, GRASS): 5,
    (WATER, GROUND): 20,
    (WATER, ROCK): 20,
    (WATER, DRAGON): 5,
    (ELECTRIC, WATER): 20,
    (ELECTRIC, ELECTRIC): 5,
    (ELECTRIC, GRASS): 5,
    (ELECTRIC, GROUND): 0,
    (ELECTRIC, FLYING): 20,
    (ELECTRIC, DRAGON): 5,
    (GRASS, FIRE): 5,
    (GRASS, WATER): 20,
    (GRASS, GRASS): 5,
    (GRASS, POISON): 5,
    (GRASS, GROUND): 20,
    (GRASS, FLYING): 5,
    (GRASS, BUG): 5,
    (GRASS, ROCK): 20,
    (GRASS, DRAGON): 5,
    (GRASS, STEEL): 5,
    (ICE, WATER): 5,
    (ICE, GRASS): 20,
    (ICE, ICE): 5,
    (ICE, GROUND): 20,
    (ICE, FLYING): 20,
    (ICE, DRAGON): 20,
    (ICE, STEEL): 5,
    (ICE, FIRE): 5,
    (FIGHTING, NORMAL): 20,
    (FIGHTING, ICE): 20,
    (FIGHTING, POISON): 5,
    (FIGHTING, FLYING): 5,
    (FIGHTING, PSYCHIC): 5,
    (FIGHTING, BUG): 5,
    (FIGHTING, ROCK): 20,
    (FIGHTING, DARK): 20,
    (FIGHTING, STEEL): 20,
    (POISON, GRASS): 20,
    (POISON, POISON): 5,
    (POISON, GROUND): 5,
    (POISON, ROCK): 5,
    (POISON, GHOST): 5,
    (POISON, STEEL): 0,
    (GROUND, FIRE): 20,
    (GROUND, ELECTRIC): 20,
    (GROUND, GRASS): 5,
    (GROUND, POISON): 20,
    (GROUND, FLYING): 0,
    (GROUND, BUG): 5,
    (GROUND, ROCK): 20,
    (GROUND, STEEL): 20,
    (FLYING, ELECTRIC): 5,
    (FLYING, GRASS): 20,
    (FLYING, FIGHTING): 20,
    (FLYING, BUG): 20,
    (FLYING, ROCK): 5,
    (FLYING, STEEL): 5,
    (PSYCHIC, FIGHTING): 20,
    (PSYCHIC, POISON): 20,
    (PSYCHIC, PSYCHIC): 5,
    (PSYCHIC, DARK): 0,
    (PSYCHIC, STEEL): 5,
    (BUG, FIRE): 5,
    (BUG, GRASS): 20,
    (BUG, FIGHTING): 5,
    (BUG, POISON): 5,
    (BUG, FLYING): 5,
    (BUG, PSYCHIC): 20,
    (BUG, GHOST): 5,
    (BUG, DARK): 20,
    (BUG, STEEL): 5,
    (ROCK, FIRE): 20,
    (ROCK, ICE): 20,
    (ROCK, FIGHTING): 5,
    (ROCK, GROUND): 5,
    (ROCK, FLYING): 20,
    (ROCK, BUG): 20,
    (ROCK, STEEL): 5,
    (GHOST, NORMAL): 0,
    (GHOST, PSYCHIC): 20,
    (GHOST, DARK): 5,
    (GHOST, STEEL): 5,
    (GHOST, GHOST): 20,
    (DRAGON, DRAGON): 20,
    (DRAGON, STEEL): 5,
    (DARK, FIGHTING): 5,
    (DARK, PSYCHIC): 20,
    (DARK, GHOST): 20,
    (DARK, DARK): 5,
    (DARK, STEEL): 5,
    (STEEL, FIRE): 5,
    (STEEL, WATER): 5,
    (STEEL, ELECTRIC): 5,
    (STEEL, ICE): 20,
    (STEEL, ROCK): 20,
    (STEEL, STEEL): 5,
    (NORMAL, GHOST): 0,
    (FIGHTING, GHOST): 0,
}

# Moves with a move script that changes this execution's damage or hit count.
# Ordinary fixed-power effects, including recoil/drain/secondary effects, use the normal pipeline.
VARIABLE_HITS = frozenset({29, 44, 77, 104, 154})
SCRIPT_DAMAGE = frozenset(
    {
        9,
        26,
        38,
        40,
        41,
        83,
        87,
        88,
        89,
        97,
        99,
        144,
        117,
        119,
        121,
        122,
        123,
        126,
        128,
        130,
        135,
        146,
        147,
        148,
        149,
        150,
        161,
        169,
        171,
        173,
        180,
        185,
        189,
        190,
        196,
        203,
    }
)
SOUND_MOVES = frozenset({45, 46, 47, 48, 103, 173, 253, 304, 319, 320})

# CalculateBaseDamage constants.
DOUBLE, LINK, TRAINER, EREADER, RECORDED_LINK, SECRET_BASE = (
    1,
    1 << 1,
    1 << 3,
    1 << 11,
    1 << 25,
    1 << 27,
)
FRONTIER = sum(1 << bit for bit in (8, 16, 17, 18, 19, 20, 21))
REFLECT, LIGHT_SCREEN = 1, 2
RAIN, SAND, SUN, HAIL = 0b111, 0b11000, 0b1100000, 0b10000000
BURN, FREEZE = 1 << 4, 1 << 5
SUBSTITUTE = 1 << 24
FORESIGHT = 1 << 29
CHARGED = 1 << 9
MUD_SPORT, WATER_SPORT = 1 << 16, 1 << 17

ABILITY_DAMP, ABILITY_CLOUD_NINE, ABILITY_FLASH_FIRE = 6, 13, 18
ABILITY_WONDER_GUARD, ABILITY_LEVITATE = 25, 26
ABILITY_SOUNDPROOF = 43
ABILITY_HUGE_POWER, ABILITY_THICK_FAT = 37, 47
ABILITY_HUSTLE, ABILITY_PLUS, ABILITY_MINUS = 55, 57, 58
ABILITY_GUTS, ABILITY_MARVEL_SCALE = 62, 63
ABILITY_OVERGROW, ABILITY_BLAZE, ABILITY_TORRENT, ABILITY_SWARM = 65, 66, 67, 68
ABILITY_PURE_POWER, ABILITY_AIR_LOCK = 74, 77

TARGET_DEPENDS, TARGET_USER_OR_SELECTED, TARGET_RANDOM = 1, 2, 4
TARGET_BOTH, TARGET_USER, TARGET_FOES_AND_ALLY, TARGET_OPPONENTS_FIELD = 8, 16, 32, 64
SCREEN = ("left", "right", "right", "left")

TYPE_ITEMS = {
    31: BUG,
    42: STEEL,
    46: GROUND,
    47: ROCK,
    48: GRASS,
    49: DARK,
    50: FIGHTING,
    51: ELECTRIC,
    52: WATER,
    53: FLYING,
    54: POISON,
    55: ICE,
    56: GHOST,
    57: PSYCHIC,
    58: FIRE,
    59: DRAGON,
    60: NORMAL,
}


class HeldFacts(Protocol):
    @property
    def battler(self) -> int: ...

    @property
    def name(self) -> str | None: ...

    @property
    def hold_effect(self) -> int | None: ...

    @property
    def parameter(self) -> int | None: ...


class DetailsFacts(Protocol):
    @property
    def held(self) -> tuple[HeldFacts, ...]: ...

    @property
    def damage(self) -> "DamageContext | None": ...


@dataclass(frozen=True)
class DamageContext:
    weather: int = 0
    side_statuses: tuple[int, int] = (0, 0)
    badges: tuple[str, ...] = ()


def read_damage_context(read: ReadMemory, badges: tuple[str, ...]) -> DamageContext:
    sides = tuple(int.from_bytes(read(SIDE_STATUSES + 2 * i, 2), "little") for i in range(2))
    weather = int.from_bytes(read(BATTLE_WEATHER, 2), "little")
    if len(sides) != 2 or weather & ~0xFF:
        raise ValueError("invalid battle damage field state")
    return DamageContext(weather, (sides[0], sides[1]), badges)


def _stage(stat: int, stage: int) -> int:
    if stage <= 6:
        return stat * 2 // (8 - stage)
    return stat * (stage - 4) // 2


def _type_multipliers(move_type: int, target: BattleBattler) -> tuple[int, ...]:
    """Return Emerald's explicit type-table entries in the game's table order."""
    target_types = set(target.types)
    return tuple(
        multiplier
        for (attack_type, defense_type), multiplier in TYPE_CHART.items()
        if attack_type == move_type
        and defense_type in target_types
        and not (
            target.status2 & FORESIGHT and defense_type == GHOST and move_type in (NORMAL, FIGHTING)
        )
    )


def _effectiveness(
    move: BattleMove, target: BattleBattler
) -> tuple[Fraction, tuple[int, ...], str | None]:
    assert move.move_type is not None
    move_type = move.move_type
    if move_type == GROUND and target.ability == ABILITY_LEVITATE:
        return Fraction(0), (), "LEVITATE"
    if target.ability == ABILITY_FLASH_FIRE and move_type == FIRE and not target.status1 & FREEZE:
        return Fraction(0), (), "FLASH FIRE"
    if (target.ability, move_type) == (10, ELECTRIC):
        return Fraction(0), (), "VOLT ABSORB"
    if (target.ability, move_type) == (11, WATER):
        return Fraction(0), (), "WATER ABSORB"
    if target.ability == ABILITY_SOUNDPROOF and move.move_id in SOUND_MOVES:
        return Fraction(0), (), "SOUNDPROOF"
    multipliers = _type_multipliers(move_type, target)
    value = Fraction(1)
    for multiplier in multipliers:
        value *= Fraction(multiplier, 10)
    if target.ability == ABILITY_WONDER_GUARD and value <= 1:
        return Fraction(0), multipliers, "WONDER GUARD"
    return value, multipliers, "type ×0" if value == 0 else None


def _weather_works(battlers: tuple[BattleBattler, ...]) -> bool:
    return not any(mon.ability in (ABILITY_CLOUD_NINE, ABILITY_AIR_LOCK) for mon in battlers)


def _badge_works(flags: int, mon: BattleBattler) -> bool:
    return (
        not flags & (LINK | EREADER | RECORDED_LINK | FRONTIER)
        and not (flags & TRAINER and flags & SECRET_BASE)
        and not mon.position & 1
    )


def _item(held: dict[int, HeldFacts], battler: int) -> HeldFacts | None:
    return held.get(battler)


def _unsupported(move: BattleMove, actor: BattleBattler) -> str | None:
    if move.effect in VARIABLE_HITS:
        return "variable hit count or move power"
    if move.power == 1 or move.effect in SCRIPT_DAMAGE:
        return "fixed or script-derived damage"
    if move.power == 0:
        return None
    if actor.ability == ABILITY_FLASH_FIRE and move.move_type == FIRE:
        return "FLASH FIRE activation state is not decoded"
    return None


def _targets(
    battle: BattleState, actor: BattleBattler, move: BattleMove
) -> tuple[list[BattleBattler], str | None]:
    alive = [m for m in battle.battlers or () if not m.absent and m.hp > 0]
    others = [m for m in alive if m.battler != actor.battler]
    foes = [m for m in others if (m.position & 1) != (actor.position & 1)]
    flags = move.target or 0
    if flags & TARGET_USER:
        return [actor], None
    if flags & TARGET_OPPONENTS_FIELD:
        return [], "opposing side; no direct damage"
    if flags & TARGET_FOES_AND_ALLY:
        return others, "all other Pokémon"
    if flags & TARGET_BOTH:
        return foes, "all foes"
    if flags & TARGET_RANDOM:
        return foes, "game selects one"
    if flags & TARGET_DEPENDS:
        return foes, "game-selected target"
    if flags & TARGET_USER_OR_SELECTED:
        return [actor, *others], "choose one, including self"
    return others if flags == 0 else foes, "choose one" if flags == 0 else None


def _label(mon: BattleBattler, actor: BattleBattler) -> str:
    role = (
        "self"
        if mon.battler == actor.battler
        else "foe"
        if (mon.position & 1) != (actor.position & 1)
        else "ally"
    )
    return (
        f"{mon.species} ({role}, screen {SCREEN[mon.position] if 0 <= mon.position < 4 else '?'})"
    )


def _fmt_effect(value: Fraction) -> str:
    return f"{float(value):g}"


def _damage(
    battle: BattleState,
    context: DamageContext,
    held: dict[int, HeldFacts],
    actor: BattleBattler,
    target: BattleBattler,
    move: BattleMove,
) -> tuple[list[int], Fraction, list[str], str | None]:
    assert move.power is not None and move.move_type is not None and move.target is not None
    move_type, power = move.move_type, move.power
    physical = move_type < MYSTERY
    attack = actor.stats[0] if physical else actor.stats[3]
    defense = target.stats[1] if physical else target.stats[4]
    notes: list[str] = []
    atk_item, def_item = _item(held, actor.battler), _item(held, target.battler)
    if atk_item is not None and atk_item.hold_effect is None:
        raise ValueError(f"{atk_item.name or 'held item'} effect is not decoded")
    if def_item is not None and def_item.hold_effect is None:
        raise ValueError(f"{def_item.name or 'held item'} effect is not decoded")
    if actor.ability in (ABILITY_HUGE_POWER, ABILITY_PURE_POWER):
        attack *= 2
        notes.append("HUGE/PURE POWER")
    flags = battle.battle_type or 0
    if _badge_works(flags, actor) and (
        (physical and "STONE" in context.badges) or (not physical and "MIND" in context.badges)
    ):
        attack = 110 * attack // 100
        notes.append("badge boost")
    if _badge_works(flags, target) and (
        (physical and "BALANCE" in context.badges) or (not physical and "MIND" in context.badges)
    ):
        defense = 110 * defense // 100
        notes.append("target badge boost")
    if (
        atk_item is not None
        and atk_item.hold_effect in TYPE_ITEMS
        and TYPE_ITEMS[atk_item.hold_effect] == move_type
    ):
        if atk_item.parameter is None:
            raise ValueError(f"{atk_item.name or 'held item'} power parameter is not decoded")
        attack = attack * (atk_item.parameter + 100) // 100
        notes.append(atk_item.name or "type item")
    if atk_item is not None and atk_item.hold_effect == 29 and physical:
        attack = 150 * attack // 100
        notes.append(atk_item.name or "CHOICE BAND")
    if (
        atk_item is not None
        and atk_item.hold_effect == 34
        and actor.species_id in (407, 408)
        and not flags & FRONTIER
        and not physical
    ):
        attack = 150 * attack // 100
    if (
        def_item is not None
        and def_item.hold_effect == 34
        and target.species_id in (407, 408)
        and not flags & FRONTIER
        and not physical
    ):
        defense = 150 * defense // 100
    if (
        atk_item is not None
        and atk_item.hold_effect == 35
        and actor.species_id == 366
        and not physical
    ):
        attack *= 2
    if (
        def_item is not None
        and def_item.hold_effect == 36
        and target.species_id == 366
        and not physical
    ):
        defense *= 2
    if (
        atk_item is not None
        and atk_item.hold_effect == 45
        and actor.species_id == 25
        and not physical
    ):
        attack *= 2
    if (
        def_item is not None
        and def_item.hold_effect == 64
        and target.species_id == 132
        and physical
    ):
        defense *= 2
    if (
        atk_item is not None
        and atk_item.hold_effect == 65
        and actor.species_id in (104, 105)
        and physical
    ):
        attack *= 2
    if target.ability == ABILITY_THICK_FAT and move_type in (FIRE, ICE) and not physical:
        attack //= 2
        notes.append("THICK FAT")
    if actor.ability == ABILITY_HUSTLE and physical:
        attack = 150 * attack // 100
        notes.append("HUSTLE")
    field = battle.battlers or ()
    if (actor.ability == ABILITY_PLUS and any(m.ability == ABILITY_MINUS for m in field)) or (
        actor.ability == ABILITY_MINUS and any(m.ability == ABILITY_PLUS for m in field)
    ):
        attack = 150 * attack // 100
        notes.append("PLUS/MINUS")
    if actor.ability == ABILITY_GUTS and actor.status1 and physical:
        attack = 150 * attack // 100
        notes.append("GUTS")
    if target.ability == ABILITY_MARVEL_SCALE and target.status1 and physical:
        defense = 150 * defense // 100
        notes.append("MARVEL SCALE")
    if move_type == ELECTRIC and any(m.status3 & MUD_SPORT for m in battle.battlers or ()):
        power //= 2
        notes.append("MUD SPORT")
    if move_type == FIRE and any(m.status3 & WATER_SPORT for m in battle.battlers or ()):
        power //= 2
        notes.append("WATER SPORT")
    pinch = {
        GRASS: (ABILITY_OVERGROW, "OVERGROW"),
        FIRE: (ABILITY_BLAZE, "BLAZE"),
        WATER: (ABILITY_TORRENT, "TORRENT"),
        BUG: (ABILITY_SWARM, "SWARM"),
    }.get(move_type)
    if pinch is not None and actor.ability == pinch[0] and actor.hp <= actor.max_hp // 3:
        power = 150 * power // 100
        notes.append(pinch[1])
    if move.effect == 7:
        defense //= 2
        notes.append("EXPLOSION defense halving")
    attack = _stage(attack, actor.stat_stages[1 if physical else 4])
    defense = max(1, _stage(defense, target.stat_stages[2 if physical else 5]))
    damage = attack * power * (2 * actor.level // 5 + 2) // defense // 50
    if physical and actor.status1 & BURN and actor.ability != ABILITY_GUTS:
        damage //= 2
        notes.append("burn")
    side = context.side_statuses[target.position & 1]
    screen = REFLECT if physical else LIGHT_SCREEN
    # Brick Break removes both screens before its damage calculation.
    if side & screen and move.effect != 186:
        alive_defenders = sum(
            1
            for m in battle.battlers or ()
            if not m.absent and (m.position & 1) == (target.position & 1)
        )
        damage = 2 * (damage // 3) if flags & DOUBLE and alive_defenders == 2 else damage // 2
        notes.append("REFLECT" if physical else "LIGHT SCREEN")
    if flags & DOUBLE and move.target & TARGET_BOTH:
        alive_defenders = sum(
            1
            for m in battle.battlers or ()
            if not m.absent and (m.position & 1) == (target.position & 1)
        )
        if alive_defenders == 2:
            damage //= 2
            notes.append("spread ×0.5")
    damage = max(1, damage) if move_type != MYSTERY else 0
    if not physical and _weather_works(battle.battlers or ()):
        if context.weather & 1:
            if move_type == FIRE:
                damage //= 2
                notes.append("rain")
            elif move_type == WATER:
                damage = 15 * damage // 10
                notes.append("rain")
        if move.effect == 151 and context.weather & (RAIN | SAND | HAIL):
            damage //= 2
            notes.append("weather-weakened SOLAR BEAM")
        if context.weather & SUN:
            if move_type == FIRE:
                damage = 15 * damage // 10
                notes.append("sun")
            elif move_type == WATER:
                damage //= 2
                notes.append("sun")
    damage += 2
    if actor.status3 & CHARGED and move_type == ELECTRIC:
        damage *= 2
        notes.append("CHARGE")
    # Struggle bypasses Cmd_typecalc entirely: no STAB and no type effectiveness.
    struggle = move.move_id == 165
    stab = not struggle and move_type in actor.types
    if stab:
        damage = damage * 15 // 10
    multipliers: tuple[int, ...]
    if struggle:
        effectiveness, multipliers, immunity = Fraction(1), (), None
    else:
        effectiveness, multipliers, immunity = _effectiveness(move, target)
    for multiplier in multipliers:
        damage = damage * multiplier // 10
        if damage == 0 and multiplier != 0:
            damage = 1
    if effectiveness == 0:
        damage = 0
    rolls = [0 if damage == 0 else max(1, damage * percent // 100) for percent in range(85, 101)]
    if move.effect == 101:
        rolls = [min(value, max(0, target.hp - 1)) for value in rolls]
        notes.append("FALSE SWIPE leaves 1 HP")
    return rolls, effectiveness, notes, immunity


def effective_damage_lines(battle: BattleState, details: DetailsFacts) -> list[str]:
    context = details.damage
    if context is None or battle.battlers is None:
        return []
    ready = {
        i.battler for i in battle.player_inputs or () if i.ready and i.phase in ("action", "move")
    }
    actors = [
        m
        for m in battle.battlers
        if m.battler in ready and not m.absent and m.hp > 0 and not m.position & 1
    ]
    if not actors:
        return []
    held = {item.battler: item for item in details.held}
    lines = [
        "Effective damage (landed, non-critical normal hit; Emerald rolls 85-100; "
        "accuracy separate; PP availability shown; other move locks not decoded; "
        "no move ranking):"
    ]
    for actor in actors:
        lines.append(f" For {actor.species}:")
        moves = [move for move in actor.moves if move.move_id and move.name is not None]
        entries = [(move, f"  {move.slot + 1} {move.name}") for move in moves]
        if moves and all(move.pp == 0 for move in moves):
            entries.append(
                (
                    BattleMove(0, 165, "STRUGGLE", 1, 1, NORMAL, 50, 100, 48, TARGET_RANDOM),
                    "  STRUGGLE (automatic because every move has 0 PP)",
                )
            )
        for move, label in entries:
            accuracy = "never misses" if move.accuracy == 0 else f"acc {move.accuracy}"
            prefix = f"{label} · {accuracy}"
            if move.move_id != 165 and move.pp == 0:
                lines.append(prefix + " · unavailable (0 PP)")
                continue
            reason = _unsupported(move, actor)
            if reason is not None:
                lines.append(prefix + f" · not deterministically computed ({reason})")
                continue
            if move.power == 0:
                lines.append(prefix + " · no direct damage")
                continue
            if move.effect == 7 and any(mon.ability == ABILITY_DAMP for mon in battle.battlers):
                lines.append(prefix + " · 0 HP (DAMP prevents explosion)")
                continue
            targets, target_note = _targets(battle, actor, move)
            lines.append(prefix + (" · " + target_note if target_note else "") + ":")
            for target in targets:
                if target.status2 & SUBSTITUTE:
                    lines.append(
                        f"   -> {_label(target, actor)}: not deterministically computed "
                        "(target is behind a substitute; substitute HP is not decoded)"
                    )
                    continue
                try:
                    rolls, effectiveness, notes, immunity = _damage(
                        battle, context, held, actor, target, move
                    )
                except ValueError as error:
                    lines.append(
                        f"   -> {_label(target, actor)}: not deterministically computed ({error})"
                    )
                    continue
                if effectiveness == 0:
                    lines.append(f"   -> {_label(target, actor)}: 0 HP · immune ({immunity})")
                    continue
                low, high = min(rolls), max(rolls)
                ko = sum(value >= target.hp for value in rolls)
                low_pct, high_pct = low * 100 // target.hp, high * 100 // target.hp
                stab = (
                    "STRUGGLE ignores STAB/type"
                    if move.move_id == 165
                    else "STAB ×1.5"
                    if move.move_type in actor.types
                    else "no STAB"
                )
                suffix = "" if not notes else " · current modifiers: " + ", ".join(notes)
                lines.append(
                    f"   -> {_label(target, actor)}: {low}-{high} HP "
                    f"({low_pct}-{high_pct}% of current {target.hp} HP) · "
                    f"{ko}/16 normal-hit KO rolls · "
                    f"type ×{_fmt_effect(effectiveness)} · {stab}{suffix}"
                )
    return lines
