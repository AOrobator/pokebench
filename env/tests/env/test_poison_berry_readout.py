import struct
from dataclasses import replace

from pokebench_env.game_state import read_game_state
from pokebench_env.live_map import OBJECT_EVENTS
from pokebench_env.poison_berry_readout import BERRY, POISON, POISON_WARNING
from pokebench_env.readout import features_off_from_env, format_readout, state_json
from pokebench_env.rerender import read_state
from pokebench_env.resources import ResourceItem, Resources
from tests.env.test_game_state import MAPS, OVERWORLD, game, mon
from tests.env.test_readout import IN_GAME


def poisoned(status=8, hp=20):
    return replace(IN_GAME, party=(replace(IN_GAME.party[0], status=status, hp=hp),))


def test_poison_is_independent_of_status_names_and_off_is_exact():
    state = poisoned()
    off = frozenset({POISON, BERRY, "status-names-v1"})
    before_state = state_json(state)
    before = format_readout(state, off)
    assert "STATUS 8" in before and "poisoned" not in before
    on = format_readout(state, off - {POISON})
    assert "STATUS PSN (poisoned)" in on
    assert POISON_WARNING in on
    assert state_json(state) == before_state
    assert format_readout(state, off) == before


def test_warning_uses_game_words_without_unseen_remedies():
    assert POISON_WARNING == (
        'Poison (PSN): "If you walk around with a poisoned '
        'POKéMON, it will lose HP until it faints."'
    )
    for status in (8, 128):
        assert POISON_WARNING in format_readout(poisoned(status))
    for state in (
        poisoned(16),
        poisoned(hp=0),
        replace(poisoned(), in_battle=True),
        replace(poisoned(), party_owner="unknown"),
        replace(poisoned(), screen="pokemon_summary"),
    ):
        assert POISON_WARNING not in format_readout(state)
    assert "ANTIDOTE" not in format_readout(poisoned())


def berry_memory(stage=5):
    m = game(OVERWORLD, [mon(280, 5, 18, 20, personality=1, ot_id=2)])
    # Player is (7,9), and map 0/9: one visible loaded berry object at (8,9).
    obj = bytearray(0x24)
    obj[0] = 1
    obj[5] = 62
    obj[8:11] = bytes([18, 9, 0])
    struct.pack_into("<hh", obj, 0x10, 15, 16)
    obj[0x1D] = 4
    m.put(OBJECT_EVENTS + 0x24, bytes(obj))
    from tests.env.test_game_state import SB1

    m.put(SB1 + 0x169C + 4 * 8, struct.pack("<BBHBBxx", 7, stage, 720, 2, 0))
    return m


def test_production_factory_reads_only_enabled_visible_ripe_trees():
    m = berry_memory()
    off = frozenset({BERRY})
    baseline = read_state(m.read, MAPS, active_ui=False, off=off)
    on = read_state(m.read, MAPS, active_ui=False, off=frozenset())
    before = format_readout(baseline, off)
    after = format_readout(on)
    assert "Berry tree at (8,9): berries ready to pick" in after
    assert "face the tree and press A to examine" in after
    assert "ORAN BERRY" not in after
    assert "Berry tree at" not in before
    assert state_json(baseline) == state_json(on)
    assert format_readout(on, off) == before
    assert "Berry tree at" not in format_readout(replace(on, in_battle=True))
    assert read_game_state(m.read, MAPS).berry_readout is None


def test_growing_tree_is_not_reported_as_ripe():
    m = berry_memory(4)
    on = read_state(m.read, MAPS, active_ui=False, off=frozenset())
    result = format_readout(on)
    assert "Berry tree at (8,9): growing; no ripe berries" in result
    assert "ready to pick" not in result


def test_bag_quotes_only_descriptions_of_berries_already_owned():
    state = replace(
        IN_GAME, resources=Resources(bag=(ResourceItem(0, 139, 2, "berries", "ORAN BERRY"),))
    )
    on = format_readout(state)
    assert 'ORAN BERRY ×2 — "A hold item that restores 10 HP in battle."' in on
    assert "PECHA" not in on
    assert "restores 10 HP" not in format_readout(state, frozenset({BERRY}))
    assert format_readout(state, frozenset({POISON, BERRY})) == format_readout(
        state, frozenset({BERRY})
    )


