import struct
from dataclasses import replace

import pytest

from pokebench_env import rerender
from pokebench_env.battle_state import BattleState
from pokebench_env.foe_trainer_items import (
    BATTLE_RESOURCES,
    ITEMS_NO,
    LEFT_SWITCH,
    RECAP_SWITCH,
    TRAINER_ITEMS,
    FoeItem,
    FoeTrainerItems,
    foe_item_lines,
    left_line,
    read_foe_trainer_items,
    recap_line,
)
from pokebench_env.game_state import GameState, MapNames
from pokebench_env.pokemon import ITEMS
from pokebench_env.readout import SERVER_FEATURES, features_off_from_env, format_readout, state_json
from pokebench_env.trainer_opponent import GTRAINERS, TRAINER_SIZE
from tests.env.test_game_state import Memory, text
from tests.env.test_readout import IN_GAME

OPPONENT, TYPE_FLAGS = 0x02038BCA, 0x02022FEC
RESOURCES, HISTORY = 0x02010000, 0x02011000
TRAINER = 1 << 3
# include/constants/items.h; include/constants/opponents.h.
FULL_RESTORE, HYPER_POTION, SUPER_POTION, FULL_HEAL, X_ATTACK = 19, 21, 22, 23, 75
GLACIA, WALLACE = 263, 335
NAMES = {
    FULL_RESTORE: "FULL RESTORE",
    HYPER_POTION: "HYPER POTION",
    SUPER_POTION: "SUPER POTION",
    FULL_HEAL: "FULL HEAL",
    X_ATTACK: "X ATTACK",
}


def item_rows(m: Memory) -> None:
    for item_id, name in NAMES.items():
        row = text(name) + b"\xff"
        m.put(ITEMS + 44 * item_id, row + bytes(14 - len(row)) + struct.pack("<H", item_id))


def battle(
    m: Memory,
    trainer_id: int,
    carried: list[int],
    slots: list[int],
    items_no: int,
    flags: int = TRAINER,
) -> None:
    item_rows(m)
    m.put(TYPE_FLAGS, struct.pack("<I", flags))
    m.put(OPPONENT, struct.pack("<H", trainer_id))
    m.put(
        GTRAINERS + trainer_id * TRAINER_SIZE + 0x10,
        struct.pack("<4H", *(carried + [0] * (4 - len(carried)))),
    )
    m.put(BATTLE_RESOURCES, struct.pack("<I", RESOURCES))
    m.put(RESOURCES + 0x18, struct.pack("<I", HISTORY))
    m.put(HISTORY + 0x48, struct.pack("<4H", *(slots + [0] * (4 - len(slots)))))
    m.put(HISTORY + 0x50, bytes([items_no]))


def test_the_layout_comes_from_pokeemerald() -> None:
    # include/battle.h: usedMoves[4] of struct UsedMoves (u16 moves[4], u16 unknown[4]),
    # abilities[4], itemEffects[4], trainerItems[4], itemsNo. Checked on run 67d7's raw RAM in
    # GLACIA's room, where the history read FULL RESTORE twice, then once after she used one.
    assert TRAINER_ITEMS == 4 * 16 + 4 + 4
    assert ITEMS_NO == TRAINER_ITEMS + 4 * 2
    assert BATTLE_RESOURCES == 0x020244A8


def test_a_full_set_of_items_reads_as_all_left() -> None:
    m = Memory()
    battle(m, GLACIA, [FULL_RESTORE, FULL_RESTORE], [FULL_RESTORE, FULL_RESTORE], 2)
    assert read_foe_trainer_items(m.read, True) == FoeTrainerItems(
        trainer_id=GLACIA,
        items_no=2,
        left=(FoeItem(0, "FULL RESTORE"), FoeItem(1, "FULL RESTORE")),
        used=(),
    )


def test_a_used_item_is_the_zeroed_slot() -> None:
    m = Memory()
    battle(m, GLACIA, [FULL_RESTORE, FULL_RESTORE], [0, FULL_RESTORE], 2)
    items = read_foe_trainer_items(m.read, True)
    assert items is not None
    assert items.used == (FoeItem(0, "FULL RESTORE"),)
    assert items.left == (FoeItem(1, "FULL RESTORE"),)


