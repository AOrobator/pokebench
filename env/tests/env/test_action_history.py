from dataclasses import replace

import pytest
from test_pokemon import fixture

from pokebench_env.action_history import ActionFrame, NativeActionJournal
from pokebench_env.pokemon import PokemonMove, decode_party_mon
from pokebench_env.resources import PokemonStorage, Resources, StoragePokemon


def mon():
    body, read = fixture()
    return decode_party_mon(body, read)


def frame(pokemon=None, captures=0, resources=None, owner="player", ui=None):
    return ActionFrame((mon() if pokemon is None else pokemon,), resources, captures, ui, owner)


def kinds(journal):
    return [entry["kind"] for entry in journal.snapshot(0)["entries"]]


def test_baseline_is_not_acquisition_and_move_changes_survive_invalid_snapshot():
    j = NativeActionJournal(clock=lambda: 123.5)
    original = mon()
    j.observe(frame(original))
    j.observe(frame(replace(original, diagnostic="harness bug: checksum", identity=None)))
    trained = replace(original, moves=(PokemonMove(52, 25, 0, "EMBER", 25),))
    j.observe(frame(trained))
    assert kinds(j).count("harness_bug") == 1
    assert "pokemon_acquired" not in kinds(j)
    assert "move_learned" in kinds(j)
    assert "move_forgotten" in kinds(j)
    learned = next(e for e in j.entries if e["kind"] == "move_learned")
    assert learned["details"]["move_name"] == "EMBER"
    assert learned["server_timestamp"] == 123.5


def test_capture_counter_before_box_insert_and_storage_sampling_gap():
    j = NativeActionJournal()
    j.observe(frame(resources=Resources(storage=PokemonStorage(0, ()))))
    j.observe(frame(captures=1))
    caught = replace(mon(), identity="new:identity")
    storage = PokemonStorage(0, (StoragePokemon(0, 2, caught),))
    j.observe(frame(captures=1, resources=Resources(storage=storage)))
    assert kinds(j) == ["pokemon_captured"]
    assert j.entries[0]["details"]["destination"] == "box"
    j.observe(frame(captures=1))
    j.observe(frame(captures=1, resources=Resources(storage=storage)))
    assert kinds(j) == ["pokemon_captured"]


def test_tutorial_and_rental_party_are_not_player_acquisitions():
    j = NativeActionJournal()
    j.observe(frame())
    other = replace(mon(), identity="wally:identity")
    j.observe(frame(other, owner="tutorial"))
    j.observe(frame(other, owner="rental"))
    j.observe(frame())
    assert kinds(j) == []


def test_saved_original_party_restoration_is_not_new_acquisition():
    from pokebench_env.party_ownership import PartyOwnership

    original = mon()
    other = replace(original, identity="previously:owned")
    j = NativeActionJournal()
    j.observe(frame(original))
    rented = replace(original, identity="rental:temporary")
    j.observe(
        replace(
            frame(rented, owner="rental"),
            ownership=PartyOwnership("rental", "factory", (original.identity, other.identity)),
        )
    )
    j.observe(frame(other))
    assert kinds(j) == []
    unknown = PartyOwnership(None, "invalid", diagnostic="invalid native originals", raw_hex="ff")
    j.observe(replace(frame(other, owner="unknown"), ownership=unknown))
    assert kinds(j) == ["harness_bug"]


def test_daycare_deposit_training_and_withdrawal_preserve_identity():
    from pokebench_env.daycare import DaycarePokemon

    original = mon()
    j = NativeActionJournal()
    j.observe(frame(original, resources=Resources(daycare=())))
    boxed = replace(original, hp=None, max_hp=None, level=None, status=None)
    deposited = DaycarePokemon(0, boxed, 0, original.level)
    j.observe(ActionFrame((), Resources(daycare=(deposited,)), 0, None))
    trained = replace(deposited, steps=10, displayed_level=original.level + 1)
    j.observe(ActionFrame((), Resources(daycare=(trained,)), 0, None))
    j.observe(frame(original, resources=Resources(daycare=())))
    assert kinds(j).count("pokemon_moved") == 2
    assert "pokemon_acquired" not in kinds(j)
    training = next(e for e in j.entries if e["kind"] == "daycare_training")
    assert training["details"]["after_steps"] == 10
    assert training["details"]["after_level"] == original.level + 1