def test_both_switches_default_off_on_the_server():
    assert {POISON, BERRY} <= features_off_from_env({})


def test_tree_visibility_identity_and_unavailable_data_are_not_guessed():
    from pokebench_env.poison_berry_readout import visible_berry_lines
    from pokebench_env.resources import BerryTree
    from tests.env.test_game_state import Memory

    resources = Resources(berry_trees=(BerryTree(4, 7, 139, 5, False, 720, 2, 0, (False,) * 4),))
    m = berry_memory()
    assert "ready to pick" in visible_berry_lines(m.read, resources, (0, 9), (7, 9))[0]
    assert visible_berry_lines(m.read, resources, (0, 8), (7, 9)) == ()
    assert visible_berry_lines(m.read, resources, (0, 9), (30, 30)) == ()
    for offset, value in [(0, 0), (1, 0x20), (1, 0x40), (2, 1), (5, 9)]:
        hidden = berry_memory()
        hidden.put(OBJECT_EVENTS + 0x24 + offset, bytes([value]))
        assert visible_berry_lines(hidden.read, resources, (0, 9), (7, 9)) == ()
    assert visible_berry_lines(m.read, Resources(), (0, 9), (7, 9)) == (
        "Berry tree at (8,9): growth state unavailable.",
    )
    empty = replace(resources, berry_trees=(replace(resources.berry_trees[0], stage=0),))
    assert visible_berry_lines(m.read, empty, (0, 9), (7, 9)) == ()
    assert visible_berry_lines(lambda a, n: b"", resources, (0, 9), (7, 9)) == (
        "Berry trees: unavailable (short object snapshot).",
    )
    assert visible_berry_lines(Memory().read, resources, (0, 9), (7, 9)) == ()


def test_poison_does_not_require_the_expanded_party_readout():
    off = frozenset({"expanded-menu-battle-information-v1"})
    assert POISON_WARNING in format_readout(poisoned(), off)
    assert POISON_WARNING not in format_readout(poisoned(), off | {POISON})


def test_native_archive_matches_the_original_off_text_and_the_independent_switches():
    import hashlib
    import json
    import os
    from pathlib import Path

    from pokebench_env.game_state import MapNames
    from pokebench_env.mart_stock import _item
    from pokebench_env.poison_berry_readout import BERRY_DESCRIPTIONS
    from pokebench_env.raw_ram import load_raw_ram
    from pokebench_env.readout import SERVER_FEATURES
    from pokebench_env.rerender import PORYMAP_MAPS, render
    from pokebench_env.rom import resolve_rom

    folder = Path(__file__).parent / "fixtures"
    proof = json.loads((folder / "poison-berry-route104.provenance.json").read_text())
    rom = resolve_rom(os.environ).read_bytes()
    read = load_raw_ram(
        folder / "poison-berry-route104.json.gz", proof["archive"]["sha256"], rom=rom
    )
    maps = MapNames.load(PORYMAP_MAPS)
    off = frozenset(x for x in SERVER_FEATURES if not proof["features"].get(x, False))
    baseline = read_state(read, maps, active_ui=True, off=off)
    original = render(baseline, off)
    assert hashlib.sha256(original.encode()).hexdigest() == proof["off_readout_sha256"]
    for enabled in ({POISON}, {BERRY}, {POISON, BERRY}):
        state = read_state(read, maps, active_ui=True, off=off - enabled)
        result = render(state, off - enabled)
        assert state_json(state) == state_json(baseline)
        assert (POISON_WARNING in result) == (POISON in enabled)
        assert ("Berry tree at (3,23): berries ready to pick" in result) == (BERRY in enabled)
        assert "ORAN BERRY" not in result
    for item_id, description in BERRY_DESCRIPTIONS.items():
        assert _item(read, item_id, False).description == description