@pytest.mark.parametrize(
    ("flags", "in_battle"),
    [
        (TRAINER, False),
        (0, True),
        (TRAINER | 1 << 1, True),
        (TRAINER | 1 << 8, True),
        (TRAINER | 1 << 22, True),
        (TRAINER | 1 << 27, True),
    ],
)
def test_no_items_outside_an_item_using_trainer_battle(flags: int, in_battle: bool) -> None:
    m = Memory()
    battle(m, GLACIA, [FULL_RESTORE], [FULL_RESTORE], 1, flags=flags)
    assert read_foe_trainer_items(m.read, in_battle) is None


def test_a_stale_or_unset_history_reads_as_nothing() -> None:
    m = Memory()
    battle(m, GLACIA, [FULL_RESTORE, FULL_RESTORE], [SUPER_POTION], 1)
    assert read_foe_trainer_items(m.read, True) is None
    battle(m, GLACIA, [FULL_RESTORE, FULL_RESTORE], [FULL_RESTORE, SUPER_POTION], 2)
    assert read_foe_trainer_items(m.read, True) is None
    battle(m, GLACIA, [FULL_RESTORE], [FULL_RESTORE, 0, 0, FULL_RESTORE], 1)
    assert read_foe_trainer_items(m.read, True) is None
    m.put(BATTLE_RESOURCES, struct.pack("<I", 0))
    assert read_foe_trainer_items(m.read, True) is None
    m.put(BATTLE_RESOURCES, struct.pack("<I", RESOURCES))
    m.put(RESOURCES + 0x18, struct.pack("<I", 0x08000000))
    assert read_foe_trainer_items(m.read, True) is None


def test_an_opponent_outside_the_trainer_table_reads_as_nothing() -> None:
    m = Memory()
    battle(m, 0, [], [], 0)
    assert read_foe_trainer_items(m.read, True) is None
    battle(m, 855, [], [], 0)
    assert read_foe_trainer_items(m.read, True) is None


def test_a_trainer_without_items() -> None:
    m = Memory()
    battle(m, 5, [], [], 0)
    items = read_foe_trainer_items(m.read, True)
    assert items == FoeTrainerItems(trainer_id=5, items_no=0, left=(), used=())
    assert foe_item_lines(items, recap=True, left=True) == [
        "Foe trainer items used this battle: none",
        "Foe trainer items left (from game memory): none",
    ]


def test_the_recap_names_only_used_items() -> None:
    items = FoeTrainerItems(
        trainer_id=WALLACE,
        items_no=4,
        left=(FoeItem(2, "FULL RESTORE"), FoeItem(3, "FULL RESTORE")),
        used=(FoeItem(0, "FULL RESTORE"), FoeItem(1, "FULL RESTORE")),
    )
    assert recap_line(items) == "Foe trainer items used this battle: FULL RESTORE ×2"


def test_items_left_say_when_the_ai_may_use_each() -> None:
    items = FoeTrainerItems(
        trainer_id=WALLACE,
        items_no=4,
        left=(FoeItem(1, "FULL RESTORE"), FoeItem(3, "FULL RESTORE")),
        used=(FoeItem(0, "FULL RESTORE"),),
    )
    assert left_line(items) == (
        "Foe trainer items left (from game memory): "
        "FULL RESTORE (only once 4 or fewer of its POKéMON can fight); "
        "FULL RESTORE (only once 2 or fewer of its POKéMON can fight). "
        "The game's trainer AI uses an item instead of a move, and the item takes effect "
        "before any move that turn: FULL RESTORE when its POKéMON in battle is below 1/4 of "
        "its max HP."
    )


def test_potions_cures_and_boosts_get_their_own_rules() -> None:
    items = FoeTrainerItems(
        trainer_id=1,
        items_no=4,
        left=(
            FoeItem(0, "HYPER POTION"),
            FoeItem(1, "SUPER POTION"),
            FoeItem(2, "FULL HEAL"),
            FoeItem(3, "X ATTACK"),
        ),
        used=(),
    )
    assert left_line(items).endswith(
        "before any move that turn: SUPER POTION or HYPER POTION when its POKéMON is below "
        "1/4 of its max HP or is missing more HP than the item restores (SUPER POTION 50, "
        "HYPER POTION 200); FULL HEAL when its POKéMON has a condition the item cures; "
        "X ATTACK on its POKéMON's first turn in battle."
    )


def test_an_item_without_a_known_rule_is_listed_without_one() -> None:
    items = FoeTrainerItems(trainer_id=1, items_no=1, left=(FoeItem(0, "NUGGET"),), used=())
    assert left_line(items) == "Foe trainer items left (from game memory): NUGGET (any turn)"


