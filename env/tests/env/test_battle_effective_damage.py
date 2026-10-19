"""battle-effective-damage-v1 source-formula and target-matrix contract."""

from dataclasses import replace

from pokebench_env.battle_damage import DamageContext, effective_damage_lines
from pokebench_env.battle_details import BattleDetails, HeldItem
from pokebench_env.battle_state import BattleBattler, BattleInput, BattleMove, BattleState


def move(
    slot: int,
    move_id: int,
    name: str,
    power: int,
    move_type: int,
    *,
    effect: int = 0,
    target: int = 0,
    accuracy: int = 100,
) -> BattleMove:
    return BattleMove(slot, move_id, name, 25, 25, move_type, power, accuracy, effect, target)


EMPTY = BattleMove(3, 0, None, 0, 0, None, None, None, None)


def mon(
    battler: int,
    position: int,
    species: str,
    *,
    level: int = 10,
    hp: int = 15,
    maximum: int = 30,
    stats: tuple[int, int, int, int, int] = (16, 15, 16, 19, 17),
    types: tuple[int, int] = (10, 10),
    ability: int = 66,
    moves: tuple[BattleMove, ...] | None = None,
    absent: bool = False,
) -> BattleBattler:
    return BattleBattler(
        battler,
        position,
        0,
        f"id-{battler}",
        280 if species == "TORCHIC" else 270,
        species,
        level,
        hp,
        maximum,
        0,
        0,
        0,
        (6,) * 8,
        stats,
        types,
        ability,
        0,
        moves or (EMPTY, EMPTY, EMPTY, EMPTY),
        absent,
    )


def details(*held: HeldItem, context: DamageContext | None = None) -> BattleDetails:
    return BattleDetails(None, None, held, None, damage=context)


def battle(*battlers: BattleBattler, double: bool = False) -> BattleState:
    players = tuple(
        BattleInput(b.battler, 0, "action", True, action_cursor=0, selected="FIGHT")
        for b in battlers
        if not b.position & 1 and not b.absent
    )
    return BattleState(True, True, "active", True, battle_type=1 if double else 0, turn=2, battlers=battlers, player_inputs=players)


def test_torchic_vs_wurmple_makes_ember_advantage_explicit_without_ranking() -> None:
    torchic = mon(
        0,
        0,
        "TORCHIC",
        moves=(
            move(0, 10, "SCRATCH", 40, 0),
            move(1, 45, "GROWL", 0, 0, effect=18),
            move(2, 116, "FOCUS ENERGY", 0, 0, effect=47, accuracy=0, target=16),
            move(3, 52, "EMBER", 40, 10, effect=4),
        ),
    )
    wurmple = mon(
        1,
        1,
        "WURMPLE",
        level=3,
        maximum=15,
        stats=(7, 7, 6, 6, 5),
        types=(6, 6),
        ability=19,
    )
    lines = effective_damage_lines(battle(torchic, wurmple), details(context=DamageContext()))
    text = "\n".join(lines)
    assert "1 SCRATCH · acc 100" in text
    assert "WURMPLE (foe, screen right): 10-12 HP" in text
    assert "0/16 normal-hit KO rolls · type ×1 · no STAB" in text
    assert "2 GROWL · acc 100 · no direct damage" in text
    assert "3 FOCUS ENERGY · never misses · no direct damage" in text
    assert "4 EMBER · acc 100" in text
    assert "WURMPLE (foe, screen right): 51-60 HP" in text
    assert "16/16 normal-hit KO rolls · type ×2 · STAB ×1.5" in text
    assert "best" not in text.lower() and "recommend" not in text.lower()


def test_blaze_and_current_hp_are_applied_by_the_emerald_integer_pipeline() -> None:
    ember = move(0, 52, "EMBER", 40, 10, effect=4)
    torchic = mon(0, 0, "TORCHIC", hp=10, moves=(ember, EMPTY, EMPTY, EMPTY))
    wurmple = mon(1, 1, "WURMPLE", level=3, maximum=15, stats=(7, 7, 6, 6, 5), types=(6, 6), ability=19)
    text = "\n".join(effective_damage_lines(battle(torchic, wurmple), details(context=DamageContext())))
    assert "73-86 HP" in text
    assert "BLAZE" in text