def test_native_party_changes_retain_transient_training_and_healing():
    j = NativeActionJournal()
    original = replace(mon(), is_egg=True)
    j.observe(frame(original))
    trained = replace(
        original,
        species_id=286,
        species="BRELOOM",
        is_egg=False,
        level=original.level + 1,
        hp=original.hp - 1,
        max_hp=original.max_hp + 2,
        experience=original.experience + 100,
        moves=tuple(replace(move, pp=move.pp - 1) for move in original.moves),
    )
    j.observe(frame(trained))
    j.observe(frame(replace(trained, hp=trained.max_hp)))
    assert kinds(j).count("pokemon_hp_changed") == 2
    for kind in (
        "pokemon_evolved",
        "pokemon_egg_changed",
        "pokemon_level_changed",
        "pokemon_max_hp_changed",
        "pokemon_experience_changed",
        "pokemon_pp_changed",
    ):
        assert kind in kinds(j)
    assert "move_learned" not in kinds(j)
    # Stored Pokémon have no party HP/level; moving one into the party cannot
    # manufacture changes from absent fields.
    j.observe(frame(replace(trained, hp=None, level=None, moves=None)))
    count = len(j.entries)
    j.observe(frame(trained))
    assert len(j.entries) == count


def test_duplicate_identity_and_unknown_storage_do_not_fabricate_movement():
    j = NativeActionJournal()
    original = mon()
    j.observe(frame(original))
    duplicate = Resources(storage=PokemonStorage(0, (StoragePokemon(0, 0, original),)))
    j.observe(frame(original, resources=duplicate))
    j.observe(frame(original))
    assert kinds(j) == []


def test_journal_requires_durable_cursor_and_overflow_fails():
    j = NativeActionJournal(capacity=1)
    j.observe(frame())
    j.observe(frame(replace(mon(), status=0)))
    assert j.snapshot(0)["last_id"] == 1
    with pytest.raises(ValueError, match="overflow"):
        j.observe(frame(replace(mon(), status=1)))
    assert j.snapshot(1)["entries"] == []
    with pytest.raises(ValueError, match="cursor"):
        j.snapshot(0)
    with pytest.raises(ValueError, match="cursor"):
        j.snapshot(2)


def test_harvest_bag_addition_precedes_tree_clear_and_regrowth_is_not_harvest():
    from pokebench_env.resources import BerryTree, ResourceItem

    tree = BerryTree(7, 1, 133, 5, False, 60, 2, 0, (False,) * 4)
    empty = replace(tree, berry=0, item_id=None, stage=0, yield_count=0)
    initial = Resources(bag=(), berry_trees=(tree,), selected_tree_id=7)
    added = replace(initial, bag=(ResourceItem(0, 133, 2),))
    picked = replace(added, berry_trees=(empty,), berry_script_owner="harvest")
    j = NativeActionJournal()
    j.observe(frame(resources=initial))
    j.observe(frame(resources=added))
    j.observe(frame(resources=picked))
    assert kinds(j).count("berry_harvested") == 1
    assert next(e for e in j.entries if e["kind"] == "berry_harvested")["details"]["quantity"] == 2
    rtc = NativeActionJournal()
    rtc.observe(frame(resources=initial))
    rtc.observe(frame(resources=replace(initial, berry_trees=(empty,))))
    assert "berry_harvested" not in kinds(rtc)


def test_production_reader_initialization_bounds_and_tutorial_owner():
    import struct

    from test_game_state import NAMING, OVERWORLD, SB1, game

    from pokebench_env.action_history import read_action_frame

    m = game(OVERWORLD)
    assert read_action_frame(m.read).party == ()
    m.put(0x030026F9, b"\x02")
    m.put(0x02022FEC, struct.pack("<I", 1 << 9))
    assert read_action_frame(m.read).party_owner == "tutorial"
    m.put(0x02022FEC, struct.pack("<I", 1 << 19))
    assert read_action_frame(m.read).party_owner == "rental"
    m.put(0x030026F9, b"\x00")
    assert read_action_frame(m.read).party_owner == "player"
    m.put(0x020244E9, b"\x07")
    with pytest.raises(ValueError, match="party count"):
        read_action_frame(m.read)
    m.put(0x020244E9, b"\x00")
    m.put(0x03005D8C, bytes(8))
    assert read_action_frame(m.read).resources is None
    m = game(NAMING)
    assert read_action_frame(m.read).party is None
    m = game((0, 0x080AA7A5))
    assert read_action_frame(m.read).party is None
    m = game(OVERWORLD)
    m.put(0x02037595, b"\x10")
    assert read_action_frame(m.read).party is None
    m = game(OVERWORLD)
    m.put(SB1 + 0x159C + 44, b"\xff" * 4)
    assert read_action_frame(m.read).captures is None