def test_each_switch_adds_only_its_own_line() -> None:
    items = FoeTrainerItems(
        trainer_id=GLACIA, items_no=2, left=(FoeItem(1, "FULL RESTORE"),), used=()
    )
    assert foe_item_lines(items, recap=False, left=False) == []
    assert foe_item_lines(items, recap=True, left=False) == [recap_line(items)]
    assert foe_item_lines(items, recap=False, left=True) == [left_line(items)]
    assert foe_item_lines(None, recap=True, left=True) == []


def test_the_json_keeps_slots() -> None:
    items = FoeTrainerItems(
        trainer_id=GLACIA, items_no=2, left=(FoeItem(1, "FULL RESTORE"),), used=()
    )
    assert items.json() == {
        "trainer_id": GLACIA,
        "items_no": 2,
        "left": [{"slot": 1, "name": "FULL RESTORE"}],
        "used": [],
    }


GLACIA_LEFT = FoeTrainerItems(
    trainer_id=GLACIA,
    items_no=2,
    left=(FoeItem(1, "FULL RESTORE"),),
    used=(FoeItem(0, "FULL RESTORE"),),
)


def battle_state(items: FoeTrainerItems | None) -> GameState:
    return replace(
        IN_GAME,
        screen="battle",
        in_battle=True,
        battle=BattleState(active=True, initialized=True, phase="input", turn=3),
        foe_trainer_items=items,
    )


def test_switches_are_server_side_and_default_off() -> None:
    off = features_off_from_env({})
    assert {RECAP_SWITCH, LEFT_SWITCH} <= set(SERVER_FEATURES)
    assert {RECAP_SWITCH, LEFT_SWITCH} <= off


def test_off_readout_and_state_are_unchanged_bytes() -> None:
    off = features_off_from_env({})
    plain = battle_state(None)
    assert format_readout(battle_state(GLACIA_LEFT), off) == format_readout(plain, off)
    assert "foe_trainer_items" not in state_json(plain)


def test_on_readout_adds_the_lines_after_the_battle_details() -> None:
    off = features_off_from_env({}) - {RECAP_SWITCH, LEFT_SWITCH}
    text_on = format_readout(battle_state(GLACIA_LEFT), off)
    lines = text_on.split("\n")
    assert recap_line(GLACIA_LEFT) in lines
    assert left_line(GLACIA_LEFT) in lines
    assert lines.index(recap_line(GLACIA_LEFT)) + 1 == lines.index(left_line(GLACIA_LEFT))
    only_recap = format_readout(battle_state(GLACIA_LEFT), off | {LEFT_SWITCH}).split("\n")
    assert recap_line(GLACIA_LEFT) in only_recap
    assert left_line(GLACIA_LEFT) not in only_recap
    assert state_json(battle_state(GLACIA_LEFT))["foe_trainer_items"] == GLACIA_LEFT.json()


def test_factory_reads_the_items_only_with_a_switch_and_in_battle(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    m = Memory()
    battle(m, GLACIA, [FULL_RESTORE, FULL_RESTORE], [0, FULL_RESTORE], 2)
    seen = battle_state(None)
    monkeypatch.setattr(rerender, "read_game_state", lambda *_args, **_kwargs: seen)
    off = features_off_from_env({})
    assert rerender.read_state(m.read, MapNames({}), active_ui=True, off=off) is seen
    for still_off in (RECAP_SWITCH, LEFT_SWITCH):
        on = rerender.read_state(m.read, MapNames({}), active_ui=True, off=off - {still_off})
        assert on.foe_trainer_items == GLACIA_LEFT
    field = replace(seen, in_battle=False)
    monkeypatch.setattr(rerender, "read_game_state", lambda *_args, **_kwargs: field)
    assert rerender.read_state(m.read, MapNames({}), active_ui=True, off=frozenset()) is field


def test_factory_reads_a_bad_rom_row_as_nothing(monkeypatch: pytest.MonkeyPatch) -> None:
    m = Memory()
    battle(m, GLACIA, [377, 377], [377, 377], 2)
    seen = battle_state(None)
    monkeypatch.setattr(rerender, "read_game_state", lambda *_args, **_kwargs: seen)
    on = rerender.read_state(m.read, MapNames({}), active_ui=True, off=frozenset())
    assert on.foe_trainer_items is None