def test_status_and_script_dynamic_moves_are_never_given_guessed_damage() -> None:
    actor = mon(
        0,
        0,
        "TORCHIC",
        moves=(
            move(0, 45, "GROWL", 0, 0, effect=18),
            move(1, 69, "SEISMIC TOSS", 1, 1, effect=87),
            move(2, 3, "DOUBLE SLAP", 15, 0, effect=29),
            EMPTY,
        ),
    )
    foe = mon(1, 1, "WURMPLE", types=(6, 6), ability=19)
    text = "\n".join(effective_damage_lines(battle(actor, foe), details(context=DamageContext())))
    assert "GROWL · acc 100 · no direct damage" in text
    assert "SEISMIC TOSS · acc 100 · not deterministically computed (fixed or script-derived damage)" in text
    assert "DOUBLE SLAP · acc 100 · not deterministically computed (variable hit count or move power)" in text


def test_double_battle_lists_selected_targets_and_applies_spread_modifier() -> None:
    selected = move(0, 52, "EMBER", 40, 10, effect=4, target=0)
    spread = move(1, 75, "RAZOR LEAF", 55, 12, effect=43, target=8, accuracy=95)
    random = move(2, 253, "UPROAR", 50, 0, effect=159, target=4)
    left = mon(0, 0, "TORCHIC", moves=(selected, spread, random, EMPTY))
    ally = mon(2, 2, "TORCHIC", moves=(selected, EMPTY, EMPTY, EMPTY))
    foe_left = mon(1, 1, "WURMPLE", types=(6, 6), ability=19)
    foe_right = replace(foe_left, battler=3, position=3, identity="id-3", species="ZIGZAGOON", types=(0, 0), ability=53)
    text = "\n".join(effective_damage_lines(battle(left, foe_left, ally, foe_right, double=True), details(context=DamageContext())))
    ember = text[text.index("1 EMBER"):text.index("2 RAZOR LEAF")]
    razor = text[text.index("2 RAZOR LEAF"):text.index("3 UPROAR")]
    uproar = text[text.index("3 UPROAR"):]
    assert "WURMPLE (foe, screen right)" in ember and "ZIGZAGOON (foe, screen left)" in ember
    assert "spread ×0.5" in razor
    assert "game selects one:" in uproar


def test_immunity_and_absent_targets_follow_current_battle_state() -> None:
    ground = move(0, 89, "EARTHQUAKE", 100, 4, effect=147, target=8)
    actor = mon(0, 0, "TORCHIC", moves=(ground, EMPTY, EMPTY, EMPTY))
    levitate = mon(1, 1, "WURMPLE", types=(13, 13), ability=26)
    absent = replace(levitate, battler=3, position=3, identity="id-3", absent=True)
    text = "\n".join(effective_damage_lines(battle(actor, levitate, absent, double=True), details(context=DamageContext())))
    assert "0 HP · immune (LEVITATE)" in text
    assert text.count("WURMPLE (foe") == 1


def test_screens_weather_burn_badges_and_hold_effects_are_current_not_assumed() -> None:
    scratch = move(0, 10, "SCRATCH", 40, 0)
    ember = move(1, 52, "EMBER", 40, 10, effect=4)
    actor = replace(mon(0, 0, "TORCHIC", moves=(scratch, ember, EMPTY, EMPTY)), status1=1 << 4)
    foe = mon(1, 1, "WURMPLE", stats=(7, 7, 6, 6, 5), types=(6, 6), ability=19)
    context = DamageContext(weather=1, side_statuses=(0, 3), badges=("STONE", "MIND"))
    held = HeldItem(0, "CHARCOAL", 58, 10)
    text = "\n".join(effective_damage_lines(battle(actor, foe), details(held, context=context)))
    assert "burn" in text and "REFLECT" in text
    assert "rain" in text and "LIGHT SCREEN" in text and "CHARCOAL" in text