def test_real_frame_hook_and_http_cursor_failures():
    import json

    from fastapi import FastAPI
    from test_game_state import OVERWORLD, game
    from test_view import get

    from pokebench_env.action_history import install_action_history

    m = game(OVERWORLD)

    class Emulator:
        def __init__(self):
            self.frames = 0

        def run_frame_with_buttons(self, buttons):
            self.frames += 1

    api = FastAPI()
    journal = install_action_history(api, Emulator, m.read)
    emu = Emulator()
    emu.run_frame_with_buttons([])
    emu.run_frame_with_buttons(["A"])
    assert journal.frame == emu.frames == 2
    status, _, body = get(api, "/pokebench/actions")
    assert status == 200
    assert json.loads(body)["frame"] == 2
    journal.error = "test unavailable snapshot"
    status, _, body = get(api, "/pokebench/actions")
    assert status == 503
    assert b"unavailable snapshot" in body
    emu.run_frame_with_buttons([])
    assert journal.frame == 3


def test_advance_latches_bad_memory_and_never_converts_failure_to_empty_batch():
    j = NativeActionJournal()
    j.advance(lambda a, n: b"")
    with pytest.raises(ValueError, match="observer failed"):
        j.snapshot(0)
    j.advance(lambda a, n: bytes(n))
    assert j.frame == 2


def test_acquisition_movement_held_item_and_diagnostics_are_native_facts():
    from pokebench_env.resources import ResourceDiagnostic

    j = NativeActionJournal()
    original = mon()
    j.observe(frame(original))
    changed = replace(original, held_item=0, held_item_name=None)
    j.observe(
        frame(
            changed, resources=Resources(diagnostics=(ResourceDiagnostic("bag", "bad slot", "ab"),))
        )
    )
    box = Resources(storage=PokemonStorage(1, (StoragePokemon(1, 3, changed),)))
    j.observe(ActionFrame((), box, 0, None))
    new = replace(original, identity="gift:identity")
    j.observe(frame(new))
    assert {"held_item_changed", "pokemon_moved", "pokemon_acquired", "harness_bug"} <= set(
        kinds(j)
    )
    j.observe(frame(new, captures=2))
    j.observe(frame(new, captures=0))
    assert j.pending_captures == 0


def test_plant_and_repeat_watering_require_correct_selected_tree_and_owner():
    from pokebench_env.resources import BerryTree

    t = BerryTree(7, 0, None, 0, False, 0, 0, 0, (False,) * 4)
    before = Resources(bag=(), berry_trees=(t,), planted_berries=3, selected_tree_id=7)
    planted = replace(t, berry=1, item_id=133, stage=1)
    after = replace(before, berry_trees=(planted,), planted_berries=4, berry_script_owner="plant")
    j = NativeActionJournal()
    j.observe(frame(resources=before))
    j.observe(frame(resources=after))
    watered = replace(after, berry_script_owner="water")
    j.observe(frame(resources=watered))
    j.observe(frame(resources=watered))
    assert kinds(j).count("berry_planted") == 1
    assert kinds(j).count("berry_watered") == 1
    j.observe(frame(resources=replace(watered, berry_script_owner=None)))
    j.observe(frame(resources=watered))
    assert kinds(j).count("berry_watered") == 2


def test_battle_attempts_hp_pp_status_and_outcome_are_separate_native_receipts():
    from test_battle_state import fixture as battle_fixture

    from pokebench_env.battle_state import BattleSignal, BattleState, read_battle_state

    memory = battle_fixture()
    first = read_battle_state(memory.read)
    assert first.diagnostic is None
    j = NativeActionJournal()
    j.observe(replace(frame(), battle=BattleState(False)))
    j.observe(replace(frame(), battle=first))
    signal = BattleSignal("move_announced", 0, 16, string_id=4, move_id=10)
    announced = replace(first, signals=(signal,))
    j.observe(replace(frame(), battle=announced))
    j.observe(replace(frame(), battle=announced))
    assert kinds(j).count("battle_signal") == 1
    assert "battle_hp_changed" not in kinds(j)
    j.observe(replace(frame(), battle=first))
    j.observe(replace(frame(), battle=announced))
    assert kinds(j).count("battle_signal") == 2
    actor = first.battlers[0]
    injured = replace(
        actor,
        hp=13,
        status1=0,
        stat_stages=(5,) + actor.stat_stages[1:],
        moves=(replace(actor.moves[0], pp=34),) + actor.moves[1:],
    )
    won = replace(first, battlers=(injured,) + first.battlers[1:], outcome_code=1, outcome="won")
    j.observe(replace(frame(), battle=won))
    j.observe(replace(frame(), battle=won))
    j.observe(replace(frame(), battle=BattleState(False)))
    assert kinds(j).count("battle_hp_changed") == 1
    assert kinds(j).count("battle_pp_changed") == 1
    assert kinds(j).count("battle_status_changed") == 1
    assert kinds(j).count("battle_outcome") == 1
    assert kinds(j).count("battle_ended") == 1
    assert next(e for e in j.entries if e["kind"] == "battle_ended")["details"]["outcome"] == "won"
